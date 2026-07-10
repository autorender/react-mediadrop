# Plan 014: Share one MockXhr test double instead of three drifted copies

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/s3/src/test-utils.ts packages/tus/src/test-utils.ts packages/xhr-upload/src/index.test.ts`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW — test-only change, no production code affected; risk is entirely in whether the unified double covers every real usage across all three call sites.
- **Depends on**: none
- **Category**: tech debt & architecture, test coverage
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Three near-identical, independently hand-maintained `MockXhr` classes
exist, confirmed by direct read this audit:

- `packages/s3/src/test-utils.ts` lines 9-83: has `statusText`,
  `responseText`, `ontimeout`, `upload.onprogress` with
  `{loaded,total,lengthComputable}`; lacks `responseURL`, `withCredentials`.
- `packages/tus/src/test-utils.ts` lines 10-70: has `responseURL`
  (computed via `new URL(...)` in `open()`); lacks `statusText`,
  `responseText`, `ontimeout`; `progress()` only takes `loaded` (no
  `total`/`lengthComputable`).
- `packages/xhr-upload/src/index.test.ts` lines 12-89: an inline,
  uncented copy (not exported/shared at all) with `withCredentials`;
  lacks `responseURL`.

Each has independently drifted to add exactly what its own package's
tests needed, without anyone reconciling the three. This is real
duplication-driven risk: a bug fixed in the real XHR-envelope logic (see
`plans/011-dedupe-xhr-transport-envelope.md`, a related but distinct
finding about the *production* code's duplication) could pass tests in
one package while a test double in another package still models the old
behavior, because the doubles aren't the same code. It also means adding
a new cross-cutting test (e.g. for `plans/011`'s shared `sendXhr` helper)
requires reconciling three different shapes rather than extending one.

## Current state

- `packages/s3/src/test-utils.ts` — full file (83 lines), as above.
- `packages/tus/src/test-utils.ts` — full file (70 lines), as above.
- `packages/xhr-upload/src/index.test.ts` lines 12-89 — inline, non-exported copy.
- None of the three packages currently import a shared testing utility from anywhere — there is no existing `@mediadrop/test-utils` or similar internal package.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Typecheck | `pnpm typecheck`                            | exit 0, all packages |
| Tests     | `pnpm test`                                 | all pass, all packages |

## Scope

**In scope**: a new internal (non-published, `private: true`) workspace
package, e.g. `packages/test-utils` (mirroring how `packages/tsconfig`
is already an internal-only shared package per its own `private: true`),
exporting a single reconciled `MockXhr` + `installMockXhr` + `makeFile`;
updating `packages/s3/src/test-utils.ts`, `packages/tus/src/test-utils.ts`,
and `packages/xhr-upload/src/index.test.ts` to import from it instead of
defining their own.

**Out of scope**: `plans/011`'s production-code XHR-envelope dedup — a
related but independent effort; land in either order, no conflict
expected since one touches `src/*.ts` production files and this one
touches only test-support code.

## Git workflow

- Branch: `advisor/014-dedupe-test-scaffolding`

## Steps

### Step 1: Design the reconciled MockXhr shape

Union of every field/method actually used across all three current
copies: `method`, `url`, `status`, `statusText`, `responseText`,
`responseURL` (computed via the tus version's `new URL(url, base)`
pattern — the most complete existing behavior), `withCredentials`,
`requestHeaders`, `responseHeaders`, `sentBody`, `aborted`,
`upload.onprogress` accepting the s3/xhr-upload's fuller
`{loaded, total, lengthComputable}` shape (a superset of tus's
`{loaded}`-only shape — tus callers just won't read `total`/
`lengthComputable`), `onload`, `onerror`, `ontimeout`, `onabort`,
`open`, `setRequestHeader`, `send`, `abort`, `getResponseHeader`,
`respond(status, body?, headers?)` (s3/xhr-upload's fuller signature;
tus's 2-arg version becomes callable by simply omitting `body`),
`progress(loaded, total?)`, `networkError()`. Confirm this union covers
every call site in all three packages' existing tests before proceeding
— grep each package's `*.test.ts` for `.status =`, `.responseText`,
`.responseURL`, `.withCredentials`, `MockXhr.instances`, `.respond(`,
`.progress(`, `.networkError(` usage.

**Verify**: no command — a design check; the grep above is the verification.

### Step 2: Create the shared package

```
packages/test-utils/
  package.json       (private: true, name: "@mediadrop/test-utils")
  src/index.ts        (MockXhr, installMockXhr, makeFile)
  tsconfig.json       (extends the shared internal tsconfig, per packages/tsconfig)
```

Add it to `pnpm-workspace.yaml`'s existing `packages/*` glob (no change
needed there, already covers it) and as a `devDependency`
(`workspace:*`) in `s3`, `tus`, `xhr-upload`'s `package.json`.

**Verify**: `pnpm install` → exit 0, no workspace-linking errors.

### Step 3: Migrate all three packages to import from it

Replace each package's local `test-utils.ts` (or inline class) with a
thin re-export or direct import from `@mediadrop/test-utils`, removing
the now-duplicated local definitions.

**Verify**: `pnpm --filter @mediadrop/s3 test && pnpm --filter @mediadrop/tus test && pnpm --filter @mediadrop/xhr-upload test` → all pass unchanged (this must be a pure refactor — no test assertion should need to change, since the reconciled double is a superset of each package's previous needs).

### Step 4: Full-repo verification

**Verify**: `pnpm typecheck && pnpm test && pnpm build` → all exit 0. Confirm `packages/test-utils` is excluded from `pnpm build`'s publishable-package build if that script assumes every `packages/*` entry is publishable (check `turbo.json`/root `package.json`'s `build` task filter — `packages/tsconfig` being `private: true` and presumably already excluded is the precedent to follow).

## Test plan

- All pre-existing tests in `s3`, `tus`, `xhr-upload` must pass unchanged post-migration.
- No new test *behavior* is being added here — this is a pure test-infrastructure consolidation. (Contrast with `plans/024`/`plans/025`, which add genuinely new test *cases*.)

## Done criteria

- [ ] New `packages/test-utils` package created, `private: true`, not published
- [ ] `s3`, `tus`, `xhr-upload` all use the shared `MockXhr`/`installMockXhr`/`makeFile`, no local duplicate definitions remain
- [ ] All existing tests pass unchanged
- [ ] `pnpm build`/`pnpm size`/CI package-discovery scripts correctly skip the new internal package the same way they already skip `packages/tsconfig`
- [ ] No files outside scope modified

## STOP conditions

- If any of the three packages' tests rely on a subtle behavioral
  difference between their own MockXhr version and the reconciled one
  (e.g. tus's `progress()` intentionally not supporting `total` because
  a test asserts something breaks/no-ops without it), stop and investigate
  rather than silently picking the more-complete behavior — confirm it's
  genuinely a superset relationship, not a meaningful divergence.

## Maintenance notes

- Any future transport package's tests should depend on
  `@mediadrop/test-utils` from day one rather than hand-rolling a fourth
  `MockXhr`.
