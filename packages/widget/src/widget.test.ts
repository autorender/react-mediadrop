// @vitest-environment jsdom
import type { UploadTransport } from "@mediadrop/core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMediaDropWidget } from "./widget.js";

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

let target: HTMLDivElement;

beforeEach(() => {
	target = document.createElement("div");
	document.body.append(target);
});

afterEach(() => {
	target.remove();
});

function makeFile(name: string, type: string): File {
	return new File(["x"], name, { type });
}

function setInputFiles(inputEl: HTMLInputElement, files: File[]): void {
	Object.defineProperty(inputEl, "files", { value: files, configurable: true });
}

function dispatchDragEvent(
	el: HTMLElement,
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
	el.dispatchEvent(event);
}

function getInput(): HTMLInputElement {
	return target.querySelector("input[type=file]") as HTMLInputElement;
}

function getDropzone(): HTMLElement {
	return target.querySelector(".md-dropzone") as HTMLElement;
}

function click(selector: string): void {
	target.querySelector<HTMLElement>(selector)?.click();
}

test("renders the empty state with no files", () => {
	createMediaDropWidget({ target });

	const emptyState = target.querySelector(".md-empty-state") as HTMLElement;
	expect(emptyState.hidden).toBe(false);
	expect(target.querySelector(".md-file-list")).toHaveProperty("hidden", true);
});

test("selecting a file through the hidden input adds it and renders a file item", () => {
	const widget = createMediaDropWidget({ target });

	setInputFiles(getInput(), [makeFile("a.png", "image/png")]);
	getInput().dispatchEvent(new Event("change"));

	expect(widget.getState().files).toHaveLength(1);
	expect(target.querySelectorAll(".md-file-item")).toHaveLength(1);
	expect(target.querySelector(".md-empty-state")).toHaveProperty(
		"hidden",
		true,
	);
});

test("dropping a file on the dropzone adds it", () => {
	const widget = createMediaDropWidget({ target });

	dispatchDragEvent(getDropzone(), "dragenter", [
		makeFile("a.png", "image/png"),
	]);
	dispatchDragEvent(getDropzone(), "drop", [makeFile("a.png", "image/png")]);

	expect(widget.getState().files).toHaveLength(1);
});

test("a file failing validation renders its error message", () => {
	const widget = createMediaDropWidget({
		target,
		restrictions: { accept: ["image/png"] },
	});

	setInputFiles(getInput(), [makeFile("a.pdf", "application/pdf")]);
	getInput().dispatchEvent(new Event("change"));

	expect(widget.getState().files[0]?.status).toBe("rejected");
	expect(target.querySelector(".md-error")?.textContent).toContain(
		"file-invalid-type",
	);
});

test("without a transport, upload-related UI and methods are absent", () => {
	const widget = createMediaDropWidget({ target });

	expect("uploadFile" in widget).toBe(false);
	expect(target.querySelector("[data-action=upload-all]")).toBeNull();
});

test("upload-all uploads accepted files and renders progress", async () => {
	const { transport, resolve } = createDeferredTransport();
	const widget = createMediaDropWidget({ target, transport });

	setInputFiles(getInput(), [makeFile("a.png", "image/png")]);
	getInput().dispatchEvent(new Event("change"));
	const fileId = widget.getState().files[0]?.id ?? "";

	click("[data-action=upload-all]");
	expect(widget.getState().files[0]?.uploadStatus).toBe("uploading");
	expect(target.querySelector(".md-file-item .md-progress")).not.toBeNull();

	resolve(fileId, { url: "https://example.test/a" });
	await vi.waitFor(() => {
		expect(widget.getState().files[0]?.uploadStatus).toBe("done");
	});
});

test("cancel button aborts an in-flight upload", async () => {
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
	const widget = createMediaDropWidget({ target, transport });

	setInputFiles(getInput(), [makeFile("a.png", "image/png")]);
	getInput().dispatchEvent(new Event("change"));
	widget.uploadAll();

	click("[data-action=cancel]");

	expect(aborted).toBe(true);
	await vi.waitFor(() => {
		expect(widget.getState().files[0]?.uploadStatus).toBe("canceled");
	});
});

