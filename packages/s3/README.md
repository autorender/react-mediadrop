# @mediadrop/s3

S3 upload transport adapters for [`@mediadrop/core`](../core/README.md) —
a simple presigned upload for small files, and multipart upload (with
resumable metadata) for large ones. **No AWS SDK, no signing server in
this package.** Your backend signs URLs; this package only ever talks to
those URLs with `XMLHttpRequest`. Works as `transport` in
`@mediadrop/react` and `@mediadrop/vanilla` identically — there is no
S3-specific binding.

## Install

```sh
pnpm add @mediadrop/s3
```

## Simple presigned upload

For files small enough for one request. Presigned PUT (raw body) or
presigned POST (S3's policy-based form upload):

```ts
import { createMediaDrop } from "@mediadrop/core";
import { createS3UploadTransport } from "@mediadrop/s3";

const mediadrop = createMediaDrop({
	transport: createS3UploadTransport({
		getUploadUrl: async ({ file }) => {
			const res = await fetch("/api/s3/presign", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ filename: file.name, contentType: file.type }),
			});
			return res.json(); // { url, method?, headers?, fields?, key?, bucket? }
		},
	}),
});
```

No retry here, or anywhere in this package — `@mediadrop/core`'s upload
queue owns retry (`retries` on `createMediaDrop`), and `createS3MultipartUploadTransport`
below retries individual parts through `@mediadrop/core`'s shared
`withRetry`, never a second, hand-rolled retry loop.

## Multipart upload

For large files. Splits the file into parts (S3's rules: parts must be
**≥ 5 MiB except the last**, and **at most 10,000 parts**;
`createS3MultipartUploadTransport` enforces both by adjusting your requested `partSize`
up as needed), uploads them with bounded concurrency, aggregates progress
across parts, and — with `sessionStore` — can skip already-uploaded parts
if the same file is re-uploaded (including after a page reload):

```ts
import { createS3MultipartUploadTransport } from "@mediadrop/s3";
import { createBrowserUploadSessionStore } from "@mediadrop/core";

const transport = createS3MultipartUploadTransport({
	createMultipartUpload: async ({ file }) => {
		const res = await fetch("/api/s3/multipart/create", {
			method: "POST",
			body: JSON.stringify({ filename: file.name, contentType: file.type }),
		});
		return res.json(); // { uploadId, key }
	},
	getPartUploadUrl: async ({ key, uploadId, partNumber }) => {
		const res = await fetch("/api/s3/multipart/part", {
			method: "POST",
			body: JSON.stringify({ key, uploadId, partNumber }),
		});
		return res.json(); // { url, headers? }
	},
	completeMultipartUpload: async ({ key, uploadId, parts }) => {
		const res = await fetch("/api/s3/multipart/complete", {
			method: "POST",
			body: JSON.stringify({ key, uploadId, parts }),
		});
		return res.json(); // { key?, location? }
	},
	abortMultipartUpload: async ({ key, uploadId }) => {
		await fetch("/api/s3/multipart/abort", {
			method: "POST",
			body: JSON.stringify({ key, uploadId }),
		});
	},
	partSize: 8 * 1024 * 1024,
	partConcurrency: 3,
	sessionStore: createBrowserUploadSessionStore(),
});
```

### Your backend's contract

This package never sees an AWS secret and has no AWS SDK dependency —
signing is entirely your backend's job (Node, Go, Python, whatever you
like). It expects four endpoints (names are yours to choose; wire them
into the options above):

| Purpose | Typical shape |
|---|---|
| Create a multipart upload | `POST /api/s3/multipart/create` → `{ uploadId, key }` |
| Sign one part's PUT URL | `POST /api/s3/multipart/part` → `{ url, headers? }` |
| Complete the upload | `POST /api/s3/multipart/complete` → `{ key?, location? }` |
| Abort the upload | `POST /api/s3/multipart/abort` |

**Your bucket's CORS config must expose the `ETag` response header**
(`ExposeHeaders: ["ETag"]`) — without it, the browser can't read each
part's ETag from the PUT response, and `createS3MultipartUploadTransport` will reject
with a message telling you exactly that.

### Progress, cancellation, and cleanup

Progress is `sum(completed part sizes) + sum(in-flight part bytes so
far)`, reported every time any part's progress changes — never
double-counted, even with multiple parts in flight at once.

**`partStallTimeoutMs`** (default `0`, disabled) aborts and retries one
part if it makes no upload progress for that long — a *stall* timeout,
reset on every progress tick, not a flat total-duration one, so a large
part on a slow-but-healthy connection is never falsely aborted. Catches a
silently dead connection that would otherwise hang the part (and
therefore the whole upload) forever instead of erroring into the shared
retry engine.

Canceling
aborts every in-flight part's request and calls `abortMultipartUpload`
(unless `abortOnCancel: false`) if the upload was already created; it
never calls `completeMultipartUpload` for a canceled upload.

**A genuine failure (not a cancel) also calls `abortMultipartUpload`**
by default (`abortOnFailure`, default `true`) — once every part retry is
exhausted, or `createMultipartUpload`/`completeMultipartUpload` itself
rejects, the multipart upload is aborted and the local resume session is
cleared (resuming against an upload S3 was just told to abort can't
work; a later retry starts a fresh `createMultipartUpload` instead).
Without this, a failed upload leaves its multipart upload orphaned in
S3 — invisible in the bucket's normal object listing, but still
accruing storage cost — until something cleans it up. Set
`abortOnFailure: false` if you'd rather leave it and resume later
instead. Either way, **set a
[bucket lifecycle rule](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html)
to expire incomplete multipart uploads** as defense-in-depth — the one
case neither option covers is losing power/network before this package
gets a chance to call `abortMultipartUpload` at all.

### Resumability — read this before relying on it

**What actually resumes:** if `sessionStore` is set and the exact same
file (matched by `fingerprint` — size/name/type/`lastModified` by
default, not file contents) is uploaded again — including after a page
reload — already-uploaded parts are skipped and only the remaining ones
are sent.

**What does not resume:** mediadrop cannot persist the file's bytes.
If the user doesn't reselect that exact file, there is nothing to resume
— they start over. There is also no pause: canceling an upload discards
its resume session (Phase 3 has no pause/resume distinction yet), so
resuming only helps after an *unplanned* interruption (a reload, a closed
tab), not a deliberate cancel.

**Without `listUploadedParts`,** a resumed upload trusts its local
session metadata as-is. Pass `listUploadedParts` (an S3 `ListParts` call
on your backend) to reconcile against what S3 actually has before
trusting it.

See [`skills/mediadrop/references/upload.md`](../../skills/mediadrop/references/upload.md)
for mediadrop's general upload contract, and
[`scope.md`](../../skills/mediadrop/references/scope.md) for the full
"not implemented" boundary.
