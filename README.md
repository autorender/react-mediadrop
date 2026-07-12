<p align="center">
  <img src="assets/logo.png" alt="mediadrop logo" width="120" />
</p>

# mediadrop-internal

Private battle-test workspace for **mediadrop** — OSS file-uploader (`@mediadrop/*`).

Not the public repo. This exists to stabilize the toolchain and API shape before a
fresh `autorender/mediadrop` repo gets created at launch. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR.

## What is mediadrop, and why headless-first?

mediadrop is a file intake/validation/upload engine for React. `react-mediadrop`
owns everything that's easy to get subtly wrong (drag/drop event quirks, upload
concurrency, retry/backoff, cancel races) — the underlying engine
(`@mediadrop/core`) is bundled directly into `react-mediadrop`'s published
package, so you only ever install one package.

**Headless-first** means the engine never assumes it owns your markup.
`getRootProps`/`getInputProps` return plain props for a hook — style and
markup are always yours. There is no prebuilt widget or dashboard, in this
phase or planned for any phase — see
[`skills/mediadrop/references/scope.md`](skills/mediadrop/references/scope.md).

## Status: Phase 1 + Phase 2

Phase 1 covers file intake, drag/drop, and validation. Phase 2 adds upload
on top: a pluggable transport contract, a queue with concurrency/retry/cancel,
and a reference XHR transport. **There is still no pause/resume, no
remote-provider import, no OAuth, no image transforms, no prebuilt widget,
and no Autorender-specific adapter.** See
[`skills/mediadrop/references/scope.md`](skills/mediadrop/references/scope.md)
for the full boundary between what's implemented and what isn't.

A vanilla JS/DOM binding and S3 (presigned + multipart)/tus transports were
previously built on this same contract and are on a separate branch for a
future phase — not part of this codebase right now. This workspace is
React-only for now.

## Packages

Only **`react-mediadrop`** is published. `@mediadrop/core` and
`@mediadrop/xhr-upload` are internal workspace-only source packages — each
is bundled directly into its own dist file inside `react-mediadrop` at
build time (see `packages/react/tsdown.config.ts`), so a consumer only
ever installs one package.

`react-mediadrop` ships two independent entry points so unused code is
never bundled:

- `react-mediadrop` — the `useMediaDrop` hook, with `@mediadrop/core` bundled in.
- `react-mediadrop/xhr-upload` — `createXhrUploadTransport`, with `@mediadrop/core` bundled in separately. A consumer who never imports this subpath never bundles it — verified with a real Vite build + `vite-bundle-analyzer`, see [`packages/react/README.md`](packages/react/README.md#entry-points).

- `packages/core` *(internal, not published)* — file intake, validation, drag/drop, upload-queue/retry/session primitives
- `packages/react` *(published as `react-mediadrop`)* — headless `useMediaDrop` hook + the `xhr-upload` subpath, both bundling `@mediadrop/core`
- `packages/xhr-upload` *(internal, not published)* — reference `XMLHttpRequest` upload transport, source-only, bundled into `react-mediadrop/xhr-upload`
- `packages/tsconfig` — shared TypeScript config
- `skills/mediadrop` — integration guide for coding agents working with mediadrop

## Which transport should I use?

| Transport | Import | Request shape | Resumable? | Backend needs to implement |
| --- | --- | --- | --- | --- |
| XHR | `react-mediadrop/xhr-upload` | One request, whole file | No | A single upload endpoint |

If your files are small enough that a dropped connection losing all
progress is acceptable, plain XHR covers it. Resumable transports (S3
multipart, tus) are on a separate branch for a future phase.

## Quickstart

### React

```tsx
import { useMediaDrop } from "react-mediadrop";

const { getRootProps, getInputProps, files } = useMediaDrop({
	restrictions: { accept: ["image/png", "image/jpeg"], maxFiles: 5 },
});
```

See [`skills/mediadrop/references/react.md`](skills/mediadrop/references/react.md).

### Upload (opt-in)

```ts
import { useMediaDrop } from "react-mediadrop";
import { createXhrUploadTransport } from "react-mediadrop/xhr-upload";

const { files, uploadAll } = useMediaDrop({
	transport: createXhrUploadTransport({ endpoint: "/api/upload" }),
	concurrency: 3,
	retries: 2,
});
```

See [`skills/mediadrop/references/upload.md`](skills/mediadrop/references/upload.md)
for the full queue/concurrency/retry/cancel contract and the transport
interface.

## Supported / not supported

**Supported today:** drag/drop and picker intake, sync validation
(accept/size/count + custom validator), the `react-mediadrop` hook, and
upload with concurrency/retry/cancel via `react-mediadrop/xhr-upload`.

**Not supported, anywhere in this codebase:**

- Pause/resume as a concept distinct from cancel.
- A vanilla JS/DOM binding — built previously, currently on a separate
  branch, not in this codebase. This workspace is React-only for now.
- Resumable transports (S3 multipart, tus) — built previously, currently
  on a separate branch for a future phase, not in this codebase.
- Persistence of file bytes across a page reload.
- Remote-provider import (Google Drive/Dropbox/URL-import pickers, an
  Uppy-Companion-equivalent server) or any OAuth flow.
- Image transforms (compression, resizing, format conversion, cropping)
  or AI hooks (content moderation, tagging).
- A prebuilt widget, dashboard, or progress UI — you own all markup.
- A hosted upload service — mediadrop is a client library; you provide
  and own the backend.
- Any Autorender-specific or Cloudinary-specific adapter.

See [`skills/mediadrop/references/scope.md`](skills/mediadrop/references/scope.md)
for the complete, authoritative list.

## Example

`examples/react-demo` (`pnpm --filter react-demo dev`) exercises
`react-mediadrop` + `react-mediadrop/xhr-upload` against a real
backend — see `examples/test-server/` — rather than a faked dev-server
mock.

## Commands

```
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm size    # checks each package's gzipped dist (published or internal/bundled-in) against its sizeLimit budget
```
