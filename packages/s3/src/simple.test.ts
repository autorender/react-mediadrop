// @vitest-environment jsdom

import { installMockXhr, MockXhr, makeFile } from "@mediadrop/test-utils";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { s3Upload } from "./simple.js";

let uninstall: () => void;
beforeEach(() => {
	uninstall = installMockXhr();
});
afterEach(() => {
	uninstall();
});

/** `getUploadUrl` is async, so the XHR isn't opened synchronously — let that microtask settle first. */
async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

test("presigned PUT sends the raw file body to the given URL with the given headers", async () => {
	const file = makeFile();
	const transport = s3Upload({
		getUploadUrl: async () => ({
			url: "https://bucket.s3.example/key",
			headers: { "Content-Type": "image/png" },
			key: "key",
			bucket: "bucket",
		}),
	});

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await flush();
	const xhr = MockXhr.instances[0];
	expect(xhr?.method).toBe("PUT");
	expect(xhr?.url).toBe("https://bucket.s3.example/key");
	expect(xhr?.requestHeaders["Content-Type"]).toBe("image/png");
	expect(xhr?.sentBody).toBe(file.file);

	xhr?.respond(200);
	const result = await promise;
	expect(result.response).toEqual({
		key: "key",
		bucket: "bucket",
		status: 200,
	});
});

test("presigned POST sends a multipart form with fields, and the file field last", async () => {
	const transport = s3Upload({
		getUploadUrl: async () => ({
			url: "https://bucket.s3.example/",
			method: "POST",
			fields: { key: "uploads/a.png", policy: "abc", signature: "def" },
		}),
	});

	const promise = transport.upload(makeFile(), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await flush();
	const xhr = MockXhr.instances[0];
	expect(xhr?.method).toBe("POST");
	const body = xhr?.sentBody as FormData;
	expect(body).toBeInstanceOf(FormData);
	const keys = [...body.keys()];
	expect(keys).toEqual(["key", "policy", "signature", "file"]);

	xhr?.respond(204);
	await promise;
});

test("reports upload progress", async () => {
	const onProgress = vi.fn();
	const transport = s3Upload({
		getUploadUrl: async () => ({ url: "https://bucket.s3.example/key" }),
	});

	const promise = transport.upload(makeFile(), {
		onProgress,
		signal: new AbortController().signal,
	});
	await flush();
	MockXhr.instances[0]?.progress(5, 10);
	expect(onProgress).toHaveBeenCalledWith({ loaded: 5, total: 10 });

	MockXhr.instances[0]?.respond(200);
	await promise;
});

test("rejects on a non-2xx status without retrying internally", async () => {
	const transport = s3Upload({
		getUploadUrl: async () => ({ url: "https://bucket.s3.example/key" }),
	});

	const promise = transport.upload(makeFile(), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await flush();
	MockXhr.instances[0]?.respond(403, "Forbidden");

	await expect(promise).rejects.toThrow(/403/);
	await expect(promise).rejects.toMatchObject({ status: 403 });
	expect(MockXhr.instances).toHaveLength(1);
});

test("aborting the signal cancels the request", async () => {
	const controller = new AbortController();
	const transport = s3Upload({
		getUploadUrl: async () => ({ url: "https://bucket.s3.example/key" }),
	});

	const promise = transport.upload(makeFile(), {
		onProgress: vi.fn(),
		signal: controller.signal,
	});
	await flush();
	controller.abort();

	expect(MockXhr.instances[0]?.aborted).toBe(true);
	await expect(promise).rejects.toThrow(/aborted/i);
});

test("stallTimeoutMs aborts and rejects if no progress happens in time", async () => {
	vi.useFakeTimers();
	try {
		const transport = s3Upload({
			getUploadUrl: async () => ({ url: "https://bucket.s3.example/key" }),
			stallTimeoutMs: 1000,
		});

		const promise = transport.upload(makeFile(), {
			onProgress: vi.fn(),
			signal: new AbortController().signal,
		});
		const rejection = expect(promise).rejects.toThrow(/stalled/i);
		await flush();

		await vi.advanceTimersByTimeAsync(1000);

		expect(MockXhr.instances[0]?.aborted).toBe(true);
		await rejection;
	} finally {
		vi.useRealTimers();
	}
});

test("an already-aborted signal never calls getUploadUrl or opens a request", async () => {
	const controller = new AbortController();
	controller.abort();
	const getUploadUrl = vi.fn();
	const transport = s3Upload({ getUploadUrl });

	await expect(
		transport.upload(makeFile(), {
			onProgress: vi.fn(),
			signal: controller.signal,
		}),
	).rejects.toThrow(/aborted/i);
	expect(getUploadUrl).not.toHaveBeenCalled();
	expect(MockXhr.instances).toHaveLength(0);
});
