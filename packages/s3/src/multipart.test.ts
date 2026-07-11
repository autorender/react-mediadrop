// @vitest-environment jsdom
import { createMemoryUploadSessionStore } from "@mediadrop/core";
import { installMockXhr, MockXhr, makeFile } from "@mediadrop/test-utils";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
	createS3MultipartUploadTransport,
	S3_MIN_PART_SIZE,
} from "./multipart.js";

let uninstall: () => void;
beforeEach(() => {
	uninstall = installMockXhr();
});
afterEach(() => {
	uninstall();
});

/** Waits until at least `count` XHRs have been opened (handles the async `getPartUploadUrl` hop before each one). */
async function waitForXhrCount(count: number): Promise<void> {
	await vi.waitFor(() => {
		expect(MockXhr.instances.length).toBeGreaterThanOrEqual(count);
	});
}

/** Responds to every currently-open, not-yet-responded XHR with a successful part upload. */
function respondAllOpenParts(): void {
	for (let i = 0; i < MockXhr.instances.length; i++) {
		const xhr = MockXhr.instances[i];
		if (xhr && xhr.status === 0) {
			xhr.respond(200, "", { ETag: `"etag-${i}"` });
		}
	}
}

/**
 * `expect(bytes).toEqual(expected)` on a multi-megabyte typed array takes
 * ~20+ seconds (chai's generic deep-equality isn't optimized for large
 * typed arrays) — a plain indexed loop is a few milliseconds instead, and
 * still reports exactly where the first mismatch is.
 */
function expectBytesEqual(
	actual: Uint8Array,
	expected: Uint8Array,
	label: string,
): void {
	if (actual.length !== expected.length) {
		throw new Error(
			`${label}: length mismatch — expected ${expected.length} bytes, got ${actual.length}`,
		);
	}
	for (let i = 0; i < actual.length; i++) {
		if (actual[i] !== expected[i]) {
			throw new Error(
				`${label}: byte mismatch at index ${i} — expected ${expected[i]}, got ${actual[i]}`,
			);
		}
	}
}

/** Drives every part of a `partConcurrency`-limited upload to completion, `concurrency` at a time. */
async function driveAllParts(
	totalParts: number,
	concurrency: number,
): Promise<void> {
	let done = 0;
	while (done < totalParts) {
		const batch = Math.min(concurrency, totalParts - done);
		await waitForXhrCount(done + batch);
		respondAllOpenParts();
		done += batch;
	}
}

test("splits a file into parts respecting the minimum part size, except the last part", async () => {
	const fileSize = S3_MIN_PART_SIZE * 2 + 100; // 2 full parts + a small remainder
	const partUrls: number[] = [];
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => {
			partUrls.push(partNumber);
			return { url: `https://s3.example/part/${partNumber}` };
		},
		completeMultipartUpload: async () => ({ location: "done", key: "k1" }),
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 1,
	});

	const promise = transport.upload(makeFile("a.png", "image/png", fileSize), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});

	await driveAllParts(3, 1);

	await promise;
	expect(partUrls).toEqual([1, 2, 3]);
});

