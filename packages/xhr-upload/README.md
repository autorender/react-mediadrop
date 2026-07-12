# @mediadrop/xhr-upload

A reference `UploadTransport` that sends a file with `XMLHttpRequest`. Its
only dependency is `@mediadrop/core` itself (for `createHttpError`, so a
failed upload's `.status` is inspectable the same way as every other
transport) — no third-party runtime dependency.

XHR, not `fetch`, is deliberate: `fetch` still has no cross-browser
upload-progress API, while `XMLHttpRequest.upload.onprogress` does. Works
as `transport` in `react-mediadrop`.

**Internal, not published.** Like `@mediadrop/core`, this is a
workspace-only source package — `react-mediadrop` bundles it into its own
`react-mediadrop/xhr-upload` subpath at build time. There's nothing to
install beyond `react-mediadrop` itself, and a bundler that never imports
the `/xhr-upload` subpath never bundles this code (see
[`skills/mediadrop/references/xhr-upload.md`](../../skills/mediadrop/references/xhr-upload.md)).

## Install

```sh
pnpm add react-mediadrop
```

## Quickstart

```tsx
import { useMediaDrop } from "react-mediadrop";
import { createXhrUploadTransport } from "react-mediadrop/xhr-upload";

const transport = createXhrUploadTransport({ endpoint: "/api/upload" });
const { getRootProps, getInputProps, uploadAll } = useMediaDrop({
	transport,
	concurrency: 3,
	retries: 2,
});
```

See [`skills/mediadrop/references/upload.md`](../../skills/mediadrop/references/upload.md)
for the full queue/retry/cancel contract this plugs into.

## What this does

- Sends one file per call, as `multipart/form-data` by default (`formData: false`
  sends the file's raw bytes instead — e.g. for a presigned PUT URL).
- Reports real upload progress via `XMLHttpRequest.upload.onprogress`.
- Aborts the underlying request when the queue cancels the upload.
- Resolves/rejects once, per attempt — nothing more.

## What this does not do

- **No retry.** A single failed attempt rejects immediately; `@mediadrop/core`'s
  upload queue decides whether to retry, when, and how many times. This
  transport has no retry/backoff logic of its own to get wrong or duplicate.
- **No concurrency control.** The queue decides how many uploads run at once;
  this transport just services one call at a time when asked.
- **No resumability.** A failed or canceled upload starts over from byte
  zero on the next attempt — there is no chunking, checkpointing, or
  resume-from-offset protocol here (that's what tus is for, and mediadrop
  does not implement tus).
- **No S3 multipart-upload protocol.** `formData: false` sends the file as
  a single PUT/POST body (e.g. to a presigned URL) — it is not S3's
  multi-part API (multiple part uploads, an upload ID, a completion call).

## Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `endpoint` | `string \| (file) => string` | — required | Computed per file, e.g. for a per-file presigned URL you already fetched. |
| `method` | `string` | `"POST"` | |
| `fieldName` | `string` | `"file"` | Ignored when `formData: false`. |
| `fields` | `object \| (file) => object` | — | Extra multipart fields. Ignored when `formData: false`. |
| `headers` | `object \| (file) => object` | — | |
| `withCredentials` | `boolean` | `false` | |
| `formData` | `boolean` | `true` | `false` sends the raw file body. |
| `isSuccessStatus` | `(status) => boolean` | `200–299` | |
| `stallTimeoutMs` | `number` | `0` (disabled) | Abort and reject if no upload progress happens for this long — a *stall* timeout (reset on every progress tick), not a flat total-duration one, so a large file on a slow-but-healthy connection is never falsely aborted. Catches a silently dead connection instead of hanging forever. |
