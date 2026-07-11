# @mediadrop/tus

A small, dependency-free [tus](https://tus.io) protocol client adapter
for [`@mediadrop/core`](../core/README.md). Requires a tus-compatible
server — this package is the browser-side client only, covering the core
create/upload/resume flow. Works as `transport` in `@mediadrop/react`
and `@mediadrop/vanilla` identically — there is no tus-specific binding.

## Install

```sh
pnpm add @mediadrop/tus
```

## Quickstart

```ts
import { createMediaDrop } from "@mediadrop/core";
import { createBrowserUploadSessionStore } from "@mediadrop/core";
import { createTusUploadTransport } from "@mediadrop/tus";

const mediadrop = createMediaDrop({
	transport: createTusUploadTransport({
		endpoint: "/files",
		chunkSize: 8 * 1024 * 1024,
		sessionStore: createBrowserUploadSessionStore(),
	}),
});
```

## What this implements

The core tus 1.0.0 flow, and nothing more:

1. **Create** — `POST` to `endpoint` with `Upload-Length` and
   `Upload-Metadata` (`filename`/`filetype`, plus anything you pass via
   `metadata`); reads the `Location` header for the upload URL.
2. **Upload** — `PATCH` each chunk to the upload URL with `Upload-Offset`
   and `Content-Type: application/offset+octet-stream`; reads the
   server's returned `Upload-Offset` to advance. Uses `XMLHttpRequest`,
   not `fetch`, specifically for real upload-progress events.
3. **Resume** — `HEAD` the upload URL and reads `Upload-Offset` for the
   *authoritative* current offset — a locally persisted offset is never
   trusted over what the server reports right now.

Retries a failed chunk via `@mediadrop/core`'s shared `withRetry` — this
package has no retry/backoff logic of its own.

**`chunkStallTimeoutMs`** (default `0`, disabled) aborts and retries one
chunk's `PATCH` if it makes no upload progress for that long — a *stall*
timeout, reset on every progress tick, not a flat total-duration one, so
a large chunk on a slow-but-healthy connection is never falsely aborted.
Catches a silently dead connection that would otherwise hang the chunk
forever instead of erroring into the shared retry engine.

## Unsupported tus extensions

Deliberately out of scope for this phase — if your server requires one of
these for your use case, this package isn't ready for it yet:

- **checksum** — no per-chunk checksum verification.
- **creation-with-upload** — creation and the first chunk are always two
  separate requests, never combined into one.
- **expiration** — no handling of `Upload-Expires`.
- **concatenation** — no partial/final upload concatenation.
- **deferred-length** — `Upload-Length` is always sent upfront; there's
  no `Upload-Defer-Length` support for streaming uploads of unknown size.
- **termination** — no `DELETE` support for explicitly discarding an
  incomplete upload server-side (canceling only stops the client from
  sending more — see below).

## Resumability — read this before relying on it

**What actually resumes:** with `sessionStore` set, re-uploading the
exact same file (matched by `fingerprint` — metadata-based, not file
contents, by default) — including after a page reload — resumes from
the server-reported offset instead of restarting at byte zero.

**What does not resume:** mediadrop cannot persist the file's bytes. If
the user doesn't reselect that exact file, there's nothing to resume from
— they start over. There is also no pause: canceling discards the resume
session (same policy as `@mediadrop/s3` — Phase 3 has no pause/resume
distinction), so resuming only helps after an *unplanned* interruption, not
a deliberate cancel. If the resumed upload URL has expired or been deleted
server-side, this falls back to creating a fresh upload automatically.

See [`skills/mediadrop/references/upload.md`](../../skills/mediadrop/references/upload.md)
for mediadrop's general upload contract, and
[`scope.md`](../../skills/mediadrop/references/scope.md) for the full
"not implemented" boundary.
