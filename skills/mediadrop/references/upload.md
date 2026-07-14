# Upload

Upload adds a real, working upload path on top of Core's file intake: a
queue, concurrency, retry, cancel, and a pluggable transport contract, with
`react-mediadrop/xhr-upload` as the reference transport.

Advanced transports built on this same contract (S3 presigned/multipart,
tus) exist on a separate branch for a future phase — not part of this
codebase right now.

This still does **not** add pause/resume, a remote-provider/OAuth story,
or a widget — see [scope.md](scope.md) before assuming any of that
exists.

## The mental model

1. You pick a transport — a small object with one method, `upload(file, { onProgress, signal })`.
   `react-mediadrop/xhr-upload`'s `createXhrUploadTransport()` is the
   reference implementation. You can write your own for anything else (a
   provider SDK, a test double, a more advanced resumable protocol).
2. You pass that transport to `useMediaDrop({ transport, ... })` — the
   exact same option regardless of which transport it is.
3. **Only then** do `uploadFile`/`uploadAll`/`cancelUpload`/
   `cancelAllUploads`/`retryUpload` exist on the returned object —
   without `transport`, they are absent, and TypeScript will not let you
   call them. This mirrors Core's own restraint: no feature exists
   halfway.
4. Every file's upload progress lives on the `MediaDropFile` itself
   (`uploadStatus`, `progress`, `uploadError`, `uploadResult`,
   `uploadAttempts`) — you read it the same way you already read `status`/
   `errors`, via `files`/`getState().files`.

## Where the logic actually lives

**`react-mediadrop` owns all upload orchestration.** For a simple
transport (`react-mediadrop/xhr-upload`) that means the queue's file-level
concurrency limit and retry/backoff entirely. A multi-request transport
(splitting one file into several requests) would still be "one file, one
`upload()` call" from the queue's point of view — internally it may issue
many requests and retry individual ones via the shared
`withRetry`, called again for that finer-grained retry — **never a
second, hand-rolled retry implementation**:

- A simple transport's job is exactly one thing: send one file, once,
  report progress, resolve or reject. It has no retry loop and no
  concurrency limit of its own.
- `useMediaDrop`'s upload methods are thin pass-throughs to the same
  queue — they add no logic, no extra state, and no separate
  retry/concurrency handling, regardless of which transport is plugged in.

