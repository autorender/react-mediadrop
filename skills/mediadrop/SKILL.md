---
name: mediadrop
description: Integrate mediadrop (Core + Upload) — file intake, drag/drop, validation, and upload (queue/concurrency/retry/cancel) for React. Use when a task asks to add a file picker, dropzone, or upload UI in a project that already depends on react-mediadrop.
license: MIT
compatibility: Requires React 18+. In Next.js App Router (or any RSC setup), the component calling useMediaDrop must be a "use client" component — the hook uses useSyncExternalStore/useEffect.
metadata:
  author: autorender
  version: "0.1.0"
  homepage: https://github.com/autorender/react-mediadrop#readme
  source: https://github.com/autorender/react-mediadrop
  install-kind: node
  install-package: react-mediadrop
---

# mediadrop — Core (file intake) + Upload

mediadrop is a lightweight, headless-first file uploader for React.
**Core** covers file selection, drag/drop, and validation via the
`useMediaDrop` hook. **Upload** adds a real upload path on top: a
pluggable transport contract, a queue with concurrency/retry/cancel, and
a reference `react-mediadrop/xhr-upload` transport. Upload is **opt-in**
— pass `transport` to get it; without it, nothing about Core's behavior
changes at all. mediadrop is headless-first with no exceptions right now
— there is no prebuilt widget/dashboard package; you own all markup.

`react-mediadrop` is the **only** published package. Its underlying
engine (`@mediadrop/core`) and the reference transport (`@mediadrop/xhr-upload`)
are internal, unpublished source packages bundled directly into
`react-mediadrop`'s own dist files — the hook and the transport are two
independent entry points (`react-mediadrop` and
`react-mediadrop/xhr-upload`) so a consumer who never imports the
transport never bundles its code. You only ever install
`react-mediadrop`; never `@mediadrop/core` or `@mediadrop/xhr-upload`
directly.

A vanilla JS/DOM binding, and additional transports (S3 presigned/multipart,
tus) built on this same contract, exist on a separate branch for a future
phase — not part of this codebase right now. Don't build around them as
if they were available; see [references/scope.md](references/scope.md).

Read [references/scope.md](references/scope.md) first if you are unsure
whether a feature exists yet — it is the authoritative "what's real" list.
[references/upload.md](references/upload.md) is the authoritative doc for
the shared upload contract; [references/xhr-upload.md](references/xhr-upload.md)
covers the one shipped transport's specifics; and
[references/troubleshooting.md](references/troubleshooting.md) is a
symptom-first index of common integration mistakes.

## Which package to use

| Situation | Import |
|---|---|
| React app | `react-mediadrop` (`useMediaDrop`) |
| Upload to a generic REST-ish endpoint | `react-mediadrop/xhr-upload` (`createXhrUploadTransport`) |

Pass a transport's result as `transport` to `useMediaDrop` — that's the
entire integration surface. `react-mediadrop` re-exports every shared
type (`MediaDropFile`, `MediaDropRestrictions`, `MediaDropError`,
`DragState`, `UploadTransport`, `MediaDropUploadSessionStore`, etc.), so
there's never a reason to import from `@mediadrop/core` directly — it
isn't published as a separate package at all.

## Next.js / RSC

`useMediaDrop` touches `useSyncExternalStore`/`useEffect` — it only runs in
a Client Component. In Next.js App Router (or any React Server Components
setup), the file that calls `useMediaDrop` (or any component that renders
it) needs a `"use client"` directive at the top. This is the single most
common integration mistake — if a task target is a Next.js app, add
`"use client"` up front rather than debugging the build error after the fact.

## Core mental model

1. A user picks or drops files.
2. Each file is validated against `restrictions` and an optional
   `validator` and becomes a `MediaDropFile` with `status: "idle" |
   "accepted" | "rejected"` and a list of typed `errors`.
3. Accepted/rejected files live in the hook's returned `files` array.
4. **Without a `transport`, nothing is uploaded** — this is still true and
   still the default. Passing `transport` to `useMediaDrop` adds
   `uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload`,
   and each file additionally tracks
   `uploadStatus`/`progress`/`uploadError`/`uploadResult` — see
   [references/upload.md](references/upload.md). This never changes
   `status`/`errors`, which stay exactly what Core defined.

See [references/core-concepts.md](references/core-concepts.md) for the file
model, store, and drag-state semantics in detail.

## Quickstarts

- React: [references/react.md](references/react.md)
- Validation/restrictions: [references/validation.md](references/validation.md)
- Upload (queue/concurrency/retry/cancel, transport contract): [references/upload.md](references/upload.md)
- Transport: [references/xhr-upload.md](references/xhr-upload.md)
- Common mistakes: [references/troubleshooting.md](references/troubleshooting.md)
- Full working demo (dropzone + upload UI + a real backend, wired
  end-to-end) — not shipped with this skill, lives in the source repo:
  https://github.com/autorender/react-mediadrop/tree/main/examples/react-demo
  and https://github.com/autorender/react-mediadrop/tree/main/examples/test-server

## Hard rules for agents integrating mediadrop

- **Do not write upload code that bypasses `transport`/the queue** — no
  hand-rolled `fetch` call stapled onto `onChange`, no ad hoc retry loop
  elsewhere. If the user wants upload behavior, wire a transport
  (`react-mediadrop/xhr-upload`, or your own) through `transport` and call
  `uploadFile`/`uploadAll` — that's the one real upload path.
- **Do not claim** full resumability without the file-reselect caveat,
  pause/resume, persistence of file *bytes* across a page reload,
  remote-provider import (Google Drive/Dropbox-style pickers), OAuth, a
  prebuilt dashboard/progress widget, image transforms, a vanilla
  JS/DOM binding, S3/tus support (none of this is part of this codebase
  right now — see [references/scope.md](references/scope.md)), or any
  vendor-specific adapter. None of that is built here.
- **Retry/concurrency logic lives in one place**: the shared `withRetry`
  engine, called via the upload queue. Don't add a second retry/backoff
  implementation inside a transport (including a custom one you write) or
  inside the hook — that duplicates logic that already exists and is
  exactly the anti-pattern `upload.md` documents avoiding (the same
  mistake Uppy's xhr-upload/tus/aws-s3 plugins each made independently).
- Use `restrictions` (`accept`, `maxFiles`, `minSize`, `maxSize`) for
  declarative rules; use `validator` for anything project-specific
  (checksum, filename policy, business rules). Don't hand-roll validation
  that duplicates what `restrictions` already does.
- Keep UI headless and developer-owned: `getRootProps`/`getInputProps`
  return plain props — style and markup are the integrator's
  responsibility. There is no prebuilt widget to reach for.
- `isDragAccept`/`isDragReject` are best-effort during an active drag
  (browsers withhold the file name until drop, so extension-based `accept`
  rules can't be evaluated mid-drag; the custom `validator` participates
  too, but only when the browser exposes a real `File` mid-drag). Don't
  treat them as a substitute for post-drop validation — the real
  accept/reject decision happens after `addFiles` runs.
- `isDragGlobal` (page-wide "something is being dragged" state) is a
  React-specific convenience built on top of `document`-level listeners —
  don't assume an equivalent exists in some other, non-existent binding.
