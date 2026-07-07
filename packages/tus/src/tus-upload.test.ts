// @vitest-environment jsdom
import { memoryUploadSessionStore } from "@mediadrop/core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installMockXhr, MockXhr, makeFile } from "./test-utils.js";
import { tusUpload } from "./tus-upload.js";
import { TusError } from "./types.js";

let uninstall: () => void;
beforeEach(() => {
	uninstall = installMockXhr();
});
afterEach(() => {
	uninstall();
});

async function waitForXhrCount(count: number): Promise<void> {
	await vi.waitFor(() => {
		expect(MockXhr.instances.length).toBeGreaterThanOrEqual(count);
	});
}

test("creates the upload with the correct tus creation headers", async () => {
	const transport = tusUpload({ endpoint: "/files" });
	const file = makeFile("a.png", "image/png", 10);

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);

	const create = MockXhr.instances[0];
	expect(create?.method).toBe("POST");
	expect(create?.url).toBe("/files");
	expect(create?.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
	expect(create?.requestHeaders["Upload-Length"]).toBe("10");
	expect(create?.requestHeaders["Upload-Metadata"]).toContain("filename");
	expect(create?.requestHeaders["Upload-Metadata"]).toContain("filetype");

	create?.respond(201, { Location: "/files/abc123" });
	await waitForXhrCount(2);
	MockXhr.instances[1]?.respond(204, { "Upload-Offset": "10" });

	await promise;
});

test("uploads the file body via PATCH with the correct offset/content-type headers", async () => {
	const transport = tusUpload({ endpoint: "/files" });
	const file = makeFile("a.png", "image/png", 10);

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(201, { Location: "/files/abc123" });
	await waitForXhrCount(2);

	const patch = MockXhr.instances[1];
	expect(patch?.method).toBe("PATCH");
	// The Location header ("/files/abc123") is resolved to an absolute URL
	// against the creation request's responseURL, same as a real browser does.
	expect(patch?.url).toBe("https://mediadrop.test/files/abc123");
	expect(patch?.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
	expect(patch?.requestHeaders["Upload-Offset"]).toBe("0");
	expect(patch?.requestHeaders["Content-Type"]).toBe(
		"application/offset+octet-stream",
	);
	expect(patch?.sentBody).toBeInstanceOf(Blob);

	patch?.respond(204, { "Upload-Offset": "10" });
	const result = await promise;
	expect(result.response).toEqual({
		uploadUrl: "https://mediadrop.test/files/abc123",
		offset: 10,
	});
});

test("splits large files into multiple chunks", async () => {
	const chunkSize = 5;
	const transport = tusUpload({ endpoint: "/files", chunkSize });
	const file = makeFile("a.png", "image/png", 12);

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(201, { Location: "/files/abc" });

	await waitForXhrCount(2);
	expect(MockXhr.instances[1]?.requestHeaders["Upload-Offset"]).toBe("0");
	MockXhr.instances[1]?.respond(204, { "Upload-Offset": "5" });

	await waitForXhrCount(3);
	expect(MockXhr.instances[2]?.requestHeaders["Upload-Offset"]).toBe("5");
	MockXhr.instances[2]?.respond(204, { "Upload-Offset": "10" });

	await waitForXhrCount(4);
	expect(MockXhr.instances[3]?.requestHeaders["Upload-Offset"]).toBe("10");
	MockXhr.instances[3]?.respond(204, { "Upload-Offset": "12" });

	const result = await promise;
	expect(result.response).toEqual({
		uploadUrl: "https://mediadrop.test/files/abc",
		offset: 12,
	});
});

test("reports progress as chunks complete", async () => {
	const onProgress = vi.fn();
	const transport = tusUpload({ endpoint: "/files" });
	const file = makeFile("a.png", "image/png", 10);

	const promise = transport.upload(file, {
		onProgress,
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(201, { Location: "/files/abc" });
	await waitForXhrCount(2);

	MockXhr.instances[1]?.progress(4);
	expect(onProgress).toHaveBeenLastCalledWith({ loaded: 4, total: 10 });

	MockXhr.instances[1]?.respond(204, { "Upload-Offset": "10" });
	await promise;
	expect(onProgress).toHaveBeenLastCalledWith({ loaded: 10, total: 10 });
});

test("resumes using the offset from a fresh HEAD request, not a stale local value", async () => {
	const sessionStore = memoryUploadSessionStore();
	const file = makeFile("a.png", "image/png", 10);
	const { createFileFingerprint } = await import("@mediadrop/core");
	const fp = createFileFingerprint(file.file);
	await sessionStore.set(`tus:${fp}`, {
		type: "tus",
		fingerprint: fp,
		uploadUrl: "/files/existing",
		offset: 0, // deliberately stale/wrong — HEAD must be trusted instead
		createdAt: 1,
		updatedAt: 1,
	});

	const transport = tusUpload({ endpoint: "/files", sessionStore });
	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});

	await waitForXhrCount(1);
	const head = MockXhr.instances[0];
	expect(head?.method).toBe("HEAD");
	expect(head?.url).toBe("/files/existing");
	head?.respond(200, { "Upload-Offset": "6" }); // server says 6 bytes already uploaded

	await waitForXhrCount(2);
	const patch = MockXhr.instances[1];
	expect(patch?.method).toBe("PATCH");
	expect(patch?.requestHeaders["Upload-Offset"]).toBe("6"); // resumed from HEAD's offset, not the stale "0"

	patch?.respond(204, { "Upload-Offset": "10" });
	await promise;
});

test("falls back to creating a new upload when the resumed URL is gone (HEAD fails)", async () => {
	const sessionStore = memoryUploadSessionStore();
	const file = makeFile("a.png", "image/png", 10);
	const { createFileFingerprint } = await import("@mediadrop/core");
	const fp = createFileFingerprint(file.file);
	await sessionStore.set(`tus:${fp}`, {
		type: "tus",
		fingerprint: fp,
		uploadUrl: "/files/expired",
		offset: 5,
		createdAt: 1,
		updatedAt: 1,
	});

	const transport = tusUpload({ endpoint: "/files", sessionStore });
	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});

	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(404); // HEAD fails — upload no longer exists server-side

	await waitForXhrCount(2);
	const create = MockXhr.instances[1];
	expect(create?.method).toBe("POST");
	create?.respond(201, { Location: "/files/new" });

	await waitForXhrCount(3);
	expect(MockXhr.instances[2]?.requestHeaders["Upload-Offset"]).toBe("0");
	MockXhr.instances[2]?.respond(204, { "Upload-Offset": "10" });

	await promise;
});

