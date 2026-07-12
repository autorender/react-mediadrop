# Troubleshooting

Symptom-first index of the mistakes that come up most when integrating
mediadrop. If you're debugging something that isn't here, check
[scope.md](scope.md) first — it may simply not be implemented.

## "Only one file uploads at a time even though I have several accepted"

`concurrency` defaults to **1** (sequential) on `createMediaDrop`/
`useMediaDrop`. Pass `concurrency: 3` (or whatever fits your backend) if
you want files in flight at once. This is not a bug — see
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

## "I want S3 or tus support"

Not in this codebase right now — `@mediadrop/s3`/`@mediadrop/tus`
existed on the same transport contract but currently live on a separate
branch for a future phase. See [scope.md](scope.md). Don't stand up a
fake tus/S3 backend to work around this; for a generic endpoint you
control today, use the bundled [xhr-upload transport](xhr-upload.md)
(`react-mediadrop/xhr-upload`).

## "An upload kept running after I removed/tore down its component"

`removeFile`/`clearFiles` cancel any in-flight upload for the files they
remove — this is handled for you. If you're writing new wrapper code
around `useMediaDrop` (not just using it) and tearing it down doesn't
stop in-flight uploads, that's a bug in the new code: call
`cancelAllUploads()` (if `transport` was passed) as part of teardown, the
same way `react-mediadrop`'s own unmount cleanup does.

## "Drag-over styling doesn't reflect the right accept/reject state"

Browsers withhold the file name during a drag (only available after
drop), so an extension-based `accept` rule (`[".png"]`) can't be evaluated
mid-drag — `isDragAccept`/`isDragReject` both stay `false` in that case.
MIME-based rules (`"image/png"`, `"image/*"`) do work during drag. This is
documented, expected behavior, not a bug — see
[core-concepts.md](core-concepts.md#drag-state). The authoritative
accept/reject decision always happens at drop time.
