# `@mediadrop/widget`

An optional, themeable DOM widget over `@mediadrop/core` (Phase 4) — a
dropzone, file list, and (with `transport`) upload UI, from one function
call. **Nothing else in mediadrop requires this package.** It's built
entirely on the same public `createMediaDrop`/`createDropzoneController`
APIs [vanilla.md](vanilla.md) describes — no access to core internals, no
duplicated upload/retry/queue logic. If the user wants to own their
markup, point them at `@mediadrop/vanilla` or `@mediadrop/react` instead
and don't install this package.

## Quickstart

```ts
import { createMediaDropWidget } from "@mediadrop/widget";
import "@mediadrop/widget/style.css";

const widget = createMediaDropWidget({
	target: document.querySelector("#uploader"),
	restrictions: { accept: ["image/*"], maxFiles: 5 },
});

// when #uploader is torn down:
widget.destroy();
```

`target`'s existing children are left alone — the widget appends its own
root element and removes only that root on `destroy()`.

## Upload (opt-in, same gating rule as every other binding)

Pass `transport` — `@mediadrop/xhr-upload`, `@mediadrop/s3`,
`@mediadrop/tus`, or your own — and the widget additionally renders
per-file progress/cancel/retry, an "Upload all" button, and total
progress, and the returned object gains `uploadFile`/`uploadAll`/
`cancelUpload`/`cancelAllUploads`/`retryUpload`. Without `transport`,
none of that exists in the DOM or on the returned object, and TypeScript
won't let you call the upload methods. There is no S3/tus-specific
widget variant, same rule as `@mediadrop/vanilla`/`@mediadrop/react`.

```ts
import { createMediaDropWidget } from "@mediadrop/widget";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const widget = createMediaDropWidget({
	target: document.querySelector("#uploader"),
	transport: createXhrUploadTransport({ endpoint: "/api/upload" }),
	concurrency: 3,
	retries: 2,
});

widget.uploadAll();
```

See [upload.md](upload.md) for the full queue/retry/cancel contract —
this package adds no upload logic of its own beyond rendering it.

## Callbacks

Derived from public state changes (`engine.subscribe`) — there's no
separate internal event bus:

| Callback | Fires when |
|---|---|
| `onChange(state)` | Any state change. |
| `onUploadStart(files)` | Files transition into `uploadStatus: "queued"`. |
| `onUploadProgress(state)` | Any state change, while `transport` is set. |
| `onUploadSuccess(file)` | A file reaches `uploadStatus: "done"`. |
| `onUploadError(file, error)` | A file reaches `uploadStatus: "error"`. |
| `onComplete({ succeeded, failed, canceled })` | Once, on the transition from "something in flight" to "nothing in flight". |

## Theming

Plain CSS custom properties on `.md-widget`, not a closed styling system
— `--md-color-bg`/`-surface`/`-border`/`-text`/`-muted`/`-primary`/
`-primary-text`/`-danger`, `--md-radius`, `--md-font-family`,
`--md-spacing`. Prefixed class names (`md-widget`, `md-dropzone`,
`md-button`, `md-file-item`, etc.) are also stable and stylable directly.
No Shadow DOM — it renders into the light DOM on purpose, so global CSS
and the variables above both work without a `::part()` API. Importing
`@mediadrop/widget/style.css` is optional; skip it and style the classes
yourself if you'd rather. See [the package README](../../../packages/widget/README.md)
for the full variable/class list.

## Hard rules for agents

- **Do not add features this package explicitly excludes**: image preview
  thumbnails beyond what's already lightweight, drag-to-reorder, a
  folder-tree view, crop/compress controls, remote-provider tabs, a modal
  dashboard, or auth UI. If a task asks for one of these on top of the
  widget, say it's out of scope rather than bolting it on.
- **Do not reach into `@mediadrop/core` internals from widget code, and
  do not duplicate the upload queue/retry/validation logic** — the widget
  is a rendering layer only. If a "the widget should do X" request would
  require new upload/retry/validation behavior, that behavior belongs in
  `@mediadrop/core` (available to every binding), not hidden inside the
  widget.
- **The widget is optional.** Never assume a project has `@mediadrop/widget`
  installed just because it uses mediadrop — check before importing it,
  the same way you'd check before assuming any other optional package is
  present.
- Same upload caveats as every transport apply here unchanged — no
  pause/resume, no file-byte persistence, see [scope.md](scope.md).
