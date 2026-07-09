---
name: mediadrop
description: Integrate mediadrop (Phase 1 + Phase 2 + Phase 3) — file intake, drag/drop, validation, and upload (queue/concurrency/retry/cancel, S3, tus) for React or plain JS. Use when a task asks to add a file picker, dropzone, or upload UI in a project that already depends on @mediadrop/core, @mediadrop/vanilla, @mediadrop/react, @mediadrop/xhr-upload, @mediadrop/s3, or @mediadrop/tus.
---

# mediadrop — Phase 1 (file intake) + Phase 2 (upload) + Phase 3 (S3/tus)

mediadrop is a lightweight, headless-first, transport-agnostic file uploader.
**Phase 1** covers file selection, drag/drop, validation, a vanilla JS
binding, and a React hook. **Phase 2** adds a real upload path on top: a
pluggable transport contract, a queue with concurrency/retry/cancel, and
a reference `@mediadrop/xhr-upload` transport. **Phase 3** adds advanced
transports on the *same* contract — `@mediadrop/s3` (presigned + multipart,
with resumable metadata) and `@mediadrop/tus` (a small tus client) — plus
the shared utilities (`withRetry`'s `shouldRetry`/`jitter`, session stores,
file fingerprinting) that make resumability possible without duplicating
retry logic per transport. Upload is **opt-in** — pass `transport` to get
it; without it, nothing about Phase 1's behavior changes at all. mediadrop
is headless-first with no exceptions right now — there is no prebuilt
widget/dashboard package; you own all markup.

Read [references/scope.md](references/scope.md) first if you are unsure
whether a feature exists yet — it is the authoritative "what's real" list.
[references/upload.md](references/upload.md) is the authoritative doc for
the shared upload contract; [references/xhr-upload.md](references/xhr-upload.md),
[references/s3.md](references/s3.md), and [references/tus.md](references/tus.md)
cover each transport's specifics; and
[references/troubleshooting.md](references/troubleshooting.md) is a
symptom-first index of common integration mistakes.

## Which package to use

| Situation | Import |
|---|---|
| React app | `@mediadrop/react` (`useMediaDrop`) |
| Plain JS / any other framework | `@mediadrop/vanilla` (`createMediaDrop`) |
| Upload to a generic REST-ish endpoint | `@mediadrop/xhr-upload` (`createXhrUploadTransport`) |
| Upload to S3 (presigned single request) | `@mediadrop/s3` (`s3Upload`) |
| Upload large files to S3 (multipart, resumable) | `@mediadrop/s3` (`s3MultipartUpload`) |
| Upload to a tus-compatible server | `@mediadrop/tus` (`tusUpload`) — **requires an actual tus server**, don't reach for this against a plain REST endpoint |
| Building an adapter, or need the raw engine | `@mediadrop/core` (advanced) |

Whichever transport you pick, pass its result as `transport` to
`createMediaDrop`/`useMediaDrop` — that's the entire integration surface.
Do not import `@mediadrop/core` directly in application code unless you are
building a framework adapter or need APIs the React/vanilla bindings don't
expose (e.g. `createStore`, `createDropzoneController`, `withRetry`,
`createFileFingerprint`, `memoryUploadSessionStore`/`browserUploadSessionStore`
in isolation). Both `@mediadrop/react` and `@mediadrop/vanilla` re-export the
shared types (`MediaDropFile`, `MediaDropRestrictions`, `MediaDropError`,
`DragState`, `UploadTransport`, `MediaDropUploadSessionStore`, etc.), so
importing from core for types is rarely necessary either.

## Core mental model

1. A user picks or drops files.
2. Each file is validated against `restrictions` and an optional
   `validator` and becomes a `MediaDropFile` with `status: "idle" |
   "accepted" | "rejected"` and a list of typed `errors`.
3. Accepted/rejected files live in a small store you read via hooks
   (React) or `onChange`/`getState` (vanilla).
4. **Without a `transport`, nothing is uploaded** — this is still true and
   still the default. Passing `transport` to `createMediaDrop`/
   `useMediaDrop` adds `uploadFile`/`uploadAll`/`cancelUpload`/
   `cancelAllUploads`/`retryUpload`, and each file additionally tracks
   `uploadStatus`/`progress`/`uploadError`/`uploadResult` — see
   [references/upload.md](references/upload.md). This never changes
   `status`/`errors`, which stay exactly what Phase 1 defined.

