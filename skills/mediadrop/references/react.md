# `@mediadrop/react`

Headless `useMediaDrop` hook. No prebuilt component — you own the markup.

## Quickstart

```tsx
import { useMediaDrop } from "@mediadrop/react";

export function UploadBox() {
	const {
		getRootProps,
		getInputProps,
		open,
		files,
		acceptedFiles,
		rejectedFiles,
		isDragActive,
		isDragAccept,
		isDragReject,
		removeFile,
		clearFiles,
	} = useMediaDrop({
		restrictions: {
			accept: ["image/png", "image/jpeg", "image/webp"],
			maxFiles: 5,
			maxSize: 5 * 1024 * 1024,
		},
	});

	return (
		<div {...getRootProps()}>
			<input {...getInputProps()} />
			<p>Drop files here</p>

			{files.map((item) => (
				<div key={item.id}>
					{item.name}
					<button type="button" onClick={() => removeFile(item.id)}>
						Remove
					</button>
				</div>
			))}

			<button type="button" onClick={open}>
				Choose files
			</button>

			{isDragReject ? <p>Some files are not allowed</p> : null}
		</div>
	);
}
```

## API shape

```ts
function useMediaDrop(options?: {
	restrictions?: MediaDropRestrictions;
	validator?: MediaDropValidator;
	noClick?: boolean; // disable click-to-open on the root
	noKeyboard?: boolean; // disable Space/Enter-to-open and focus tracking
	noDrag?: boolean; // disable the root's drag/drop handling
}): {
	files: MediaDropFile[];
	acceptedFiles: MediaDropFile[];
	rejectedFiles: MediaDropFile[];
	isDragActive: boolean;
	isDragAccept: boolean;
	isDragReject: boolean;
	isFocused: boolean; // root has keyboard focus; always false when noKeyboard
	isDragGlobal: boolean; // a file drag is happening anywhere on the document
	removeFile(id: string): void;
	clearFiles(): void;
	open(): void;
	getRootProps(arg?: {
		onClick?, onKeyDown?, onFocus?, onBlur?,
		onDragEnter?, onDragOver?, onDragLeave?, onDrop?
	}): {
		role, tabIndex,
		onClick, onKeyDown, onFocus, onBlur,
		onDragEnter, onDragOver, onDragLeave, onDrop,
	};
	getInputProps(arg?: {
		onChange?, onClick?
	}): { ref, type: "file", multiple, accept, style, onChange, onClick };
};
```

Passing `transport` (plus optional `concurrency`/`retries`/`retryDelays`)
additionally returns `uploadFile`/`uploadAll`/`cancelUpload`/
`cancelAllUploads`/`retryUpload` — see "Upload" below.

### Click-to-open and keyboard activation

By default, `getRootProps()` makes the root element click- and
keyboard-activatable, matching the common dropzone pattern: clicking
anywhere in the root, or pressing Space/Enter while it's focused, opens the
native file picker — the same thing `open()` does programmatically.

- `noClick: true` disables the click-to-open behavior (keep `open()` for a
  manual "Choose files" button instead).
- `noKeyboard: true` disables Space/Enter-to-open, removes `tabIndex` from
  the returned props, and stops tracking `isFocused` (it stays `false`).
- `noDrag: true` disables drag/drop handling on the root entirely — the
  input and click-to-open still work.

**If you render your own "Choose files" button inside the root element**
(as opposed to relying on click-to-open), stop its click from bubbling to
the root, or the root's click-to-open will fire a second time:

```tsx
<div {...getRootProps()}>
	<input {...getInputProps()} />
	<button
		type="button"
		onClick={(event) => {
			event.stopPropagation();
			open();
		}}
	>
		Choose files
	</button>
</div>
```

This is the same reason `getInputProps()`'s own `onClick` already stops
propagation internally — the input lives inside the root too.

## Upload (Phase 2, opt-in)

