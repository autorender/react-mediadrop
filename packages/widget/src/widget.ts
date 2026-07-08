import {
	createDropzoneController,
	createMediaDrop,
	type DragState,
	type MediaDropError,
	type MediaDropFile,
	type MediaDropInstance,
	type MediaDropOptions,
	type MediaDropState,
	type MediaDropUploadInstance,
	type MediaDropUploadOptions,
	type Unsubscribe,
} from "@mediadrop/core";
import { formatBytes } from "./format.js";
import { DEFAULT_LABELS, type MediaDropWidgetLabels } from "./labels.js";

export type MediaDropWidgetOptions = MediaDropOptions & {
	/** The element the widget renders into. Its existing children are left alone until `destroy()`; the widget appends its own root inside it. */
	target: HTMLElement;
	labels?: Partial<MediaDropWidgetLabels>;
	disabled?: boolean;
	onChange?: (state: MediaDropState) => void;
	onUploadStart?: (files: MediaDropFile[]) => void;
	onUploadProgress?: (state: MediaDropState) => void;
	onUploadSuccess?: (file: MediaDropFile) => void;
	onUploadError?: (file: MediaDropFile, error: MediaDropError) => void;
	onComplete?: (result: {
		succeeded: MediaDropFile[];
		failed: MediaDropFile[];
		canceled: MediaDropFile[];
	}) => void;
};

export type MediaDropWidgetUploadOptions = MediaDropWidgetOptions &
	MediaDropUploadOptions;

export type MediaDropWidget = {
	getState: () => MediaDropState;
	subscribe: MediaDropInstance["subscribe"];
	open: () => void;
	removeFile: (id: string) => void;
	clearFiles: () => void;
	setDisabled: (disabled: boolean) => void;
	destroy: () => void;
};

export type MediaDropWidgetUploadMethods = {
	uploadFile: (id: string) => void;
	uploadAll: () => void;
	cancelUpload: (id: string) => void;
	cancelAllUploads: () => void;
	retryUpload: (id: string) => void;
};

export type MediaDropWidgetUpload = MediaDropWidget &
	MediaDropWidgetUploadMethods;

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	return node;
}

/**
 * The optional, framework-neutral widget over `@mediadrop/core`'s public
 * API — the same `createMediaDrop`/`createDropzoneController` any binding
 * uses, not a private internal. This is a rendering layer on top of the
 * exact same state/upload engine `@mediadrop/react`/`@mediadrop/vanilla`
 * use; it owns no validation, queue, retry, or transport logic of its own.
 *
 * Rendering is a full re-render of the file list on every state change —
 * deliberately simple (no virtual-DOM/diffing dependency) for a widget
 * whose job is "a few dozen files in a list," not a data-grid.
 *
 * Passing `transport` additionally returns
 * `uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload`
 * and renders the upload-related UI (progress, cancel, retry, "Upload
 * all"). Without it, the widget is intake/validation only — same contract
 * as `createMediaDrop`/`useMediaDrop` elsewhere in mediadrop.
 */
