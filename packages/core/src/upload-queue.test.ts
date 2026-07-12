import { expect, test, vi } from "vitest";
import { createHttpError } from "./retry.js";
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

test("a failing upload's HTTP status is preserved on uploadError instead of discarded", async () => {
	const store = createFakeStore([makeFile("a")]);
	const { transport, reject } = createDeferredTransport();
	const queue = createUploadQueue({ transport }, store);

	queue.enqueue("a");
	reject("a", createHttpError("Forbidden", 403));
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("error");
	});

	expect(store.getFile("a")?.uploadError).toEqual({
		code: "upload-error",
		message: "Forbidden",
		status: 403,
	});
});

test("a failing upload's transport-specific error code is preserved as sourceCode on uploadError", async () => {
	const store = createFakeStore([makeFile("a")]);
	const { transport, reject } = createDeferredTransport();
	const queue = createUploadQueue({ transport }, store);

	class FakeTusError extends Error {
		code = "offset-mismatch";
	}

	queue.enqueue("a");
	reject(
		"a",
		new FakeTusError("tus PATCH response was missing the Upload-Offset header"),
	);
	await vi.waitFor(() => {
		expect(store.getFile("a")?.uploadStatus).toBe("error");
	});

	expect(store.getFile("a")?.uploadError).toEqual({
		code: "upload-error",
		message: "tus PATCH response was missing the Upload-Offset header",
		sourceCode: "offset-mismatch",
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

test("cancel force-frees the slot after cancelGraceMs if the transport ignores its AbortSignal", async () => {
	vi.useFakeTimers();
	try {
		const store = createFakeStore([makeFile("a"), makeFile("b")]);
		const misbehavingTransport: UploadTransport = {
			upload() {
				// Never resolves, never rejects, ignores `signal` entirely —
				// simulates a broken/third-party transport.
				return new Promise(() => {});
			},
		};
		const queue = createUploadQueue(
			{ transport: misbehavingTransport, concurrency: 1, cancelGraceMs: 1000 },
			store,
		);

		queue.enqueue("a");
		queue.enqueue("b");
		expect(store.getFile("b")?.uploadStatus).toBe("queued");

		queue.cancel("a");
		// Not yet force-freed — the grace period hasn't elapsed.
		expect(store.getFile("b")?.uploadStatus).toBe("queued");

		await vi.advanceTimersByTimeAsync(1000);

		expect(store.getFile("a")?.uploadStatus).toBe("canceled");
		// "b" got its turn once the stuck slot was force-freed.
		expect(store.getFile("b")?.uploadStatus).toBe("uploading");
	} finally {
		vi.useRealTimers();
	}
});

test("the force-free timer doesn't misfire against a fresh attempt that reused the same file id", async () => {
	vi.useFakeTimers();
	try {
		const store = createFakeStore([makeFile("a")]);
		let callCount = 0;
		let resolveSecond: (() => void) | undefined;
		const transport: UploadTransport = {
			upload() {
				callCount += 1;
				if (callCount === 1) return new Promise(() => {}); // first attempt: stuck
				return new Promise((resolve) => {
					resolveSecond = () => resolve({ response: "ok" });
				});
			},
		};
		const queue = createUploadQueue({ transport, cancelGraceMs: 1000 }, store);

		queue.enqueue("a");
		queue.cancel("a");
		await vi.advanceTimersByTimeAsync(1000);
		expect(store.getFile("a")?.uploadStatus).toBe("canceled");

		// A brand new attempt for the same file id starts a fresh controller...
		queue.enqueue("a");
		expect(store.getFile("a")?.uploadStatus).toBe("uploading");

		// ...and must not be force-cancelled by the *first* attempt's timer.
		resolveSecond?.();
		await vi.waitFor(() => {
			expect(store.getFile("a")?.uploadStatus).toBe("done");
		});
	} finally {
		vi.useRealTimers();
	}
});

test("a transport that settles after force-free does not corrupt a later re-upload of the same id", async () => {
	vi.useFakeTimers();
	try {
		const store = createFakeStore([makeFile("a")]);
		// Tracks each *call*'s own resolver separately (unlike
		// createDeferredTransport's helper, which is keyed by file id and
		// so can't model two distinct in-flight calls for the same id).
		const resolvers: Array<(v: { response?: unknown }) => void> = [];
		const transport: UploadTransport = {
			upload() {
				return new Promise((resolve) => {
					resolvers.push(resolve);
				});
			},
		};
		const queue = createUploadQueue({ transport, cancelGraceMs: 10 }, store);

		queue.enqueue("a");
		queue.cancel("a");

		// Force-free runs before the first (stuck) transport call ever settles.
		await vi.advanceTimersByTimeAsync(10);
		expect(store.getFile("a")?.uploadStatus).toBe("canceled");

		// A fast user retry starts a brand-new attempt/controller for "a".
		queue.enqueue("a");
		expect(store.getFile("a")?.uploadStatus).toBe("uploading");
		expect(resolvers).toHaveLength(2);

		// The *original* (first) call's resolver fires late — after
		// force-free already reassigned "a" to the second attempt. Flush
		// microtasks so its (guarded, no-op) .then handler gets a turn to run.
		resolvers[0]?.({ response: "stale" });
		await vi.advanceTimersByTimeAsync(0);

		// The stale resolution must not have clobbered the second attempt's
		// live state back to "done" — it should still reflect the second
		// attempt (uploading, since its own transport call never resolved).
		expect(store.getFile("a")?.uploadStatus).toBe("uploading");
		expect(store.getFile("a")?.uploadResult).toBeUndefined();
	} finally {
		vi.useRealTimers();
	}
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