Passing `transport` adds upload orchestration to the returned object —
without it, none of this exists, and TypeScript won't let you call it:

```tsx
import { useMediaDrop } from "@mediadrop/react";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const transport = createXhrUploadTransport({ endpoint: "/api/upload" });

export function UploadBox() {
	const {
		getRootProps,
		getInputProps,
		files,
		uploadAll,
		cancelUpload,
		retryUpload,
	} = useMediaDrop({
		transport,
		concurrency: 3,
		retries: 2,
	});

	return (
		<div {...getRootProps()}>
			<input {...getInputProps()} />

			{files.map((item) => (
				<div key={item.id}>
					{item.name} — {item.uploadStatus ?? "not queued"}
					{item.progress ? ` (${item.progress.loaded} bytes)` : null}
					{item.uploadStatus === "uploading" ? (
						<button type="button" onClick={() => cancelUpload(item.id)}>
							Cancel
						</button>
					) : null}
					{item.uploadStatus === "error" ? (
						<button type="button" onClick={() => retryUpload(item.id)}>
							Retry
						</button>
					) : null}
				</div>
			))}

			<button type="button" onClick={uploadAll}>
				Upload all
			</button>
		</div>
	);
}
```

`files`/`acceptedFiles`/`rejectedFiles` already carry the upload state —
there's no separate upload-specific list. Read `item.uploadStatus`/
`item.progress`/`item.uploadError`/`item.uploadResult` directly off each
`MediaDropFile`. `transport` accepts `@mediadrop/xhr-upload`,
`@mediadrop/s3`, `@mediadrop/tus`, or your own — this hook has no
S3/tus-specific API and never will (see "Bad" examples in `SKILL.md`).
See [upload.md](upload.md) for the full queue/retry/cancel contract and
the transport interface: no transport implements its own retry loop (S3
multipart and tus both call `@mediadrop/core`'s shared `withRetry`
instead), and this hook adds no logic beyond forwarding to that queue —
not a second implementation of any of it.

Whether a given `useMediaDrop()` call has upload methods is decided once,
the same way `restrictions`/`validator` are baked in once — from whether
`transport` was passed on the render that created the hook's underlying
engine. It does not appear or disappear across re-renders.

## Composing your own handlers

`getRootProps`/`getInputProps` accept your own handlers and compose them
with the internal ones — your handler always runs first:

```tsx
<div {...getRootProps({ onDrop: (e) => console.log("also dropped", e) })}>
```

If your handler calls `event.stopPropagation()`, mediadrop's internal
handling for that event is skipped. This is the one supported way to
override built-in behavior — don't reach into internals to disable it.

## Things to get right

- **Don't wrap the returned `<input>` in `display: none` yourself and expect
  `open()` to fail** — `getInputProps()` already hides it (`display: none`)
  and `open()` calls `.click()` on it programmatically, which works through
  `display: none` in all evergreen browsers.
- The hook is SSR-safe: it never touches `window`/`document` during render.
  `isDragGlobal`'s `document` listeners are registered inside a `useEffect`
  (client-only) and removed on unmount — same pattern as everything else
  that touches browser globals here. You can render it on the server
  without guards.
- The engine backing one `useMediaDrop()` call is created once for that
  component instance's lifetime. Changing `restrictions`/`validator` props
  after mount changes future drag-acceptance previews (`isDragAccept`/
  `isDragReject`) but does **not** retroactively re-validate files already
  in `files`. If a task needs fully dynamic restrictions with re-validation,
  say so explicitly rather than assuming the hook already does it.
- Multiple `useMediaDrop()` calls on the same page are independent and safe
  — see [core-concepts.md](core-concepts.md#multiple-dropzones-on-one-page).
- There's no dashboard/progress UI to import — every list item, remove
  button, progress bar, and status message in the examples above is yours
  to build. `progress`/`uploadStatus` on `MediaDropFile` are data, not UI.
