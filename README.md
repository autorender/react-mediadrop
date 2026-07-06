# mediadrop-internal

Private battle-test workspace for **mediadrop** — OSS file-uploader (`@mediadrop/*`).

Not the public repo. This exists to stabilize the toolchain and API shape before a
fresh `autorenderhq/mediadrop` repo gets created at launch. See
`docs/uppy-oss-research.md` §22 for the two-repo strategy.

## Packages

- `packages/core` — transport-agnostic upload queue engine
- `packages/react` — React hooks over `@mediadrop/core`
- `packages/tsconfig` — shared TypeScript config

## Commands

```
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```
