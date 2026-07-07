---
name: mediadrop
description: Integrate mediadrop (Phase 1 + Phase 2) — file intake, drag/drop, validation, and upload (queue/concurrency/retry/cancel) for React or plain JS. Use when a task asks to add a file picker, dropzone, or upload UI in a project that already depends on @mediadrop/core, @mediadrop/vanilla, @mediadrop/react, or @mediadrop/xhr-upload.
---

# mediadrop — Phase 1 (file intake) + Phase 2 (upload)

mediadrop is a lightweight, headless-first, transport-agnostic file uploader.
**Phase 1** covers file selection, drag/drop, validation, a vanilla JS
binding, and a React hook. **Phase 2** adds a real upload path on top: a
pluggable transport contract, a queue with concurrency/retry/cancel, and
a reference `@mediadrop/xhr-upload` transport. Upload is **opt-in** — pass
`transport` to get it; without it, nothing about Phase 1's behavior
changes at all.

Read [references/scope.md](references/scope.md) first if you are unsure
whether a feature exists yet — it is the authoritative "what's real" list.
[references/upload.md](references/upload.md) is the authoritative doc for
everything upload-related.

## Which package to use

| Situation | Import |
|---|---|
| React app | `@mediadrop/react` (`useMediaDrop`) |
| Plain JS / any other framework | `@mediadrop/vanilla` (`createMediaDrop`) |
| Need to actually upload | add `@mediadrop/xhr-upload` (`createXhrUploadTransport`), pass its result as `transport` |
| Building an adapter, or need the raw engine | `@mediadrop/core` (advanced) |

Do not import `@mediadrop/core` directly in application code unless you are
building a framework adapter or need APIs the React/vanilla bindings don't
expose (e.g. `createStore`, `createDropzoneController`, `withRetry` in
isolation). Both `@mediadrop/react` and `@mediadrop/vanilla` re-export the
shared types (`MediaDropFile`, `MediaDropRestrictions`, `MediaDropError`,
`DragState`, `UploadTransport`, etc.), so importing from core for types is
rarely necessary either.

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

## Hard rules for agents integrating mediadrop

- **Do not write upload code that bypasses `transport`/the queue** — no
  hand-rolled `fetch` call stapled onto `onChange`, no ad hoc retry loop
  elsewhere. If the user wants upload behavior, wire a transport (
  `@mediadrop/xhr-upload` or your own) through `transport` and call
  `uploadFile`/`uploadAll` — that's the one real upload path.
- **Do not claim** resumability/chunking/tus support, S3's
  multipart-upload protocol, pause/resume, persistence across a page
  reload, remote-provider import (Google Drive/Dropbox-style pickers),
  OAuth, or a prebuilt dashboard/progress widget exists. None of that is
  built — see [references/upload.md](references/upload.md)'s "not
  implemented" list before assuming otherwise.
- **Retry/concurrency logic lives in one place**: `@mediadrop/core`'s
  upload queue. Don't add retry/backoff inside a transport (including a
  custom one you write) or inside a React/vanilla binding — that
  duplicates logic that already exists and is exactly the anti-pattern
  `upload.md` documents avoiding.
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
