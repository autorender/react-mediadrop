# mediadrop-internal

Private battle-test workspace for **mediadrop** — OSS file-uploader (`@mediadrop/*`).

Not the public repo. This exists to stabilize the toolchain and API shape before a
fresh `autorenderhq/mediadrop` repo gets created at launch.

## What is mediadrop, and why headless-first?

mediadrop is a file intake/validation/upload engine you can drop into any
JS project — plain DOM, React, or nothing at all. The core package owns
everything that's easy to get subtly wrong (drag/drop event quirks,
upload concurrency, retry/backoff, cancel races, resumable metadata):
one implementation, shared by every binding.

**Headless-first** means the engine never assumes it owns your markup.
`@mediadrop/react` and `@mediadrop/vanilla` are thin wiring, not a UI.
`@mediadrop/widget` (Phase 4) is the one exception, and it stays optional
by construction: it's a small DOM layer built entirely on the same public
`createMediaDrop`/`createDropzoneController` APIs any binding uses — it
doesn't reach into core internals, doesn't duplicate the upload queue or
retry logic, and doesn't do anything you couldn't do yourself by wiring
`@mediadrop/vanilla` to your own markup. If you don't want mediadrop's
markup or CSS, don't install `@mediadrop/widget` — everything else works
exactly the same without it.

## Status: Phase 1 + Phase 2 + Phase 3 + Phase 4

Phase 1 covers file intake, drag/drop, validation, a vanilla JS binding, and
a React hook. Phase 2 adds upload on top: a pluggable transport contract,
a queue with concurrency/retry/cancel (owned by `@mediadrop/core`, not
duplicated per transport or binding), and a reference XHR transport. Phase 3
adds advanced transports on the same contract: S3 (presigned + multipart,
with resumable metadata) and a small tus client — both retry through
`@mediadrop/core`'s shared `withRetry`, never their own copy. Phase 4 adds
`@mediadrop/widget`, an optional themeable DOM widget over the same public
API, plus a full set of runnable examples. **There is still no pause/resume,
no remote-provider import, no OAuth, no image transforms, and no
Autorender-specific adapter.** See
[`skills/mediadrop/references/scope.md`](skills/mediadrop/references/scope.md)
for the full boundary between what's implemented and what isn't.

## Packages

- `packages/core` — framework-free file intake, validation, drag/drop, upload-queue, retry, session-store, and fingerprint primitives
- `packages/vanilla` — thin DOM binding over `@mediadrop/core`, for plain JS/TS
- `packages/react` — headless `useMediaDrop` hook over `@mediadrop/core`
- `packages/widget` — optional, themeable DOM widget (dropzone + file list + upload UI) over the same public API as the bindings above
- `packages/xhr-upload` — reference `XMLHttpRequest` upload transport, zero runtime dependencies
- `packages/s3` — S3 presigned/multipart upload transport, no AWS SDK
- `packages/tus` — a small tus protocol client transport, no `tus-js-client` dependency
- `packages/tsconfig` — shared TypeScript config
- `skills/mediadrop` — integration guide for coding agents working with mediadrop

## Which transport should I use?

| Transport | Package | Request shape | Resumable? | Backend needs to implement |
| --- | --- | --- | --- | --- |
| XHR | `@mediadrop/xhr-upload` | One request, whole file | No | A single upload endpoint |
| S3 (simple) | `@mediadrop/s3` (`s3Upload`) | One presigned PUT/POST | No | Presign one URL per file |
| S3 (multipart) | `@mediadrop/s3` (`s3MultipartUpload`) | Many presigned PUTs, one per part | Metadata-only (see below) | Create/sign-part/complete/abort multipart calls |
| tus | `@mediadrop/tus` (`tusUpload`) | POST create, then PATCH chunks | Metadata-only (see below) | A real tus server (or tus-compatible endpoint) |

"Resumable" always means: mediadrop persists upload progress *metadata*
(IDs, offsets, completed parts) via a `MediaDropUploadSessionStore`, keyed
by a metadata fingerprint of the file — never the file's bytes. Resuming
after a page reload requires the user to reselect the exact same file;
there is no way to continue an upload mediadrop can no longer read from
disk. If your files are small enough that a dropped connection losing all
progress is acceptable, start with plain XHR; reach for S3 multipart/tus
when they aren't.

## Quickstart

### React

```tsx
import { useMediaDrop } from "@mediadrop/react";

const { getRootProps, getInputProps, files } = useMediaDrop({
	restrictions: { accept: ["image/png", "image/jpeg"], maxFiles: 5 },
});
```

