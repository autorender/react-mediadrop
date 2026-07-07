# Upload (Phase 2 + Phase 3)

Phase 2 added a real, working upload path on top of Phase 1's file
intake: a queue, concurrency, retry, cancel, and a pluggable transport
contract, with `@mediadrop/xhr-upload` as the reference transport. Phase
3 adds advanced transports on the *same* contract — `@mediadrop/s3`
(presigned single-request + multipart, with resumable metadata) and
`@mediadrop/tus` (a small tus client) — plus the shared utilities that
make resumability possible without every transport reinventing retry:
`withRetry`'s `shouldRetry`/`jitter`, session stores, and file
fingerprinting.

It still does **not** add pause/resume, the full tus extension suite, a
remote-provider/OAuth story, or a widget — see "What's still not
implemented" below before assuming any of that exists.

## The mental model

1. You pick a transport — a small object with one method, `upload(file, { onProgress, signal })`.
   `@mediadrop/xhr-upload`'s `createXhrUploadTransport()` is the simplest
   reference implementation; `@mediadrop/s3`'s `s3Upload`/
   `s3MultipartUpload` and `@mediadrop/tus`'s `tusUpload` are more capable
   ones. You can write your own for anything else (a provider SDK, a test
   double).
2. You pass that transport to `createMediaDrop({ transport, ... })`
   (core), `useMediaDrop({ transport, ... })` (React), or
   `createMediaDrop({ transport, ... })` (vanilla) — the exact same
   option regardless of which transport it is.
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

**`@mediadrop/core` owns all upload orchestration.** For a simple
transport (`@mediadrop/xhr-upload`) that means the queue's file-level
concurrency limit and retry/backoff entirely. For a multi-request
transport (`@mediadrop/s3`'s multipart, `@mediadrop/tus`'s chunking) it
means the file-level queue *plus* that transport calling `@mediadrop/core`'s
exported `withRetry` again, itself, for its own finer-grained retry
(one failed S3 part, one failed tus chunk) — **never a second, hand-rolled
retry implementation**:

- A simple transport's job is exactly one thing: send one file, once,
  report progress, resolve or reject. It has no retry loop and no
  concurrency limit of its own.
