# @mediadrop/react

Headless `useMediaDrop` hook over [`@mediadrop/core`](../core/README.md).
No prebuilt component — you own the markup.

## Install

```sh
pnpm add @mediadrop/react
```

## Quickstart

```tsx
import { useMediaDrop } from "@mediadrop/react";

function UploadBox() {
	const { getRootProps, getInputProps, files, isDragActive } = useMediaDrop({
		restrictions: { accept: ["image/png", "image/jpeg"], maxFiles: 5 },
	});

	return (
		<div {...getRootProps()}>
			<input {...getInputProps()} />
			{isDragActive ? "Drop it!" : "Drag files here"}
		</div>
	);
}
```

`getRootProps()` already makes the root click- and keyboard-activatable
(Space/Enter opens the file picker), so the example above needs no
separate "Choose files" button. Pass `noClick`/`noKeyboard`/`noDrag` to
`useMediaDrop()` to opt out of any of that.

## What the hook returns

| Field | Type | Notes |
|---|---|---|
| `files` / `acceptedFiles` / `rejectedFiles` | `MediaDropFile[]` | Every file added, filtered by `status`. |
| `isDragActive` / `isDragAccept` / `isDragReject` | `boolean` | Per-dropzone drag state — best-effort, see [core-concepts.md](../../skills/mediadrop/references/core-concepts.md#drag-state). |
| `isFocused` | `boolean` | Root element has keyboard focus. Always `false` when `noKeyboard` is set. |
| `isDragGlobal` | `boolean` | A file drag is happening anywhere on the document, not just this root — React-only, see [core-concepts.md](../../skills/mediadrop/references/core-concepts.md#drag-state). |
| `removeFile(id)` / `clearFiles()` | `() => void` | Mutate the file list. |
| `open()` | `() => void` | Imperatively open the native file picker. |
| `getRootProps(arg?)` | `() => RootProps` | Drag/drop + click/keyboard handlers, `role`, `tabIndex`. Composes with your own handlers — yours runs first, `event.stopPropagation()` opts out of the internal one. |
| `getInputProps(arg?)` | `() => InputProps` | Hidden `<input type="file">` props. |

Pass `transport` (plus optional `concurrency`/`retries`/`retryDelays`) and
the hook additionally returns `uploadFile`/`uploadAll`/`cancelUpload`/
`cancelAllUploads`/`retryUpload`, with each file's `uploadStatus`/
`progress`/`uploadError`/`uploadResult` available on `files`/
`acceptedFiles`/`rejectedFiles` directly. Without `transport`, none of
that exists on the returned object, and TypeScript won't let you call it.

```tsx
import { useMediaDrop } from "@mediadrop/react";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const transport = createXhrUploadTransport({ endpoint: "/api/upload" });
const { files, uploadAll } = useMediaDrop({ transport, concurrency: 3 });
```

See [`skills/mediadrop/references/react.md`](../../skills/mediadrop/references/react.md)
for the full API, handler composition rules, click/keyboard details, and
SSR notes, and [`upload.md`](../../skills/mediadrop/references/upload.md)
for the full queue/retry/cancel contract — this hook adds no logic of its
own beyond forwarding to `@mediadrop/core`'s queue.

**Resumability, S3 multipart, pause/resume, and remote-provider import are
still not implemented** — see
[`skills/mediadrop/references/scope.md`](../../skills/mediadrop/references/scope.md).
