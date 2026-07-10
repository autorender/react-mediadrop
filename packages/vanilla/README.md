# @mediadrop/vanilla

Thin DOM binding over [`@mediadrop/core`](../core/README.md) for plain
JS/TS projects (or any framework without a dedicated mediadrop binding).

```ts
import { createMediaDrop } from "@mediadrop/vanilla";

const uploader = createMediaDrop({
	root: document.querySelector("#dropzone"),
	input: document.querySelector("#file-input"),
	restrictions: { accept: ["image/*"], maxFiles: 5 },
	onChange(state) {
		console.log(state.files);
	},
});

// later, when the dropzone element is torn down:
uploader.destroy();
```

See [`skills/mediadrop/references/vanilla.md`](../../skills/mediadrop/references/vanilla.md)
for the full API and gotchas.

## Drag state (opt-in)

Pass `onDragStateChange` to be notified whenever the root's drag state
changes (drag enter/over/leave/drop), so you can toggle a CSS class or
attribute for a "drag active" affordance without reimplementing drag
tracking yourself:

```ts
const uploader = createMediaDrop({
	root: document.querySelector("#dropzone"),
	onDragStateChange(state) {
		root.classList.toggle("drag-active", state.isDragActive);
		root.classList.toggle("drag-reject", state.isDragReject);
	},
});
```

`state` is the same `DragState` shape (`isDragActive`/`isDragAccept`/
`isDragReject`) `@mediadrop/react`'s `useMediaDrop` exposes — `isDragReject`
reflects both `restrictions.accept` and a custom `validator`, previewed
live during the drag, before drop.

## Upload (opt-in)

Pass `transport` (e.g. from [`@mediadrop/xhr-upload`](../xhr-upload/README.md))
and the returned object additionally has `uploadFile`/`uploadAll`/
`cancelUpload`/`cancelAllUploads`/`retryUpload`; each file's
`uploadStatus`/`progress`/`uploadError`/`uploadResult` lands on the same
`MediaDropFile` objects `onChange`/`getState` already give you. Without
`transport`, none of that exists on the returned object, and TypeScript
won't let you call it. `destroy()` cancels every queued/in-flight upload
for you before removing DOM listeners.

```ts
import { createMediaDrop } from "@mediadrop/vanilla";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const uploader = createMediaDrop({
	input: document.querySelector("#file-input"),
	transport: createXhrUploadTransport({ endpoint: "/api/upload" }),
	concurrency: 3,
});

uploader.uploadAll();
```

`transport` accepts **any** `UploadTransport` — `@mediadrop/xhr-upload`,
[`@mediadrop/s3`](../s3/README.md), [`@mediadrop/tus`](../tus/README.md),
or your own. There is no S3/tus-specific wrapper and there won't be —
this binding stays a thin pass-through, the same one option either way.

See [`skills/mediadrop/references/upload.md`](../../skills/mediadrop/references/upload.md)
for the full queue/retry/cancel contract — this binding adds no logic of
its own beyond forwarding to `@mediadrop/core`'s queue.

**Pause/resume, remote-provider import, and OAuth are still not
implemented** — see
[`skills/mediadrop/references/scope.md`](../../skills/mediadrop/references/scope.md).