See [references/core-concepts.md](references/core-concepts.md) for the file
model, store, and drag-state semantics in detail.

## Quickstarts

- React: [references/react.md](references/react.md)
- Vanilla JS: [references/vanilla.md](references/vanilla.md)
- Validation/restrictions (shared by both): [references/validation.md](references/validation.md)
- Upload (queue/concurrency/retry/cancel, transport contract): [references/upload.md](references/upload.md)
- Transports: [references/xhr-upload.md](references/xhr-upload.md), [references/s3.md](references/s3.md), [references/tus.md](references/tus.md)
- Common mistakes: [references/troubleshooting.md](references/troubleshooting.md)

## Hard rules for agents integrating mediadrop

- **Do not write upload code that bypasses `transport`/the queue** — no
  hand-rolled `fetch` call stapled onto `onChange`, no ad hoc retry loop
  elsewhere. If the user wants upload behavior, wire a transport
  (`@mediadrop/xhr-upload`/`@mediadrop/s3`/`@mediadrop/tus`, or your own)
  through `transport` and call `uploadFile`/`uploadAll` — that's the one
  real upload path.
- **Do not put an AWS SDK, or any AWS secret/credential, in frontend
  code.** `@mediadrop/s3` never signs anything itself — signing
  (`getUploadUrl`/`createMultipartUpload`/`getPartUploadUrl`/etc.) is
  always a callback you wire to *your own backend*. If a task implies the
  browser needs AWS credentials, that's a sign the backend contract is
  missing, not something to work around by importing the AWS SDK
  client-side.
- **Do not use `s3MultipartUpload` unless the backend actually implements
  all four callbacks** (`createMultipartUpload`/`getPartUploadUrl`/
  `completeMultipartUpload`/`abortMultipartUpload`) — don't stub one out
  and call the integration done. Same for `tusUpload`: it needs a real
  tus-compatible server, not a generic REST endpoint pretending to be one.
- **Do not claim** full resumability without the file-reselect caveat,
  S3's multipart protocol where you meant a single presigned request,
  the full tus extension suite (checksum, creation-with-upload,
  expiration, concatenation, deferred-length, termination —
  `@mediadrop/tus` implements none of these), pause/resume, persistence
  of file *bytes* across a page reload, remote-provider import
  (Google Drive/Dropbox-style pickers), OAuth, a prebuilt
  dashboard/progress widget, image transforms, or any Autorender-specific
  adapter. None of that is built — see
  [references/scope.md](references/scope.md) before assuming otherwise.
  "Resumable" in this codebase always means *metadata* persistence
  (upload IDs, offsets, completed parts) plus the user reselecting the
  same file — never magic byte-level persistence.
- **Retry/concurrency logic lives in one place**: `@mediadrop/core`'s
  `withRetry` (file-level, via the upload queue) and the same `withRetry`
  called again for part/chunk-level retry inside `@mediadrop/s3`/
  `@mediadrop/tus`. Don't add a second retry/backoff implementation
  inside a transport (including a custom one you write) or inside a
  React/vanilla binding — that duplicates logic that already exists and
  is exactly the anti-pattern `upload.md` documents avoiding (the same
  mistake Uppy's xhr-upload/tus/aws-s3 plugins each made independently).
- Use `restrictions` (`accept`, `maxFiles`, `minSize`, `maxSize`) for
  declarative rules; use `validator` for anything project-specific
  (checksum, filename policy, business rules). Don't hand-roll validation
  that duplicates what `restrictions` already does.
- Keep UI headless and developer-owned: `getRootProps`/`getInputProps`
  (React) or the DOM elements you pass in (vanilla) return plain
  props/hooks — style and markup are the integrator's responsibility.
  There is no prebuilt widget to reach for.
- `isDragAccept`/`isDragReject` are best-effort during an active drag
  (browsers withhold the file name until drop, so extension-based `accept`
  rules can't be evaluated mid-drag; the custom `validator` participates
  too, but only when the browser exposes a real `File` mid-drag). Don't
  treat them as a substitute for post-drop validation — the real
  accept/reject decision happens after `addFiles` runs.
- `@mediadrop/react`'s `isDragGlobal` (page-wide "something is being
  dragged" state) exists **only** on the React hook — it is not a core or
  vanilla concept. Don't reach for it, or fake an equivalent, from
  `@mediadrop/vanilla` or `@mediadrop/core`.
