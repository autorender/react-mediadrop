import {
	createFileFingerprint,
	type MediaDropFile,
	type MediaDropUploadSessionStore,
	type UploadTransport,
	withRetry,
} from "@mediadrop/core";
import { createUpload, headUpload, patchChunk } from "./protocol.js";
import { TusError, type TusSession } from "./types.js";

export type TusUploadOptions = {
	/** The tus server's creation endpoint, e.g. `"/files"`. */
	endpoint: string;
	/** Bytes per `PATCH` request. Default 8 MiB. */
	chunkSize?: number;
	/** Extra headers sent with every request (creation, HEAD, and PATCH). */
	headers?:
		| Record<string, string>
		| ((file: MediaDropFile) => Record<string, string>);
	/** Extra `Upload-Metadata` entries beyond the `filename`/`filetype` mediadrop always sends. */
	metadata?:
		| Record<string, string>
		| ((file: MediaDropFile) => Record<string, string>);
	/** Enables resumable metadata persistence. Required for `resume`. */
	sessionStore?: MediaDropUploadSessionStore;
	/** Defaults to `@mediadrop/core`'s `createFileFingerprint` (metadata-based, not content-hashed). */
	fingerprint?: (file: File) => string | Promise<string>;
	/** Default: `true` if `sessionStore` is provided, `false` otherwise. */
	resume?: boolean;
	/** Retries per chunk *after* the first attempt, via `@mediadrop/core`'s `withRetry`. Default `3`. */
	chunkRetries?: number;
	chunkRetryDelays?: number[];
};

function resolveOption<T>(
	value: T | ((file: MediaDropFile) => T) | undefined,
	file: MediaDropFile,
): T | undefined {
	return typeof value === "function"
		? (value as (file: MediaDropFile) => T)(file)
		: value;
}

function base64EncodeUtf8(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function buildMetadataHeader(
	file: MediaDropFile,
	extra: Record<string, string> | undefined,
): string {
	const entries: Array<[string, string]> = [
		["filename", file.name],
		["filetype", file.type],
		...Object.entries(extra ?? {}),
	];
	return entries
		.map(([key, value]) => `${key} ${base64EncodeUtf8(value)}`)
		.join(",");
}

function isValidSession(
	value: unknown,
	fingerprint: string,
): value is TusSession {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		v.type === "tus" &&
		v.fingerprint === fingerprint &&
		typeof v.uploadUrl === "string"
	);
}

/**
 * A small, dependency-free tus client covering only the core protocol
 * flow: create (`POST`), upload (`PATCH`), and resume (`HEAD` for the
 * authoritative offset). See the package README for the tus extensions
 * this deliberately does not implement (checksum, creation-with-upload,
 * expiration, concatenation, deferred-length, termination).
 *
 * Retries a failed chunk with `@mediadrop/core`'s shared `withRetry` —
 * this adapter has no retry/backoff logic of its own. Resuming across a
 * page reload requires the user to reselect the same file (matched by
 * fingerprint) — nothing here persists file bytes.
 */
export function tusUpload(options: TusUploadOptions): UploadTransport {
	const {
		endpoint,
		chunkSize = 8 * 1024 * 1024,
		headers,
		metadata,
		sessionStore,
		fingerprint = createFileFingerprint,
		resume = Boolean(sessionStore),
		chunkRetries = 3,
		chunkRetryDelays,
	} = options;

	return {
		async upload(file, { onProgress, signal }) {
			if (signal.aborted) {
				throw new TusError("aborted", "Upload aborted");
			}

			const fp = await fingerprint(file.file);
			const sessionKey = `tus:${fp}`;
			const resolvedHeaders = resolveOption(headers, file);

			let session: TusSession | null = null;
			if (resume && sessionStore) {
				const stored = await sessionStore.get(sessionKey);
				if (isValidSession(stored, fp)) session = stored;
			}

			let uploadUrl: string | undefined;

			try {
				let offset: number;
				if (session) {
					try {
						const head = await headUpload(session.uploadUrl, {
							headers: resolvedHeaders,
							signal,
						});
						uploadUrl = session.uploadUrl;
						offset = head.offset;
					} catch {
						// The persisted upload is gone server-side (expired/deleted) —
						// fall back to starting a fresh one instead of failing outright.
						session = null;
						const created = await createUpload(endpoint, {
							uploadLength: file.file.size,
							metadataHeader: buildMetadataHeader(
								file,
								resolveOption(metadata, file),
							),
							headers: resolvedHeaders,
							signal,
						});
						uploadUrl = created.uploadUrl;
						offset = 0;
					}
				} else {
					const created = await createUpload(endpoint, {
						uploadLength: file.file.size,
						metadataHeader: buildMetadataHeader(
							file,
							resolveOption(metadata, file),
						),
						headers: resolvedHeaders,
						signal,
					});
					uploadUrl = created.uploadUrl;
					offset = 0;
				}

				const activeUploadUrl = uploadUrl;
				const persist = async (currentOffset: number): Promise<void> => {
					if (!sessionStore) return;
					const now = Date.now();
					await sessionStore.set(sessionKey, {
						type: "tus",
						fingerprint: fp,
						uploadUrl: activeUploadUrl,
						offset: currentOffset,
						createdAt: session?.createdAt ?? now,
						updatedAt: now,
					} satisfies TusSession);
				};

				await persist(offset);
				onProgress({ loaded: offset, total: file.file.size });

				while (offset < file.file.size) {
					const chunkStart = offset;
					const chunkEnd = Math.min(chunkStart + chunkSize, file.file.size);
					const chunk = file.file.slice(chunkStart, chunkEnd);

					const result = await withRetry(
						() =>
							patchChunk(activeUploadUrl, {
								offset: chunkStart,
								chunk,
								headers: resolvedHeaders,
								signal,
								onProgress: (loaded) =>
									onProgress({
										loaded: chunkStart + loaded,
										total: file.file.size,
									}),
							}),
						{ retries: chunkRetries, retryDelays: chunkRetryDelays },
						signal,
					);

					if (result.offset <= chunkStart) {
						throw new TusError(
							"offset-mismatch",
							"tus server reported no progress after a successful PATCH",
						);
					}
					offset = result.offset;
					onProgress({ loaded: offset, total: file.file.size });
					await persist(offset);
				}

				// A cancel requested right as the last chunk's PATCH resolved can't
				// un-send that request — but it can still stop us from reporting
				// success. The queue only reports "canceled" from a *rejected*
				// promise (see @mediadrop/core's upload-queue.ts), so a resolved
				// one here would otherwise be reported "done" regardless of cancel.
				if (signal.aborted) {
					throw new TusError("aborted", "Upload aborted");
				}

				if (sessionStore) await sessionStore.remove(sessionKey);
				return { response: { uploadUrl: activeUploadUrl, offset } };
			} catch (error) {
				if (signal.aborted && sessionStore) {
					// Same policy as @mediadrop/s3: Phase 3 has no pause, so a cancel
					// is final and its resume session is discarded, not kept "for later."
					await sessionStore.remove(sessionKey);
				}
				throw error;
			}
		},
	};
}
