import type {
	DragState,
	MediaDropFile,
	MediaDropInstance,
	MediaDropOptions,
	MediaDropState,
	MediaDropUploadInstance,
	MediaDropUploadOptions,
} from "@mediadrop/core";
import { createDropzoneController, createMediaDrop } from "@mediadrop/core";
import type {
	ChangeEvent,
	CSSProperties,
	FocusEvent,
	HTMLAttributes,
	InputHTMLAttributes,
	KeyboardEvent,
	MouseEvent,
	DragEvent as ReactDragEvent,
	RefCallback,
} from "react";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

const IDLE_DRAG_STATE: DragState = {
	isDragActive: false,
	isDragAccept: false,
	isDragReject: false,
};

const HIDDEN_INPUT_STYLE: CSSProperties = {
	display: "none",
};

type StoppableEvent = {
	isPropagationStopped: () => boolean;
};

function composeHandlers<E extends StoppableEvent>(
	userHandler: ((event: E) => void) | undefined,
	internalHandler: (event: E) => void,
): (event: E) => void {
	return (event: E) => {
		userHandler?.(event);
		if (!event.isPropagationStopped()) {
			internalHandler(event);
		}
	};
}

export type UseMediaDropOptions = MediaDropOptions & {
	/** Disable click-to-open on the root element's composed `onClick`. */
	noClick?: boolean;
	/** Disable Space/Enter-to-open and focus tracking on the root element. */
	noKeyboard?: boolean;
	/** Disable the root element's drag/drop handling entirely. */
	noDrag?: boolean;
};

export type GetRootPropsArg = HTMLAttributes<HTMLElement> & {
	onClick?: (event: MouseEvent<HTMLElement>) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
	onFocus?: (event: FocusEvent<HTMLElement>) => void;
	onBlur?: (event: FocusEvent<HTMLElement>) => void;
	onDragEnter?: (event: ReactDragEvent<HTMLElement>) => void;
	onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
	onDragLeave?: (event: ReactDragEvent<HTMLElement>) => void;
	onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
};

export type RootProps = Omit<
	HTMLAttributes<HTMLElement>,
	| "onClick"
	| "onKeyDown"
	| "onFocus"
	| "onBlur"
	| "onDragEnter"
	| "onDragOver"
	| "onDragLeave"
	| "onDrop"
> & {
	role: string;
	tabIndex?: number;
	onClick: (event: MouseEvent<HTMLElement>) => void;
	onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
	onFocus: (event: FocusEvent<HTMLElement>) => void;
	onBlur: (event: FocusEvent<HTMLElement>) => void;
	onDragEnter: (event: ReactDragEvent<HTMLElement>) => void;
	onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
	onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
	onDrop: (event: ReactDragEvent<HTMLElement>) => void;
};

export type GetInputPropsArg = InputHTMLAttributes<HTMLInputElement> & {
	onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
	onClick?: (event: MouseEvent<HTMLInputElement>) => void;
};

export type InputProps = Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"ref" | "type" | "multiple" | "accept" | "style" | "onChange" | "onClick"
> & {
	ref: RefCallback<HTMLInputElement>;
	type: "file";
	multiple: boolean;
	accept: string | undefined;
	style: CSSProperties;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onClick: (event: MouseEvent<HTMLInputElement>) => void;
};

export type UseMediaDropResult = {
	files: MediaDropFile[];
	acceptedFiles: MediaDropFile[];
	rejectedFiles: MediaDropFile[];
	isDragActive: boolean;
	isDragAccept: boolean;
	isDragReject: boolean;
	/** This dropzone's root element currently has keyboard focus. Always `false` when `noKeyboard` is set. */
	isFocused: boolean;
	/**
	 * A file drag is in progress anywhere on the document, not just over this
	 * dropzone's root. Useful for a page-wide "drop files anywhere" hint.
	 * Best-effort like `isDragActive`'s sibling flags — see core-concepts.md.
	 */
	isDragGlobal: boolean;
	removeFile: (id: string) => void;
	clearFiles: () => void;
	open: () => void;
	getRootProps: (arg?: GetRootPropsArg) => RootProps;
	getInputProps: (arg?: GetInputPropsArg) => InputProps;
};

