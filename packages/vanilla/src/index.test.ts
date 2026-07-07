// @vitest-environment jsdom
import type { UploadTransport } from "@mediadrop/core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMediaDrop } from "./index.js";

/** A transport whose resolution/rejection is controlled by the test. */
function createDeferredTransport() {
	const deferreds = new Map<
		string,
		{
			resolve: (v: { response?: unknown }) => void;
			reject: (e: unknown) => void;
		}
	>();
	const transport: UploadTransport = {
		upload(file) {
			return new Promise((resolve, reject) => {
				deferreds.set(file.id, { resolve, reject });
			});
		},
	};
	return {
		transport,
		resolve: (id: string, response?: unknown) =>
			deferreds.get(id)?.resolve({ response }),
		reject: (id: string, error: unknown) => deferreds.get(id)?.reject(error),
	};
}

let root: HTMLDivElement;
let input: HTMLInputElement;

beforeEach(() => {
	root = document.createElement("div");
	input = document.createElement("input");
	input.type = "file";
	document.body.append(root, input);
});

afterEach(() => {
	root.remove();
	input.remove();
});

function makeFile(name: string, type: string): File {
	return new File(["x"], name, { type });
}

/** jsdom has no FileList constructor; input.files only accepts a real one via defineProperty. */
function setInputFiles(target: HTMLInputElement, files: File[]): void {
	Object.defineProperty(target, "files", {
		value: files,
		configurable: true,
	});
}

/** jsdom does not implement DragEvent/DataTransfer, so drop payloads are simulated. */
function dispatchDragEvent(
	target: HTMLElement,
	type: string,
	files: File[] = [],
): void {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: {
			files,
			items: files.map((file) => ({ kind: "file", type: file.type })),
		},
	});
	target.dispatchEvent(event);
}

test("selecting a file through the input reports it via onChange", () => {
	const onChange = vi.fn();
	createMediaDrop({ input, onChange });

	setInputFiles(input, [makeFile("a.png", "image/png")]);
	input.dispatchEvent(new Event("change"));

	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange.mock.calls[0]?.[0].files).toHaveLength(1);
});

test("dropping files on the root reports them via onChange", () => {
	const onChange = vi.fn();
	createMediaDrop({ root, onChange });

	dispatchDragEvent(root, "dragenter", [makeFile("a.png", "image/png")]);
	dispatchDragEvent(root, "drop", [makeFile("a.png", "image/png")]);

	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange.mock.calls[0]?.[0].files).toHaveLength(1);
});

test("open() clicks the input", () => {
	const clickSpy = vi.spyOn(input, "click");
	const uploader = createMediaDrop({ input });

	uploader.open();

	expect(clickSpy).toHaveBeenCalledTimes(1);
});

test("removeFile and clearFiles delegate to the core engine", () => {
	const uploader = createMediaDrop({ input });
	setInputFiles(input, [makeFile("a.png", "image/png")]);
	input.dispatchEvent(new Event("change"));

	const [item] = uploader.getState().files;
	uploader.removeFile(item?.id ?? "");
	expect(uploader.getState().files).toHaveLength(0);

	setInputFiles(input, [makeFile("b.png", "image/png")]);
	input.dispatchEvent(new Event("change"));
	uploader.clearFiles();
	expect(uploader.getState().files).toHaveLength(0);
});

test("destroy() removes listeners so further events are ignored", () => {
	const onChange = vi.fn();
	const uploader = createMediaDrop({ root, input, onChange });

	uploader.destroy();

	setInputFiles(input, [makeFile("a.png", "image/png")]);
	input.dispatchEvent(new Event("change"));
	dispatchDragEvent(root, "drop", [makeFile("b.png", "image/png")]);

	expect(onChange).not.toHaveBeenCalled();
});

test("without a transport, upload methods do not exist on the returned object", () => {
	const uploader = createMediaDrop({ input });

	expect("uploadFile" in uploader).toBe(false);
	expect("cancelUpload" in uploader).toBe(false);
});

test("with a transport, uploadFile drives a file through uploadStatus", async () => {
	const { transport, resolve } = createDeferredTransport();
	const uploader = createMediaDrop({ input, transport });

	setInputFiles(input, [makeFile("a.png", "image/png")]);
	input.dispatchEvent(new Event("change"));
	const fileId = uploader.getState().files[0]?.id ?? "";

	uploader.uploadFile(fileId);
	expect(uploader.getState().files[0]?.uploadStatus).toBe("uploading");

	resolve(fileId, { url: "https://example.test/a" });
	await vi.waitFor(() => {
		expect(uploader.getState().files[0]?.uploadStatus).toBe("done");
	});
	expect(uploader.getState().files[0]?.uploadResult).toEqual({
		url: "https://example.test/a",
	});
});

test("cancelUpload aborts an in-flight upload", async () => {
	let aborted = false;
	const transport: UploadTransport = {
		upload(_file, { signal }) {
			return new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => {
					aborted = true;
					reject(new Error("aborted"));
				});
			});
		},
	};
	const uploader = createMediaDrop({ input, transport });

	setInputFiles(input, [makeFile("a.png", "image/png")]);
	input.dispatchEvent(new Event("change"));
	const fileId = uploader.getState().files[0]?.id ?? "";

	uploader.uploadFile(fileId);
	uploader.cancelUpload(fileId);

	expect(aborted).toBe(true);
	await vi.waitFor(() => {
		expect(uploader.getState().files[0]?.uploadStatus).toBe("canceled");
	});
});

test("retryUpload re-enqueues a failed upload", async () => {
	const { transport, reject, resolve } = createDeferredTransport();
	const uploader = createMediaDrop({ input, transport });

	setInputFiles(input, [makeFile("a.png", "image/png")]);
	input.dispatchEvent(new Event("change"));
	const fileId = uploader.getState().files[0]?.id ?? "";

	uploader.uploadFile(fileId);
	reject(fileId, new Error("network blip"));
	await vi.waitFor(() => {
		expect(uploader.getState().files[0]?.uploadStatus).toBe("error");
	});

	uploader.retryUpload(fileId);
	expect(uploader.getState().files[0]?.uploadStatus).toBe("uploading");

	resolve(fileId);
	await vi.waitFor(() => {
		expect(uploader.getState().files[0]?.uploadStatus).toBe("done");
	});
});

test("uploadAll only enqueues currently accepted files", () => {
	const calls: string[] = [];
	const transport: UploadTransport = {
		upload(file) {
			calls.push(file.id);
			return new Promise(() => {});
		},
	};
	const uploader = createMediaDrop({
		input,
		transport,
		restrictions: { accept: ["image/png"] },
	});

	setInputFiles(input, [
		makeFile("a.png", "image/png"),
		makeFile("b.pdf", "application/pdf"),
	]);
	input.dispatchEvent(new Event("change"));

	uploader.uploadAll();

	const files = uploader.getState().files;
	expect(calls).toEqual([files[0]?.id]);
});

test("destroy() cancels every in-flight upload instead of leaking them", () => {
	let abortCount = 0;
	const transport: UploadTransport = {
		upload(_file, { signal }) {
			return new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => {
					abortCount += 1;
					reject(new Error("aborted"));
				});
			});
		},
	};
	const uploader = createMediaDrop({ input, transport, concurrency: 2 });

	setInputFiles(input, [
		makeFile("a.png", "image/png"),
		makeFile("b.png", "image/png"),
	]);
	input.dispatchEvent(new Event("change"));
	uploader.uploadAll();

	uploader.destroy();

	expect(abortCount).toBe(2);
});
