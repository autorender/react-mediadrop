# Plan 021: Move shared dependency versions into the pnpm catalog; add missing root dev scripts

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- pnpm-workspace.yaml package.json packages/*/package.json`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: DX & tooling
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`pnpm-workspace.yaml` (confirmed by direct read) already uses pnpm's
`catalog:` feature for exactly one dependency: `typescript: "^5.9.3"`.
This is the right mechanism for keeping a shared dev-dependency version
consistent across every package without hand-editing N `package.json`
files whenever it's bumped — but it's used for only one dependency today.
Cross-referencing `react-email`'s monorepo (a more mature sibling project
using the same pnpm+Turborepo+Changesets stack): shared tooling
dependencies (test runner, linter, build tool versions) are kept
consistent across packages there too, and this repo's own
`CONTRIBUTING.md`-stated goal of keeping every transport package
identically tooled is undermined if `vitest`/`biome`/`tsdown` versions
are allowed to drift independently per-package `package.json` (verify
whether they currently do before assuming this is a live problem — if
every package already pins the exact same version by coincidence, this
plan is prevention, not a fix, and should be scoped down accordingly).

Separately (a DX gap, not a version-consistency one): root `package.json`'s
scripts (confirmed: `build`, `test`, `lint`, `typecheck`, `size` — the
same ones CI runs) have no `dev`/`watch` script wired to Turborepo's
`--filter`/persistent-task support for iterating on one package with its
consuming example live-reloading, forcing a contributor to manually `cd`
into two terminals (one package in watch mode, one example's dev server)
rather than a single root-level command.

## Current state

- `pnpm-workspace.yaml` — `catalog: { typescript: "^5.9.3" }` only.
- Root `package.json` — scripts: `build`, `test`, `lint`, `typecheck`, `size` (confirmed present); no `dev` script.
- `turbo.json` — task graph for `build`/`test`/`lint`/`typecheck`; check whether a `dev` task (marked `persistent: true, cache: false` in Turborepo's convention) already exists before assuming it needs to be added from scratch.

## Commands you will need

| Purpose        | Command                    | Expected on success |
|-----------------|-------------------------------|----------------------|
| Check versions  | `pnpm ls vitest biome tsdown -r --depth 0` | shows each package's resolved version — confirms whether drift already exists |
| Install         | `pnpm install`              | exit 0 after catalog changes |

## Scope

**In scope**: `pnpm-workspace.yaml` (expand `catalog:`), every
`packages/*/package.json` and `examples/*/package.json` that references
a now-cataloged dependency (change to `"catalog:"` per pnpm's syntax),
root `package.json` (`dev` script), `turbo.json` (`dev` task, if missing).

**Out of scope**: per-package *runtime* dependencies that are
deliberately package-specific (e.g. `@mediadrop/s3` alone needing an AWS
SDK type, if any) — only genuinely shared dev/build tooling belongs in
the catalog.

## Git workflow

- Branch: `advisor/021-shared-version-catalog-and-dev-scripts`

## Steps

### Step 1: Audit actual version drift across packages

```bash
pnpm ls vitest @biomejs/biome tsdown -r --depth 0
```

Confirm whether these are already identical across every package (likely,
given a single root devDependency install is common in this style of
monorepo) or have actually drifted. If already identical via a root-level
shared devDependency (not per-package), this plan may be much smaller
than expected — check root `package.json`'s own `devDependencies` first,
since catalog is specifically for cases where each package.json
independently declares the same dep (common when packages are meant to
be independently `npm install`-able in isolation for local dev, less
common when everything is managed from the root).

**Verify**: no command beyond the audit itself; document findings in the PR.

### Step 2: If drift (or drift risk) exists, move shared devDependencies into the catalog

```yaml
# pnpm-workspace.yaml
catalog:
  typescript: "^5.9.3"
  vitest: "^<confirmed-version>"
  "@biomejs/biome": "^<confirmed-version>"
```

Update each consuming `package.json` to reference `"catalog:"` instead of
a hardcoded version range.

**Verify**: `pnpm install` → exit 0. `pnpm ls vitest -r --depth 0` → identical version everywhere.

### Step 3: Add a root `dev` script/Turborepo task, if missing

```json
// turbo.json
"dev": {
  "cache": false,
  "persistent": true
}
```

```json
// root package.json
"scripts": {
  "dev": "turbo run dev"
}
```

Confirm each package that should support `dev` (likely `core`, and
`examples/react-demo`) has its own `dev` script (e.g. `tsdown --watch`
for a package, `vite`/whatever the example uses for the demo) before
assuming the root task will work — this plan wires the root
orchestration, not necessarily every package's individual watch script,
if any package is missing one, note it and add a minimal one.

**Verify**: `pnpm dev` (or `pnpm --filter @mediadrop/core --filter react-demo dev`) starts both, live-reload confirmed by editing a `core` source file and observing the demo picks it up (manual check, not automatable in CI).

## Test plan

- `pnpm install` succeeds with catalog references.
- `pnpm ls <dep> -r --depth 0` shows one consistent version repo-wide for every cataloged dependency.
- Manual local check that `pnpm dev` starts a usable live-reload loop (not CI-automatable, but confirm once during implementation).

## Done criteria

- [ ] Shared dev/build tooling dependencies moved into `pnpm-workspace.yaml`'s `catalog:` (only if Step 1 confirms genuine drift risk — otherwise document why not needed and reduce scope)
- [ ] `pnpm install` succeeds, versions consistent repo-wide
- [ ] Root `dev` script added and manually confirmed to work
- [ ] No files outside scope modified

## STOP conditions

- If Step 1 shows every package already pins identical versions via a
  single root-level devDependency (not per-package), most of this plan's
  catalog work is unnecessary — only add the `dev` script and note the
  audit's finding rather than manufacturing catalog entries for
  dependencies that were never actually drifting.

## Maintenance notes

- Any new shared dev/build tooling dependency added in the future should
  go into the catalog from the start, not a per-package hardcoded version.
