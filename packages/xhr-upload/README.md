# @mediadrop/xhr-upload

A reference `UploadTransport` (see [`@mediadrop/core`](../core/README.md))
that sends a file with `XMLHttpRequest`. **Zero runtime dependencies** —
`@mediadrop/core` is a types-only peer dependency, erased at build time.

XHR, not `fetch`, is deliberate: `fetch` still has no cross-browser
upload-progress API, while `XMLHttpRequest.upload.onprogress` does. Works
as `transport` in `@mediadrop/react`, `@mediadrop/vanilla`, and
[`@mediadrop/widget`](../widget/README.md) identically.

## Install

```sh
pnpm add @mediadrop/xhr-upload
```

## Quickstart

```ts
import { createMediaDrop } from "@mediadrop/core";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const mediadrop = createMediaDrop({
	transport: createXhrUploadTransport({ endpoint: "/api/upload" }),
	concurrency: 3,
	retries: 2,
});

const [item] = mediadrop.addFiles(fileListOrArray);
mediadrop.uploadFile(item.id);
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