- A multi-request transport (S3 multipart, tus) is still "one file, one
  `upload()` call" from the queue's point of view — internally it may
  issue many requests, retry individual ones via `withRetry`, and run
  some of them concurrently (S3 multipart's `partConcurrency`), but this
  is *internal* to that one call, not a second queue.
- React's `useMediaDrop`/vanilla's `createMediaDrop` upload methods are
  thin pass-throughs to the same core queue — they add no logic, no extra
  state, and no separate retry/concurrency handling, regardless of which
  transport is plugged in.

If you're asked to add retry, backoff, or concurrency logic anywhere
*other than* calling `@mediadrop/core`'s `withRetry` (e.g. "add a retry
loop inside the transport" or "have the React hook retry failed uploads
itself"), that's almost certainly wrong — say so and point at `withRetry`
instead of adding a second copy of this logic. This is a direct reaction
to Uppy's own history: its `xhr-upload`, `tus`, and `aws-s3` plugins each
carry an independent copy of retry/backoff, and one of them (`aws-s3`'s
`HTTPCommunicationQueue.ts`) has a code comment admitting it was "taken
out of Tus" and that retry "should [have] a centralized place." mediadrop
has that centralized place; use it.

### The shared retry engine

`withRetry(attempt, options, signal)` (from `@mediadrop/core`) is the one
retry engine, used by the queue and by `@mediadrop/s3`/`@mediadrop/tus`:

```ts
type RetryOptions = {
	retries?: number; // retries after the first attempt. Default 0.
	retryDelays?: number[]; // backoff per retry; last value repeats if exhausted.
	shouldRetry?: (error: unknown, attemptNumber: number) => boolean; // default: retries everything
	jitter?: number; // 0–1, randomizes each delay by up to this fraction. Default 0.
};
```

`shouldRetry` matters when a transport can tell the difference between
"this will never succeed" (a 4xx response) and "this might succeed next
time" (a network blip, a 5xx) — return `false` for the former to fail
fast instead of burning through the retry budget. `jitter` matters when
many requests could fail at once (e.g. every part of a multipart upload
hitting the same transient network issue) — it spreads their retries out
instead of having them all retry in lockstep.

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
- **Do not implement your own retry or backoff inside a transport.** Use
  `@mediadrop/core`'s `withRetry` for any finer-grained retry the
  transport itself needs — see "Where the logic actually lives" above.

## Session persistence and file fingerprinting

Two shared `@mediadrop/core` utilities exist specifically so resumable
transports (`@mediadrop/s3`'s multipart, `@mediadrop/tus`) don't each
invent their own metadata storage or "is this the same file" check:

```ts
type MediaDropUploadSessionStore = {
	get(key: string): Promise<unknown | null>;
	set(key: string, value: unknown): Promise<void>;
	remove(key: string): Promise<void>;
};

memoryUploadSessionStore(); // in-process only — gone on reload, gone between tabs
browserUploadSessionStore({ prefix? }); // localStorage-backed, SSR-safe (no-op without `window`)

createFileFingerprint(file: File): string; // name+size+type+lastModified, not file contents
```

**These stores hold metadata only — upload IDs, byte offsets, completed
part numbers — never file bytes.** `createFileFingerprint` is
metadata-based on purpose: hashing file *contents* would let two
selections of a huge file be compared reliably, but reading the whole
file to do that is exactly the cost mediadrop avoids imposing by default.
Both `s3MultipartUpload` and `tusUpload` accept a `fingerprint` option if
you need different matching behavior. If a task asks for
"guaranteed unique file identification" or content-addressed matching,
say that the default fingerprint doesn't provide that — point at the
`fingerprint` override rather than quietly hashing file contents inside
core.

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

## `@mediadrop/s3`

Two transports, no AWS SDK, no signing in this package — your backend
signs URLs, this package only ever talks to those URLs:

- **`s3Upload({ getUploadUrl })`** — one presigned PUT or POST request,
  for files small enough for a single request. Same shape as
  `@mediadrop/xhr-upload`, just S3's two presigned-request styles.
- **`s3MultipartUpload({ createMultipartUpload, getPartUploadUrl, completeMultipartUpload, abortMultipartUpload?, ... })`**
  — splits a file into parts (enforcing S3's real constraints: parts ≥ 5
  MiB except the last, ≤ 10,000 parts total), uploads them with bounded
  concurrency, aggregates progress across parts without double-counting,
  retries a failed part via `withRetry`, and — with `sessionStore` — can
  skip already-uploaded parts on a subsequent attempt (including after a
  page reload, if the same file is reselected).

```ts
import { s3MultipartUpload } from "@mediadrop/s3";
import { browserUploadSessionStore } from "@mediadrop/core";

const transport = s3MultipartUpload({
	createMultipartUpload: async ({ file }) => fetchFromYourBackend(file),
	getPartUploadUrl: async ({ key, uploadId, partNumber }) => fetchFromYourBackend(...),
	completeMultipartUpload: async ({ key, uploadId, parts }) => fetchFromYourBackend(...),
	abortMultipartUpload: async ({ key, uploadId }) => fetchFromYourBackend(...),
	sessionStore: browserUploadSessionStore(),
});
```

Every callback is a request to **your own backend** — never to AWS
directly, and never with an AWS credential in the browser. See the
[package README](../../../packages/s3/README.md) for the exact backend
contract each callback implies, and the CORS `ExposeHeaders: ["ETag"]`
requirement multipart needs to read each part's ETag.

## `@mediadrop/tus`

A small, dependency-free tus client — the core create/`PATCH`/resume
flow only, **not** the full tus extension suite:

```ts
import { tusUpload } from "@mediadrop/tus";

const transport = tusUpload({
	endpoint: "/files", // a real tus-compatible server's creation endpoint
	sessionStore: browserUploadSessionStore(),
});
```

Requires an actual tus server — don't reach for this against a generic
REST endpoint (use `@mediadrop/xhr-upload` for that). Resume uses a fresh
`HEAD` request for the authoritative offset, never a stale locally
persisted one. Explicitly unsupported: the checksum, creation-with-upload,
expiration, concatenation, deferred-length, and termination extensions —
see the [package README](../../../packages/tus/README.md) for what each
of those would have added, and don't imply they work.

## What's still not implemented — do not build around it, do not fake it

- **Pause/resume.** Canceling an upload ends it and discards its resume
  session (both `@mediadrop/s3` and `@mediadrop/tus`) — there is no
  "pause and continue later" distinct from cancel. `retryUpload`/
  `uploadFile` on a canceled file starts over via a *new* upload/session,
  not a resumed one.
- **Persistence of file bytes.** Session stores persist metadata (upload
  IDs, offsets, completed parts) — never the `File`'s contents. Resuming
  after a page reload always requires the user to reselect the exact same
  file; nothing here can resume without that. Don't say "fully resumable"
  without this caveat attached.
- **The full tus extension suite.** `@mediadrop/tus` implements tus's
  core flow only — see that package's README for the specific extensions
  left out.
- **Remote-provider import** (Google Drive/Dropbox-style pickers, a
  Companion-equivalent server) and **OAuth** of any kind — still entirely
  out of scope, same as Phase 1 and 2.
- **A prebuilt progress UI or widget/dashboard.** `progress`/
  `uploadStatus` are data on `MediaDropFile` — there is no progress bar,
  toast, or dashboard component to import, for any transport. You still
  own every bit of markup.
- **Image compression/resize/AI transform hooks, and any
  Autorender-specific adapter.** Not part of this phase either.

If a task requires any of the above, say so explicitly rather than
improvising a stand-in inside mediadrop's public API.
