import { expect, test, vi } from "vitest";
import { createMediaDrop } from "./mediadrop.js";
import type { UploadTransport } from "./transport.js";

function makeFile(name: string, type: string, size: number): File {
	return new File([new Uint8Array(size)], name, { type });
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

test("accepts valid files", () => {
	const mediadrop = createMediaDrop({
		restrictions: { accept: ["image/png"] },
	});
	mediadrop.addFiles([makeFile("a.png", "image/png", 100)]);

	expect(mediadrop.getAcceptedFiles()).toHaveLength(1);
	expect(mediadrop.getState().files[0]?.status).toBe("accepted");
});

test("rejects files with an invalid type", () => {
	const mediadrop = createMediaDrop({
		restrictions: { accept: ["image/png"] },
	});
	mediadrop.addFiles([makeFile("a.pdf", "application/pdf", 100)]);

	const [item] = mediadrop.getRejectedFiles();
	expect(item?.errors[0]?.code).toBe("file-invalid-type");
});

test("rejects files that are too large", () => {
	const mediadrop = createMediaDrop({ restrictions: { maxSize: 100 } });
	mediadrop.addFiles([makeFile("a.png", "image/png", 200)]);

	const [item] = mediadrop.getRejectedFiles();
	expect(item?.errors[0]?.code).toBe("file-too-large");
});

test("rejects files that are too small", () => {
	const mediadrop = createMediaDrop({ restrictions: { minSize: 100 } });
	mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);

	const [item] = mediadrop.getRejectedFiles();
	expect(item?.errors[0]?.code).toBe("file-too-small");
});

test("enforces maxFiles by accepting up to the limit and rejecting the overflow", () => {
	const mediadrop = createMediaDrop({ restrictions: { maxFiles: 2 } });
	mediadrop.addFiles([
		makeFile("a.png", "image/png", 10),
		makeFile("b.png", "image/png", 10),
		makeFile("c.png", "image/png", 10),
	]);

	const state = mediadrop.getState();
	expect(state.files.map((item) => item.status)).toEqual([
		"accepted",
		"accepted",
		"rejected",
	]);
	expect(state.files[2]?.errors[0]?.code).toBe("too-many-files");
});

test("maxFiles accounts for files already accepted in earlier batches", () => {
	const mediadrop = createMediaDrop({ restrictions: { maxFiles: 1 } });
	mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);
	mediadrop.addFiles([makeFile("b.png", "image/png", 10)]);

	expect(mediadrop.getAcceptedFiles()).toHaveLength(1);
	expect(mediadrop.getRejectedFiles()).toHaveLength(1);
});

test("a rejected file does not block other valid files in the same batch", () => {
	const mediadrop = createMediaDrop({
		restrictions: { accept: ["image/png"] },
	});
	mediadrop.addFiles([
		makeFile("a.pdf", "application/pdf", 10),
		makeFile("b.png", "image/png", 10),
	]);

	const state = mediadrop.getState();
	expect(state.files[0]?.status).toBe("rejected");
	expect(state.files[1]?.status).toBe("accepted");
});

test("custom validator returning a single error rejects the file", () => {
	const mediadrop = createMediaDrop({
		validator: (file) =>
			file.name.includes("bad")
				? { code: "validator-error", message: "bad file" }
				: null,
	});
	mediadrop.addFiles([makeFile("bad.png", "image/png", 10)]);

	expect(mediadrop.getRejectedFiles()).toHaveLength(1);
});

test("custom validator returning multiple errors rejects the file with all errors", () => {
	const mediadrop = createMediaDrop({
		validator: () => [
			{ code: "validator-error", message: "first" },
			{ code: "validator-error", message: "second" },
		],
	});
	mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);

	expect(mediadrop.getRejectedFiles()[0]?.errors).toHaveLength(2);
});

test("removeFile removes a single file by id", () => {
	const mediadrop = createMediaDrop();
	const [item] = mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);
	mediadrop.addFiles([makeFile("b.png", "image/png", 10)]);

	mediadrop.removeFile(item?.id ?? "");

	expect(mediadrop.getState().files).toHaveLength(1);
	expect(mediadrop.getState().files[0]?.name).toBe("b.png");
});

test("clearFiles empties the file list", () => {
	const mediadrop = createMediaDrop();
	mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);

	mediadrop.clearFiles();

	expect(mediadrop.getState().files).toEqual([]);
});

test("subscribe fires when files are added, removed, or cleared", () => {
	const mediadrop = createMediaDrop();
	const listener = vi.fn();
	mediadrop.subscribe(listener);

	mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);
	mediadrop.clearFiles();

	expect(listener).toHaveBeenCalledTimes(2);
});

