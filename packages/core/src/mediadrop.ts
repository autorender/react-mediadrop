import { createError } from "./errors.js";
import { createFileItem } from "./file.js";
import { validateFile } from "./restrictions.js";
import type { Store } from "./store.js";
import { createStore } from "./store.js";
import type { UploadTransport } from "./transport.js";
import type {
	MediaDropFile,
	MediaDropOptions,
	MediaDropState,
} from "./types.js";
import { createUploadQueue, type UploadQueue } from "./upload-queue.js";

export type MediaDropInstance = {
	getState: () => MediaDropState;
	subscribe: Store<MediaDropState>["subscribe"];
	addFiles: (files: FileList | File[]) => MediaDropFile[];
	removeFile: (id: string) => void;
	clearFiles: () => void;
	getAcceptedFiles: () => MediaDropFile[];
	getRejectedFiles: () => MediaDropFile[];
};

export type MediaDropUploadOptions = {
	/** Pluggable transport (e.g. from `@mediadrop/xhr-upload`). Upload methods only exist on the returned instance when this is set. */
	transport: UploadTransport;
	/** Max uploads in flight at once. Default `1` (sequential). */
	concurrency?: number;
	/** Retries after the first attempt, shared across every file. Default `0`. */
	retries?: number;
	retryDelays?: number[];
	/**
	 * Grace period (ms) after `cancelUpload`/`cancelAllUploads` aborts a
	 * transport's `signal` before its concurrency slot is force-freed
	 * regardless of whether the transport ever settled — a safety net for a
	 * transport that doesn't honor `signal`. Default `5000`.
	 */
	cancelGraceMs?: number;
};

export type MediaDropUploadInstance = MediaDropInstance & {
	/** Queue a file for upload (or restart it if it already finished/failed/was canceled). No-op if it isn't `status: "accepted"` or is already in flight. */
	uploadFile: (id: string) => void;
	/** Queue every currently `status: "accepted"` file. */
	uploadAll: () => void;
	/** Cancel one file: aborts it if uploading, drops it if merely queued. */
	cancelUpload: (id: string) => void;
	/** Cancel every queued and in-flight upload. */
	cancelAllUploads: () => void;
	/** Re-enqueue a file, but only if its last attempt ended in `uploadStatus: "error"`. */
	retryUpload: (id: string) => void;
};

/**
 * Creates a framework-neutral file intake engine: validates incoming files
 * against restrictions/validator, tracks them in a small store, and exposes
 * accepted/rejected views.
 *
 * `maxFiles` is enforced as an aggregate rule: files that individually pass
 * validation still fill remaining slots in the order they were added, and
 * any surplus is rejected with `too-many-files`. This keeps behavior
 * predictable — a single oversized batch never blocks the files that do fit.
 *
 * Passing `transport` additionally returns upload orchestration
 * (`uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload`)
 * — see `upload-queue.ts` for the queue/concurrency/retry engine. Without
 * `transport`, none of that exists: this stays exactly the Phase 1 intake
 * engine, and TypeScript won't let you call upload methods that were never
 * configured.
 */
