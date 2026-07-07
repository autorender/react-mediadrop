# Upload (Phase 2)

Phase 2 adds a real, working upload path on top of Phase 1's file intake:
a queue, concurrency, retry, cancel, and a pluggable transport contract.
It does **not** add resumability, chunking, S3's multipart-upload
protocol, or a remote-provider/OAuth story — see "What's still not
implemented" below before assuming any of that exists.

## The mental model

1. You pick a transport — a small object with one method, `upload(file, { onProgress, signal })`.
   `@mediadrop/xhr-upload`'s `createXhrUploadTransport()` is the reference
   implementation (XHR, for real upload-progress events); you can write
   your own for anything else (fetch-based, a provider SDK, a test double).
2. You pass that transport to `createMediaDrop({ transport, ... })`
   (core), `useMediaDrop({ transport, ... })` (React), or
   `createMediaDrop({ transport, ... })` (vanilla).
3. **Only then** do `uploadFile`/`uploadAll`/`cancelUpload`/
   `cancelAllUploads`/`retryUpload` exist on the returned object —
   without `transport`, they are absent, and TypeScript will not let you
   call them. This mirrors Phase 1's own restraint: no feature exists
   halfway.
4. Every file's upload progress lives on the `MediaDropFile` itself
   (`uploadStatus`, `progress`, `uploadError`, `uploadResult`,
   `uploadAttempts`) — you read it the same way you already read `status`/
   `errors`, via `files`/`getState().files`.

## Where the logic actually lives

**`@mediadrop/core` owns all upload orchestration** — the queue,
concurrency limit, retry/backoff, and cancellation. Transports (including
`@mediadrop/xhr-upload`) and the React/vanilla bindings do not duplicate
any of it:

- A transport's job is exactly one thing: send one file, once, report
  progress, resolve or reject. It has no retry loop and no concurrency
  limit of its own.
- React's `useMediaDrop`/vanilla's `createMediaDrop` upload methods are
  thin pass-throughs to the same core queue — they add no logic, no extra
  state, and no separate retry/concurrency handling.

If you're asked to add retry, backoff, or concurrency logic anywhere
*other than* `@mediadrop/core`'s queue (e.g. "add a retry loop inside the
transport" or "have the React hook retry failed uploads itself"), that's
almost certainly wrong — say so and point at the queue instead of adding a
second copy of this logic.

## `MediaDropFile`'s upload fields

```ts
type MediaDropFile = {
	// ...status, errors, etc. — unchanged from Phase 1...
	uploadStatus?: "queued" | "uploading" | "done" | "error" | "canceled";
	progress?: { loaded: number; total: number | null };
	uploadError?: MediaDropError; // code: "upload-error", present after a failed attempt
	uploadResult?: unknown; // whatever the transport resolved with — opaque to core
	uploadAttempts?: number; // 1-indexed, for the current/last upload run
};
```

`uploadStatus` is **`undefined` until an upload is requested** for that
file — a freshly-accepted file has no `uploadStatus` at all, not
`"queued"`. It only ever applies to `status: "accepted"` files; a
rejected file can never be queued.

### `status` and `uploadStatus` are separate on purpose

`status` (`"idle" | "accepted" | "rejected"`) is the Phase 1 validation
verdict and is **never touched by the upload queue** — it's decided once,
when the file is added, exactly as before. `uploadStatus` is a completely
independent field for the upload lifecycle. This means:

- `getAcceptedFiles()`/`getRejectedFiles()` behave identically whether or
  not any upload has started, finished, or failed — Phase 1's contract
  holds. Do not "fix" this by making upload move a file out of
  `getAcceptedFiles()`; that would be a regression, not an improvement.
- `maxFiles` counting (based on `status`) is unaffected by upload
  progress — a file finishing its upload does not free up a `maxFiles`
  slot, because it never left `status: "accepted"`.

## The queue: concurrency, retry, cancel

```ts
createMediaDrop({
	transport,
	concurrency: 3, // max uploads in flight at once. Default 1 (sequential).
	retries: 2, // retries *after* the first attempt, shared for every file. Default 0.
	retryDelays: [1000, 2000, 4000], // backoff per retry; last value repeats if exhausted.
});
```