test("sends each part's exact byte range — no off-by-one gap or overlap at part boundaries", async () => {
	// Distinguishable bytes at every position (not uniform padding) so a
	// boundary bug (e.g. sending [0,100),[100,200) instead of the correct
	// [0,100),[99,199)) is actually detectable, not invisible against
	// all-zero content. 2 full parts + a small remainder, matching the
	// part-count test above.
	const fileSize = S3_MIN_PART_SIZE * 2 + 100;
	const content = new Uint8Array(fileSize);
	for (let i = 0; i < fileSize; i++) content[i] = i % 256;
	const file = new File([content], "a.png", { type: "image/png" });

	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload: async () => ({ location: "done", key: "k1" }),
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 1,
	});

	const promise = transport.upload(
		{
			id: "a",
			file,
			name: "a.png",
			size: fileSize,
			type: "image/png",
			status: "accepted",
			errors: [],
		},
		{ onProgress: vi.fn(), signal: new AbortController().signal },
	);

	const expectedRanges = [
		[0, S3_MIN_PART_SIZE],
		[S3_MIN_PART_SIZE, S3_MIN_PART_SIZE * 2],
		[S3_MIN_PART_SIZE * 2, fileSize],
	];

	for (let i = 0; i < expectedRanges.length; i++) {
		await waitForXhrCount(i + 1);
		const xhr = MockXhr.instances[i];
		const sentBody = xhr?.sentBody;
		expect(sentBody).toBeInstanceOf(Blob);
		const bytes = new Uint8Array(await (sentBody as Blob).arrayBuffer());
		const [start, end] = expectedRanges[i] ?? [0, 0];
		expectBytesEqual(bytes, content.slice(start, end), `part ${i + 1}`);
		xhr?.respond(200, "", { ETag: `"etag-${i}"` });
	}

	await promise;
});

test("uploads parts with the given concurrency, not more at once", async () => {
	const fileSize = S3_MIN_PART_SIZE * 4;
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload: async () => ({ location: "done" }),
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 2,
	});

	const promise = transport.upload(makeFile("a.png", "image/png", fileSize), {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});

	await waitForXhrCount(2);
	// 4 parts, concurrency 2 -> exactly 2 XHRs open, not more, while those are pending.
	expect(MockXhr.instances).toHaveLength(2);

	respondAllOpenParts();
	await waitForXhrCount(4);
	expect(MockXhr.instances).toHaveLength(4);

	respondAllOpenParts();
	await promise;
});

test("aggregates progress across completed and in-flight parts without double-counting", async () => {
	const partSize = S3_MIN_PART_SIZE;
	const fileSize = partSize * 2;
	const onProgress = vi.fn();
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload: async () => ({ location: "done" }),
		partSize,
		partConcurrency: 2,
	});

	const promise = transport.upload(makeFile("a.png", "image/png", fileSize), {
		onProgress,
		signal: new AbortController().signal,
	});
	await waitForXhrCount(2);

	// Part 1 halfway, part 2 not started yet.
	MockXhr.instances[0]?.progress(partSize / 2, partSize);
	expect(onProgress).toHaveBeenLastCalledWith({
		loaded: partSize / 2,
		total: fileSize,
	});

	// Part 1 completes...
	MockXhr.instances[0]?.respond(200, "", { ETag: '"e1"' });
	await vi.waitFor(() => {
		expect(onProgress).toHaveBeenLastCalledWith({
			loaded: partSize,
			total: fileSize,
		});
	});
	// ...and part 2 is now halfway. Total loaded must be part1(full) + part2(half),
	// not part1(half, stale) + part2(half).
	MockXhr.instances[1]?.progress(partSize / 2, partSize);
	expect(onProgress).toHaveBeenLastCalledWith({
		loaded: partSize + partSize / 2,
		total: fileSize,
	});

	MockXhr.instances[1]?.respond(200, "", { ETag: '"e2"' });
	await promise;
});

test("collects ETags and completes with sorted, complete part numbers", async () => {
	const completeArgs: unknown[] = [];
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload: async (context) => {
			completeArgs.push(context.parts);
			return { location: "done", key: "k1" };
		},
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 3,
	});

	const promise = transport.upload(
		makeFile("a.png", "image/png", S3_MIN_PART_SIZE * 3),
		{ onProgress: vi.fn(), signal: new AbortController().signal },
	);
	await driveAllParts(3, 3);

	const result = await promise;
	expect(completeArgs[0]).toEqual([
		{ partNumber: 1, etag: '"etag-0"', size: S3_MIN_PART_SIZE },
		{ partNumber: 2, etag: '"etag-1"', size: S3_MIN_PART_SIZE },
		{ partNumber: 3, etag: '"etag-2"', size: S3_MIN_PART_SIZE },
	]);
	expect(result.response).toMatchObject({
		key: "k1",
		location: "done",
		uploadId: "u1",
	});
});