export type UseMediaDropUploadOptions = UseMediaDropOptions &
	MediaDropUploadOptions;

export type UseMediaDropUploadMethods = {
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

export type UseMediaDropUploadResult = UseMediaDropResult &
	UseMediaDropUploadMethods;

/**
 * Headless file intake + drag/drop hook over the core engine.
 *
 * The intake engine and drag/drop controller are created once for the
 * lifetime of the hook. Changing `restrictions`/`validator` after mount does
 * not recreate the engine in Phase 1 — restrictions used for live drag
 * acceptance previews are read fresh on every render, but restrictions
 * already baked into accept/reject decisions for files already added are
 * not retroactively re-evaluated.
 *
 * Passing `transport` additionally returns upload orchestration
 * (`uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload`)
 * — a thin pass-through to the core engine's upload queue, which owns all
 * concurrency/retry/cancel logic. Without `transport`, none of that exists
 * on the returned object, and TypeScript won't let you call it — same
 * contract as `createMediaDrop` itself. Whether a given hook instance has
 * upload methods is decided once, from whether `transport` was passed on
 * the render that created the underlying engine; it does not change across
 * re-renders, same as `restrictions`/`validator` above.
 */
export function useMediaDrop(
	options: UseMediaDropUploadOptions,
): UseMediaDropUploadResult;
export function useMediaDrop(options?: UseMediaDropOptions): UseMediaDropResult;
export function useMediaDrop(
	options: UseMediaDropOptions & Partial<MediaDropUploadOptions> = {},
): UseMediaDropResult | UseMediaDropUploadResult {
	const optionsRef = useRef(options);
	optionsRef.current = options;

	const engineRef = useRef<MediaDropInstance | MediaDropUploadInstance | null>(
		null,
	);
	if (!engineRef.current) {
		engineRef.current = options.transport
			? createMediaDrop({
					restrictions: options.restrictions,
					validator: options.validator,
					transport: options.transport,
					concurrency: options.concurrency,
					retries: options.retries,
					retryDelays: options.retryDelays,
					cancelGraceMs: options.cancelGraceMs,
				})
			: createMediaDrop({
					restrictions: options.restrictions,
					validator: options.validator,
				});
	}
	const engine = engineRef.current;

	// Cancels every queued/in-flight upload on unmount, the same guarantee
	// `@mediadrop/vanilla`'s `destroy()` makes — without this, an upload
	// started right before a route change/unmount would keep running in
	// the background with nothing left able to reference or cancel it.
	useEffect(() => {
		return () => {
			if ("cancelAllUploads" in engine) engine.cancelAllUploads();
		};
	}, [engine]);

	const dropzone = useMemo(() => createDropzoneController(), []);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [dragState, setDragState] = useState<DragState>(IDLE_DRAG_STATE);
	const [isFocused, setIsFocused] = useState(false);
	const [isDragGlobal, setIsDragGlobal] = useState(false);

	const subscribe = useCallback(
		(onStoreChange: () => void) => engine.subscribe(onStoreChange),
		[engine],
	);
	const state = useSyncExternalStore<MediaDropState>(
		subscribe,
		engine.getState,
		engine.getState,
	);

	const acceptedFiles = useMemo(
		() => state.files.filter((item) => item.status === "accepted"),
		[state],
	);
	const rejectedFiles = useMemo(
		() => state.files.filter((item) => item.status === "rejected"),
		[state],
	);

	const removeFile = useCallback(
		(id: string) => engine.removeFile(id),
		[engine],
	);
	const clearFiles = useCallback(() => engine.clearFiles(), [engine]);
	const open = useCallback(() => inputRef.current?.click(), []);

	// Document-wide drag tracking is independent of this dropzone's own root
	// events (which only see drags over their own subtree). A depth counter
	// mirrors the fix for the "dragleave into a child" flicker, applied at
	// document scope instead of at the root element.
	const globalDragDepthRef = useRef(0);
	useEffect(() => {
		function hasFiles(event: DragEvent): boolean {
			const types = event.dataTransfer?.types;
			return types ? Array.from(types).includes("Files") : false;
		}
		function handleDocumentDragEnter(event: DragEvent): void {
			if (!hasFiles(event)) return;
			globalDragDepthRef.current += 1;
			setIsDragGlobal(true);
		}
		function handleDocumentDragLeave(): void {
			globalDragDepthRef.current = Math.max(0, globalDragDepthRef.current - 1);
			if (globalDragDepthRef.current === 0) setIsDragGlobal(false);
		}
		function handleDocumentDragEndOrDrop(): void {
			globalDragDepthRef.current = 0;
			setIsDragGlobal(false);
		}

		document.addEventListener("dragenter", handleDocumentDragEnter);
		document.addEventListener("dragleave", handleDocumentDragLeave);
		document.addEventListener("dragend", handleDocumentDragEndOrDrop);
		document.addEventListener("drop", handleDocumentDragEndOrDrop);
		return () => {
			document.removeEventListener("dragenter", handleDocumentDragEnter);
			document.removeEventListener("dragleave", handleDocumentDragLeave);
			document.removeEventListener("dragend", handleDocumentDragEndOrDrop);
			document.removeEventListener("drop", handleDocumentDragEndOrDrop);
		};
	}, []);

	const handleDragEnter = useCallback(
		(event: ReactDragEvent<HTMLElement>) => {
			if (optionsRef.current.noDrag) return;
			setDragState(
				dropzone.handleDragEnter(
					event.nativeEvent,
					optionsRef.current.restrictions?.accept,
					optionsRef.current.validator,
				),
			);
		},
		[dropzone],
	);
	const handleDragOver = useCallback(
		(event: ReactDragEvent<HTMLElement>) => {
			if (optionsRef.current.noDrag) return;
			dropzone.handleDragOver(event.nativeEvent);
		},
		[dropzone],
	);
	const handleDragLeave = useCallback(() => {
		if (optionsRef.current.noDrag) return;
		setDragState(dropzone.handleDragLeave());
	}, [dropzone]);
	const handleDrop = useCallback(
		(event: ReactDragEvent<HTMLElement>) => {
			if (optionsRef.current.noDrag) return;
			event.preventDefault();
			const { files, state: nextDragState } = dropzone.handleDrop(
				event.nativeEvent,
			);
			setDragState(nextDragState);
			if (files.length > 0) {
				engine.addFiles(files);
			}
		},
		[dropzone, engine],
	);
	const handleInputChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const { files } = event.target;
			if (files && files.length > 0) {
				engine.addFiles(files);
			}
			event.target.value = "";
		},
		[engine],
	);
	const handleClick = useCallback(() => {
		if (optionsRef.current.noClick) return;
		inputRef.current?.click();
	}, []);
	const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
		if (optionsRef.current.noKeyboard) return;
		// Only react when the event originated on the root itself, not when
		// it bubbled up from a focusable descendant (a button, a link, a
		// "remove file" control) — otherwise activating any such descendant
		// via keyboard also (incorrectly) opens the file dialog.
		if (event.target !== event.currentTarget) return;
		if (event.key === " " || event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.click();
		}
	}, []);
	const handleFocus = useCallback(() => {
		if (optionsRef.current.noKeyboard) return;
		setIsFocused(true);
	}, []);
	const handleBlur = useCallback(() => {
		if (optionsRef.current.noKeyboard) return;
		setIsFocused(false);
	}, []);

	const getRootProps = useCallback(
		(arg: GetRootPropsArg = {}): RootProps => {
			const {
				onClick,
				onKeyDown,
				onFocus,
				onBlur,
				onDragEnter,
				onDragOver,
				onDragLeave,
				onDrop,
				...rest
			} = arg;
			return {
				...rest,
				role: "presentation",
				tabIndex: optionsRef.current.noKeyboard ? undefined : 0,
				onClick: composeHandlers(onClick, handleClick),
				onKeyDown: composeHandlers(onKeyDown, handleKeyDown),
				onFocus: composeHandlers(onFocus, handleFocus),
				onBlur: composeHandlers(onBlur, handleBlur),
				onDragEnter: composeHandlers(onDragEnter, handleDragEnter),
				onDragOver: composeHandlers(onDragOver, handleDragOver),
				onDragLeave: composeHandlers(onDragLeave, handleDragLeave),
				onDrop: composeHandlers(onDrop, handleDrop),
			};
		},
		[
			handleClick,
			handleKeyDown,
			handleFocus,
			handleBlur,
			handleDragEnter,
			handleDragOver,
			handleDragLeave,
			handleDrop,
		],
	);

	// The input returned by getInputProps() is meant to be rendered inside the
	// getRootProps() element (see react.md's example). Without this, clicking
	// the input bubbles a click up to the root, whose own onClick calls
	// input.click() again — an infinite re-trigger loop.
	const handleInputClick = useCallback(
		(event: MouseEvent<HTMLInputElement>) => {
			event.stopPropagation();
		},
		[],
	);

	const getInputProps = useCallback(
		(arg: GetInputPropsArg = {}): InputProps => {
			const restrictions = optionsRef.current.restrictions;
			const accept = Array.isArray(restrictions?.accept)
				? restrictions.accept.join(",")
				: restrictions?.accept;
			const { onChange, onClick, style, ...rest } = arg;

			return {
				...rest,
				ref: (node) => {
					inputRef.current = node;
				},
				type: "file",
				multiple: restrictions?.maxFiles !== 1,
				accept,
				// A consumer-supplied `style` is merged in, but `display: none`
				// always wins — the hidden-native-input pattern this hook is
				// built around (see the comment above `handleInputClick`)
				// breaks if that's overridden.
				style: { ...style, ...HIDDEN_INPUT_STYLE },
				onChange: composeHandlers(onChange, handleInputChange),
				onClick: composeHandlers(onClick, handleInputClick),
			};
		},
		[handleInputChange, handleInputClick],
	);

	const uploadFile = useCallback(
		(id: string) => {
			if ("uploadFile" in engine) engine.uploadFile(id);
		},
		[engine],
	);
	const uploadAll = useCallback(() => {
		if ("uploadAll" in engine) engine.uploadAll();
	}, [engine]);
	const cancelUpload = useCallback(
		(id: string) => {
			if ("cancelUpload" in engine) engine.cancelUpload(id);
		},
		[engine],
	);
	const cancelAllUploads = useCallback(() => {
		if ("cancelAllUploads" in engine) engine.cancelAllUploads();
	}, [engine]);
	const retryUpload = useCallback(
		(id: string) => {
			if ("retryUpload" in engine) engine.retryUpload(id);
		},
		[engine],
	);

	const result: UseMediaDropResult = {
		files: state.files,
		acceptedFiles,
		rejectedFiles,
		isDragActive: dragState.isDragActive,
		isDragAccept: dragState.isDragAccept,
		isDragReject: dragState.isDragReject,
		isFocused,
		isDragGlobal,
		removeFile,
		clearFiles,
		open,
		getRootProps,
		getInputProps,
	};

	if (!("uploadFile" in engine)) {
		return result;
	}

	return {
		...result,
		uploadFile,
		uploadAll,
		cancelUpload,
		cancelAllUploads,
		retryUpload,
	};
}
