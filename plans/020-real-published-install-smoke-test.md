# Plan 020: Add a real packed-tarball install/import smoke test to CI

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- .github/workflows/ci.yml examples/react-demo/package.json`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW — purely additive CI step; does not touch any package's runtime code.
- **Depends on**: `plans/004-add-package-publish-metadata.md` (flips `private: true` → `false`; a smoke test that packs and installs a tarball is far more meaningful once packages are actually publish-shaped, though it works either way since `pnpm pack` doesn't itself require `private: false`)
- **Category**: test coverage, DX & tooling
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Confirmed by direct inspection this audit: `examples/react-demo/package.json`
depends on the workspace packages via `workspace:*` protocol, which pnpm
resolves to a symlink into the monorepo's own `packages/*/src` (or built
`dist/`, depending on `tsdown` output and workspace linking) — this is
never what an actual downstream consumer experiences. A real consumer
runs `npm install @mediadrop/core`, gets exactly what's inside the
published tarball (governed by each package's `files`/`exports` fields in
`package.json`), and imports from the package name, not a monorepo-relative
path. None of that path is exercised anywhere in CI today — `.github/workflows/ci.yml`
(confirmed by direct read) runs `install`/`lint`/`typecheck`/`test`/`build`/`size`,
none of which pack a tarball, install it into an isolated project, and
import from it. A real bug class this misses: a package's `exports` map
or `files` allowlist excluding a file that's actually needed at runtime
(the classic "works in the monorepo where everything is visible via
symlinks/raw source, breaks for a real npm consumer who only gets what
`files` allows") — this exact bug class is common enough in the JS
ecosystem to be worth a dedicated guard, and this repo has zero coverage
for it today.

## Current state

- `.github/workflows/ci.yml` — no packing/install-from-tarball step.
- `examples/react-demo/package.json` — `workspace:*` dependencies, confirmed via direct read; no `test` script.
- Each publishable package's `package.json` — `files`/`main`/`module`/`types`/`exports` fields exist (tsdown-generated build config) but are never validated against an actual install.

## Commands you will need

| Purpose        | Command                                  | Expected on success |
|-----------------|---------------------------------------------|----------------------|
| Build           | `pnpm build`                                | exit 0, produces `dist/` per package |
| Pack one package| `pnpm --filter @mediadrop/core pack --pack-destination /tmp/mdpack` | produces a `.tgz` |

## Scope

**In scope**: new CI job/step in `.github/workflows/ci.yml`; a new
minimal smoke-test fixture project (e.g. `smoke-test/` at repo root, NOT
part of the `pnpm-workspace.yaml` glob, so it truly installs from npm-style
tarballs rather than being workspace-linked).

**Out of scope**: `examples/react-demo` itself — left as a `workspace:*`-based
dev example (that's a reasonable, intentional choice for a demo meant to
show live-reloading against local source); this plan adds a *separate*,
narrowly-scoped smoke test rather than converting the existing demo.

## Git workflow

- Branch: `advisor/020-real-published-install-smoke-test`

## Steps

### Step 1: Build and pack every publishable package

```bash
pnpm build
mkdir -p /tmp/mdpack
for pkg in core react s3 tus vanilla xhr-upload; do
  pnpm --filter "@mediadrop/$pkg" pack --pack-destination /tmp/mdpack
done
```

**Verify**: six `.tgz` files exist in `/tmp/mdpack`.

### Step 2: Create a minimal, isolated smoke-test fixture

`smoke-test/package.json` (not in the pnpm workspace glob — confirm by
checking it doesn't match `packages/*`/`examples/*` in `pnpm-workspace.yaml`,
or explicitly exclude it there):

```json
{
  "name": "mediadrop-smoke-test",
  "private": true,
  "type": "module"
}
```

`smoke-test/smoke.mjs`: import each package by name (`import { createMediaDrop } from "@mediadrop/core"`, etc. — for `react`, use `react-dom/server` to render a minimal component using `useMediaDrop` since there's no DOM in a plain Node smoke test) and call a trivial, representative function from each to confirm the module actually loads and the expected export exists at runtime — not just that TypeScript types resolve.

**Verify**: locally, `cd smoke-test && npm install /tmp/mdpack/*.tgz && node smoke.mjs` → exits 0, no import errors.

### Step 3: Wire into CI as a step after build

```yaml
      - run: pnpm build
      - name: Pack publishable packages
        run: |
          mkdir -p /tmp/mdpack
          for pkg in core react s3 tus vanilla xhr-upload; do
            pnpm --filter "@mediadrop/$pkg" pack --pack-destination /tmp/mdpack
          done
      - name: Install-from-tarball smoke test
        working-directory: smoke-test
        run: |
          npm install /tmp/mdpack/*.tgz
          node smoke.mjs
```

**Verify**: push a branch, confirm this step runs and passes in CI.

### Step 4: Prove it catches real bugs (negative test, local-only, don't commit the break)

Locally, temporarily narrow one package's `files` field in `package.json`
to exclude a file `smoke.mjs` actually needs, re-run Steps 1-2, confirm
the smoke test now fails with a clear module-not-found error. Revert the
temporary change before committing — this step is validation that the
new CI step is a real regression guard, not evidence to ship.

**Verify**: manual local confirmation only; not part of the committed CI step.

## Test plan

- CI step per Step 3 runs on every PR/push, exercising all six packages' actual published shape.
- Step 4's manual negative-test validates the guard actually catches the failure mode it's meant to (do this once during implementation, not on every CI run).

## Done criteria

- [ ] `smoke-test/` fixture created, importing every publishable package by name
- [ ] CI packs, installs, and runs the smoke test after `pnpm build`
- [ ] Verified locally that narrowing a package's `files` field causes the smoke test to fail (Step 4)
- [ ] `smoke-test/` excluded from the pnpm workspace (confirmed via `pnpm-workspace.yaml`)
- [ ] No files outside scope modified

## STOP conditions

- If `@mediadrop/react`'s exports can't be meaningfully smoke-tested
  without a DOM (no jsdom in this Node-only smoke fixture), decide
  whether to add jsdom as a smoke-test-only dev dependency or settle for
  a shallower "does the module load and export the expected function
  names" check without actually invoking the hook — the latter is still
  strictly better than zero coverage today, so don't block the whole
  plan on making the React check as deep as the others.

## Maintenance notes

- Any new publishable package must be added to the `for pkg in ...` loop
  in both the CI step and locally, and given an import line in `smoke.mjs`.
