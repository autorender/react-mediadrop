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

	function countAccepted(): number {
		return store.getState().files.filter((item) => item.status === "accepted")
			.length;
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

		store.setState((state) => ({ files: [...state.files, ...items] }));
		return items;
	}

	function removeFile(id: string): void {
		queue?.cancel(id);
		store.setState((state) => ({
			files: state.files.filter((item) => item.id !== id),
		}));
	}

	function clearFiles(): void {
		queue?.cancelAll();
		store.setState({ files: [] });
	}

	function getAcceptedFiles(): MediaDropFile[] {
		return store.getState().files.filter((item) => item.status === "accepted");
	}

	function getRejectedFiles(): MediaDropFile[] {
		return store.getState().files.filter((item) => item.status === "rejected");
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
			getFile: (id) => store.getState().files.find((item) => item.id === id),
			updateFile: (id, patch) => {
				store.setState((state) => ({
					files: state.files.map((item) =>
						item.id === id ? { ...item, ...patch } : item,
					),
				}));
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