test("aborts the multipart upload on cancel and never completes it", async () => {
	const abortMultipartUpload = vi.fn().mockResolvedValue(undefined);
	const completeMultipartUpload = vi.fn();
	const controller = new AbortController();
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload,
		abortMultipartUpload,
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 2,
	});

	const promise = transport.upload(
		makeFile("a.png", "image/png", S3_MIN_PART_SIZE * 3),
		{ onProgress: vi.fn(), signal: controller.signal },
	);
	await waitForXhrCount(2);

	controller.abort();
	await expect(promise).rejects.toThrow();

	await vi.waitFor(() => {
		expect(abortMultipartUpload).toHaveBeenCalledWith({
			file: expect.anything(),
			key: "k1",
			uploadId: "u1",
		});
	});
	expect(completeMultipartUpload).not.toHaveBeenCalled();
});

test("aborts the multipart upload on a genuine failure too, not just cancel, and clears the session", async () => {
	const abortMultipartUpload = vi.fn().mockResolvedValue(undefined);
	const sessionStore = createMemoryUploadSessionStore();
	const removeSpy = vi.spyOn(sessionStore, "remove");
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload: vi.fn(),
		abortMultipartUpload,
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 1,
		partRetries: 0,
		sessionStore,
	});

	const promise = transport.upload(
		makeFile("a.png", "image/png", S3_MIN_PART_SIZE),
		{ onProgress: vi.fn(), signal: new AbortController().signal },
	);
	await waitForXhrCount(1);
	// A genuine, non-cancel failure — the part upload itself fails and every
	// retry (partRetries: 0, so just this one attempt) is exhausted.
	MockXhr.instances[0]?.respond(403, "Forbidden");

	await expect(promise).rejects.toMatchObject({ status: 403 });

	await vi.waitFor(() => {
		expect(abortMultipartUpload).toHaveBeenCalledWith({
			file: expect.anything(),
			key: "k1",
			uploadId: "u1",
		});
	});
	// The session pointed at an upload we just told S3 to abort — keeping
	// it around would make a later retry try to resume against a dead
	// uploadId, so it must be gone.
	expect(removeSpy).toHaveBeenCalled();
});

test("abortOnFailure: false leaves a genuinely failed upload's session and multipart upload alone", async () => {
	const abortMultipartUpload = vi.fn().mockResolvedValue(undefined);
	const sessionStore = createMemoryUploadSessionStore();
	const removeSpy = vi.spyOn(sessionStore, "remove");
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload: vi.fn(),
		abortMultipartUpload,
		abortOnFailure: false,
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 1,
		partRetries: 0,
		sessionStore,
	});

	const promise = transport.upload(
		makeFile("a.png", "image/png", S3_MIN_PART_SIZE),
		{ onProgress: vi.fn(), signal: new AbortController().signal },
	);
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(403, "Forbidden");

	await expect(promise).rejects.toMatchObject({ status: 403 });

	expect(abortMultipartUpload).not.toHaveBeenCalled();
	expect(removeSpy).not.toHaveBeenCalled();
});

test("partStallTimeoutMs aborts a stalled part and retries it, without touching other parts", async () => {
	vi.useFakeTimers();
	try {
		let getPartUrlCalls = 0;
		const transport = createS3MultipartUploadTransport({
			createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
			getPartUploadUrl: async ({ partNumber }) => {
				getPartUrlCalls++;
				return { url: `https://s3.example/part/${partNumber}` };
			},
			completeMultipartUpload: async () => ({ location: "done" }),
			partSize: S3_MIN_PART_SIZE,
			partConcurrency: 1,
			partStallTimeoutMs: 1000,
			partRetries: 1,
			partRetryDelays: [0],
		});

		const promise = transport.upload(
			makeFile("a.png", "image/png", S3_MIN_PART_SIZE),
			{ onProgress: vi.fn(), signal: new AbortController().signal },
		);
		// Let createMultipartUpload + getPartUploadUrl's async hops settle
		// (vi.waitFor auto-advances fake timers as needed).
		await waitForXhrCount(1);

		// No progress at all on the first attempt — it stalls.
		await vi.advanceTimersByTimeAsync(1000);
		expect(MockXhr.instances[0]?.aborted).toBe(true);

		// The shared retry engine (not a second timeout loop) retries the
		// same part with a fresh XHR, after its own (0ms) retry delay.
		await waitForXhrCount(2);
		expect(getPartUrlCalls).toBe(2);
		MockXhr.instances[1]?.respond(200, "", { ETag: '"etag-retry"' });

		await promise;
	} finally {
		vi.useRealTimers();
	}
});

