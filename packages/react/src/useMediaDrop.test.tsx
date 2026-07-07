// @vitest-environment jsdom
import type { UploadTransport } from "@mediadrop/core";
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import type { ChangeEvent } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type {
	UseMediaDropOptions,
	UseMediaDropResult,
	UseMediaDropUploadOptions,
	UseMediaDropUploadResult,
} from "./useMediaDrop.js";
import { useMediaDrop } from "./useMediaDrop.js";

afterEach(() => {
	cleanup();
});

function makeFile(name: string, type: string): File {
	return new File(["x"], name, { type });
}

/** jsdom has no writable FileList; tests assign files via defineProperty. */
function setInputFiles(target: HTMLInputElement, files: File[]): void {
	Object.defineProperty(target, "files", { value: files, configurable: true });
}

/** jsdom does not implement DragEvent/DataTransfer, so drag payloads are simulated. */
function dragEventWithFiles(type: string, files: File[] = []): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: {
			files,
			items: files.map((file) => ({ kind: "file", type: file.type })),
			types: files.length > 0 ? ["Files"] : [],
		},
	});
	return event;
}

function Harness(props: {
	options?: UseMediaDropOptions;
	apiRef: { current: UseMediaDropResult | null };
	onInputChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
	const api = useMediaDrop(props.options);
	props.apiRef.current = api;
	return (
		<div data-testid="root" {...api.getRootProps()}>
			<input
				data-testid="input"
				{...api.getInputProps({ onChange: props.onInputChange })}
			/>
		</div>
	);
}

function UploadHarness(props: {
	options: UseMediaDropUploadOptions;
	apiRef: { current: UseMediaDropUploadResult | null };
}) {
	const api = useMediaDrop(props.options);
	props.apiRef.current = api;
	return (
		<div data-testid="root" {...api.getRootProps()}>
			<input data-testid="input" {...api.getInputProps()} />
		</div>
	);
}

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

test("initializes without crashing", () => {
	const { result } = renderHook(() => useMediaDrop());

	expect(result.current.files).toEqual([]);
	expect(result.current.acceptedFiles).toEqual([]);
	expect(result.current.rejectedFiles).toEqual([]);
	expect(result.current.isDragActive).toBe(false);
});

test("getRootProps/getInputProps return usable, spreadable props", () => {
	const { result } = renderHook(() => useMediaDrop());

	const rootProps = result.current.getRootProps();
	expect(typeof rootProps.onDragEnter).toBe("function");
	expect(typeof rootProps.onDrop).toBe("function");

	const inputProps = result.current.getInputProps();
	expect(inputProps.type).toBe("file");
	expect(inputProps.multiple).toBe(true);
	expect(typeof inputProps.onChange).toBe("function");
});

test("getInputProps sets multiple=false when maxFiles is 1", () => {
	const { result } = renderHook(() =>
		useMediaDrop({ restrictions: { maxFiles: 1 } }),
	);
	expect(result.current.getInputProps().multiple).toBe(false);
});

test("adding files through the input updates files", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	setInputFiles(input, [makeFile("a.png", "image/png")]);
	fireEvent.change(input);

	expect(apiRef.current?.files).toHaveLength(1);
});

test("drag enter/leave/drop update drag state and drop adds files", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(
		<Harness
			apiRef={apiRef}
			options={{ restrictions: { accept: ["image/png"] } }}
		/>,
	);

	const root = screen.getByTestId("root");

	fireEvent(
		root,
		dragEventWithFiles("dragenter", [makeFile("a.png", "image/png")]),
	);
	expect(apiRef.current?.isDragActive).toBe(true);
	expect(apiRef.current?.isDragAccept).toBe(true);

	fireEvent(root, dragEventWithFiles("drop", [makeFile("a.png", "image/png")]));
	expect(apiRef.current?.isDragActive).toBe(false);
	expect(apiRef.current?.files).toHaveLength(1);
});

test("dragleave deactivates the dropzone", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} />);

	const root = screen.getByTestId("root");
	fireEvent(
		root,
		dragEventWithFiles("dragenter", [makeFile("a.png", "image/png")]),
	);
	fireEvent(root, dragEventWithFiles("dragleave"));

	expect(apiRef.current?.isDragActive).toBe(false);
});

test("a consumer calling stopPropagation suppresses the internal handler", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	const onInputChange = vi.fn((event: ChangeEvent<HTMLInputElement>) => {
		event.stopPropagation();
	});
	render(<Harness apiRef={apiRef} onInputChange={onInputChange} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	setInputFiles(input, [makeFile("a.png", "image/png")]);
	fireEvent.change(input);

	expect(onInputChange).toHaveBeenCalledTimes(1);
	expect(apiRef.current?.files).toHaveLength(0);
});

