import { withRetry } from "./retry.js";
import type { UploadTransport } from "./transport.js";
import type { MediaDropError, MediaDropFile } from "./types.js";

export type UploadQueueOptions = {
	transport: UploadTransport;
	/** Max number of uploads in flight at once. Default `1` (sequential). */
	concurrency?: number;
	/** Retries *after* the first attempt, shared across every file. Default `0`. */
	retries?: number;
	retryDelays?: number[];
};

/**
 * The queue talks to file state only through this small interface instead
 * of reaching into a store directly — keeps the queue testable with a
 * plain in-memory fake, and keeps it from knowing anything about
 * `createStore`'s selector-subscription machinery.
 */
export type UploadQueueStore = {
	getFile: (id: string) => MediaDropFile | undefined;
	updateFile: (id: string, patch: Partial<MediaDropFile>) => void;
};

export type UploadQueue = {
	/** Queue a file for upload (or restart it, if it already finished/failed/was canceled). No-op if the file isn't `status: "accepted"` or is already in flight. */
	enqueue(id: string): void;
	/** Cancel one file: aborts it if uploading, drops it if merely queued. No-op otherwise. */
	cancel(id: string): void;
	/** Cancel every queued and in-flight file. */
	cancelAll(): void;
	/** Re-enqueue a file, but only if its last attempt ended in `uploadStatus: "error"`. */
	retry(id: string): void;
};

function toUploadError(error: unknown): MediaDropError {
	const message = error instanceof Error ? error.message : String(error);
	return { code: "upload-error", message };
}

/**
 * Owns upload orchestration: a FIFO queue, a concurrency limit, and (via
 * `withRetry`) shared retry/backoff. This is the one place concurrency and
 * retry are implemented in mediadrop — transports (e.g.
 * `@mediadrop/xhr-upload`) and bindings (React/vanilla) never reimplement
 * either.
 */
export function createUploadQueue(
	options: UploadQueueOptions,
	store: UploadQueueStore,
): UploadQueue {
	const { transport, concurrency = 1, retries = 0, retryDelays } = options;
	const pending: string[] = [];
	const active = new Map<string, AbortController>();

	function pump(): void {
		while (active.size < concurrency && pending.length > 0) {
			const id = pending.shift();
			if (id === undefined) break;
			// The file may have been removed from the store while it waited.
			if (!store.getFile(id)) continue;
			startUpload(id);
		}
	}

	function startUpload(id: string): void {
		const controller = new AbortController();
		active.set(id, controller);

		withRetry(
			(attemptNumber) => {
				const file = store.getFile(id);
				if (!file) {
					throw new Error(`mediadrop: file "${id}" was removed mid-upload.`);
				}
				store.updateFile(id, {
					uploadStatus: "uploading",
					uploadAttempts: attemptNumber,
					uploadError: undefined,
					progress: { loaded: 0, total: null },
				});
				return transport.upload(file, {
					signal: controller.signal,
					onProgress: (progress) => store.updateFile(id, { progress }),
				});
			},
			{ retries, retryDelays },
			controller.signal,
		)
			.then((result) => {
				store.updateFile(id, {
					uploadStatus: "done",
					uploadResult: result.response,
				});
			})
			.catch((error) => {
				if (controller.signal.aborted) {
					store.updateFile(id, { uploadStatus: "canceled" });
					return;
				}
				store.updateFile(id, {
					uploadStatus: "error",
					uploadError: toUploadError(error),
				});
			})
			.finally(() => {
				active.delete(id);
				pump();
			});
	}

	function enqueue(id: string): void {
		const file = store.getFile(id);
		if (file?.status !== "accepted") return;
		if (active.has(id) || pending.includes(id)) return;

		pending.push(id);
		store.updateFile(id, { uploadStatus: "queued", uploadError: undefined });
		pump();
	}

	function cancel(id: string): void {
		const controller = active.get(id);
		if (controller) {
			controller.abort();
			return;
		}
		const pendingIndex = pending.indexOf(id);
		if (pendingIndex !== -1) {
			pending.splice(pendingIndex, 1);
			store.updateFile(id, { uploadStatus: "canceled" });
		}
	}

	function cancelAll(): void {
		for (const id of [...pending]) cancel(id);
		for (const id of active.keys()) cancel(id);
	}

	function retry(id: string): void {
		const file = store.getFile(id);
		if (file?.uploadStatus !== "error") return;
		enqueue(id);
	}

	return { enqueue, cancel, cancelAll, retry };
}