test("retries a failed part using the shared retry engine, not a second retry loop", async () => {
	let getPartUrlCalls = 0;
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => {
			getPartUrlCalls++;
			return { url: `https://s3.example/part/${partNumber}` };
		},
		completeMultipartUpload: async () => ({ location: "done" }),
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 1,
		partRetries: 2,
		partRetryDelays: [0, 0],
	});

	const promise = transport.upload(
		makeFile("a.png", "image/png", S3_MIN_PART_SIZE),
		{
			onProgress: vi.fn(),
			signal: new AbortController().signal,
		},
	);
	await waitForXhrCount(1);
	// First attempt fails...
	MockXhr.instances[0]?.respond(500);
	// ...retry succeeds.
	await waitForXhrCount(2);
	MockXhr.instances[1]?.respond(200, "", { ETag: '"etag-retry"' });

	await promise;
	expect(getPartUrlCalls).toBe(2);
});

test("a permanent 4xx on a part fails fast instead of burning the retry budget", async () => {
	let getPartUrlCalls = 0;
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => {
			getPartUrlCalls++;
			return { url: `https://s3.example/part/${partNumber}` };
		},
		completeMultipartUpload: async () => ({ location: "done" }),
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 1,
		partRetries: 3,
		partRetryDelays: [0, 0, 0],
	});

	const promise = transport.upload(
		makeFile("a.png", "image/png", S3_MIN_PART_SIZE),
		{
			onProgress: vi.fn(),
			signal: new AbortController().signal,
		},
	);
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(403, "Forbidden");

	await expect(promise).rejects.toMatchObject({ status: 403 });
	// The default shouldRetry treats a 403 as permanent — one attempt, no retries.
	expect(getPartUrlCalls).toBe(1);
});

test("persists session metadata as parts complete, and resumes by skipping them", async () => {
	const sessionStore = createMemoryUploadSessionStore();
	const file = makeFile("a.png", "image/png", S3_MIN_PART_SIZE * 2);
	const createMultipartUpload = vi
		.fn()
		.mockResolvedValue({ uploadId: "u1", key: "k1" });
	const partUrlCalls: number[] = [];

	const makeTransport = () =>
		createS3MultipartUploadTransport({
			createMultipartUpload,
			getPartUploadUrl: async ({ partNumber }) => {
				partUrlCalls.push(partNumber);
				return { url: `https://s3.example/part/${partNumber}` };
			},
			completeMultipartUpload: async () => ({ location: "done" }),
			partSize: S3_MIN_PART_SIZE,
			partConcurrency: 1,
			sessionStore,
		});

	// First attempt: upload part 1, then abandon before part 2 finishes (simulates
	// a reload, not a deliberate cancel — the promise just never settles).
	const firstTransport = makeTransport();
	const firstAttempt = firstTransport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);
	MockXhr.instances[0]?.respond(200, "", { ETag: '"etag-part1"' });
	await waitForXhrCount(2); // part 2 requested and in flight
	void firstAttempt.catch(() => {});

	expect(createMultipartUpload).toHaveBeenCalledTimes(1);
	expect(partUrlCalls).toEqual([1, 2]);

	// Second attempt with a fresh transport instance (simulating a new page load,
	// same file reselected) must resume: skip part 1, re-request only part 2.
	partUrlCalls.length = 0;
	const secondTransport = makeTransport();
	const secondAttempt = secondTransport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await vi.waitFor(() => {
		expect(partUrlCalls).toEqual([2]);
	});
	expect(createMultipartUpload).toHaveBeenCalledTimes(1); // not called again — resumed instead

	const inFlight = MockXhr.instances.filter((xhr) => xhr.status === 0);
	inFlight[inFlight.length - 1]?.respond(200, "", { ETag: '"etag-part2"' });

	const result = await secondAttempt;
	expect(result.response).toMatchObject({ uploadId: "u1" });
});