export function createMediaDrop(
	options: MediaDropOptions & MediaDropUploadOptions,
): MediaDropUploadInstance;
export function createMediaDrop(options?: MediaDropOptions): MediaDropInstance;
export function createMediaDrop(
	options: MediaDropOptions & Partial<MediaDropUploadOptions> = {},
): MediaDropInstance | MediaDropUploadInstance {
	const {
		restrictions = {},
		validator,
		transport,
		concurrency,
		retries,
		retryDelays,
		cancelGraceMs,
	} = options;
	const store = createStore<MediaDropState>({ files: [] });
	// Set once (below) when `transport` is configured. `removeFile`/`clearFiles`
	// read this via closure so a removed file's in-flight upload is always
	// canceled — otherwise its `AbortController` would leak and its
	// concurrency slot would never free up.
	let queue: UploadQueue | null = null;

	// id -> index within the current `store.getState().files` array, kept in
	// sync with every operation that changes the array's membership or
	// order (`addFiles`/`removeFile`/`clearFiles`). This exists so
	// `updateFile` — called on every single progress event, for every
	// in-flight file — can look up "which element is this?" in O(1) instead
	// of an O(n) `.find`/`.map` scan over the whole list on every tick.
	let indexById = new Map<string, number>();

	function rebuildIndex(files: MediaDropFile[]): void {
		indexById = new Map(files.map((item, i) => [item.id, i]));
	}

	// Cache of the aggregate read helpers, invalidated only when the
	// `files` array reference actually changes — cheap since every mutation
	// above already produces a new array/reference, so this is a correct,
	// exact-match cache key, not an approximation.
	let aggregateCacheFiles: MediaDropFile[] | null = null;
	let acceptedCache: MediaDropFile[] = [];
	let rejectedCache: MediaDropFile[] = [];

	function refreshAggregatesIfNeeded(): void {
		const files = store.getState().files;
		if (files === aggregateCacheFiles) return;
		aggregateCacheFiles = files;
		acceptedCache = files.filter((item) => item.status === "accepted");
		rejectedCache = files.filter((item) => item.status === "rejected");
	}

	function countAccepted(): number {
		refreshAggregatesIfNeeded();
		return acceptedCache.length;
	}

	function addFiles(input: FileList | File[]): MediaDropFile[] {
		const incoming = Array.from(input);
		const maxFiles = restrictions.maxFiles;
		let acceptedCount = countAccepted();

		const items = incoming.map((file) => {
			const item = createFileItem(file);
			const errors = validateFile(file, restrictions, validator);

			if (errors.length > 0) {
				item.status = "rejected";
				item.errors = errors;
				return item;
			}

			if (typeof maxFiles === "number" && acceptedCount >= maxFiles) {
				item.status = "rejected";
				item.errors = [
					createError(
						"too-many-files",
						`Cannot accept more than ${maxFiles} file(s).`,
					),
				];
				return item;
			}

			acceptedCount += 1;
			item.status = "accepted";
			return item;
		});

		store.setState((state) => {
			const files = [...state.files, ...items];
			// Appending never shifts an existing id's index, so just add the
			// new entries rather than rebuilding the whole map.
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item) indexById.set(item.id, state.files.length + i);
			}
			return { files };
		});
		return items;
	}

	function removeFile(id: string): void {
		queue?.cancel(id);
		store.setState((state) => {
			const files = state.files.filter((item) => item.id !== id);
			// Removal shifts every subsequent index, so the map needs a full
			// rebuild here — but this is a rare, user-driven action, not the
			// per-progress-tick hot path `updateFile` is.
			rebuildIndex(files);
			return { files };
		});
	}

	function clearFiles(): void {
		queue?.cancelAll();
		indexById = new Map();
		store.setState({ files: [] });
	}

	function getAcceptedFiles(): MediaDropFile[] {
		refreshAggregatesIfNeeded();
		return acceptedCache;
	}

	function getRejectedFiles(): MediaDropFile[] {
		refreshAggregatesIfNeeded();
		return rejectedCache;
	}

	const base: MediaDropInstance = {
		getState: store.getState,
		subscribe: store.subscribe,
		addFiles,
		removeFile,
		clearFiles,
		getAcceptedFiles,
		getRejectedFiles,
	};

	if (!transport) {
		return base;
	}

	queue = createUploadQueue(
		{ transport, concurrency, retries, retryDelays, cancelGraceMs },
		{
			getFile: (id) => {
				const index = indexById.get(id);
				return index === undefined ? undefined : store.getState().files[index];
			},
			updateFile: (id, patch) => {
				store.setState((state) => {
					const index = indexById.get(id);
					if (index === undefined) return state;
					const files = state.files.slice();
					const current = files[index];
					if (!current) return state;
					files[index] = { ...current, ...patch };
					return { files };
				});
			},
		},
	);
	const activeQueue = queue;

	function uploadFile(id: string): void {
		activeQueue.enqueue(id);
	}

	function uploadAll(): void {
		for (const item of store.getState().files) {
			if (item.status === "accepted") activeQueue.enqueue(item.id);
		}
	}

	function cancelUpload(id: string): void {
		activeQueue.cancel(id);
	}

	function cancelAllUploads(): void {
		activeQueue.cancelAll();
	}

	function retryUpload(id: string): void {
		activeQueue.retry(id);
	}

	return {
		...base,
		uploadFile,
		uploadAll,
		cancelUpload,
		cancelAllUploads,
		retryUpload,
	};
}
