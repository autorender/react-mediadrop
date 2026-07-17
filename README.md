<p align="center">
  <img src="assets/logo.png" alt="mediadrop logo" width="120" />
</p>

# react-mediadrop

[![npm](https://img.shields.io/npm/v/react-mediadrop.svg?style=flat-square)](https://www.npmjs.com/package/react-mediadrop)
![CI](https://img.shields.io/github/actions/workflow/status/autorender/react-mediadrop/ci.yml?branch=main&style=flat-square&label=CI)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![bundle size](https://img.shields.io/badge/min%2Bgzip-4.4KB-success?style=flat-square)](https://bundlephobia.com/package/react-mediadrop)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg?style=flat-square)](CODE_OF_CONDUCT.md)
[![skills.sh](https://skills.sh/b/autorender/react-mediadrop)](https://skills.sh/autorender/react-mediadrop)

**mediadrop** is a headless file uploader for React — file intake, drag/drop,
validation, and upload (queue, concurrency, retry, cancel) via a single
`useMediaDrop` hook. No prebuilt widget — you own the markup.

`react-mediadrop` ships at **4.4 KB minified + gzipped** (per
[Bundlephobia](https://bundlephobia.com/package/react-mediadrop)); the
optional `xhr-upload` transport is a separate subpath import, so you only
pay for it if you use it. If you've used `react-dropzone`, the API will feel
familiar — `useMediaDrop` returns the same `getRootProps`/`getInputProps`
shape, plus a built-in upload queue react-dropzone doesn't have.

Documentation and examples at https://www.mediadrop.dev/docs.
Source code at https://github.com/autorender/react-mediadrop.

## Install

```sh
pnpm add react-mediadrop
```

or `npm install` / `yarn add` — `react-mediadrop` ships as ESM with TypeScript
types included, and works with any modern bundler. Requires **React 18+**;
no `window`/`document` access at render time, so it's safe to import in SSR
frameworks (Next.js, Remix, etc.) — browser APIs only run inside event
handlers, on the client.

## Quickstart

### React

```tsx
import { useMediaDrop } from "react-mediadrop";

const { getRootProps, getInputProps, files } = useMediaDrop({
	restrictions: { accept: ["image/png", "image/jpeg"], maxFiles: 5 },
});
```

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

Without `transport`, nothing is uploaded — `useMediaDrop` only tracks
intake/validation state. See the
[quickstart](https://www.mediadrop.dev/docs/getting-started/quickstart)
and [upload guide](https://www.mediadrop.dev/docs/guides/upload) for
the full API.

## What's implemented

**Core**: file intake from a picker or drag/drop, sync validation
(`accept`/`maxFiles`/`minSize`/`maxSize` + a custom `validator`), and drag
state (`isDragActive`/`isDragAccept`/`isDragReject`).

**Upload** (opt-in via `transport`): a pluggable transport contract, a queue
with concurrency limit + shared retry/backoff, cancel via `AbortSignal`, and
a reference `react-mediadrop/xhr-upload` transport.

Pause/resume, remote-provider import, OAuth, image transforms, a prebuilt
widget, and any vendor-specific adapter are not implemented — see the
[scope reference](skills/mediadrop/references/scope.md) for the full,
authoritative list.

## Packages

Only `react-mediadrop` is published to npm — everything else is an internal,
workspace-only source package bundled directly into it at build time. Only
`react-mediadrop` matters if you're a consumer — the rest is internal build
structure, listed here for contributors.

| Package | Published? | What it is |
| --- | --- | --- |
| [`packages/react`](packages/react) | `react-mediadrop` | The `useMediaDrop` hook + the `react-mediadrop/xhr-upload` subpath |
| [`packages/core`](packages/core) | internal | File intake, validation, drag/drop, upload-queue/retry primitives |
| [`packages/xhr-upload`](packages/xhr-upload) | internal | Reference `XMLHttpRequest` upload transport |
| [`skills/mediadrop`](skills/mediadrop) | — | Integration guide for coding agents |

## Example

`examples/react-demo` (`pnpm --filter react-demo dev`) exercises
`react-mediadrop` against a real backend — see `examples/test-server` —
rather than a faked dev-server mock.

## Commands

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm size    # checks each published/bundled package's gzipped dist against its size budget
```

## Support

Questions or issues not covered by the [docs](https://www.mediadrop.dev/docs)?
Open a [GitHub issue](https://github.com/autorender/react-mediadrop/issues) or
email oss@autorender.io.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a PR.

## License

[MIT](LICENSE)