test("without a transport, no upload methods exist on the instance", () => {
	const mediadrop = createMediaDrop({
		restrictions: { accept: ["image/png"] },
	});

	expect("uploadFile" in mediadrop).toBe(false);
	expect("uploadAll" in mediadrop).toBe(false);
	expect("cancelUpload" in mediadrop).toBe(false);
});

test("with a transport, uploadFile drives a file through uploadStatus without touching its validation status", async () => {
	const { transport, resolve } = createDeferredTransport();
	const mediadrop = createMediaDrop({ transport });
	const [item] = mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);

	mediadrop.uploadFile(item?.id ?? "");
	expect(mediadrop.getState().files[0]?.uploadStatus).toBe("uploading");
	expect(mediadrop.getState().files[0]?.status).toBe("accepted");

	resolve(item?.id ?? "", { url: "https://example.test/a" });
	await vi.waitFor(() => {
		expect(mediadrop.getState().files[0]?.uploadStatus).toBe("done");
	});

	// Validation-level status/accept-reject bookkeeping is untouched by upload.
	expect(mediadrop.getState().files[0]?.status).toBe("accepted");
	expect(mediadrop.getAcceptedFiles()).toHaveLength(1);
	expect(mediadrop.getState().files[0]?.uploadResult).toEqual({
		url: "https://example.test/a",
	});
});

test("uploadAll only enqueues accepted files, never rejected ones", () => {
	const calls: string[] = [];
	const transport: UploadTransport = {
		upload(file) {
			calls.push(file.id);
			return new Promise(() => {});
		},
	};
	const mediadrop = createMediaDrop({
		transport,
		restrictions: { accept: ["image/png"] },
	});
	mediadrop.addFiles([
		makeFile("a.png", "image/png", 10),
		makeFile("b.pdf", "application/pdf", 10),
	]);

	mediadrop.uploadAll();

	const files = mediadrop.getState().files;
	expect(calls).toEqual([files[0]?.id]);
	expect(files[1]?.uploadStatus).toBeUndefined();
});

test("maxFiles counting is unaffected by upload progress — status never changes once a file is accepted", async () => {
	const { transport, resolve } = createDeferredTransport();
	const mediadrop = createMediaDrop({
		transport,
		restrictions: { maxFiles: 1 },
	});
	const [item] = mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);

	mediadrop.uploadFile(item?.id ?? "");
	resolve(item?.id ?? "");
	await vi.waitFor(() => {
		expect(mediadrop.getState().files[0]?.uploadStatus).toBe("done");
	});

	// A second file must still be rejected — "a" finishing its upload must
	// not free up a maxFiles slot, because `status` (not `uploadStatus`) is
	// what maxFiles counts, and `status` never changed.
	mediadrop.addFiles([makeFile("b.png", "image/png", 10)]);
	expect(mediadrop.getRejectedFiles()).toHaveLength(1);
	expect(mediadrop.getRejectedFiles()[0]?.errors[0]?.code).toBe(
		"too-many-files",
	);
});

test("removeFile cancels that file's in-flight upload instead of leaking it", () => {
	let sawAbort = false;
	const transport: UploadTransport = {
		upload(_file, { signal }) {
			return new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => {
					sawAbort = true;
					reject(new Error("aborted"));
				});
			});
		},
	};
	const mediadrop = createMediaDrop({ transport });
	const [item] = mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);

	mediadrop.uploadFile(item?.id ?? "");
	mediadrop.removeFile(item?.id ?? "");

	expect(sawAbort).toBe(true);
	expect(mediadrop.getState().files).toHaveLength(0);
});

test("clearFiles cancels every in-flight upload instead of leaking them", () => {
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
	const mediadrop = createMediaDrop({ transport, concurrency: 2 });
	mediadrop.addFiles([
		makeFile("a.png", "image/png", 10),
		makeFile("b.png", "image/png", 10),
	]);
	mediadrop.uploadAll();

	mediadrop.clearFiles();

	expect(abortCount).toBe(2);
});

test("cancelUpload and retryUpload round-trip a failed upload back to done", async () => {
	const { transport, reject, resolve } = createDeferredTransport();
	const mediadrop = createMediaDrop({ transport });
	const [item] = mediadrop.addFiles([makeFile("a.png", "image/png", 10)]);

	mediadrop.uploadFile(item?.id ?? "");
	reject(item?.id ?? "", new Error("network blip"));
	await vi.waitFor(() => {
		expect(mediadrop.getState().files[0]?.uploadStatus).toBe("error");
	});

	mediadrop.retryUpload(item?.id ?? "");
	expect(mediadrop.getState().files[0]?.uploadStatus).toBe("uploading");

	resolve(item?.id ?? "");
	await vi.waitFor(() => {
		expect(mediadrop.getState().files[0]?.uploadStatus).toBe("done");
	});
});
