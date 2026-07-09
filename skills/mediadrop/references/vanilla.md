# `@mediadrop/vanilla`

Thin DOM binding over `@mediadrop/core`. Use this for plain JS/TS projects,
or any framework without a dedicated mediadrop binding.

## Quickstart

```ts
import { createMediaDrop } from "@mediadrop/vanilla";

const uploader = createMediaDrop({
	root: document.querySelector("#dropzone"),
	input: document.querySelector("#file-input"),
	restrictions: {
		accept: ["image/png", "image/jpeg", "image/webp"],
		maxFiles: 5,
	},
	onChange(state) {
		console.log(state.files);
	},
});

// Open the native file picker programmatically (e.g. from a "Choose files" button):
document.querySelector("#choose-button")?.addEventListener("click", () => {
	uploader.open();
});

// When you're done with this dropzone (SPA route change, component teardown, etc.):
uploader.destroy();
```

`root` and `input` are both optional and independent:

- Pass `root` to wire drag/drop on that element.
- Pass `input` (an `<input type="file">`) to wire file-picker selection and
  to enable `uploader.open()`.
- Pass both for the common "click or drag" dropzone pattern.

## API

```ts
type VanillaMediaDropOptions = {
	root?: HTMLElement | null;
	input?: HTMLInputElement | null;
	restrictions?: MediaDropRestrictions;
	validator?: MediaDropValidator;
	onChange?: (state: MediaDropState) => void;
};

function createMediaDrop(options: VanillaMediaDropOptions): {
	getState(): MediaDropState;
	subscribe(listener: (state: MediaDropState) => void): () => void;
	addFiles(files: FileList | File[]): void;
	removeFile(id: string): void;
	clearFiles(): void;
	open(): void; // clicks the input, if one was passed
	destroy(): void; // removes all DOM listeners this call added
};
```

Passing `transport` (plus optional `concurrency`/`retries`/`retryDelays`)
additionally returns `uploadFile`/`uploadAll`/`cancelUpload`/
`cancelAllUploads`/`retryUpload` — see "Upload" below.

`onChange` fires on every state change (add/remove/clear) — it's a
convenience wrapper around `subscribe`. Call `subscribe` directly if you
need to unsubscribe independently from `destroy()`.

## Upload (Phase 2 + Phase 3, opt-in)

`transport` accepts `@mediadrop/xhr-upload`, `@mediadrop/s3`,
`@mediadrop/tus`, or your own — this binding has no S3/tus-specific
wrapper and never will. Example below uses `@mediadrop/xhr-upload`; swap
in `s3Upload`/`s3MultipartUpload`/`tusUpload` the same way.

```ts
import { createMediaDrop } from "@mediadrop/vanilla";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const uploader = createMediaDrop({
	root: document.querySelector("#dropzone"),
	input: document.querySelector("#file-input"),
	transport: createXhrUploadTransport({ endpoint: "/api/upload" }),
	concurrency: 3,
	retries: 2,
	onChange(state) {
		for (const item of state.files) {
			console.log(item.name, item.uploadStatus, item.progress);
		}
	},
});

uploader.uploadAll();
// later: uploader.cancelUpload(id) / uploader.retryUpload(id)
```

Without `transport`, `uploadFile`/`uploadAll`/`cancelUpload`/
`cancelAllUploads`/`retryUpload` don't exist on the returned object at
all (TypeScript won't let you call them). `destroy()` cancels every
queued/in-flight upload before removing DOM listeners — you don't need to
call `cancelAllUploads()` yourself first. See [upload.md](upload.md) for
the full queue/retry/cancel contract; this binding adds no logic of its
own beyond forwarding to `@mediadrop/core`'s queue.

## Things to get right

- **Always call `destroy()`** when the dropzone element is removed from the
  DOM (route change, conditional render, teardown). `createMediaDrop`
  attaches real `addEventListener` calls; nothing removes them for you.
- This package does not touch validation or state logic — both live in
  `@mediadrop/core`. Don't duplicate `accept`/`maxSize`/etc. checks here;
  pass them through `restrictions`.
- There is no built-in drag-state (`isDragActive`/`isDragAccept`/
  `isDragReject`) surface in the vanilla API today — `onChange` only reports
  file state. If you need visual drag feedback, use `@mediadrop/core`'s
  `createDropzoneController` directly (advanced use) or track it yourself
  from your own `dragenter`/`dragleave` listeners on `root`.