test("removeFile and clearFiles update state", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	setInputFiles(input, [makeFile("a.png", "image/png")]);
	fireEvent.change(input);

	const [item] = apiRef.current?.files ?? [];
	act(() => {
		apiRef.current?.removeFile(item?.id ?? "");
	});
	expect(apiRef.current?.files).toHaveLength(0);

	setInputFiles(input, [makeFile("b.png", "image/png")]);
	fireEvent.change(input);
	act(() => {
		apiRef.current?.clearFiles();
	});
	expect(apiRef.current?.files).toHaveLength(0);
});

test("unmounting does not throw and further native events are inert", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	const { unmount } = render(<Harness apiRef={apiRef} />);

	const root = screen.getByTestId("root");
	expect(() => unmount()).not.toThrow();
	expect(() => root.dispatchEvent(dragEventWithFiles("drop"))).not.toThrow();
});

test("getRootProps exposes keyboard/focus affordances by default", () => {
	const { result } = renderHook(() => useMediaDrop());

	const rootProps = result.current.getRootProps();
	expect(rootProps.role).toBe("presentation");
	expect(rootProps.tabIndex).toBe(0);
	expect(typeof rootProps.onClick).toBe("function");
	expect(typeof rootProps.onKeyDown).toBe("function");
	expect(typeof rootProps.onFocus).toBe("function");
	expect(typeof rootProps.onBlur).toBe("function");
});

test("clicking the root opens the file dialog", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	const clickSpy = vi.spyOn(input, "click");
	fireEvent.click(screen.getByTestId("root"));

	expect(clickSpy).toHaveBeenCalledTimes(1);
});

test("noClick suppresses click-to-open", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} options={{ noClick: true }} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	const clickSpy = vi.spyOn(input, "click");
	fireEvent.click(screen.getByTestId("root"));

	expect(clickSpy).not.toHaveBeenCalled();
});

test("Enter/Space on a focused root opens the file dialog", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	const clickSpy = vi.spyOn(input, "click");
	const root = screen.getByTestId("root");

	fireEvent.keyDown(root, { key: "Enter" });
	fireEvent.keyDown(root, { key: " " });

	expect(clickSpy).toHaveBeenCalledTimes(2);
});

test("noKeyboard suppresses keyboard-to-open and tabIndex", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} options={{ noKeyboard: true }} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	const clickSpy = vi.spyOn(input, "click");
	const root = screen.getByTestId("root");

	expect(apiRef.current?.getRootProps().tabIndex).toBeUndefined();
	fireEvent.keyDown(root, { key: "Enter" });

	expect(clickSpy).not.toHaveBeenCalled();
});

test("isFocused tracks focus/blur on the root, unless noKeyboard is set", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} />);

	const root = screen.getByTestId("root");
	fireEvent.focus(root);
	expect(apiRef.current?.isFocused).toBe(true);

	fireEvent.blur(root);
	expect(apiRef.current?.isFocused).toBe(false);
});

test("noKeyboard keeps isFocused false", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} options={{ noKeyboard: true }} />);

	const root = screen.getByTestId("root");
	fireEvent.focus(root);

	expect(apiRef.current?.isFocused).toBe(false);
});

test("noDrag disables drag state and drop no longer adds files", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} options={{ noDrag: true }} />);

	const root = screen.getByTestId("root");
	fireEvent(
		root,
		dragEventWithFiles("dragenter", [makeFile("a.png", "image/png")]),
	);
	expect(apiRef.current?.isDragActive).toBe(false);

	fireEvent(root, dragEventWithFiles("drop", [makeFile("a.png", "image/png")]));
	expect(apiRef.current?.files).toHaveLength(0);
});

test("isDragGlobal reflects a drag anywhere on the document, independent of this dropzone's root", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	render(<Harness apiRef={apiRef} />);

	const elsewhere = document.createElement("div");
	document.body.append(elsewhere);

	fireEvent(
		document,
		dragEventWithFiles("dragenter", [makeFile("a.png", "image/png")]),
	);
	expect(apiRef.current?.isDragGlobal).toBe(true);
	// This dropzone's own root never saw the drag, so its per-zone state is untouched.
	expect(apiRef.current?.isDragActive).toBe(false);

	fireEvent(document, dragEventWithFiles("drop"));
	expect(apiRef.current?.isDragGlobal).toBe(false);

	elsewhere.remove();
});

