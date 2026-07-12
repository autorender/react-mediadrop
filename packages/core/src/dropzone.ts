import { isAcceptedType, normalizeAccept } from "./restrictions.js";
import type {
	DragState,
	MediaDropRestrictions,
	MediaDropValidator,
} from "./types.js";

const IDLE_DRAG_STATE: DragState = {
	isDragActive: false,
	isDragAccept: false,
	isDragReject: false,
};

export type DropResult = {
	files: File[];
	state: DragState;
};

/**
 * Runs the custom validator against whatever real `File` objects the
 * browser is willing to hand back mid-drag via `DataTransferItem.getAsFile`.
 * Some browsers return a `File` with an empty `name` and no readable
 * content before drop, so this is best-effort like the rest of drag
 * preview — it never fabricates a `File`, it only uses what the browser
 * actually exposes. Returns `evaluated: false` when nothing usable was
 * available, so callers can fall back to the accept-only evaluation.
 */
function evaluateValidatorPreview(
	event: DragEvent,
	validator: MediaDropValidator | undefined,
): { evaluated: boolean; allValid: boolean } {
	const items = event.dataTransfer?.items;
	if (!validator || !items) {
		return { evaluated: false, allValid: true };
	}

	const files = Array.from(items)
		.filter(
			(item): item is DataTransferItem & { getAsFile: () => File | null } =>
				item.kind === "file" && typeof item.getAsFile === "function",
		)
		.map((item) => item.getAsFile())
		.filter((file): file is File => file !== null);

	if (files.length === 0) {
		return { evaluated: false, allValid: true };
	}

	const allValid = files.every((file) => {
		const result = validator(file);
		return !result || (Array.isArray(result) && result.length === 0);
	});
	return { evaluated: true, allValid };
}

/**
 * Framework-free drag/drop state machine for a single dropzone element.
 *
 * This module never touches `window`/`document` itself — callers (vanilla,
 * react) attach its handlers to native drag events on whichever element they
 * own. Nested children are handled with an enter/leave depth counter, which
 * is the standard fix for the "dragleave fires when crossing into a child
 * element" flicker; each dropzone only reacts to events that bubble to its
 * own root, so multiple independent dropzones on one page do not interfere
 * with each other. Overlapping/nested dropzones are not specially
 * coordinated in Phase 1.
 *
 * `accept`/`validator` are passed per-call (not baked in at creation) so
 * callers can reflect restriction changes without recreating the controller.
 */
function hasFiles(event: DragEvent): boolean {
	const types = event.dataTransfer?.types;
	return types ? Array.from(types).includes("Files") : false;
}

export function createDropzoneController() {
	let depth = 0;
	let state: DragState = IDLE_DRAG_STATE;

	function evaluateAcceptance(
		event: DragEvent,
		accept: MediaDropRestrictions["accept"],
		validator: MediaDropValidator | undefined,
	): Pick<DragState, "isDragAccept" | "isDragReject"> {
		const items = event.dataTransfer?.items;
		const fileTypes = items
			? Array.from(items)
					.filter((item) => item.kind === "file")
					.map((item) => item.type)
			: [];

		// Extension-based accept tokens (".png") can't be checked without a
		// file name, which browsers withhold until drop. Only evaluate
		// mime-based tokens during an active drag.
		const mimeTokens = normalizeAccept(accept).filter((token) =>
			token.includes("/"),
		);

		const canEvaluateAccept =
			mimeTokens.length > 0 &&
			fileTypes.length > 0 &&
			fileTypes.every((type) => type !== "");

		const acceptOk = canEvaluateAccept
			? fileTypes.every((type) =>
					isAcceptedType({ name: "", type }, mimeTokens),
				)
			: null;

		const { evaluated: canEvaluateValidator, allValid: validatorOk } =
			evaluateValidatorPreview(event, validator);

		if (acceptOk === null && !canEvaluateValidator) {
			return { isDragAccept: false, isDragReject: false };
		}

		const allAccepted =
			(acceptOk ?? true) && (!canEvaluateValidator || validatorOk);
		return { isDragAccept: allAccepted, isDragReject: !allAccepted };
	}

	function handleDragEnter(
		event: DragEvent,
		accept?: MediaDropRestrictions["accept"],
		validator?: MediaDropValidator,
	): DragState {
		depth += 1;
		// Dragging a text selection, a link, or an image from elsewhere on the
		// page also fires `dragenter` — none of those carry "Files" among
		// `dataTransfer.types`. Without this gate the dropzone would show the
		// same "drag active" affordance for those as for an actual file drag.
		if (!hasFiles(event)) {
			state = IDLE_DRAG_STATE;
			return state;
		}
		const acceptance = evaluateAcceptance(event, accept, validator);
		state = { isDragActive: true, ...acceptance };
		return state;
	}

	function handleDragOver(event: DragEvent): void {
		event.preventDefault();
	}

	function handleDragLeave(): DragState {
		depth = Math.max(0, depth - 1);
		if (depth === 0) {
			state = IDLE_DRAG_STATE;
		}
		return state;
	}

	function handleDrop(event: DragEvent): DropResult {
		depth = 0;
		state = IDLE_DRAG_STATE;
		const files = event.dataTransfer?.files
			? Array.from(event.dataTransfer.files)
			: [];
		return { files, state };
	}

	function reset(): DragState {
		depth = 0;
		state = IDLE_DRAG_STATE;
		return state;
	}

	return {
		getDragState: () => state,
		handleDragEnter,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		reset,
	};
}

export type DropzoneController = ReturnType<typeof createDropzoneController>;
