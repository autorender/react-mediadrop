// @vitest-environment jsdom
import { installMockXhr, MockXhr, makeFile } from "@mediadrop/test-utils";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createXhrUploadTransport } from "./index.js";

let uninstall: () => void;

beforeEach(() => {
	uninstall = installMockXhr();
});

afterEach(() => {
	uninstall();
});

test("sends a multipart/form-data request by default and resolves on a 2xx status", async () => {
	const transport = createXhrUploadTransport({
		endpoint: "https://example.test/upload",
	});

	const promise = transport.upload(makeFile(), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	const xhr = MockXhr.instances[0];
	expect(xhr?.method).toBe("POST");
	expect(xhr?.url).toBe("https://example.test/upload");
	expect(xhr?.sentBody).toBeInstanceOf(FormData);

	xhr?.respond(200, JSON.stringify({ url: "https://cdn.test/a.png" }), {
		"Content-Type": "application/json",
	});

	const result = await promise;
	expect(result.response).toEqual({ url: "https://cdn.test/a.png" });
});

test("reports upload progress via the transport's onProgress callback", async () => {
	const transport = createXhrUploadTransport({
		endpoint: "https://example.test/upload",
	});
	const onProgress = vi.fn();

	const promise = transport.upload(makeFile(), {
		onProgress,
		signal: new AbortController().signal,
	});
	const xhr = MockXhr.instances[0];
	xhr?.progress(50, 100);
	expect(onProgress).toHaveBeenCalledWith({ loaded: 50, total: 100 });

	xhr?.respond(204);
	await promise;
});

test("reports total: null when the response length isn't computable", async () => {
	const transport = createXhrUploadTransport({
		endpoint: "https://example.test/upload",
	});
	const onProgress = vi.fn();

	const promise = transport.upload(makeFile(), {
		onProgress,
		signal: new AbortController().signal,
	});
	MockXhr.instances[0]?.progress(50, null);
	expect(onProgress).toHaveBeenCalledWith({ loaded: 50, total: null });

	MockXhr.instances[0]?.respond(200);
	await promise;
});

test("rejects on a non-2xx status, without the transport retrying internally", async () => {
	const transport = createXhrUploadTransport({
		endpoint: "https://example.test/upload",
	});

	const promise = transport.upload(makeFile(), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	MockXhr.instances[0]?.respond(500, "", {});

	await expect(promise).rejects.toThrow(/500/);
	await expect(promise).rejects.toMatchObject({ status: 500 });
	// Only one XHR was ever opened — retry is the queue's job, not this transport's.
	expect(MockXhr.instances).toHaveLength(1);
});

test("rejects on a network error", async () => {
	const transport = createXhrUploadTransport({
		endpoint: "https://example.test/upload",
	});

	const promise = transport.upload(makeFile(), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	MockXhr.instances[0]?.networkError();

	await expect(promise).rejects.toThrow(/network error/);
});

test("aborting the signal calls xhr.abort() and rejects", async () => {
	const transport = createXhrUploadTransport({
		endpoint: "https://example.test/upload",
	});
	const controller = new AbortController();

	const promise = transport.upload(makeFile(), {
		onProgress: vi.fn(),
		signal: controller.signal,
	});
	controller.abort();

	expect(MockXhr.instances[0]?.aborted).toBe(true);
	await expect(promise).rejects.toThrow(/aborted/i);
});

test("an already-aborted signal rejects immediately without ever opening a request", async () => {
	const transport = createXhrUploadTransport({
		endpoint: "https://example.test/upload",
	});
	const controller = new AbortController();
	controller.abort();

	await expect(
		transport.upload(makeFile(), {
			onProgress: vi.fn(),
			signal: controller.signal,
		}),
	).rejects.toThrow(/aborted/i);
	expect(MockXhr.instances).toHaveLength(0);
});

test("stallTimeoutMs aborts and rejects if no progress happens in time", async () => {
	vi.useFakeTimers();
	try {
		const transport = createXhrUploadTransport({
			endpoint: "https://example.test/upload",
			stallTimeoutMs: 1000,
		});
		const promise = transport.upload(makeFile(), {
			onProgress: vi.fn(),
			signal: new AbortController().signal,
		});
		// Attach the rejection assertion before advancing the fake clock, so
		// the handler is already in place the instant the timer fires.
		const rejection = expect(promise).rejects.toThrow(/stalled/i);

		await vi.advanceTimersByTimeAsync(1000);

		expect(MockXhr.instances[0]?.aborted).toBe(true);
		await rejection;
	} finally {
		vi.useRealTimers();
	}
});

test("stallTimeoutMs never fires as long as progress keeps arriving, even for a slow transfer", async () => {
	vi.useFakeTimers();
	try {
		const transport = createXhrUploadTransport({
			endpoint: "https://example.test/upload",
			stallTimeoutMs: 1000,
		});
		const promise = transport.upload(makeFile(), {
			onProgress: vi.fn(),
			signal: new AbortController().signal,
		});
		const xhr = MockXhr.instances[0];

		for (let i = 0; i < 5; i++) {
			await vi.advanceTimersByTimeAsync(900);
			xhr?.progress((i + 1) * 100, 1000);
		}
		expect(xhr?.aborted).toBe(false);

		xhr?.respond(200, "{}", { "Content-Type": "application/json" });
		await expect(promise).resolves.toBeDefined();
	} finally {
		vi.useRealTimers();
	}
});

test("endpoint, headers, and fields can be computed per file", async () => {
	const transport = createXhrUploadTransport({
		endpoint: (file) => `https://example.test/upload/${file.id}`,
		headers: (file) => ({ "X-File-Name": file.name }),
		fields: (file) => ({ fileId: file.id }),
	});

	const promise = transport.upload(makeFile(), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	const xhr = MockXhr.instances[0];

	expect(xhr?.url).toBe("https://example.test/upload/a");
	expect(xhr?.requestHeaders["X-File-Name"]).toBe("a.png");
	expect((xhr?.sentBody as FormData).get("fileId")).toBe("a");
	// Exactly the computed `fields` entries plus the file itself — nothing
	// extra or stray leaks into the FormData.
	expect([...(xhr?.sentBody as FormData).keys()]).toEqual(["fileId", "file"]);

	xhr?.respond(200);
	await promise;
});

test("formData: false sends the raw file body instead of a multipart envelope", async () => {
	const transport = createXhrUploadTransport({
		endpoint: "https://example.test/upload",
		formData: false,
	});
	const file = makeFile();

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});

	expect(MockXhr.instances[0]?.sentBody).toBe(file.file);

	MockXhr.instances[0]?.respond(200);
	await promise;
});