export function createMediaDropWidget(
	options: MediaDropWidgetUploadOptions,
): MediaDropWidgetUpload;
export function createMediaDropWidget(
	options: MediaDropWidgetOptions,
): MediaDropWidget;
export function createMediaDropWidget(
	options: MediaDropWidgetOptions & Partial<MediaDropUploadOptions>,
): MediaDropWidget | MediaDropWidgetUpload {
	const {
		target,
		restrictions,
		validator,
		transport,
		concurrency,
		retries,
		retryDelays,
		labels: labelOverrides,
		disabled: initialDisabled = false,
		onChange,
		onUploadStart,
		onUploadProgress,
		onUploadSuccess,
		onUploadError,
		onComplete,
	} = options;

	const labels: MediaDropWidgetLabels = {
		...DEFAULT_LABELS,
		...labelOverrides,
	};

	let engine: MediaDropInstance | MediaDropUploadInstance;
	if (transport) {
		engine = createMediaDrop({
			restrictions,
			validator,
			transport,
			concurrency,
			retries,
			retryDelays,
		});
	} else {
		engine = createMediaDrop({ restrictions, validator });
	}
	const hasUpload = "uploadFile" in engine;

	const dropzone = createDropzoneController();
	let disabled = initialDisabled;

	// ---- Build the (mostly) static DOM shell once. ----
	const root = el("div", "md-widget");

	const dropzoneEl = el("div", "md-dropzone");
	dropzoneEl.setAttribute("role", "group");
	const dropzoneText = el("p", "md-dropzone-text");
	dropzoneText.textContent = labels.dropzoneText;
	const chooseButton = el("button", "md-button md-button-primary");
	chooseButton.type = "button";
	chooseButton.dataset.action = "choose";
	chooseButton.textContent = labels.chooseFilesButton;
	const inputEl = el("input");
	inputEl.type = "file";
	inputEl.hidden = true;
	inputEl.multiple = restrictions?.maxFiles !== 1;
	if (restrictions?.accept) {
		inputEl.accept = Array.isArray(restrictions.accept)
			? restrictions.accept.join(",")
			: restrictions.accept;
	}
	dropzoneEl.append(dropzoneText, chooseButton, inputEl);

	const topActions = el("div", "md-actions");
	const totalProgressEl = el("progress", "md-progress md-progress-total");
	const clearButton = el("button", "md-button");
	clearButton.type = "button";
	clearButton.dataset.action = "clear";
	clearButton.textContent = labels.clearButton;
	const uploadAllButton = el("button", "md-button md-button-primary");
	uploadAllButton.type = "button";
	uploadAllButton.dataset.action = "upload-all";
	uploadAllButton.textContent = labels.uploadAllButton;
	if (hasUpload) topActions.append(totalProgressEl, uploadAllButton);
	topActions.append(clearButton);

	const fileListEl = el("ul", "md-file-list");
	const emptyStateEl = el("div", "md-empty-state");
	emptyStateEl.textContent = labels.emptyState;

	root.append(dropzoneEl, topActions, emptyStateEl, fileListEl);
	target.append(root);

	// ---- Rendering ----

	function renderFileItem(file: MediaDropFile): HTMLLIElement {
		const item = el("li", `md-file-item md-file-item--${file.status}`);
		item.dataset.fileId = file.id;

		const meta = el("div", "md-file-item-meta");
		const name = el("span", "md-file-name");
		name.textContent = file.name;
		const size = el("span", "md-file-size");
		size.textContent = formatBytes(file.size);
		const status = el("span", "md-file-status");
		status.textContent = file.status;
		meta.append(name, size, status);

		if (hasUpload && file.uploadStatus) {
			const uploadStatus = el("span", "md-upload-status");
			uploadStatus.textContent =
				file.uploadAttempts && file.uploadAttempts > 1
					? `${file.uploadStatus} (attempt ${file.uploadAttempts})`
					: file.uploadStatus;
			meta.append(uploadStatus);
		}
		item.append(meta);

		if (file.errors.length > 0) {
			const errorList = el("ul", "md-errors");
			for (const error of file.errors) {
				const li = el("li", "md-error");
				li.textContent = `[${error.code}] ${error.message}`;
				errorList.append(li);
			}
			item.append(errorList);
		}

		if (hasUpload) {
			if (file.uploadStatus === "uploading" || file.uploadStatus === "queued") {
				const progress = el("progress", "md-progress");
				progress.max = 100;
				const fileProgress = file.progress;
				if (
					fileProgress &&
					fileProgress.total != null &&
					fileProgress.total > 0
				) {
					progress.value = Math.round(
						(fileProgress.loaded / fileProgress.total) * 100,
					);
				}
				item.append(progress);
			}
			if (file.uploadError) {
				const errorEl = el("p", "md-error");
				errorEl.textContent = `[${file.uploadError.code}] ${file.uploadError.message}`;
				item.append(errorEl);
			}
		}

		const actions = el("div", "md-actions");
		if (
			hasUpload &&
			(file.uploadStatus === "uploading" || file.uploadStatus === "queued")
		) {
			const cancelButton = el("button", "md-button md-button-danger");
			cancelButton.type = "button";
			cancelButton.dataset.action = "cancel";
			cancelButton.textContent = labels.cancelButton;
			actions.append(cancelButton);
		}
		if (hasUpload && file.uploadStatus === "error") {
			const retryButton = el("button", "md-button");
			retryButton.type = "button";
			retryButton.dataset.action = "retry";
			retryButton.textContent = labels.retryButton;
			actions.append(retryButton);
		}
		const removeButton = el("button", "md-button");
		removeButton.type = "button";
		removeButton.dataset.action = "remove";
		removeButton.textContent = labels.removeButton;
		actions.append(removeButton);
		item.append(actions);

		return item;
	}

	function computeTotalProgress(
		files: MediaDropFile[],
	): { loaded: number; total: number } | null {
		const relevant = files.filter((file) => file.uploadStatus);
		if (relevant.length === 0) return null;
		let loaded = 0;
		let total = 0;
		for (const file of relevant) {
			total += file.size;
			if (file.uploadStatus === "done") {
				loaded += file.size;
			} else if (file.progress) {
				loaded += Math.min(file.progress.loaded, file.size);
			}
		}
		return { loaded, total };
	}

	function render(state: MediaDropState): void {
		fileListEl.replaceChildren(...state.files.map(renderFileItem));
		emptyStateEl.hidden = state.files.length > 0;
		fileListEl.hidden = state.files.length === 0;

		if (hasUpload) {
			const totals = computeTotalProgress(state.files);
			if (totals && totals.total > 0) {
				totalProgressEl.hidden = false;
				totalProgressEl.max = 100;
				totalProgressEl.value = Math.round(
					(totals.loaded / totals.total) * 100,
				);
			} else {
				totalProgressEl.hidden = true;
			}
			uploadAllButton.disabled =
				disabled || !state.files.some((file) => file.status === "accepted");
		}
		clearButton.disabled = disabled || state.files.length === 0;
		chooseButton.disabled = disabled;
		inputEl.disabled = disabled;
	}

	function applyDragClasses(state: DragState): void {
		dropzoneEl.classList.toggle("md-dropzone-active", state.isDragActive);
		dropzoneEl.classList.toggle("md-dropzone-accept", state.isDragAccept);
		dropzoneEl.classList.toggle("md-dropzone-reject", state.isDragReject);
	}

	// ---- Callback derivation from state diffs (no separate event bus). ----
	let previousById = new Map<string, MediaDropFile>();
	let wasInFlight = false;

	function deriveCallbacks(state: MediaDropState): void {
		if (!hasUpload) return;

		const started: MediaDropFile[] = [];
		const succeeded: MediaDropFile[] = [];
		const failed: MediaDropFile[] = [];

		for (const file of state.files) {
			const previous = previousById.get(file.id);
			if (
				file.uploadStatus === "queued" &&
				previous?.uploadStatus !== "queued"
			) {
				started.push(file);
			}
			if (file.uploadStatus === "done" && previous?.uploadStatus !== "done") {
				succeeded.push(file);
			}
			if (file.uploadStatus === "error" && previous?.uploadStatus !== "error") {
				failed.push(file);
			}
		}

		if (started.length > 0) onUploadStart?.(started);
		for (const file of succeeded) onUploadSuccess?.(file);
		for (const file of failed) {
			if (file.uploadError) onUploadError?.(file, file.uploadError);
		}

		const isInFlight = state.files.some(
			(file) =>
				file.uploadStatus === "queued" || file.uploadStatus === "uploading",
		);
		// Fire once, exactly on the transition from "something in flight" to
		// "nothing in flight" — not on every render while idle.
		if (wasInFlight && !isInFlight) {
			onComplete?.({
				succeeded: state.files.filter((file) => file.uploadStatus === "done"),
				failed: state.files.filter((file) => file.uploadStatus === "error"),
				canceled: state.files.filter(
					(file) => file.uploadStatus === "canceled",
				),
			});
		}
		wasInFlight = isInFlight;

		onUploadProgress?.(state);
	}

	// ---- Wiring ----
	const unsubscribeFns: Unsubscribe[] = [];

	function handleStateChange(state: MediaDropState): void {
		onChange?.(state);
		deriveCallbacks(state);
		render(state);
		previousById = new Map(state.files.map((file) => [file.id, file]));
	}
	unsubscribeFns.push(engine.subscribe(handleStateChange));

	function handleInputChange(event: Event): void {
		const files = (event.target as HTMLInputElement).files;
		if (files && files.length > 0) engine.addFiles(files);
		(event.target as HTMLInputElement).value = "";
	}
	inputEl.addEventListener("change", handleInputChange);

	function handleDragEnter(event: DragEvent): void {
		if (disabled) return;
		event.preventDefault();
		applyDragClasses(dropzone.handleDragEnter(event, restrictions?.accept));
	}
	function handleDragOver(event: DragEvent): void {
		if (disabled) return;
		dropzone.handleDragOver(event);
	}
	function handleDragLeave(): void {
		applyDragClasses(dropzone.handleDragLeave());
	}
	function handleDrop(event: DragEvent): void {
		event.preventDefault();
		const { files, state } = dropzone.handleDrop(event);
		applyDragClasses(state);
		if (disabled) return;
		if (files.length > 0) engine.addFiles(files);
	}
	dropzoneEl.addEventListener("dragenter", handleDragEnter);
	dropzoneEl.addEventListener("dragover", handleDragOver);
	dropzoneEl.addEventListener("dragleave", handleDragLeave);
	dropzoneEl.addEventListener("drop", handleDrop);

	function handleClick(event: MouseEvent): void {
		if (disabled) return;
		const actionEl = (event.target as HTMLElement).closest<HTMLElement>(
			"[data-action]",
		);
		if (!actionEl) return;
		const fileItemEl = actionEl.closest<HTMLElement>("[data-file-id]");
		const fileId = fileItemEl?.dataset.fileId;

		switch (actionEl.dataset.action) {
			case "choose":
				inputEl.click();
				break;
			case "clear":
				engine.clearFiles();
				break;
			case "upload-all":
				if ("uploadAll" in engine) engine.uploadAll();
				break;
			case "cancel":
				if (fileId && "cancelUpload" in engine) engine.cancelUpload(fileId);
				break;
			case "retry":
				if (fileId && "retryUpload" in engine) engine.retryUpload(fileId);
				break;
			case "remove":
				if (fileId) engine.removeFile(fileId);
				break;
			default:
				break;
		}
	}
	root.addEventListener("click", handleClick);

	// Initial paint.
	render(engine.getState());

	function setDisabled(next: boolean): void {
		disabled = next;
		root.classList.toggle("md-widget-disabled", disabled);
		render(engine.getState());
	}

	const base: MediaDropWidget = {
		getState: engine.getState,
		subscribe: engine.subscribe,
		open: () => inputEl.click(),
		removeFile: (id) => engine.removeFile(id),
		clearFiles: () => engine.clearFiles(),
		setDisabled,
		destroy: () => {
			if ("cancelAllUploads" in engine) engine.cancelAllUploads();
			for (const unsubscribe of unsubscribeFns) unsubscribe();
			inputEl.removeEventListener("change", handleInputChange);
			dropzoneEl.removeEventListener("dragenter", handleDragEnter);
			dropzoneEl.removeEventListener("dragover", handleDragOver);
			dropzoneEl.removeEventListener("dragleave", handleDragLeave);
			dropzoneEl.removeEventListener("drop", handleDrop);
			root.removeEventListener("click", handleClick);
			root.remove();
		},
	};

	// Checked directly here (not via the `hasUpload` const) so TypeScript's
	// narrowing actually applies to `engine` for the rest of this block —
	// see @mediadrop/vanilla's index.ts for the same pattern and why.
	if (!("uploadFile" in engine)) {
		return base;
	}

	const uploadFile = (id: string): void => engine.uploadFile(id);
	const uploadAll = (): void => engine.uploadAll();
	const cancelUpload = (id: string): void => engine.cancelUpload(id);
	const cancelAllUploads = (): void => engine.cancelAllUploads();
	const retryUpload = (id: string): void => engine.retryUpload(id);

	return {
		...base,
		uploadFile,
		uploadAll,
		cancelUpload,
		cancelAllUploads,
		retryUpload,
	};
}