test("retry button appears for a failed file and re-enqueues it", async () => {
	const { transport, reject, resolve } = createDeferredTransport();
	const widget = createMediaDropWidget({ target, transport });

	setInputFiles(getInput(), [makeFile("a.png", "image/png")]);
	getInput().dispatchEvent(new Event("change"));
	const fileId = widget.getState().files[0]?.id ?? "";

	widget.uploadFile(fileId);
	reject(fileId, new Error("network blip"));
	await vi.waitFor(() => {
		expect(widget.getState().files[0]?.uploadStatus).toBe("error");
	});
	expect(target.querySelector("[data-action=retry]")).not.toBeNull();

	click("[data-action=retry]");
	expect(widget.getState().files[0]?.uploadStatus).toBe("uploading");

	resolve(fileId);
	await vi.waitFor(() => {
		expect(widget.getState().files[0]?.uploadStatus).toBe("done");
	});
});

test("remove button removes a single file", () => {
	const widget = createMediaDropWidget({ target });

	setInputFiles(getInput(), [makeFile("a.png", "image/png")]);
	getInput().dispatchEvent(new Event("change"));
	expect(widget.getState().files).toHaveLength(1);

	click("[data-action=remove]");

	expect(widget.getState().files).toHaveLength(0);
});

test("clear button clears every file", () => {
	const widget = createMediaDropWidget({ target });

	setInputFiles(getInput(), [
		makeFile("a.png", "image/png"),
		makeFile("b.png", "image/png"),
	]);
	getInput().dispatchEvent(new Event("change"));
	expect(widget.getState().files).toHaveLength(2);

	click("[data-action=clear]");

	expect(widget.getState().files).toHaveLength(0);
});

test("onComplete fires exactly once when all uploads settle", async () => {
	const { transport, resolve } = createDeferredTransport();
	const onComplete = vi.fn();
	const widget = createMediaDropWidget({
		target,
		transport,
		onComplete,
		concurrency: 2,
	});

	setInputFiles(getInput(), [
		makeFile("a.png", "image/png"),
		makeFile("b.png", "image/png"),
	]);
	getInput().dispatchEvent(new Event("change"));
	widget.uploadAll();

	const [a, b] = widget.getState().files;
	resolve(a?.id ?? "");
	resolve(b?.id ?? "");

	await vi.waitFor(() => {
		expect(onComplete).toHaveBeenCalledTimes(1);
	});
	expect(onComplete.mock.calls[0]?.[0].succeeded).toHaveLength(2);
});

test("setDisabled(true) disables interactive controls and ignores clicks", () => {
	const widget = createMediaDropWidget({ target });

	setInputFiles(getInput(), [makeFile("a.png", "image/png")]);
	getInput().dispatchEvent(new Event("change"));

	widget.setDisabled(true);

	expect(target.querySelector(".md-widget")).toHaveProperty(
		"className",
		expect.stringContaining("md-widget-disabled"),
	);
	click("[data-action=remove]");
	expect(widget.getState().files).toHaveLength(1);
});

test("destroy() removes the DOM and stops responding to further input", () => {
	const onChange = vi.fn();
	const widget = createMediaDropWidget({ target, onChange });

	widget.destroy();

	expect(target.querySelector(".md-widget")).toBeNull();
});

test("destroy() cancels in-flight uploads instead of leaking them", () => {
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
	const widget = createMediaDropWidget({ target, transport, concurrency: 2 });

	setInputFiles(getInput(), [
		makeFile("a.png", "image/png"),
		makeFile("b.png", "image/png"),
	]);
	getInput().dispatchEvent(new Event("change"));
	widget.uploadAll();

	widget.destroy();

	expect(abortCount).toBe(2);
});

test("two widget instances in separate containers do not conflict", () => {
	const targetB = document.createElement("div");
	document.body.append(targetB);

	const widgetA = createMediaDropWidget({ target });
	const widgetB = createMediaDropWidget({ target: targetB });

	setInputFiles(getInput(), [makeFile("a.png", "image/png")]);
	getInput().dispatchEvent(new Event("change"));

	expect(widgetA.getState().files).toHaveLength(1);
	expect(widgetB.getState().files).toHaveLength(0);

	targetB.remove();
});
