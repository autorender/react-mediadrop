import type { MediaDropFile, MediaDropUploadProgress } from "./types.js";

export type UploadTransportResult = {
	/** Whatever the transport got back on success — opaque to core, passed through to `MediaDropFile.uploadResult`. */
	response?: unknown;
};

export type UploadTransportContext = {
	onProgress: (progress: MediaDropUploadProgress) => void;
	/**
	 * Aborted when the queue cancels this upload (user cancel, or a fresh
	 * `retryUpload`/`uploadFile` superseding an in-flight one). Transports
	 * must wire this to whatever native cancellation they have (e.g.
	 * `XMLHttpRequest.abort()`) — core does not retry or reclassify a
	 * rejection as "canceled" on your behalf beyond checking this signal.
	 */
	signal: AbortSignal;
};

/**
 * The contract every upload transport implements. Deliberately one method:
 * transports do not own retry (the queue's shared retry engine does, see
 * `retry.ts`) or concurrency (the queue does) — a transport is just "send
 * this one file, once, and report progress." Keeping the contract this
 * thin is what lets the xhr transport (or any other adapter) stay a
 * few dozen lines with no retry/backoff logic of its own to get wrong.
 */
export type UploadTransport = {
	upload(
		file: MediaDropFile,
		context: UploadTransportContext,
	): Promise<UploadTransportResult>;
};
