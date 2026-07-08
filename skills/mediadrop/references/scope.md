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

## Implemented (Phase 3 — S3, tus, resumable metadata)

See [upload.md](upload.md) for the full contract. Summary:

- **`@mediadrop/s3`**: `s3Upload` (single presigned PUT/POST request) and
  `s3MultipartUpload` (part-splitting respecting S3's real constraints,
  bounded part concurrency, aggregated progress, part-level retry via
  `withRetry`, cancel/abort). No AWS SDK; your backend signs every URL.
- **`@mediadrop/tus`**: `tusUpload`, a small client for tus's core
  create/`PATCH`/resume flow. No `tus-js-client` dependency. Explicitly
  does **not** implement the checksum, creation-with-upload, expiration,
  concatenation, deferred-length, or termination extensions.
- **Resumable metadata**, shared by both: `@mediadrop/core`'s
  `MediaDropUploadSessionStore` (`memoryUploadSessionStore()`/
  `browserUploadSessionStore()`) persists upload IDs/offsets/completed
  parts — never file bytes — keyed by `createFileFingerprint()` (file
  metadata, not content hash). Resuming after a page reload requires the
  user to reselect the same file; there is no way around that.
- **A shared retry engine extended for this**: `withRetry` gained
  `shouldRetry` (skip retrying errors that can't succeed) and `jitter`
  (randomize backoff so many failing requests don't retry in lockstep) —
  used by S3's part retry and tus's chunk retry, on top of the same
  engine the Phase 2 queue already used. No transport implements its own
  retry loop.

## Implemented (Phase 4 — widget, examples, adoption docs)

See [widget.md](widget.md) for the full contract. Summary:

- **`@mediadrop/widget`**: an *optional* prebuilt, themeable DOM widget
  (dropzone, file list, per-file progress/cancel/retry, upload-all/clear)
  over the exact same public `createMediaDrop`/`createDropzoneController`
  APIs the other bindings use. It has no upload/retry/validation logic of
  its own and no access to `@mediadrop/core` internals — headless-first
  still holds for every package that doesn't opt into this one.
  Theming is plain CSS custom properties and prefixed class names, not a
  closed styling system or Shadow DOM.
- Runnable examples for every binding and transport
  (`examples/react-demo`, `examples/vanilla-basic`,
  `examples/widget-basic`, `examples/transports`), each talking to a real
  local dev-server endpoint, none of them a production backend.
- This is still a **rendering layer, not a new capability** — nothing a
  project could do with the widget was impossible before; it is
  markup/CSS you no longer have to write yourself.

## Not implemented — do not build around it, do not fake it

If a task requires any of the following, say so explicitly rather than
improvising a stand-in inside mediadrop's public API:

- **Pause/resume.** Canceling an upload (any transport) ends it and
  discards its resume session — there's no "pause and continue later"
  distinct from cancel.
- **Persistence of file bytes across a page reload.** Only metadata
  persists (see above); the user must reselect the exact same file for
  any resume to be possible. Never claim resumability without this caveat.
- **The full tus extension suite.** See `@mediadrop/tus`'s README for the
  specific list of extensions left out.
- **Remote-provider import** (Google Drive/Dropbox/URL-import style pickers,
  an Uppy-Companion-equivalent server).
- **OAuth** of any kind.
- **AI transform hooks** (image compression, resizing, format conversion,
  content moderation).
- **A hosted dashboard, image editor, or anything beyond `@mediadrop/widget`'s
  dropzone/file-list/upload UI.** No drag-to-reorder, folder-tree view,
  crop/compress controls, remote-provider tabs, modal dashboard, or auth
  UI — see [widget.md](widget.md) for the exact list the widget itself
  excludes. `progress`/`uploadStatus` remain data you can read from any
  binding; the widget is one way to render them, not the only way, and
  not a requirement.
- **Any Autorender-specific or Cloudinary-specific adapter.**
- **A production AWS SDK dependency, or AWS credentials, in any browser
  package.** `@mediadrop/s3` never signs anything itself.
- **Async validators.** The `validator` function is synchronous only.
- **Re-validation of files already added.** Restrictions/validator changes
  don't retroactively touch existing `MediaDropFile` entries.

## If asked to add one of these

Tell the user/requestor it's out of scope for the current phase, and — if
they want it anyway — treat it as new work outside this skill's guidance,
not as "using mediadrop correctly." Don't bolt a `fetch` call onto
`onChange` and call it an upload feature; don't imply `@mediadrop/tus`
supports an extension it doesn't; don't claim "fully resumable" without
the file-reselect caveat.
