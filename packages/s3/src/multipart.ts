import {
	createFileFingerprint,
	type MediaDropUploadSessionStore,
	type RetryOptions,
	type UploadTransport,
	withRetry,
} from "@mediadrop/core";
import type {
	S3MultipartAbortContext,
	S3MultipartCompleteContext,
	S3MultipartCompleteResult,
	S3MultipartCreateContext,
	S3MultipartCreateResult,
	S3MultipartListPartsContext,
	S3MultipartPart,
	S3MultipartPartUrlContext,
	S3MultipartPartUrlResult,
	S3MultipartSession,
} from "./types.js";

/** S3 requires every part except the last to be at least this size. */
export const S3_MIN_PART_SIZE = 5 * 1024 * 1024;
/** S3 allows at most this many parts per multipart upload. */
export const S3_MAX_PART_COUNT = 10_000;

export type S3MultipartUploadOptions = {
	createMultipartUpload: (
		context: S3MultipartCreateContext,
	) => Promise<S3MultipartCreateResult>;
	getPartUploadUrl: (
		context: S3MultipartPartUrlContext,
	) => Promise<S3MultipartPartUrlResult>;
	completeMultipartUpload: (
		context: S3MultipartCompleteContext,
	) => Promise<S3MultipartCompleteResult>;
	/** Called on cancel, if an upload was already created and `abortOnCancel` (default `true`) isn't disabled. Best-effort — a failure here doesn't change the cancel outcome. */
	abortMultipartUpload?: (context: S3MultipartAbortContext) => Promise<void>;
	/**
	 * Reconciles resumed local metadata against S3's real state before
	 * skipping "already uploaded" parts. Without this, a resumed upload
	 * trusts locally persisted part numbers/ETags as-is — accurate as long
	 * as nothing external touched the multipart upload, but not verified
	 * against S3 directly. See the package README.
	 */
	listUploadedParts?: (
		context: S3MultipartListPartsContext,
	) => Promise<S3MultipartPart[]>;

	/** Target size per part. Clamped up to `S3_MIN_PART_SIZE`, and up further if needed to stay within `S3_MAX_PART_COUNT` parts. Default 8 MiB. */
	partSize?: number;
	/** Max parts uploading at once. Default `3`. */
	partConcurrency?: number;
	/** Retries per part *after* the first attempt, via `@mediadrop/core`'s `withRetry` — not a second, hand-rolled retry loop. Default `3`. */
	partRetries?: number;
	partRetryDelays?: number[];

	/** Enables resumable metadata persistence. Required for `resume`. */
	sessionStore?: MediaDropUploadSessionStore;
	/** Defaults to `@mediadrop/core`'s `createFileFingerprint` (metadata-based, not content-hashed). */
	fingerprint?: (file: File) => string | Promise<string>;
	/** Default: `true` if `sessionStore` is provided, `false` otherwise. */
	resume?: boolean;
	/** Call `abortMultipartUpload` (if provided) when the upload is canceled. Default `true`. */
	abortOnCancel?: boolean;
};

type PartPlan = { partNumber: number; start: number; end: number };
type PartPlanResult = { partSize: number; parts: PartPlan[] };

function computePartPlan(
	fileSize: number,
	requestedPartSize: number,
): PartPlanResult {
	let partSize = Math.max(requestedPartSize, S3_MIN_PART_SIZE);
	if (Math.ceil(fileSize / partSize) > S3_MAX_PART_COUNT) {
		partSize = Math.ceil(fileSize / S3_MAX_PART_COUNT);
	}

	const parts: PartPlan[] = [];
	let start = 0;
	let partNumber = 1;
	while (start < fileSize) {
		const end = Math.min(start + partSize, fileSize);
		parts.push({ partNumber, start, end });
		start = end;
		partNumber += 1;
	}
	// A zero-byte file still needs exactly one (empty) part.
	if (parts.length === 0) {
		parts.push({ partNumber: 1, start: 0, end: 0 });
	}
	return { partSize, parts };
}

function isValidSession(
	value: unknown,
	fingerprint: string,
): value is S3MultipartSession {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		v.type === "s3-multipart" &&
		v.fingerprint === fingerprint &&
		typeof v.uploadId === "string" &&
		typeof v.key === "string" &&
		typeof v.partSize === "number" &&
		Array.isArray(v.completedParts)
	);
}

