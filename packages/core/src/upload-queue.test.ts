import { expect, test, vi } from "vitest";
import type { UploadTransport } from "./transport.js";
import type { MediaDropFile } from "./types.js";
import { createUploadQueue, type UploadQueueStore } from "./upload-queue.js";

function makeFile(
	id: string,
	overrides: Partial<MediaDropFile> = {},
): MediaDropFile {
	return {
		id,
		file: new File(["x"], `${id}.png`, { type: "image/png" }),
		name: `${id}.png`,
		size: 1,
		type: "image/png",
		status: "accepted",
		errors: [],
		...overrides,
	};
}

/** A minimal in-memory fake of the store interface the queue depends on. */
function createFakeStore(initialFiles: MediaDropFile[]): UploadQueueStore & {
	remove: (id: string) => void;
} {
	let files = initialFiles;
	return {
		getFile: (id) => files.find((f) => f.id === id),
		updateFile: (id, patch) => {
			files = files.map((f) => (f.id === id ? { ...f, ...patch } : f));
		},
		remove: (id) => {
			files = files.filter((f) => f.id !== id);
		},
	};
}

/** A transport whose resolution/rejection is controlled by the test. */
function createDeferredTransport() {
	const deferreds = new Map<
		string,
		{
			resolve: (v: { response?: unknown }) => void;
			reject: (e: unknown) => void;
		}
	>();
	const calls: string[] = [];
	const signals = new Map<string, AbortSignal>();

	const transport: UploadTransport = {
		upload(file, { signal }) {
			calls.push(file.id);
			signals.set(file.id, signal);
			return new Promise((resolve, reject) => {
				deferreds.set(file.id, { resolve, reject });
			});
		},
	};

	return {
		transport,
		calls,
		signals,
		resolve(id: string, response?: unknown) {
			deferreds.get(id)?.resolve({ response });
		},
		reject(id: string, error: unknown) {
			deferreds.get(id)?.reject(error);
		},
	};
}

test("enqueue ignores files that are not status: accepted", () => {
	const store = createFakeStore([makeFile("a", { status: "rejected" })]);
	const { transport } = createDeferredTransport();
	const queue = createUploadQueue({ transport }, store);

	queue.enqueue("a");

	expect(store.getFile("a")?.uploadStatus).toBeUndefined();
});

test("enqueue marks a file queued, then uploading once the queue starts it", () => {
	const store = createFakeStore([makeFile("a")]);
	const { transport, calls } = createDeferredTransport();
	const queue = createUploadQueue({ transport }, store);

	queue.enqueue("a");

	expect(calls).toEqual(["a"]);
	expect(store.getFile("a")?.uploadStatus).toBe("uploading");
	expect(store.getFile("a")?.uploadAttempts).toBe(1);
});

test("respects the concurrency limit, starting the next file only when a slot frees", async () => {
	const store = createFakeStore([makeFile("a"), makeFile("b"), makeFile("c")]);
	const { transport, calls, resolve } = createDeferredTransport();
	const queue = createUploadQueue({ transport, concurrency: 2 }, store);

	queue.enqueue("a");
	queue.enqueue("b");
	queue.enqueue("c");

	expect(calls).toEqual(["a", "b"]);
	expect(store.getFile("c")?.uploadStatus).toBe("queued");

	resolve("a");
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("done");
	});

	expect(calls).toEqual(["a", "b", "c"]);
});

test("a successful upload stores the transport's response on uploadResult", async () => {
	const store = createFakeStore([makeFile("a")]);
	const { transport, resolve } = createDeferredTransport();
	const queue = createUploadQueue({ transport }, store);

	queue.enqueue("a");
	resolve("a", { url: "https://example.test/a" });
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("done");
	});

	expect(store.getFile("a")?.uploadResult).toEqual({
		url: "https://example.test/a",
	});
});

test("a failing upload with no retries configured ends in uploadStatus: error", async () => {
	const store = createFakeStore([makeFile("a")]);
	const { transport, reject } = createDeferredTransport();
	const queue = createUploadQueue({ transport }, store);

	queue.enqueue("a");
	reject("a", new Error("server exploded"));
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("error");
	});

	expect(store.getFile("a")?.uploadError).toEqual({
		code: "upload-error",
		message: "server exploded",
	});
});

