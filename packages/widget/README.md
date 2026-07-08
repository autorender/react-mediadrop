# @mediadrop/widget

An optional, themeable DOM widget over [`@mediadrop/core`](../core/README.md)
— a dropzone, file list, and (with `transport`) upload UI, from one
function call. Nothing in this package is required to use mediadrop: it's
built entirely on the same public `createMediaDrop`/`createDropzoneController`
APIs [`@mediadrop/vanilla`](../vanilla/README.md) uses, with no access to
core internals and no upload/retry/queue logic of its own. If you'd
rather own your markup, use `@mediadrop/vanilla` or
[`@mediadrop/react`](../react/README.md) directly and skip this package
entirely.

## Install

```sh
pnpm add @mediadrop/widget
```

## Quickstart

```ts
import { createMediaDropWidget } from "@mediadrop/widget";
import "@mediadrop/widget/style.css";

const widget = createMediaDropWidget({
	target: document.querySelector("#uploader"),
	restrictions: { accept: ["image/*"], maxFiles: 5 },
});

// later, when #uploader is torn down:
widget.destroy();
```

`target`'s existing children are left alone; the widget appends its own
root element inside it and removes only that root on `destroy()`.

## Upload (opt-in)

Pass `transport` (e.g. from [`@mediadrop/xhr-upload`](../xhr-upload/README.md),
[`@mediadrop/s3`](../s3/README.md), or [`@mediadrop/tus`](../tus/README.md))
and the widget additionally renders per-file progress/cancel/retry, an
"Upload all" button, and total progress — and the returned object gains
`uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload`.
Without `transport`, none of that exists on the returned object or in the
DOM, and TypeScript won't let you call the upload methods.

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

`transport` accepts **any** `UploadTransport` — there is no S3/tus-specific
widget variant and there won't be, same rule as every other binding. See
[`skills/mediadrop/references/upload.md`](../../skills/mediadrop/references/upload.md)
for the full queue/retry/cancel contract; this package adds no logic of
its own beyond rendering it.

## Callbacks

All callbacks are derived from public state changes (`engine.subscribe`) —
there's no separate internal event bus to keep in sync.

| Callback | Fires when |
|---|---|
| `onChange(state)` | Any state change, same as `@mediadrop/vanilla`'s `onChange`. |
| `onUploadStart(files)` | One or more files transition into `uploadStatus: "queued"`. |
| `onUploadProgress(state)` | Any state change, while `transport` is set — for wiring your own aggregate progress UI alongside the widget's. |
| `onUploadSuccess(file)` | A file reaches `uploadStatus: "done"`. |
| `onUploadError(file, error)` | A file reaches `uploadStatus: "error"`. |
| `onComplete({ succeeded, failed, canceled })` | Fires once, exactly on the transition from "something queued/uploading" to "nothing in flight" — not on every idle render. |

## Options

| Option | Type | Notes |
|---|---|---|
| `target` | `HTMLElement` | Required. Where the widget mounts. |
| `restrictions` / `validator` / `transport` / `concurrency` / `retries` / `retryDelays` | — | Forwarded to `createMediaDrop` unchanged. |
| `labels` | `Partial<MediaDropWidgetLabels>` | Override any button/text string (`dropzoneText`, `chooseFilesButton`, `uploadAllButton`, `clearButton`, `cancelButton`, `retryButton`, `removeButton`, `emptyState`). No i18n framework — plain strings in, plain strings out. |
| `disabled` | `boolean` | Initial disabled state; toggle later via `widget.setDisabled(next)`. |

## Theming

No Tailwind, no CSS framework, no closed styling system — plain CSS
custom properties on `.md-widget`, overridable from any parent selector:

```css
.md-widget {
	--md-color-bg: #0b0b0c;
	--md-color-surface: #1c1c20;
	--md-color-border: #4b4b52;
	--md-color-text: #e8e8ea;
	--md-color-muted: #9a9aa2;
	--md-color-primary: #2f6fed;
	--md-color-primary-text: #ffffff;
	--md-color-danger: #d1373f;
	--md-radius: 8px;
	--md-font-family: system-ui, sans-serif;
	--md-spacing: 0.75rem;
}
```

Every element also carries a plain, prefixed class name you can target
directly if variables aren't enough: `md-widget`, `md-dropzone` (plus
`md-dropzone-active`/`-accept`/`-reject` during a drag), `md-button`
(plus `md-button-primary`/`md-button-danger`), `md-file-list`,
`md-file-item` (plus `md-file-item--{status}`), `md-file-name`,
`md-file-size`, `md-progress`, `md-error`, `md-actions`,
`md-empty-state`, `md-widget-disabled`. The default theme
(`@mediadrop/widget/style.css`) is a starting point, not a requirement —
skip the import and style the classes yourself if you'd rather.

## What this deliberately does not do

- No image preview thumbnails, drag-to-reorder, folder-tree view, or
  crop/compress controls.
- No remote-provider tabs (Google Drive/URL import) or modal dashboard —
  this is an inline widget, not an Uppy Dashboard-style overlay.
- No auth UI of any kind.
- No Shadow DOM encapsulation — it renders into the light DOM, so global
  CSS can reach it (by design, so the CSS-variable theming above works
  without a `::part()` API).

See [`skills/mediadrop/references/scope.md`](../../skills/mediadrop/references/scope.md)
for the full, authoritative list of what's out of scope across all of
mediadrop, not just this package.