function uploadPartBytes(
	url: string,
	headers: Record<string, string> | undefined,
	blob: Blob,
	signal: AbortSignal,
	onProgress: (loaded: number) => void,
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error("Upload aborted"));
			return;
		}
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url, true);
		for (const [key, value] of Object.entries(headers ?? {})) {
			xhr.setRequestHeader(key, value);
		}
		xhr.upload.onprogress = (event) => onProgress(event.loaded);
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				const etag = xhr.getResponseHeader("ETag");
				if (!etag) {
					reject(
						new Error(
							'S3 part upload succeeded but the "ETag" response header was not readable. ' +
								'Your bucket CORS config likely needs "ETag" in ExposeHeaders — see the package README.',
						),
					);
					return;
				}
				resolve(etag);
			} else {
				reject(new Error(`Part upload failed with status ${xhr.status}`));
			}
		};
		xhr.onerror = () => reject(new Error("Part upload failed: network error"));
		xhr.onabort = () => reject(new Error("Upload aborted"));
		signal.addEventListener("abort", () => xhr.abort(), { once: true });
		xhr.send(blob);
	});
}

/** Runs `worker` over `items` with at most `concurrency` in flight; the first thrown error wins and stops scheduling further items (already-running ones are left to the caller's own `signal` wiring to cut short). */
async function runWithConcurrency<T>(
	items: T[],
	concurrency: number,
	worker: (item: T) => Promise<void>,
	signal: AbortSignal,
): Promise<void> {
	let index = 0;
	let firstError: unknown;
	let hasError = false;

	async function runNext(): Promise<void> {
		while (!signal.aborted && !hasError) {
			const i = index++;
			const item = items[i];
			if (item === undefined) return;
			try {
				await worker(item);
			} catch (error) {
				if (!hasError) {
					hasError = true;
					firstError = error;
				}
				return;
			}
		}
	}

	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	await Promise.all(Array.from({ length: workerCount }, () => runNext()));
	if (hasError) throw firstError;
}

/**
 * S3 multipart upload: splits a file into parts, uploads them with bounded
 * concurrency, aggregates progress across parts, retries a failed part
 * with `@mediadrop/core`'s shared `withRetry` (never a second retry loop),
 * and — with `sessionStore` — persists enough metadata to skip
 * already-uploaded parts if this exact file (by fingerprint) is
 * re-uploaded, including after a page reload. It does not persist file
 * bytes; see the package README for exactly what resuming does and
 * doesn't mean.
 *
 * Your backend does the signing (`createMultipartUpload`/
 * `getPartUploadUrl`/`completeMultipartUpload`/`abortMultipartUpload`) —
 * this package never sees AWS credentials and has no AWS SDK dependency.
 */