test("retries automatically on failure, up to the configured count, before succeeding", async () => {
	const store = createFakeStore([makeFile("a")]);
	let attempt = 0;
	const transport: UploadTransport = {
		upload: vi.fn().mockImplementation(() => {
			attempt += 1;
			if (attempt < 3)
				return Promise.reject(new Error(`attempt ${attempt} failed`));
			return Promise.resolve({ response: "ok" });
		}),
	};
	const queue = createUploadQueue(
		{ transport, retries: 2, retryDelays: [0, 0] },
		store,
	);

	queue.enqueue("a");
	// Flush the retry loop's microtasks/timers.
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("done");
	});

	expect(transport.upload).toHaveBeenCalledTimes(3);
});

test("cancel on a merely-queued file removes it without ever calling the transport", () => {
	const store = createFakeStore([makeFile("a"), makeFile("b")]);
	const { transport, calls } = createDeferredTransport();
	const queue = createUploadQueue({ transport, concurrency: 1 }, store);

	queue.enqueue("a");
	queue.enqueue("b");
	expect(store.getFile("b")?.uploadStatus).toBe("queued");

	queue.cancel("b");

	expect(store.getFile("b")?.uploadStatus).toBe("canceled");
	expect(calls).toEqual(["a"]);
});

test("cancel on an in-flight file aborts its signal and settles it as canceled, not error", async () => {
	const store = createFakeStore([makeFile("a")]);
	const { transport, signals, reject } = createDeferredTransport();
	const queue = createUploadQueue({ transport, retries: 5 }, store);

	queue.enqueue("a");
	const signal = signals.get("a");
	expect(signal?.aborted).toBe(false);

	queue.cancel("a");
	expect(signal?.aborted).toBe(true);

	// Simulate the transport's promise rejecting because it observed the abort.
	reject("a", new Error("aborted"));
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("canceled");
	});

	expect(store.getFile("a")?.uploadError).toBeUndefined();
});

test("cancelAll cancels every queued and in-flight file", () => {
	const store = createFakeStore([makeFile("a"), makeFile("b"), makeFile("c")]);
	const { transport, signals } = createDeferredTransport();
	const queue = createUploadQueue({ transport, concurrency: 2 }, store);

	queue.enqueue("a");
	queue.enqueue("b");
	queue.enqueue("c");

	queue.cancelAll();

	expect(signals.get("a")?.aborted).toBe(true);
	expect(signals.get("b")?.aborted).toBe(true);
	expect(store.getFile("c")?.uploadStatus).toBe("canceled");
});

test("retry() re-enqueues a failed file but ignores files that never failed", async () => {
	const store = createFakeStore([makeFile("a"), makeFile("b")]);
	const { transport, reject, calls } = createDeferredTransport();
	const queue = createUploadQueue({ transport }, store);

	queue.enqueue("a");
	reject("a", new Error("boom"));
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("error");
	});

	queue.retry("b"); // "b" was never queued/failed — must be a no-op.
	expect(store.getFile("b")?.uploadStatus).toBeUndefined();

	queue.retry("a");
	expect(calls).toEqual(["a", "a"]);
	expect(store.getFile("a")?.uploadStatus).toBe("uploading");
	expect(store.getFile("a")?.uploadError).toBeUndefined();
});

test("a file removed from the store while merely queued is skipped, not started", async () => {
	const store = createFakeStore([makeFile("a"), makeFile("b")]);
	const { transport, calls, resolve } = createDeferredTransport();
	const queue = createUploadQueue({ transport, concurrency: 1 }, store);

	queue.enqueue("a");
	queue.enqueue("b");
	expect(calls).toEqual(["a"]);

	// Simulate removeFile("b") happening while "b" is still waiting behind "a".
	store.remove("b");
	resolve("a");
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("done");
	});

	expect(calls).toEqual(["a"]);
});
