<p align="center">
  <img src="assets/readme-banner.png" alt="react-mediadrop banner" />
</p>

[![npm](https://img.shields.io/npm/v/react-mediadrop.svg?style=flat-square)](https://www.npmjs.com/package/react-mediadrop)
![CI](https://img.shields.io/github/actions/workflow/status/autorender/react-mediadrop/ci.yml?branch=main&style=flat-square&label=CI)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![bundle size](https://img.shields.io/badge/min%2Bgzip-4.4KB-success?style=flat-square)](https://bundlephobia.com/package/react-mediadrop)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg?style=flat-square)](CODE_OF_CONDUCT.md)
[![skills.sh](https://skills.sh/b/autorender/react-mediadrop)](https://skills.sh/autorender/react-mediadrop)

## Introduction

**mediadrop** is a headless, hooks-first file uploader for React: intake,
drag/drop, validation, and upload (queue, concurrency, retry, cancel) via
a single `useMediaDrop` hook — the same `getRootProps`/`getInputProps`
shape you already know from react-dropzone, with upload built in. No
prebuilt widget — you own the markup.

`react-mediadrop` ships at **4.4 KB minified + gzipped** (per
[Bundlephobia](https://bundlephobia.com/package/react-mediadrop)); the
optional `xhr-upload` transport is a separate subpath import, so you only
pay for it if you use it.

Documentation and examples at https://www.mediadrop.dev/docs.

## Why

We built mediadrop for Autorender's own upload widget — the entry point for
every file and media asset into our pipeline. It went through several
iterations before it looked like this: a lightweight, hooks-first, headless
core, with a pluggable transport layer instead of one fixed upload path.

What came out of it is a set of ordinary React primitives — hooks,
validation, a transport contract — the same shape whether you're wiring
them into a media pipeline or a plain upload form. We're open-sourcing
mediadrop so any team building an uploader can start from the same
primitives we did.

If you've used `react-dropzone`, the API will feel familiar —
`useMediaDrop` returns the same `getRootProps`/`getInputProps` shape, plus a
built-in upload queue react-dropzone doesn't have.

## Install

```sh
pnpm add react-mediadrop
# or: npm install react-mediadrop
# or: yarn add react-mediadrop
```

Using an AI coding agent? Also install the Agent Skill so it integrates
the API correctly on the first try instead of guessing from the package
name:

```sh
npx skills add autorender/react-mediadrop
```

Also indexed on [Context7](https://context7.com/autorender/react-mediadrop)
— reachable via MCP from Cursor, Claude Code, Windsurf, and other
Context7-compatible tools with no local install.

- Ships as **ESM** with TypeScript types included — works with any modern
  bundler.
- Requires **React 18+**.
- No `window`/`document` access at render time — safe to import in SSR
  frameworks (Next.js, Remix, etc.); browser APIs only run inside event
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

## Blocks (shadcn registry)

Prebuilt, copy-into-your-project blocks — dropzone, avatar uploader,
multi-file upload form, S3 direct-upload — installable via the shadcn
CLI's [GitHub registry](https://ui.shadcn.com/docs/registry/github)
support, no separate registry server required:

```sh
npx shadcn@latest add autorender/react-mediadrop/dropzone
```

Swap `dropzone` for `avatar-uploader`, `multi-file-upload-form`, or
`s3-direct-upload`. (Shorter `@mediadrop/dropzone` form pending shadcn
Registry Directory review.)

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

`examples/react-demo` exercises `react-mediadrop` against a real backend
(`examples/test-server`, a plain Express app) instead of a faked dev-server
mock.

| Example | Binding | Transports covered |
| --- | --- | --- |
| [`react-demo`](examples/react-demo) | `react-mediadrop` | `react-mediadrop/xhr-upload` |
| [`test-server`](examples/test-server) | — | Real Express backend for `react-demo` |

```sh
# terminal 1 — backend, listens on http://localhost:8787
pnpm --filter test-server dev

# terminal 2 — frontend
pnpm --filter react-demo dev
```

Open the demo, drop a file, hit "Upload all" — bytes land in
`examples/test-server/uploads/` (git-ignored).

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

Brought to you by [Autorender](https://autorender.io), [MIT](LICENSE)