export function s3MultipartUpload(
	options: S3MultipartUploadOptions,
): UploadTransport {
	const {
		createMultipartUpload,
		getPartUploadUrl,
		completeMultipartUpload,
		abortMultipartUpload,
		listUploadedParts,
		partSize: requestedPartSize = 8 * 1024 * 1024,
		partConcurrency = 3,
		partRetries = 3,
		partRetryDelays,
		sessionStore,
		fingerprint = createFileFingerprint,
		resume = Boolean(sessionStore),
		abortOnCancel = true,
	} = options;

	return {
		async upload(file, { onProgress, signal }) {
			if (signal.aborted) {
				throw new Error("Upload aborted");
			}

			const fp = await fingerprint(file.file);
			const sessionKey = `s3-multipart:${fp}`;

			let session: S3MultipartSession | null = null;
			if (resume && sessionStore) {
				const stored = await sessionStore.get(sessionKey);
				if (isValidSession(stored, fp)) session = stored;
			}

			// A resumed session's parts were cut at its own partSize — reuse it
			// so part boundaries (and therefore part numbers) line up.
			const { partSize: effectivePartSize, parts: plan } = computePartPlan(
				file.file.size,
				session?.partSize ?? requestedPartSize,
			);

			let uploadId: string | undefined;
			let key: string | undefined;
			const completedParts = new Map<number, S3MultipartPart>();

			try {
				if (session) {
					uploadId = session.uploadId;
					key = session.key;
					for (const part of session.completedParts) {
						completedParts.set(part.partNumber, part);
					}
					if (listUploadedParts) {
						try {
							const remoteParts = await listUploadedParts({
								file,
								key,
								uploadId,
							});
							completedParts.clear();
							for (const part of remoteParts)
								completedParts.set(part.partNumber, part);
						} catch {
							// Reconciliation failed — fall back to trusting local metadata,
							// a documented limitation rather than a hard failure.
						}
					}
				} else {
					const created = await createMultipartUpload({ file });
					uploadId = created.uploadId;
					key = created.key;
				}

				const persist = async (): Promise<void> => {
					if (!sessionStore || !uploadId || !key) return;
					const now = Date.now();
					await sessionStore.set(sessionKey, {
						type: "s3-multipart",
						fingerprint: fp,
						uploadId,
						key,
						partSize: effectivePartSize,
						completedParts: [...completedParts.values()],
						createdAt: session?.createdAt ?? now,
						updatedAt: now,
					} satisfies S3MultipartSession);
				};

				// Persist immediately so a cancel/reload right after creation still
				// knows the uploadId/key to resume or abort against.
				await persist();

				const activeUploadId = uploadId;
				const activeKey = key;
				const partProgress = new Map<number, number>();

				function reportProgress(): void {
					let loaded = 0;
					for (const part of completedParts.values()) loaded += part.size;
					for (const bytes of partProgress.values()) loaded += bytes;
					onProgress({
						loaded: Math.min(loaded, file.file.size),
						total: file.file.size,
					});
				}

				const partSignalController = new AbortController();
				const onExternalAbort = (): void => partSignalController.abort();
				signal.addEventListener("abort", onExternalAbort, { once: true });

				const retryOptions: RetryOptions = {
					retries: partRetries,
					retryDelays: partRetryDelays,
				};

				async function uploadOnePart(part: PartPlan): Promise<void> {
					if (completedParts.has(part.partNumber)) return;
					const blob = file.file.slice(part.start, part.end);
					const size = part.end - part.start;

					const etag = await withRetry(
						async () => {
							partProgress.set(part.partNumber, 0);
							const { url, headers } = await getPartUploadUrl({
								file,
								key: activeKey,
								uploadId: activeUploadId,
								partNumber: part.partNumber,
							});
							return uploadPartBytes(
								url,
								headers,
								blob,
								partSignalController.signal,
								(loaded) => {
									partProgress.set(part.partNumber, loaded);
									reportProgress();
								},
							);
						},
						retryOptions,
						partSignalController.signal,
					);

					partProgress.delete(part.partNumber);
					completedParts.set(part.partNumber, {
						partNumber: part.partNumber,
						etag,
						size,
					});
					reportProgress();
					await persist();
				}

				try {
					await runWithConcurrency(
						plan,
						partConcurrency,
						uploadOnePart,
						partSignalController.signal,
					);
				} finally {
					signal.removeEventListener("abort", onExternalAbort);
				}

				if (signal.aborted) {
					throw new Error("Upload aborted");
				}

				const sortedParts = [...completedParts.values()].sort(
					(a, b) => a.partNumber - b.partNumber,
				);
				const result = await completeMultipartUpload({
					file,
					key: activeKey,
					uploadId: activeUploadId,
					parts: sortedParts,
				});

				// A cancel requested while `completeMultipartUpload` was in flight
				// can't stop that request — but it can still stop us from reporting
				// success. The queue only ever reports "canceled" from a *rejected*
				// promise (see @mediadrop/core's upload-queue.ts), so a resolved one
				// here would otherwise be reported "done" regardless of the cancel.
				if (signal.aborted) {
					throw new Error("Upload aborted");
				}

				if (sessionStore) await sessionStore.remove(sessionKey);

				return {
					response: {
						key: result.key ?? activeKey,
						location: result.location,
						uploadId: activeUploadId,
						parts: sortedParts,
					},
				};
			} catch (error) {
				if (signal.aborted) {
					if (abortOnCancel && abortMultipartUpload && uploadId && key) {
						try {
							await abortMultipartUpload({ file, key, uploadId });
						} catch {
							// Best-effort — the cancel outcome doesn't depend on this succeeding.
						}
					}
					// Phase 3 has no pause: every cancel is final, so its resume
					// session is discarded rather than left around indefinitely.
					if (sessionStore) await sessionStore.remove(sessionKey);
				}
				throw error;
			}
		},
	};
}