If you're asked to add retry, backoff, or concurrency logic anywhere
*other than* calling the shared `withRetry` (e.g. "add a retry
loop inside the transport" or "have the React hook retry failed uploads
itself"), that's almost certainly wrong — say so and point at `withRetry`
instead of adding a second copy of this logic. This is a direct reaction
to Uppy's own history: its `xhr-upload`, `tus`, and `aws-s3` plugins each
carry an independent copy of retry/backoff, and one of them (`aws-s3`'s
`HTTPCommunicationQueue.ts`) has a code comment admitting it was "taken
out of Tus" and that retry "should [have] a centralized place." mediadrop
has that centralized place; use it.

### The shared retry engine

`withRetry(attempt, options, signal)` (re-exported from `react-mediadrop`) is the one
retry engine, used by the queue and available to any transport that
needs finer-grained retry of its own:

```ts
type RetryOptions = {
	retries?: number; // retries after the first attempt. Default 0.
	retryDelays?: number[]; // backoff per retry; last value repeats if exhausted.
	shouldRetry?: (error: unknown, attemptNumber: number) => boolean; // default: defaultShouldRetry
	jitter?: number; // 0–1, randomizes each delay by up to this fraction. Default 0.
};
```

`defaultShouldRetry`, the built-in default, retries **408, 429, and every
5xx** status, plus anything without a recognizable HTTP status (network
errors) — it does not retry other 4xx statuses (400/401/403/404/413,
etc.), since those describe a request that fails the same way every time.
Pass your own `shouldRetry` to override this classification entirely.
`jitter` matters when many requests could fail at once (e.g. every part
of a multipart upload hitting the same transient network issue) — it
spreads their retries out instead of having them all retry in lockstep.

## `MediaDropFile`'s upload fields

```ts
type MediaDropFile = {
	// ...status, errors, etc. — unchanged from Core...
	uploadStatus?: "queued" | "uploading" | "done" | "error" | "canceled";
	progress?: { loaded: number; total: number | null };
	uploadError?: MediaDropError; // code: "upload-error", present after a failed attempt
	uploadResult?: unknown; // whatever the transport resolved with — opaque to core
	uploadAttempts?: number; // 1-indexed, for the current/last upload run
};
```

`uploadError.code` is always `"upload-error"` — a stable, single value
every consumer can rely on regardless of transport. `uploadError.status`
(HTTP status, e.g. from a rejected/aborted request) and
`uploadError.sourceCode` (a transport's own finer-grained error
classification, if it attaches one) are both optional — present only
when the failing transport attached that information, omitted otherwise.
Don't `switch` exhaustively on `sourceCode`; it's transport-specific and
open-ended, not a closed union like `MediaDropErrorCode`.

`uploadStatus` is **`undefined` until an upload is requested** for that
file — a freshly-accepted file has no `uploadStatus` at all, not
`"queued"`. It only ever applies to `status: "accepted"` files; a
rejected file can never be queued.

### `status` and `uploadStatus` are separate on purpose

`status` (`"idle" | "accepted" | "rejected"`) is the Core validation
verdict and is **never touched by the upload queue** — it's decided once,
when the file is added, exactly as before. `uploadStatus` is a completely
independent field for the upload lifecycle. This means:

- `getAcceptedFiles()`/`getRejectedFiles()` behave identically whether or
  not any upload has started, finished, or failed — Core's contract
  holds. Do not "fix" this by making upload move a file out of
  `getAcceptedFiles()`; that would be a regression, not an improvement.
- `maxFiles` counting (based on `status`) is unaffected by upload
  progress — a file finishing its upload does not free up a `maxFiles`
  slot, because it never left `status: "accepted"`.

## The queue: concurrency, retry, cancel

```ts
useMediaDrop({
	transport,
	concurrency: 3, // max uploads in flight at once. Default 1 (sequential).
	retries: 2, // retries *after* the first attempt, shared for every file. Default 0.
	retryDelays: [1000, 2000, 4000], // backoff per retry; last value repeats if exhausted.
	cancelGraceMs: 5000, // force-free a slot this long after cancel if the transport never settles. Default 5000.
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

**`cancelGraceMs` (default `5000`)** is a safety net, not the normal
path: a well-behaved transport wires up `signal` and rejects promptly
once aborted, so cancel usually settles almost immediately. If a
transport doesn't (a bug, or a third-party one you don't control),
`cancelUpload`/`cancelAllUploads` would otherwise leak that concurrency
slot forever and starve every file still waiting behind it — this timer
force-frees the slot after the grace period regardless.

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

Writing your own transport (instead of `react-mediadrop/xhr-upload`) means
implementing exactly this — one method, one file, one attempt:

- Call `onProgress` as the upload progresses. `total: null` when the
  length can't be determined.
- Wire `signal`'s `abort` event to whatever cancellation your transport
  has (e.g. `XMLHttpRequest.abort()`, `fetch`'s own `signal` support).
- Resolve with `{ response }` (anything, opaque to core — e.g. the
  server's parsed JSON body) on success. Reject on failure — the queue
  decides whether to retry, you don't.
- **Do not implement your own retry or backoff inside a transport.** Use
  the shared `withRetry` for any finer-grained retry the
  transport itself needs — see "Where the logic actually lives" above.

## Session persistence and file fingerprinting

`react-mediadrop` still exports the metadata-persistence utilities built
for resumable transports, even though no transport in this codebase
currently uses them (S3/tus, the transports that did, are on a separate
branch). If you write a custom resumable transport, these exist so you
don't have to invent your own metadata storage or "is this the same
file" check:

```ts
type MediaDropUploadSessionStore = {
	get(key: string): Promise<unknown | null>;
	set(key: string, value: unknown): Promise<void>;
	remove(key: string): Promise<void>;
};

createMemoryUploadSessionStore(); // in-process only — gone on reload, gone between tabs
createBrowserUploadSessionStore({ prefix? }); // localStorage-backed, SSR-safe (no-op without `window`)

createFileFingerprint(file: File): string; // name+size+type+lastModified+webkitRelativePath, not file contents
```

**These stores hold metadata only — upload IDs, byte offsets, completed
part numbers — never file bytes.** `createFileFingerprint` is
metadata-based on purpose: hashing file *contents* would let two
selections of a huge file be compared reliably, but reading the whole
file to do that is exactly the cost mediadrop avoids imposing by default.
Two different files with identical name, size, type, modified time, and
relative path will still collide — this is "looks like the same file,"
not a content-addressed guarantee. If a task asks for "guaranteed unique
file identification" or content-addressed matching, say that the default
fingerprint doesn't provide that — a custom resumable transport can
accept its own `fingerprint` option rather than quietly hashing file
contents inside core.

## Transport guide

- [xhr-upload.md](xhr-upload.md) — the reference transport, generic REST-ish endpoints

## What's still not implemented — do not build around it, do not fake it

See [scope.md](scope.md) for the authoritative, up-to-date list. In short:
pause/resume, S3/tus transports, persistence of file *bytes* across a
reload, remote-provider import, OAuth, image transforms, and any
specific CDN/storage-provider adapter are all out of scope — don't improvise a
stand-in for any of them inside mediadrop's public API.
