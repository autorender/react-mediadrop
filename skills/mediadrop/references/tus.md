# `@mediadrop/tus`

A small, dependency-free [tus](https://tus.io) protocol client — the core
create/`PATCH`/resume flow only, **not** the full tus extension suite.
**Requires an actual tus-compatible server** — don't reach for this
against a generic REST endpoint pretending to be one; use
[xhr-upload.md](xhr-upload.md) for that instead.

See [upload.md](upload.md) for the shared queue/concurrency/retry/cancel
contract this plugs into.

## Quickstart

```ts
import { tusUpload } from "@mediadrop/tus";
import { browserUploadSessionStore } from "@mediadrop/core";

const transport = tusUpload({
	endpoint: "/files", // a real tus server's creation endpoint
	chunkSize: 8 * 1024 * 1024,
	sessionStore: browserUploadSessionStore(),
});
```

## What this implements

1. **Create** — `POST` to `endpoint` with `Upload-Length` and
   `Upload-Metadata`; reads the `Location` header for the upload URL.
2. **Upload** — `PATCH` each chunk with `Upload-Offset` and
   `Content-Type: application/offset+octet-stream`; reads the server's
   returned `Upload-Offset` to advance. Uses `XMLHttpRequest`, not
   `fetch`, for real upload-progress events.
3. **Resume** — `HEAD` the upload URL and trusts the server's
   `Upload-Offset` as authoritative — **never** a stale locally persisted
   offset. If the resumed upload URL has expired or been deleted
   server-side, this falls back to creating a fresh upload automatically.

Retries a failed chunk via `@mediadrop/core`'s shared `withRetry` — no
retry/backoff logic of its own. `chunkStallTimeoutMs` (default `0`,
disabled) aborts and retries a chunk with no upload progress for that
long — a stall timeout, not a flat one, so it won't false-abort a
large-but-healthy chunk.

## Unsupported tus extensions — don't imply these work

- **checksum** — no per-chunk checksum verification.
- **creation-with-upload** — creation and the first chunk are always two
  separate requests.
- **expiration** — no handling of `Upload-Expires`.
- **concatenation** — no partial/final upload concatenation.
- **deferred-length** — `Upload-Length` is always sent upfront; no
  `Upload-Defer-Length` support for streaming uploads of unknown size.
- **termination** — no `DELETE` support for discarding an incomplete
  upload server-side (canceling only stops the client from sending more).

## Resumability — the caveat to always attach

**What actually resumes:** with `sessionStore` set, re-uploading the
exact same file (matched by `fingerprint` — metadata-based, not file
contents, by default) — including after a page reload — resumes from the
server-reported offset instead of restarting at byte zero.

**What does not resume:** mediadrop cannot persist the file's bytes. If
the user doesn't reselect that exact file, there's nothing to resume from
— they start over. There is also no pause: canceling discards the resume
session (same policy as `@mediadrop/s3`), so resuming only helps after an
*unplanned* interruption, not a deliberate cancel. Never say "fully
resumable" without this caveat.

See [the package README](../../../packages/tus/README.md) for the full
option list.