test("a stored session whose fingerprint doesn't match the current file starts a fresh upload instead of resuming", async () => {
	const sessionStore = createMemoryUploadSessionStore();
	const file = makeFile("a.png", "image/png", S3_MIN_PART_SIZE);

	// A session for a *different* file (deliberately wrong fingerprint) —
	// isValidSession must reject this and treat it as "no session."
	await sessionStore.set("s3-multipart:not-this-files-fingerprint", {
		type: "s3-multipart",
		fingerprint: "not-this-files-fingerprint",
		uploadId: "stale-upload",
		key: "stale-key",
		partSize: S3_MIN_PART_SIZE,
		completedParts: [
			{ partNumber: 1, etag: '"stale"', size: S3_MIN_PART_SIZE },
		],
		createdAt: 1,
		updatedAt: 1,
	});

	const createMultipartUpload = vi
		.fn()
		.mockResolvedValue({ uploadId: "u-fresh", key: "k-fresh" });
	const getPartUploadUrl = vi
		.fn()
		.mockResolvedValue({ url: "https://s3.example/part/1" });
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload,
		getPartUploadUrl,
		completeMultipartUpload: async () => ({ location: "done" }),
		partSize: S3_MIN_PART_SIZE,
		sessionStore,
	});

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await driveAllParts(1, 1);
	await promise;

	// A fresh upload was created — the stale, differently-fingerprinted
	// session was never trusted.
	expect(createMultipartUpload).toHaveBeenCalledTimes(1);
	expect(getPartUploadUrl).toHaveBeenCalledWith(
		expect.objectContaining({ uploadId: "u-fresh", key: "k-fresh" }),
	);
});

test("a resumed uploadId that S3 no longer recognizes (404) fails cleanly instead of hanging or silently succeeding", async () => {
	// Documents current behavior without `listUploadedParts` configured:
	// the stored uploadId/parts are trusted optimistically — the first
	// request against a now-gone upload ID is what actually surfaces the
	// problem, as a normal (non-retried, since 404 is a permanent 4xx)
	// HTTP error, not silent corruption or a hang.
	const sessionStore = createMemoryUploadSessionStore();
	// Exactly one part — avoids the default partConcurrency (3) opening a
	// second, never-responded-to XHR alongside the one this test resolves.
	const file = makeFile("a.png", "image/png", S3_MIN_PART_SIZE);
	const { createFileFingerprint } = await import("@mediadrop/core");
	const fp = await createFileFingerprint(file.file);
	await sessionStore.set(`s3-multipart:${fp}`, {
		type: "s3-multipart",
		fingerprint: fp,
		uploadId: "gone-upload",
		key: "k1",
		partSize: S3_MIN_PART_SIZE,
		completedParts: [],
		createdAt: 1,
		updatedAt: 1,
	});

	const abortMultipartUpload = vi.fn().mockResolvedValue(undefined);
	const createMultipartUpload = vi.fn();
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload,
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload: vi.fn(),
		abortMultipartUpload,
		partSize: S3_MIN_PART_SIZE,
		partConcurrency: 1,
		partRetries: 0,
		sessionStore,
	});

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await waitForXhrCount(1);
	// The uploadId in the resumed session no longer exists server-side.
	MockXhr.instances[0]?.respond(404, "NoSuchUpload");

	await expect(promise).rejects.toMatchObject({ status: 404 });
	// Resumed against a stale uploadId — createMultipartUpload is never
	// called (the code trusted the stored uploadId instead of creating a
	// new one), and the failed upload is cleaned up: abort attempted,
	// session cleared, so a subsequent retry starts genuinely fresh.
	expect(createMultipartUpload).not.toHaveBeenCalled();
	await vi.waitFor(() => {
		expect(abortMultipartUpload).toHaveBeenCalledWith(
			expect.objectContaining({ uploadId: "gone-upload", key: "k1" }),
		);
	});
	expect(await sessionStore.get(`s3-multipart:${fp}`)).toBeNull();
});