- **`uploadFile(id)`**: queues a file (or restarts it, even if it already
  finished/failed/was canceled). No-op if the file isn't `status:
  "accepted"` or is already in flight.
- **`uploadAll()`**: queues every currently `status: "accepted"` file.
- **`cancelUpload(id)`**: aborts it if it's uploading (via `AbortSignal`,
  standard web API — no custom cancellation protocol), or simply drops it
  if it's merely queued. Ends in `uploadStatus: "canceled"`, not `"error"`.
- **`cancelAllUploads()`**: cancels every queued and in-flight file.
- **`retryUpload(id)`**: re-enqueues a file, but only if its last attempt
  ended in `uploadStatus: "error"` — it's a no-op on anything else. This
  is a *manual* retry after automatic retries were exhausted; it's
  distinct from the automatic `retries` config above.

Retrying stops immediately once a file is canceled — a cancel always wins
over a pending retry; it does not wait out the backoff delay first.

**`removeFile(id)`/`clearFiles()` cancel any in-flight upload for the
files they remove.** Removing a file that's mid-upload does not leave an
orphaned request running in the background with a leaked concurrency
slot — this is handled for you, don't add your own cleanup for it.

## The transport contract

```ts
type UploadTransport = {
	upload(
		file: MediaDropFile,
		context: {
			onProgress: (progress: { loaded: number; total: number | null }) => void;
			signal: AbortSignal;
		},
	): Promise<{ response?: unknown }>;
};
```

Writing your own transport (instead of `@mediadrop/xhr-upload`) means
implementing exactly this — one method, one file, one attempt:

- Call `onProgress` as the upload progresses. `total: null` when the
  length can't be determined.
- Wire `signal`'s `abort` event to whatever cancellation your transport
  has (e.g. `XMLHttpRequest.abort()`, `fetch`'s own `signal` support).
- Resolve with `{ response }` (anything, opaque to core — e.g. the
  server's parsed JSON body) on success. Reject on failure — the queue
  decides whether to retry, you don't.
- **Do not implement your own retry or backoff inside a transport.** That
  logic already exists once, in the queue — see "Where the logic actually
  lives" above.

## `@mediadrop/xhr-upload`

The reference transport, using `XMLHttpRequest` (not `fetch`, because
`fetch` still has no cross-browser upload-progress API):

```ts
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const transport = createXhrUploadTransport({
	endpoint: "/api/upload", // or (file) => `/api/upload/${file.id}` for a per-file URL
	fields: { folder: "avatars" }, // extra multipart fields
});
```

See [the package README](../../../packages/xhr-upload/README.md) for the
full option list. It is zero-runtime-dependency and does not retry or
control concurrency itself — see above.

## What's still not implemented — do not build around it, do not fake it

- **Resumability / chunking.** A failed or canceled upload restarts from
  byte zero on the next attempt. There is no checkpointing, no
  resume-from-offset, no tus protocol support.
- **S3's multipart-upload protocol.** `@mediadrop/xhr-upload`'s
  `formData: false` sends one PUT/POST with the whole file as the body
  (e.g. to a presigned URL) — that is not S3's multi-part API (multiple
  part uploads, an upload ID, a completion call).
- **Remote-provider import** (Google Drive/Dropbox-style pickers, a
  Companion-equivalent server) and **OAuth** of any kind — still entirely
  out of scope, same as Phase 1.
- **Pause/resume.** Canceling an upload ends it; there is no "pause and
  continue later" — `retryUpload`/`uploadFile` always start over.
- **Persistence across a page reload.** Queue state lives in memory only;
  reloading the page loses in-flight/queued uploads, same as the rest of
  mediadrop's state.
- **A prebuilt progress UI.** `progress`/`uploadStatus` are data on
  `MediaDropFile` — there is no progress bar, toast, or dashboard
  component to import. You still own every bit of markup.

If a task requires any of the above, say so explicitly rather than
improvising a stand-in inside mediadrop's public API.
