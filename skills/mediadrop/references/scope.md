# Scope: what's real and what isn't

mediadrop's feature set has two layers: Core and Upload. This document is
the authoritative "what's real today" list — if something isn't listed
under "Implemented," treat it as not existing, even if it sounds like an
obvious next step.

## Implemented (Core — file intake, drag/drop, validation)

- File intake from a picker (`<input type="file">`) or drag/drop.
- Validation against `restrictions` (`accept`, `maxFiles`, `minSize`,
  `maxSize`) and an optional synchronous custom `validator`.
- A framework-neutral file model (`MediaDropFile`) with typed error codes.
- A small subscribable store with optional selector subscriptions.
- Per-dropzone drag state (`isDragActive`/`isDragAccept`/`isDragReject`),
  best-effort during an active drag. The custom `validator` also
  participates in this best-effort preview when the browser exposes a real
  `File` mid-drag via `DataTransferItem.getAsFile()`.
- `react-mediadrop`: a headless `useMediaDrop` hook, including keyboard
  activation (Space/Enter), click-to-open, focus tracking (`isFocused`),
  page-wide drag awareness (`isDragGlobal`), and `noClick`/`noKeyboard`/
  `noDrag` escape hatches — see [react.md](react.md). `@mediadrop/core`
  (the underlying engine) is bundled directly into `react-mediadrop`'s
  published package, not published or imported separately.

## Implemented (Upload)

See [upload.md](upload.md) for the full contract. Summary:

- A pluggable upload **transport contract** (`UploadTransport`, one
  method: send one file, once, report progress). `react-mediadrop/xhr-upload`
  is the reference implementation, using `XMLHttpRequest` — a separate,
  tree-shakeable entry point, not bundled into the main `react-mediadrop`
  import unless you import it.
- An upload **queue**: concurrency limit, shared retry/backoff (one retry
  engine, not duplicated per transport), and cancel via standard
  `AbortSignal`.
- `uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload`
  on `useMediaDrop()`'s return value **only when `transport` is
  passed**. Without `transport`, none of it exists, and TypeScript won't
  let you call it.
- Per-file upload state on `MediaDropFile`: `uploadStatus`, `progress`,
  `uploadError`, `uploadResult`, `uploadAttempts` — kept separate from the
  Core `status`/`errors` fields, which upload never touches.

## Not implemented — do not build around it, do not fake it

If a task requires any of the following, say so explicitly rather than
improvising a stand-in inside mediadrop's public API:

- **Pause/resume.** Canceling an upload ends it; there's no "pause and
  continue later" distinct from cancel.
- **A bundled resumable or multi-request transport.** Only the
  single-request XHR transport ships; anything else is new work — write
  a custom transport against the contract in [upload.md](upload.md).
- **Persistence of file bytes across a page reload.**
- **Remote-provider import** (Google Drive/Dropbox/URL-import style pickers,
  an Uppy-Companion-equivalent server).
- **OAuth** of any kind.
- **AI transform hooks** (image compression, resizing, format conversion,
  content moderation).
- **A prebuilt dashboard/widget or progress UI.** mediadrop is
  headless-first; there is no drop-in UI component to import, in this
  phase or planned for any phase. `progress`/`uploadStatus` are data you
  read — building the progress bar/toast/dashboard is still your job.
- **Any specific CDN/storage-provider adapter.**
- **Async validators.** The `validator` function is synchronous only.
- **Re-validation of files already added.** Restrictions/validator changes
  don't retroactively touch existing `MediaDropFile` entries.

## If asked to add one of these

Tell the user/requestor it's out of scope for what's implemented today, and
— if they want it anyway — treat it as new work outside this skill's guidance,
not as "using mediadrop correctly." Don't bolt a `fetch` call onto
`onChange` and call it an upload feature; don't claim "fully resumable"
without the file-reselect caveat.
