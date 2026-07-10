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
	/**
	 * Grace period (ms) after `cancel`/`cancelAll` aborts a transport's
	 * `signal` before the queue force-frees that upload's concurrency slot
	 * regardless of whether the transport's promise has settled. The
	 * contract every transport is supposed to follow is "wire up `signal`
	 * and reject once aborted" — but a transport that doesn't (a bug, or a
	 * third-party one you don't control) would otherwise leak its slot
	 * forever, silently starving every file still waiting behind it.
	 * Default `5000`.
	 */
	cancelGraceMs?: number;
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

	// `createHttpError` (retry.ts) attaches `status`; `@mediadrop/tus`'s
	// `TusError` attaches `code`. Neither is a class this module imports —
	// both are duck-typed here so any current or future transport's own
	// error-tagging convention is picked up without core needing to know
	// about it by name.
	const tagged = error as { status?: unknown; code?: unknown } | null;
	const status =
		error instanceof Error && typeof tagged?.status === "number"
			? tagged.status
			: undefined;
	const sourceCode =
		error instanceof Error && typeof tagged?.code === "string"
			? tagged.code
			: undefined;

	return {
		code: "upload-error",
		message,
		...(status !== undefined ? { status } : {}),
		...(sourceCode !== undefined ? { sourceCode } : {}),
	};
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
	const {
		transport,
		concurrency = 1,
		retries = 0,
		retryDelays,
		cancelGraceMs = 5000,
	} = options;
	const pending: string[] = [];
	const active = new Map<string, AbortController>();
	const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function clearGraceTimer(id: string): void {
		const timer = graceTimers.get(id);
		if (timer !== undefined) {
			clearTimeout(timer);
			graceTimers.delete(id);
		}
	}

	// Shared by the settle handlers below and `scheduleForceFree` — true
	// only if `id` still maps to this exact controller/attempt. Without
	// this, a transport that settles *after* force-free already reassigned
	// `id` to a brand-new attempt (a fast retry within the grace window)
	// would clobber that newer attempt's live state with its own stale
	// result.
	function isStillActive(id: string, controller: AbortController): boolean {
		return active.get(id) === controller;
	}

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
				if (!isStillActive(id, controller)) return;
				if (controller.signal.aborted) {
					store.updateFile(id, { uploadStatus: "canceled" });
					return;
				}
				store.updateFile(id, {
					uploadStatus: "done",
					uploadResult: result.response,
				});
			})
			.catch((error) => {
				if (!isStillActive(id, controller)) return;
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
				clearGraceTimer(id);
				if (isStillActive(id, controller)) {
					active.delete(id);
				}
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

	// If `transport.upload()` doesn't honor `signal` (a bug, or a
	// third-party transport you don't control), calling `controller.abort()`
	// alone would leave this slot occupied forever, and everything still
	// `pending` behind it would starve. This timer force-frees the slot
	// after `cancelGraceMs` regardless — checked against the exact
	// `controller` instance so it can't misfire against a *later* attempt
	// that reused the same file id (e.g. a fast retry within the grace
	// window).
	function scheduleForceFree(id: string, controller: AbortController): void {
		const timer = setTimeout(() => {
			graceTimers.delete(id);
			if (active.get(id) === controller) {
				active.delete(id);
				store.updateFile(id, { uploadStatus: "canceled" });
				pump();
			}
		}, cancelGraceMs);
		graceTimers.set(id, timer);
	}

	function cancel(id: string): void {
		const controller = active.get(id);
		if (controller) {
			controller.abort();
			scheduleForceFree(id, controller);
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