test("without listUploadedParts, a stored completedParts entry inconsistent with the current file's part plan is trusted as-is (documented limitation)", async () => {
	// This documents a real, already-disclosed tradeoff (see
	// `listUploadedParts`'s own doc comment in multipart.ts): without it,
	// resume trusts locally stored part metadata without checking it's
	// actually consistent with the current file's own computed part
	// boundaries. Here the stored "completed" part 1 has a size that
	// doesn't match what computePartPlan would produce for this file — the
	// upload still treats it as done and skips re-uploading it, rather than
	// detecting the inconsistency. Recommendation for a follow-up: consider
	// validating a resumed session's completedParts total size against the
	// current file's size before trusting it, falling back to a fresh
	// upload on mismatch, when `listUploadedParts` isn't configured.
	const sessionStore = createMemoryUploadSessionStore();
	const file = makeFile("a.png", "image/png", S3_MIN_PART_SIZE * 2);
	const { createFileFingerprint } = await import("@mediadrop/core");
	const fp = await createFileFingerprint(file.file);
	await sessionStore.set(`s3-multipart:${fp}`, {
		type: "s3-multipart",
		fingerprint: fp,
		uploadId: "u1",
		key: "k1",
		partSize: S3_MIN_PART_SIZE,
		// Inconsistent: this file's real part 1 is exactly S3_MIN_PART_SIZE
		// bytes, but the stored metadata claims a different size for it.
		completedParts: [
			{ partNumber: 1, etag: '"stale-etag"', size: S3_MIN_PART_SIZE - 10 },
		],
		createdAt: 1,
		updatedAt: 1,
	});

	const getPartUploadUrl = vi
		.fn()
		.mockResolvedValue({ url: "https://s3.example/part/2" });
	const completeArgs: unknown[] = [];
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: vi.fn(),
		getPartUploadUrl,
		completeMultipartUpload: async (context) => {
			completeArgs.push(context.parts);
			return { location: "done", key: "k1" };
		},
		partSize: S3_MIN_PART_SIZE,
		sessionStore,
	});

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});

	// Part 1 is never re-requested — it's trusted as already done, despite
	// the size mismatch. Only part 2 gets uploaded.
	await waitForXhrCount(1);
	expect(getPartUploadUrl).toHaveBeenCalledTimes(1);
	expect(getPartUploadUrl).toHaveBeenCalledWith(
		expect.objectContaining({ partNumber: 2 }),
	);
	MockXhr.instances[0]?.respond(200, "", { ETag: '"etag-2"' });

	await promise;
	// The stale, size-inconsistent part 1 metadata is passed straight
	// through to completeMultipartUpload unchanged.
	expect(completeArgs[0]).toEqual([
		{ partNumber: 1, etag: '"stale-etag"', size: S3_MIN_PART_SIZE - 10 },
		{ partNumber: 2, etag: '"etag-2"', size: S3_MIN_PART_SIZE },
	]);
});

