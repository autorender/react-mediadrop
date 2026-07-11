# `@mediadrop/xhr-upload`

The reference `UploadTransport` — sends a file with `XMLHttpRequest`, not
`fetch`, specifically because `fetch` still has no cross-browser
upload-progress API while `XMLHttpRequest.upload.onprogress` does.

See [upload.md](upload.md) for the shared queue/concurrency/retry/cancel
contract this plugs into — this transport adds none of that itself.

## Quickstart

```ts
import { createMediaDrop } from "@mediadrop/core"; // or @mediadrop/react, @mediadrop/vanilla
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const transport = createXhrUploadTransport({
	endpoint: "/api/upload", // or (file) => `/api/upload/${file.id}` for a per-file URL
	fields: { folder: "avatars" }, // extra multipart fields
});

const mediadrop = createMediaDrop({ transport, concurrency: 3, retries: 2 });
```

See [the package README](../../../packages/xhr-upload/README.md) for the
full option list (`method`, `fieldName`, `headers`, `withCredentials`,
`formData`, `isSuccessStatus`, `stallTimeoutMs`).

## What this is for, and what it isn't

- Use it for a generic REST-ish endpoint you control — a single request,
  the whole file, `multipart/form-data` by default (`formData: false`
  sends the raw bytes, e.g. for a presigned PUT URL that isn't S3's).
- Its only dependency is `@mediadrop/core` itself; it has **no retry
  loop** and **no concurrency control** of its own — both are the
  queue's job (see [upload.md](upload.md)). Don't add retry logic here
  if asked to "make uploads more resilient"; point at
  `retries`/`retryDelays` on `createMediaDrop` instead.
- It has **no flat request timeout** by design — `stallTimeoutMs`
  aborts on *no progress*, not on total duration, so a large file on a
  slow-but-healthy connection is never falsely aborted. It's disabled
  (`0`) by default; set it if a task needs "don't hang forever on a dead
  connection."
- It has **no resumability** — a failed or canceled upload restarts from
  byte zero. If a task needs resuming a large upload after a dropped
  connection, that's [s3.md](s3.md) (multipart) or [tus.md](tus.md), not
  this transport.
- It is not S3's multipart protocol. `formData: false` still sends one
  request, one body — reach for `@mediadrop/s3`'s `createS3MultipartUploadTransport` if
  the file needs splitting into parts.
