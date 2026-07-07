# Scope: what's real and what isn't

mediadrop is built in phases. This document is the authoritative "what's
real today" list — if something isn't listed under "Implemented," treat it
as not existing, even if it sounds like an obvious next step.

## Implemented (Phase 1 — file intake, drag/drop, validation)

- File intake from a picker (`<input type="file">`) or drag/drop.
- Validation against `restrictions` (`accept`, `maxFiles`, `minSize`,
  `maxSize`) and an optional synchronous custom `validator`.
- A framework-neutral file model (`MediaDropFile`) with typed error codes.
- A small subscribable store with optional selector subscriptions
  (`@mediadrop/core`).
- Per-dropzone drag state (`isDragActive`/`isDragAccept`/`isDragReject`),
  best-effort during an active drag. The custom `validator` also
  participates in this best-effort preview when the browser exposes a real
  `File` mid-drag via `DataTransferItem.getAsFile()`.
- `@mediadrop/vanilla`: DOM wiring for plain JS/TS projects.
- `@mediadrop/react`: a headless `useMediaDrop` hook, including keyboard
  activation (Space/Enter), click-to-open, focus tracking (`isFocused`),
  page-wide drag awareness (`isDragGlobal`), and `noClick`/`noKeyboard`/
  `noDrag` escape hatches — see [react.md](react.md).

## Implemented (Phase 2 — upload)

See [upload.md](upload.md) for the full contract. Summary:

- A pluggable upload **transport contract** (`UploadTransport`, one
  method: send one file, once, report progress). `@mediadrop/xhr-upload`
  is the reference implementation, using `XMLHttpRequest`.
- An upload **queue** owned entirely by `@mediadrop/core`: concurrency
  limit, shared retry/backoff (one retry engine, not duplicated per
  transport or per binding), and cancel via standard `AbortSignal`.
- `uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload`
  on `createMediaDrop()`'s return value **only when `transport` is
  passed** — same in `@mediadrop/react`'s `useMediaDrop` and
  `@mediadrop/vanilla`'s `createMediaDrop`. Without `transport`, none of
  it exists, and TypeScript won't let you call it.
- Per-file upload state on `MediaDropFile`: `uploadStatus`, `progress`,
  `uploadError`, `uploadResult`, `uploadAttempts` — kept separate from the
  Phase 1 `status`/`errors` fields, which upload never touches.

## Not implemented — do not build around it, do not fake it

If a task requires any of the following, say so explicitly rather than
improvising a stand-in inside mediadrop's public API:

- **Resumability, chunking, or the tus protocol.** A failed/canceled
  upload restarts from byte zero. There is no checkpointing or
  resume-from-offset.
- **S3's multipart-upload protocol** (multiple part uploads, an upload
  ID, a completion call). `@mediadrop/xhr-upload`'s `formData: false`
  sends one request with the whole file as the body — that's a single
  PUT/POST, not S3 multipart.
- **Pause/resume.** Canceling ends an upload; there's no "pause and
  continue later."
- **Persistence across a page reload.** Queue and file state live in
  memory only.
- **Remote-provider import** (Google Drive/Dropbox/URL-import style pickers,
  an Uppy-Companion-equivalent server).
- **OAuth** of any kind.
- **AI transform hooks** (image compression, resizing, format conversion,
  content moderation).
- **A prebuilt dashboard/widget or progress UI.** mediadrop is
  headless-first; there is no drop-in UI component to import, in this
  phase or planned for any phase. `progress`/`uploadStatus` are data you
  read — building the progress bar/toast/dashboard is still your job.
- **Any Autorender-specific or Cloudinary-specific adapter.**
- **Async validators.** The `validator` function is synchronous only.
- **Re-validation of files already added.** Restrictions/validator changes
  don't retroactively touch existing `MediaDropFile` entries.

## If asked to add one of these

Tell the user/requestor it's out of scope for the current phase, and — if
they want it anyway — treat it as new work outside this skill's guidance,
not as "using mediadrop correctly." Don't bolt a `fetch` call onto
`onChange` and call it an upload feature that supports resumability or
S3 multipart when it's actually a single-request transport.
