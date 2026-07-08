# Troubleshooting

Symptom-first index of the mistakes that come up most when integrating
mediadrop. If you're debugging something that isn't here, check
[scope.md](scope.md) first — it may simply not be implemented.

## "Only one file uploads at a time even though I have several accepted"

`concurrency` defaults to **1** (sequential) on `createMediaDrop`/
`useMediaDrop`/the widget. Pass `concurrency: 3` (or whatever fits your
backend) if you want files in flight at once. This is not a bug — see
[upload.md](upload.md#the-queue-concurrency-retry-cancel).

## "TypeScript says `uploadFile`/`uploadAll`/etc. don't exist"

You didn't pass `transport`. These methods (and `uploadStatus`/`progress`/
etc. on each file) only exist on the returned object when `transport` is
set — this is intentional, not a bug to work around with a type cast. Add
`transport: someTransport` to the options and the methods appear.

## "A file's `uploadStatus` is `undefined` even though it's accepted"

Correct, expected behavior: `uploadStatus` stays `undefined` until an
upload is actually requested for that file (`uploadFile`/`uploadAll`).
`status: "accepted"` alone does not imply anything about upload state —
see [core-concepts.md](core-concepts.md).

## "A file disappeared from `getAcceptedFiles()`/the accepted count after it finished uploading"

It shouldn't — `status` (validation) and `uploadStatus` (upload
lifecycle) are separate fields, and upload never touches `status`. If you
see this, something outside mediadrop's public API is mutating file state
— don't "fix" it by making upload move files between `status` buckets;
that would be a regression, not a fix.

## "S3 multipart part uploads fail with a message about the ETag header"

Your bucket's CORS config is missing `ExposeHeaders: ["ETag"]`. Without
it, the browser can't read the `ETag` response header from the part PUT,
even though the upload itself succeeded. This is the most common S3
multipart integration failure — check CORS before anything else. See
[s3.md](s3.md).

## "Resuming after a page reload doesn't work"

Check, in order: (1) was `sessionStore` passed to `s3MultipartUpload`/
`tusUpload`? Resuming is off by default without one. (2) Did the user
reselect the *exact same file*? Resuming is keyed by a metadata
fingerprint (name/size/type/`lastModified`) — mediadrop cannot persist
file bytes, so there is no way to resume without the user picking that
file again. (3) Was the upload *canceled* rather than interrupted?
Canceling always discards the resume session — only unplanned
interruptions (reload, closed tab, dropped connection) are resumable.

## "I want to upload to my REST API but I'm using `@mediadrop/tus` / `@mediadrop/s3`"

Wrong transport. `tusUpload` needs a real tus-compatible server;
`s3MultipartUpload`/`s3Upload` need a backend that actually signs S3
URLs. For a generic endpoint you control, use
[`@mediadrop/xhr-upload`](xhr-upload.md) instead — don't stand up a fake
tus/S3 backend just to reuse those packages.

## "An upload kept running after I removed/tore down its widget or component"

`removeFile`/`clearFiles` on `@mediadrop/core` (and therefore every
binding) cancel any in-flight upload for the files they remove — this is
handled for you. If you're writing new binding/wrapper code (not just
using an existing one) and tearing it down doesn't stop in-flight
uploads, that's a bug in the new code: call `cancelAllUploads()` (if
`transport` was passed) as part of teardown, the same way
`@mediadrop/vanilla`, `@mediadrop/react`, and `@mediadrop/widget` each do
in their own `destroy()`.

## "Drag-over styling doesn't reflect the right accept/reject state"

Browsers withhold the file name during a drag (only available after
drop), so an extension-based `accept` rule (`[".png"]`) can't be evaluated
mid-drag — `isDragAccept`/`isDragReject` both stay `false` in that case.
MIME-based rules (`"image/png"`, `"image/*"`) do work during drag. This is
documented, expected behavior, not a bug — see
[core-concepts.md](core-concepts.md#drag-state). The authoritative
accept/reject decision always happens at drop time.

## "I need page-wide drag detection but I'm not using React"

`isDragGlobal` is a `@mediadrop/react`-only convenience — there's no core
or vanilla equivalent. Wire your own `dragenter`/`dragleave`/`dragend`/
`drop` listeners on `document` if you need the same thing outside React.

## "Should I install `@mediadrop/widget`?"

Only if the project wants mediadrop's prebuilt markup/CSS. It's entirely
optional — every other package works the same with or without it. Check
`package.json` before assuming it's present, and don't add it to a
project that's already built its own UI over `@mediadrop/vanilla`/
`@mediadrop/react` unless asked to.
