import { expect, test } from "vitest";
import { createDropzoneController } from "./dropzone.js";

/**
 * jsdom does not implement DragEvent/DataTransfer, so drag events are
 * modeled with a minimal object of the same shape our code reads from:
 * `dataTransfer.items` (kind/type) and `dataTransfer.files`.
 */
function createDragEvent(fileTypes: string[]): DragEvent {
	const items = fileTypes.map((type) => ({ kind: "file" as const, type }));
	const files = fileTypes.map((type) => new File([], "f", { type }));
	return {
		preventDefault: () => {},
		dataTransfer: { items, files },
	} as unknown as DragEvent;
}

test("starts idle", () => {
	const controller = createDropzoneController();
	expect(controller.getDragState()).toEqual({
		isDragActive: false,
		isDragAccept: false,
		isDragReject: false,
	});
});

test("dragenter activates the dropzone", () => {
	const controller = createDropzoneController();
	const state = controller.handleDragEnter(createDragEvent(["image/png"]));
	expect(state.isDragActive).toBe(true);
});

test("accepts a payload that matches the accept restriction", () => {
	const controller = createDropzoneController();
	const state = controller.handleDragEnter(createDragEvent(["image/png"]), [
		"image/png",
	]);
	expect(state).toEqual({
		isDragActive: true,
		isDragAccept: true,
		isDragReject: false,
	});
});

test("rejects a payload that does not match the accept restriction", () => {
	const controller = createDropzoneController();
	const state = controller.handleDragEnter(
		createDragEvent(["application/pdf"]),
		["image/png"],
	);
	expect(state).toEqual({
		isDragActive: true,
		isDragAccept: false,
		isDragReject: true,
	});
});

test("is indeterminate (neither accept nor reject) without an accept restriction", () => {
	const controller = createDropzoneController();
	const state = controller.handleDragEnter(
		createDragEvent(["application/pdf"]),
	);
	expect(state.isDragAccept).toBe(false);
	expect(state.isDragReject).toBe(false);
});

test("is indeterminate when the browser withholds item types", () => {
	const controller = createDropzoneController();
	const state = controller.handleDragEnter(createDragEvent([""]), [
		"image/png",
	]);
	expect(state.isDragAccept).toBe(false);
	expect(state.isDragReject).toBe(false);
});

test("does not flicker when the drag crosses into nested children", () => {
	const controller = createDropzoneController();
	controller.handleDragEnter(createDragEvent(["image/png"]));
	// simulate entering + leaving a child element, which bubbles to the root
	controller.handleDragEnter(createDragEvent(["image/png"]));
	const afterChildLeave = controller.handleDragLeave();
	expect(afterChildLeave.isDragActive).toBe(true);

	const afterRootLeave = controller.handleDragLeave();
	expect(afterRootLeave.isDragActive).toBe(false);
});

test("drop resets state and returns the dropped files", () => {
	const controller = createDropzoneController();
	controller.handleDragEnter(createDragEvent(["image/png"]));

	const { files, state } = controller.handleDrop(
		createDragEvent(["image/png"]),
	);

	expect(files).toHaveLength(1);
	expect(state.isDragActive).toBe(false);
});

test("reset clears state regardless of depth", () => {
	const controller = createDropzoneController();
	controller.handleDragEnter(createDragEvent(["image/png"]));
	controller.handleDragEnter(createDragEvent(["image/png"]));

	const state = controller.reset();

	expect(state.isDragActive).toBe(false);
});

/**
 * Real `DataTransferItem`s expose `getAsFile()` even mid-drag (per spec),
 * unlike our other mocks which only carry `kind`/`type`.
 */
function createDragEventWithRealFiles(files: File[]): DragEvent {
	const items = files.map((file) => ({
		kind: "file" as const,
		type: file.type,
		getAsFile: () => file,
	}));
	return {
		preventDefault: () => {},
		dataTransfer: { items, files },
	} as unknown as DragEvent;
}

test("custom validator rejecting a dragged file marks the drag as rejected", () => {
	const controller = createDropzoneController();
	const validator = (file: File) =>
		file.name.includes("bad")
			? { code: "validator-error" as const, message: "bad file" }
			: null;

	const state = controller.handleDragEnter(
		createDragEventWithRealFiles([
			new File([], "bad.png", { type: "image/png" }),
		]),
		undefined,
		validator,
	);

	expect(state).toEqual({
		isDragActive: true,
		isDragAccept: false,
		isDragReject: true,
	});
});

test("custom validator accepting every dragged file combines with the accept restriction", () => {
	const controller = createDropzoneController();
	const validator = () => null;

	const state = controller.handleDragEnter(
		createDragEventWithRealFiles([
			new File([], "good.png", { type: "image/png" }),
		]),
		["image/png"],
		validator,
	);

	expect(state).toEqual({
		isDragActive: true,
		isDragAccept: true,
		isDragReject: false,
	});
});

test("falls back to accept-only evaluation when the browser withholds getAsFile", () => {
	const controller = createDropzoneController();
	const validator = () => ({ code: "validator-error" as const, message: "x" });

	// createDragEvent's items have no getAsFile, matching browsers/mocks that
	// don't expose it — the validator must not be able to fail the drag then.
	const state = controller.handleDragEnter(
		createDragEvent(["image/png"]),
		["image/png"],
		validator,
	);

	expect(state).toEqual({
		isDragActive: true,
		isDragAccept: true,
		isDragReject: false,
	});
});