test("removes the session after a successful completion", async () => {
	const sessionStore = memoryUploadSessionStore();
	const file = makeFile("a.png", "image/png", 10);
	const transport = tusUpload({ endpoint: "/files", sessionStore });

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(201, { Location: "/files/abc" });
	await waitForXhrCount(2);
	MockXhr.instances[1]?.respond(204, { "Upload-Offset": "10" });
	await promise;

	const { createFileFingerprint } = await import("@mediadrop/core");
	const fp = createFileFingerprint(file.file);
	expect(await sessionStore.get(`tus:${fp}`)).toBeNull();
});

test("aborting the signal cancels the request and clears the session", async () => {
	const sessionStore = memoryUploadSessionStore();
	const file = makeFile("a.png", "image/png", 10);
	const controller = new AbortController();
	const transport = tusUpload({ endpoint: "/files", sessionStore });

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: controller.signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(201, { Location: "/files/abc" });
	await waitForXhrCount(2);

	controller.abort();
	await expect(promise).rejects.toThrow();
	expect(MockXhr.instances[1]?.aborted).toBe(true);

	const { createFileFingerprint } = await import("@mediadrop/core");
	const fp = createFileFingerprint(file.file);
	expect(await sessionStore.get(`tus:${fp}`)).toBeNull();
});

test("retries a failed chunk using the shared retry engine", async () => {
	const transport = tusUpload({
		endpoint: "/files",
		chunkRetries: 2,
		chunkRetryDelays: [0, 0],
	});
	const file = makeFile("a.png", "image/png", 10);

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(201, { Location: "/files/abc" });

	await waitForXhrCount(2);
	MockXhr.instances[1]?.respond(500); // first PATCH attempt fails

	await waitForXhrCount(3);
	expect(MockXhr.instances[2]?.method).toBe("PATCH");
	MockXhr.instances[2]?.respond(204, { "Upload-Offset": "10" }); // retry succeeds

	await promise;
});

test("a cancel that lands right as the final chunk resolves still rejects, not resolves", async () => {
	// Regression test: the queue (@mediadrop/core's upload-queue.ts) only ever
	// reports uploadStatus: "canceled" from a *rejected* transport promise —
	// a resolved one is always reported "done", regardless of the abort
	// signal. Without an explicit post-loop abort check, a cancel landing in
	// the narrow window right as the last PATCH resolves would be silently
	// ignored and reported "done" as if nothing happened.
	const controller = new AbortController();
	const transport = tusUpload({ endpoint: "/files" });
	const file = makeFile("a.png", "image/png", 10);

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: controller.signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(201, { Location: "/files/abc" });
	await waitForXhrCount(2);

	// Resolve the final chunk and cancel in the same synchronous tick — the
	// resolution wins the race (a settled promise can't be un-resolved), so
	// this reproduces "the request had already succeeded by the time the
	// cancel was processed" without relying on timing luck.
	MockXhr.instances[1]?.respond(204, { "Upload-Offset": "10" });
	controller.abort();

	await expect(promise).rejects.toThrow();
});

test("throws a typed TusError when creation fails, without retrying internally", async () => {
	const transport = tusUpload({ endpoint: "/files" });
	const promise = transport.upload(makeFile("a.png", "image/png", 10), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(500);

	await expect(promise).rejects.toBeInstanceOf(TusError);
	await expect(promise).rejects.toMatchObject({ code: "creation-failed" });
	expect(MockXhr.instances).toHaveLength(1); // no internal retry — that's the queue's job
});