test("removes the session after a successful completion", async () => {
	const sessionStore = createMemoryUploadSessionStore();
	const setSpy = vi.spyOn(sessionStore, "set");
	const removeSpy = vi.spyOn(sessionStore, "remove");
	const file = makeFile("a.png", "image/png", S3_MIN_PART_SIZE);
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload: async () => ({ location: "done" }),
		partSize: S3_MIN_PART_SIZE,
		sessionStore,
	});

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await driveAllParts(1, 1);
	await promise;

	expect(setSpy).toHaveBeenCalled();
	expect(removeSpy).toHaveBeenCalledTimes(1);

	const { createFileFingerprint } = await import("@mediadrop/core");
	const fp = createFileFingerprint(file.file);
	expect(await sessionStore.get(`s3-multipart:${fp}`)).toBeNull();
});

test("falls back to trusting local session metadata when listUploadedParts fails", async () => {
	const sessionStore = createMemoryUploadSessionStore();
	const file = makeFile("a.png", "image/png", S3_MIN_PART_SIZE);

	// Pre-seed a session as if part 1 already completed.
	const { createFileFingerprint } = await import("@mediadrop/core");
	const fp = createFileFingerprint(file.file);
	await sessionStore.set(`s3-multipart:${fp}`, {
		type: "s3-multipart",
		fingerprint: fp,
		uploadId: "u1",
		key: "k1",
		partSize: S3_MIN_PART_SIZE,
		completedParts: [
			{ partNumber: 1, etag: '"seeded"', size: S3_MIN_PART_SIZE },
		],
		createdAt: 1,
		updatedAt: 1,
	});

	const getPartUploadUrl = vi.fn();
	const completeMultipartUpload = vi
		.fn()
		.mockResolvedValue({ location: "done" });
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: vi.fn(),
		getPartUploadUrl,
		completeMultipartUpload,
		listUploadedParts: async () => {
			throw new Error("S3 is unreachable");
		},
		partSize: S3_MIN_PART_SIZE,
		sessionStore,
	});

	const promise = transport.upload(file, {
		onProgress: vi.fn(),
		signal: new AbortController().signal,
	});
	await promise;

	// Only 1 part total (file fits in one part) and it was already "completed"
	// per local metadata, so no part URL should ever be requested.
	expect(getPartUploadUrl).not.toHaveBeenCalled();
	expect(completeMultipartUpload).toHaveBeenCalledWith(
		expect.objectContaining({
			parts: [{ partNumber: 1, etag: '"seeded"', size: S3_MIN_PART_SIZE }],
		}),
	);
});

test("a cancel that lands while completeMultipartUpload is in flight still rejects, not resolves", async () => {
	// Regression test: the queue (@mediadrop/core's upload-queue.ts) only ever
	// reports uploadStatus: "canceled" from a *rejected* transport promise —
	// a resolved one is always reported "done", regardless of the abort
	// signal. Without an explicit post-completion abort check, a cancel
	// requested in the narrow window while completeMultipartUpload is still
	// pending would be silently ignored: the object gets created in S3 *and*
	// the file is reported "done" as if nothing happened.
	let resolveComplete!: (value: { location: string }) => void;
	const completeMultipartUpload = vi.fn(
		() =>
			new Promise<{ location: string }>((resolve) => {
				resolveComplete = resolve;
			}),
	);
	const abortMultipartUpload = vi.fn().mockResolvedValue(undefined);
	const controller = new AbortController();
	const transport = createS3MultipartUploadTransport({
		createMultipartUpload: async () => ({ uploadId: "u1", key: "k1" }),
		getPartUploadUrl: async ({ partNumber }) => ({
			url: `https://s3.example/part/${partNumber}`,
		}),
		completeMultipartUpload,
		abortMultipartUpload,
		partSize: S3_MIN_PART_SIZE,
	});

	const promise = transport.upload(
		makeFile("a.png", "image/png", S3_MIN_PART_SIZE),
		{
			onProgress: vi.fn(),
			signal: controller.signal,
		},
	);
	await driveAllParts(1, 1);
	await vi.waitFor(() => expect(completeMultipartUpload).toHaveBeenCalled());

	// Cancel while completeMultipartUpload is still pending, then let it resolve.
	controller.abort();
	resolveComplete({ location: "done" });

	await expect(promise).rejects.toThrow();
});
