# mediadrop-internal

Private battle-test workspace for **mediadrop** — OSS file-uploader (`@mediadrop/*`).

Not the public repo. This exists to stabilize the toolchain and API shape before a
fresh `autorenderhq/mediadrop` repo gets created at launch.

## Status: Phase 1 + Phase 2 + Phase 3

Phase 1 covers file intake, drag/drop, validation, a vanilla JS binding, and
a React hook. Phase 2 adds upload on top: a pluggable transport contract,
a queue with concurrency/retry/cancel (owned by `@mediadrop/core`, not
duplicated per transport or binding), and a reference XHR transport. Phase 3
adds advanced transports on the same contract: S3 (presigned + multipart,
with resumable metadata) and a small tus client — both retry through
`@mediadrop/core`'s shared `withRetry`, never their own copy. Upload is
opt-in — pass `transport` to get it. **There is still no pause/resume,
no remote-provider import, no OAuth, and no widget/dashboard.** See
[`skills/mediadrop/references/scope.md`](skills/mediadrop/references/scope.md)
for the full boundary between what's implemented and what isn't.

## Packages

- `packages/core` — framework-free file intake, validation, drag/drop, upload-queue, retry, session-store, and fingerprint primitives
- `packages/vanilla` — thin DOM binding over `@mediadrop/core`, for plain JS/TS
- `packages/react` — headless `useMediaDrop` hook over `@mediadrop/core`
- `packages/xhr-upload` — reference `XMLHttpRequest` upload transport, zero runtime dependencies
- `packages/s3` — S3 presigned/multipart upload transport, no AWS SDK
- `packages/tus` — a small tus protocol client transport, no `tus-js-client` dependency
- `packages/tsconfig` — shared TypeScript config
- `skills/mediadrop` — integration guide for coding agents working with mediadrop

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

### Upload (opt-in)

```ts
import { createMediaDrop } from "@mediadrop/core"; // or @mediadrop/react, @mediadrop/vanilla
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

## Live demo

`examples/react-demo` (`pnpm --filter react-demo dev`) exercises both
phases against a real `@mediadrop/xhr-upload` transport, backed by a
local-only dev-server endpoint that fails ~1 in 4 uploads on purpose —
so you can see queueing, progress, cancel, retry, and error states
without needing a real backend.

## Commands

```
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm size    # checks each package's gzipped dist against its sizeLimit budget
```
