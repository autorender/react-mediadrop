# @mediadrop/core

Framework-free file intake, validation, and drag/drop primitives for
mediadrop. **Zero runtime dependencies** — this package never touches
`window`/`document`; all browser wiring lives in the bindings.

Most apps should use [`@mediadrop/react`](../react/README.md),
[`@mediadrop/vanilla`](../vanilla/README.md), or the prebuilt
[`@mediadrop/widget`](../widget/README.md) instead — import this package
directly only when building a new framework binding or an advanced
integration.

## Install

```sh
pnpm add @mediadrop/core
```

## Quickstart

```ts
import { createMediaDrop } from "@mediadrop/core";

const mediadrop = createMediaDrop({
	restrictions: { accept: ["image/png", "image/jpeg"], maxFiles: 5 },
});

mediadrop.addFiles(fileListOrArray);
mediadrop.subscribe((state) => console.log(state.files));
```

## API surface

| Export | What it does |
|---|---|
| `createMediaDrop(options?)` | The intake engine: `addFiles`, `removeFile`, `clearFiles`, `getState`, `subscribe`, `getAcceptedFiles`, `getRejectedFiles`. Pass `transport` to additionally get `uploadFile`/`uploadAll`/`cancelUpload`/`cancelAllUploads`/`retryUpload` — see "Upload" below. |
| `createStore(initialState)` | The minimal subscribable store `createMediaDrop` is built on — full-state or selector-based subscriptions. Useful if you're building your own engine on top. |
| `createDropzoneController()` | The drag/drop state machine (enter/leave depth counter, accept/reject preview). Bindings attach this to native drag events; you only need it directly for a new binding. |
| `validateFile(file, restrictions?, validator?)` | Runs one file through the restriction checks used internally by `addFiles`. |
| `isAcceptedType(candidate, accept)` / `normalizeAccept(accept)` | The `accept` token matching logic, exposed for building custom UI (e.g. previewing whether a type would pass before the user picks a file). |
| `createFileItem(file)` / `createId()` | Lower-level helpers `createMediaDrop` uses to build a `MediaDropFile`. |
| `createUploadQueue(options, store)` | The queue/concurrency/retry engine `createMediaDrop` wires up internally. Only useful directly if you're building a new binding. |
| `withRetry(attempt, options, signal)` | The one retry/backoff engine in mediadrop — used by the upload queue, and by `@mediadrop/s3`/`@mediadrop/tus` for part/chunk-level retry. Supports `shouldRetry` (skip retrying errors that will never succeed) and `jitter` (randomize backoff to avoid many clients retrying in lockstep). Nobody hand-rolls a second retry loop. |
| `memoryUploadSessionStore()` / `browserUploadSessionStore(options?)` | Metadata persistence for resumable transports (`@mediadrop/s3`'s multipart, `@mediadrop/tus`) — upload IDs, offsets, completed parts, never file bytes. The browser one is `localStorage`-backed and SSR-safe (a no-op without `window`); the memory one is in-process only. |
| `createFileFingerprint(file)` | A fast, synchronous, metadata-based (not content-hashed) "looks like the same file" key, used by resumable transports to match a freshly-selected file against a persisted session. |
| Types: `MediaDropFile`, `MediaDropState`, `MediaDropRestrictions`, `MediaDropValidator`, `MediaDropError`, `MediaDropErrorCode`, `DragState`, `UploadTransport`, `MediaDropUploadOptions`, `MediaDropUploadSessionStore` | Shared shapes, re-exported by both bindings — you rarely need to import them from here directly. |

See [`skills/mediadrop/references/core-concepts.md`](../../skills/mediadrop/references/core-concepts.md)
for the file model, store, and drag-state semantics in detail, and
[`validation.md`](../../skills/mediadrop/references/validation.md) for the
full restrictions/validator contract.

## Upload (opt-in)

`createMediaDrop` validates files and tracks their state either way. Pass
`transport` and it *also* orchestrates uploading them — a queue,
concurrency limit, shared retry/backoff, and cancel — through whatever
transport you give it: [`@mediadrop/xhr-upload`](../xhr-upload/README.md)
for a generic endpoint, [`@mediadrop/s3`](../s3/README.md) for S3
presigned/multipart, or [`@mediadrop/tus`](../tus/README.md) for a
tus-compatible server. Without `transport`, nothing sends anything over
the network, same as before. See
[`skills/mediadrop/references/upload.md`](../../skills/mediadrop/references/upload.md)
for the full contract, and [`scope.md`](../../skills/mediadrop/references/scope.md)
for exactly what's still not implemented (pause/resume, remote-provider
import, OAuth, and more).
