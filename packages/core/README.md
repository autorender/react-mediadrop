# @mediadrop/core

Framework-free file intake, validation, and drag/drop primitives for
mediadrop. **Zero runtime dependencies** — this package never touches
`window`/`document`; all browser wiring lives in the framework bindings.

**Internal, not published.** This package is a workspace-only source
package — [`react-mediadrop`](../react/README.md) bundles its code (and
re-exports its public API, including `withRetry`, the session-store
helpers, and `createFileFingerprint`) directly into its own dist at build
time, so consumers only ever install `react-mediadrop`. Future framework
bindings will follow the same pattern: their own source package, bundling
this one in. Import from here directly only when working on core itself
or adding a new framework binding.

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
| `withRetry(attempt, options, signal)` | The one retry/backoff engine in mediadrop — used by the upload queue, and available to any transport that needs its own finer-grained retry. Supports `shouldRetry` (skip retrying errors that will never succeed) and `jitter` (randomize backoff to avoid many clients retrying in lockstep). Nobody hand-rolls a second retry loop. Defaults to `defaultShouldRetry` if you don't pass your own. |
| `createHttpError(message, status?)` / `defaultShouldRetry(error)` | Every built-in transport throws HTTP failures through `createHttpError` so `.status` is inspectable; `defaultShouldRetry` reads that status to skip retrying permanent 4xx responses (retries 408/429/5xx and anything without a recognizable status). |
| `createStallWatchdog(onStall, ms)` | Fires `onStall` if `reset()` isn't called again within `ms` — a *stall* timeout, not a flat total-duration one, so a large file on a slow-but-healthy connection is never falsely aborted. Every built-in transport that streams bytes over `XMLHttpRequest` uses this for its opt-in `stallTimeoutMs`-style option; `ms <= 0` disables it. |
| `createMemoryUploadSessionStore()` / `createBrowserUploadSessionStore(options?)` | Metadata persistence for resumable transports — upload IDs, offsets, completed parts, never file bytes. Not used by any transport currently shipped in this repo (S3/tus, which did use these, are on a separate branch); available for a custom resumable transport. The browser one is `localStorage`-backed and SSR-safe (a no-op without `window`); the memory one is in-process only. |
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
for a generic endpoint, or your own. Without `transport`, nothing sends anything over
the network, same as before. See
[`skills/mediadrop/references/upload.md`](../../skills/mediadrop/references/upload.md)
for the full contract, and [`scope.md`](../../skills/mediadrop/references/scope.md)
for exactly what's still not implemented (pause/resume, remote-provider
import, OAuth, and more).
