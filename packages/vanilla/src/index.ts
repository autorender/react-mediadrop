import type {
	MediaDropInstance,
	MediaDropOptions,
	MediaDropState,
	MediaDropUploadInstance,
	MediaDropUploadOptions,
} from "@mediadrop/core";
import {
	createMediaDrop as createCoreMediaDrop,
	createDropzoneController,
} from "@mediadrop/core";

export type {
	DragState,
	MediaDropError,
	MediaDropErrorCode,
	MediaDropFile,
	MediaDropFileStatus,
	MediaDropOptions,
	MediaDropRestrictions,
	MediaDropState,
	MediaDropUploadOptions,
	MediaDropUploadProgress,
	MediaDropUploadStatus,
	MediaDropValidator,
	UploadTransport,
	UploadTransportContext,
	UploadTransportResult,
} from "@mediadrop/core";

export type VanillaMediaDropOptions = MediaDropOptions & {
	root?: HTMLElement | null;
	input?: HTMLInputElement | null;
	onChange?: (state: MediaDropState) => void;
};

export type VanillaMediaDropUploadOptions = VanillaMediaDropOptions &
	MediaDropUploadOptions;

export type VanillaMediaDrop = {
	getState: () => MediaDropState;
	subscribe: (listener: (state: MediaDropState) => void) => () => void;
	addFiles: (files: FileList | File[]) => void;
	removeFile: (id: string) => void;
	clearFiles: () => void;
	open: () => void;
	destroy: () => void;
};

export type VanillaMediaDropUploadMethods = {
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

export type VanillaMediaDropUpload = VanillaMediaDrop &
	VanillaMediaDropUploadMethods;

/**
 * Wires a root drop target and/or a file input to a `@mediadrop/core`
 * intake engine. Purely DOM plumbing — validation and state live in core.
 *
 * Passing `transport` additionally returns upload orchestration
 * (`uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload`)
 * — a thin pass-through to `@mediadrop/core`'s upload queue. Without
 * `transport`, none of that exists on the returned object, and TypeScript
 * won't let you call it. `destroy()` cancels every in-flight/queued upload
 * before removing DOM listeners, so tearing this down never leaves an
 * orphaned request running in the background.
 */
export function createMediaDrop(
	options: VanillaMediaDropUploadOptions,
): VanillaMediaDropUpload;
export function createMediaDrop(
	options?: VanillaMediaDropOptions,
): VanillaMediaDrop;
export function createMediaDrop(
	options: VanillaMediaDropOptions & Partial<MediaDropUploadOptions> = {},
): VanillaMediaDrop | VanillaMediaDropUpload {
	const {
		root = null,
		input = null,
		onChange,
		restrictions,
		validator,
		transport,
		concurrency,
		retries,
		retryDelays,
	} = options;

	// `let` + `if`/`else` (not `const engine: T = transport ? A : B`) is
	// deliberate: TypeScript's `"x" in engine` narrowing further down stops
	// working reliably when `engine`'s declared type is inferred straight
	// from a ternary that calls createMediaDrop's overloads, even with an
	// explicit annotation on the ternary itself. Splitting the declaration
	// from the assignment (mirroring how @mediadrop/react threads the same
	// value through a `useRef`'s pre-declared generic) avoids it.
	let engine: MediaDropInstance | MediaDropUploadInstance;
	if (transport) {
		engine = createCoreMediaDrop({
			restrictions,
			validator,
			transport,
			concurrency,
			retries,
			retryDelays,
		});
	} else {
		engine = createCoreMediaDrop({ restrictions, validator });
	}
	const dropzone = createDropzoneController();
	const cleanupFns: Array<() => void> = [];

	if (onChange) {
		cleanupFns.push(engine.subscribe(onChange));
	}

	function handleInputChange(event: Event): void {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			engine.addFiles(target.files);
		}
		target.value = "";
	}

	if (input) {
		input.addEventListener("change", handleInputChange);
		cleanupFns.push(() =>
			input.removeEventListener("change", handleInputChange),
		);
	}

	function handleDragEnter(event: DragEvent): void {
		event.preventDefault();
		dropzone.handleDragEnter(event, restrictions?.accept);
	}

	function handleDragOver(event: DragEvent): void {
		dropzone.handleDragOver(event);
	}

	function handleDragLeave(): void {
		dropzone.handleDragLeave();
	}

	function handleDrop(event: DragEvent): void {
		event.preventDefault();
		const { files } = dropzone.handleDrop(event);
		if (files.length > 0) {
			engine.addFiles(files);
		}
	}

	if (root) {
		root.addEventListener("dragenter", handleDragEnter);
		root.addEventListener("dragover", handleDragOver);
		root.addEventListener("dragleave", handleDragLeave);
		root.addEventListener("drop", handleDrop);
		cleanupFns.push(() => {
			root.removeEventListener("dragenter", handleDragEnter);
			root.removeEventListener("dragover", handleDragOver);
			root.removeEventListener("dragleave", handleDragLeave);
			root.removeEventListener("drop", handleDrop);
		});
	}

	// Defined as a named function (not inline as the `destroy` property's
	// value below) for the same reason as the `let`/`if`/`else` above — an
	// arrow function assigned directly as an object literal property's
	// value loses the outer `"x" in engine` narrowing that its body relies
	// on. A separately-declared closure, referenced by shorthand, keeps it.
	function destroy(): void {
		if ("cancelAllUploads" in engine) engine.cancelAllUploads();
		for (const cleanup of cleanupFns) cleanup();
	}
	const open = () => input?.click();

	const base: VanillaMediaDrop = {
		getState: engine.getState,
		subscribe: engine.subscribe,
		addFiles: engine.addFiles,
		removeFile: engine.removeFile,
		clearFiles: engine.clearFiles,
		open,
		destroy,
	};

	if (!("uploadFile" in engine)) {
		return base;
	}

	const uploadFile = (id: string) => engine.uploadFile(id);
	const uploadAll = () => engine.uploadAll();
	const cancelUpload = (id: string) => engine.cancelUpload(id);
	const cancelAllUploads = () => engine.cancelAllUploads();
	const retryUpload = (id: string) => engine.retryUpload(id);

	return {
		...base,
		uploadFile,
		uploadAll,
		cancelUpload,
		cancelAllUploads,
		retryUpload,
	};
}
