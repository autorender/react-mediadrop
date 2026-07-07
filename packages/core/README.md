# @mediadrop/core

Framework-free file intake, validation, and drag/drop primitives for
mediadrop. **Zero runtime dependencies** — this package never touches
`window`/`document`; all browser wiring lives in the bindings.

Most apps should use [`@mediadrop/react`](../react/README.md) or
[`@mediadrop/vanilla`](../vanilla/README.md) instead — import this package
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
| `withRetry(attempt, options, signal)` | The one retry/backoff engine used by the upload queue — not duplicated per transport. |
| Types: `MediaDropFile`, `MediaDropState`, `MediaDropRestrictions`, `MediaDropValidator`, `MediaDropError`, `MediaDropErrorCode`, `DragState`, `UploadTransport`, `MediaDropUploadOptions` | Shared shapes, re-exported by both bindings — you rarely need to import them from here directly. |

See [`skills/mediadrop/references/core-concepts.md`](../../skills/mediadrop/references/core-concepts.md)
for the file model, store, and drag-state semantics in detail, and
[`validation.md`](../../skills/mediadrop/references/validation.md) for the
full restrictions/validator contract.

## Upload (opt-in)

`createMediaDrop` validates files and tracks their state either way. Pass
`transport` and it *also* orchestrates uploading them — a queue,
concurrency limit, shared retry/backoff, and cancel — through whatever
transport you give it (e.g. [`@mediadrop/xhr-upload`](../xhr-upload/README.md)).
Without `transport`, nothing sends anything over the network, same as
before. See [`skills/mediadrop/references/upload.md`](../../skills/mediadrop/references/upload.md)
for the full contract, and [`scope.md`](../../skills/mediadrop/references/scope.md)
for exactly what's still not implemented (resumability, S3 multipart,
pause/resume, and more).