See [`skills/mediadrop/references/react.md`](skills/mediadrop/references/react.md).

### Vanilla JS

```ts
import { createMediaDrop } from "@mediadrop/vanilla";

const uploader = createMediaDrop({
	root: document.querySelector("#dropzone"),
	input: document.querySelector("#file-input"),
	restrictions: { accept: ["image/*"], maxFiles: 5 },
	onChange(state) {
		console.log(state.files);
	},
});
```

See [`skills/mediadrop/references/vanilla.md`](skills/mediadrop/references/vanilla.md).

### Widget (optional, Phase 4)

```ts
import { createMediaDropWidget } from "@mediadrop/widget";
import "@mediadrop/widget/style.css";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

createMediaDropWidget({
	target: document.querySelector("#uploader"),
	restrictions: { accept: ["image/*"], maxFiles: 5 },
	transport: createXhrUploadTransport({ endpoint: "/api/upload" }),
});
```

One call renders a dropzone, file list, per-file progress/cancel/retry,
and upload-all/clear controls. Theming is CSS custom properties, not a
closed styling system — see
[`packages/widget/README.md`](packages/widget/README.md).

### Upload (opt-in)

```ts
import { createMediaDrop } from "@mediadrop/core"; // or @mediadrop/react, @mediadrop/vanilla, @mediadrop/widget
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const mediadrop = createMediaDrop({
	transport: createXhrUploadTransport({ endpoint: "/api/upload" }),
	concurrency: 3,
	retries: 2,
});
```

See [`skills/mediadrop/references/upload.md`](skills/mediadrop/references/upload.md)
for the full queue/concurrency/retry/cancel contract and the transport
interface.

### S3 / tus (opt-in, Phase 3)

```ts
import { s3MultipartUpload } from "@mediadrop/s3";
import { tusUpload } from "@mediadrop/tus";

// createMediaDrop({ transport: s3MultipartUpload({ ...your backend's signing endpoints... }) });
// createMediaDrop({ transport: tusUpload({ endpoint: "/files" }) });
```

Same `transport` option, same queue, same retry engine — see
[`packages/s3/README.md`](packages/s3/README.md) and
[`packages/tus/README.md`](packages/tus/README.md) for the full backend
contract each expects, and exactly what resuming does and doesn't mean.

## Supported / not supported

**Supported today:** drag/drop and picker intake, sync validation
(accept/size/count + custom validator), React and vanilla bindings, an
optional themeable widget, upload with concurrency/retry/cancel via any
of four transports (XHR, S3 simple, S3 multipart, tus), and resumable
*metadata* (never file bytes) for S3 multipart and tus.

**Not supported, anywhere in this codebase:**

- Pause/resume as a concept distinct from cancel.
- Persistence of file bytes across a page reload — only metadata persists.
- Remote-provider import (Google Drive/Dropbox/URL-import pickers, an
  Uppy-Companion-equivalent server) or any OAuth flow.
- Image transforms (compression, resizing, format conversion, cropping)
  or AI hooks (content moderation, tagging).
- A hosted upload service — mediadrop is a client library; you provide
  and own the backend.
- AWS SigV4 signing in the browser — `@mediadrop/s3` never signs
  anything itself; your backend does.
- Any Autorender-specific or Cloudinary-specific adapter.

See [`skills/mediadrop/references/scope.md`](skills/mediadrop/references/scope.md)
for the complete, authoritative list.

## Examples

- `examples/react-demo` (`pnpm --filter react-demo dev`) — `@mediadrop/react` + `@mediadrop/xhr-upload`
- `examples/vanilla-basic` (`pnpm --filter vanilla-basic dev`) — `@mediadrop/vanilla` with a fully hand-rolled UI
- `examples/widget-basic` (`pnpm --filter widget-basic dev`) — `@mediadrop/widget`, one function call
- `examples/transports` (`pnpm --filter transports dev`) — `@mediadrop/s3` (simple + multipart) and `@mediadrop/tus` side by side

Every example talks to a real local dev-server endpoint (see each
example's `vite.config.ts`) that discards what it receives and, in
`react-demo`/`widget-basic`, fails ~1 in 4 uploads on purpose — so you can
see queueing, progress, cancel, retry, and error states without needing a
real backend.

## Commands

```
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm size    # checks each package's gzipped dist against its sizeLimit budget
```