test("custom validator can reject files during drag preview when the browser exposes getAsFile", () => {
	const apiRef: { current: UseMediaDropResult | null } = { current: null };
	const validator = (file: File) =>
		file.name.includes("bad")
			? { code: "validator-error" as const, message: "bad file" }
			: null;
	render(<Harness apiRef={apiRef} options={{ validator }} />);

	const root = screen.getByTestId("root");
	const file = makeFile("bad.png", "image/png");
	const event = new Event("dragenter", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "dataTransfer", {
		value: {
			items: [{ kind: "file", type: file.type, getAsFile: () => file }],
		},
	});
	act(() => {
		root.dispatchEvent(event);
	});

	expect(apiRef.current?.isDragActive).toBe(true);
	expect(apiRef.current?.isDragReject).toBe(true);
});

test("without a transport, upload methods do not exist on the returned object", () => {
	const { result } = renderHook(() => useMediaDrop());

	expect("uploadFile" in result.current).toBe(false);
	expect("cancelUpload" in result.current).toBe(false);
});

test("with a transport, uploadFile drives a file through uploadStatus", async () => {
	const { transport, resolve } = createDeferredTransport();
	const apiRef: { current: UseMediaDropUploadResult | null } = {
		current: null,
	};
	render(<UploadHarness apiRef={apiRef} options={{ transport }} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	setInputFiles(input, [makeFile("a.png", "image/png")]);
	fireEvent.change(input);

	const fileId = apiRef.current?.files[0]?.id ?? "";
	act(() => {
		apiRef.current?.uploadFile(fileId);
	});
	expect(apiRef.current?.files[0]?.uploadStatus).toBe("uploading");

	await act(async () => {
		resolve(fileId, { url: "https://example.test/a" });
		await Promise.resolve();
	});
	expect(apiRef.current?.files[0]?.uploadStatus).toBe("done");
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
	const apiRef: { current: UseMediaDropUploadResult | null } = {
		current: null,
	};
	render(<UploadHarness apiRef={apiRef} options={{ transport }} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	setInputFiles(input, [makeFile("a.png", "image/png")]);
	fireEvent.change(input);
	const fileId = apiRef.current?.files[0]?.id ?? "";

	act(() => {
		apiRef.current?.uploadFile(fileId);
	});
	await act(async () => {
		apiRef.current?.cancelUpload(fileId);
		await Promise.resolve();
	});

	expect(aborted).toBe(true);
	expect(apiRef.current?.files[0]?.uploadStatus).toBe("canceled");
});

test("retryUpload re-enqueues a failed upload", async () => {
	const { transport, reject, resolve } = createDeferredTransport();
	const apiRef: { current: UseMediaDropUploadResult | null } = {
		current: null,
	};
	render(<UploadHarness apiRef={apiRef} options={{ transport }} />);

	const input = screen.getByTestId("input") as HTMLInputElement;
	setInputFiles(input, [makeFile("a.png", "image/png")]);
	fireEvent.change(input);
	const fileId = apiRef.current?.files[0]?.id ?? "";

	act(() => {
		apiRef.current?.uploadFile(fileId);
	});
	await act(async () => {
		reject(fileId, new Error("network blip"));
		await Promise.resolve();
	});
	expect(apiRef.current?.files[0]?.uploadStatus).toBe("error");

	act(() => {
		apiRef.current?.retryUpload(fileId);
	});
	expect(apiRef.current?.files[0]?.uploadStatus).toBe("uploading");

	await act(async () => {
		resolve(fileId);
		await Promise.resolve();
	});
	expect(apiRef.current?.files[0]?.uploadStatus).toBe("done");
});

test("uploadAll only enqueues currently accepted files", () => {
	const calls: string[] = [];
	const transport: UploadTransport = {
		upload(file) {
			calls.push(file.id);
			return new Promise(() => {});
		},
	};
	const apiRef: { current: UseMediaDropUploadResult | null } = {
		current: null,
	};
	render(
		<UploadHarness
			apiRef={apiRef}
			options={{ transport, restrictions: { accept: ["image/png"] } }}
		/>,
	);

	const input = screen.getByTestId("input") as HTMLInputElement;
	setInputFiles(input, [
		makeFile("a.png", "image/png"),
		makeFile("b.pdf", "application/pdf"),
	]);
	fireEvent.change(input);

	act(() => {
		apiRef.current?.uploadAll();
	});

	const files = apiRef.current?.files ?? [];
	expect(calls).toEqual([files[0]?.id]);
});
