# mediadrop-internal

Private battle-test workspace for **mediadrop** — OSS file-uploader (`@mediadrop/*`).

Not the public repo. This exists to stabilize the toolchain and API shape before a
fresh `autorenderhq/mediadrop` repo gets created at launch.

## Status: Phase 1 + Phase 2

Phase 1 covers file intake, drag/drop, validation, a vanilla JS binding, and
a React hook. Phase 2 adds upload on top: a pluggable transport contract,
a queue with concurrency/retry/cancel (owned by `@mediadrop/core`, not
duplicated per transport or binding), and a reference XHR transport.
Upload is opt-in — pass `transport` to get it. **There is still no
resumable/tus protocol, no S3 multipart, no pause/resume, and no
remote-provider import.** See
[`skills/mediadrop/references/scope.md`](skills/mediadrop/references/scope.md)
for the full boundary between what's implemented and what isn't.

## Packages

- `packages/core` — framework-free file intake, validation, drag/drop, and upload-queue primitives
- `packages/vanilla` — thin DOM binding over `@mediadrop/core`, for plain JS/TS
- `packages/react` — headless `useMediaDrop` hook over `@mediadrop/core`
- `packages/xhr-upload` — reference `XMLHttpRequest` upload transport, zero runtime dependencies
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
