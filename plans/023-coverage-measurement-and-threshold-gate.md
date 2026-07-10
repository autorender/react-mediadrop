# Plan 023: Add coverage measurement and a CI threshold gate

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- .github/workflows/ci.yml vitest.config.ts vitest.workspace.ts package.json`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: test coverage
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Confirmed by direct inspection this audit: no `@vitest/coverage-v8` (or
any coverage provider) dependency exists anywhere in the repo, no root
or per-package `vitest.config.ts` sets a `coverage` block, and CI's
`test` step (`.github/workflows/ci.yml`) runs `pnpm test` with no
`--coverage` flag and no threshold enforcement. 183 tests currently pass
across 6 packages (baseline confirmed this audit: core 103, react 25,
vanilla 11, xhr-upload 11, s3 21, tus 12) — a healthy-looking count, but
with no coverage measurement there is no way to know which branches
(error paths, edge cases, the abort/retry/stall interaction surfaces this
very audit found several real bugs in) are actually exercised versus
untested. This is the foundational gap behind several of this audit's
other test-coverage findings (`plans/024`, `plans/025`, `plans/026`) —
none of them would have been caught by "tests are green," and no
future regression in an untested branch would be caught either, without
this baseline measurement in place first.

## Current state

- No coverage tooling installed anywhere in the repo.
- `package.json` (root) — `test` script runs `turbo run test` → each package's own `vitest run`.
- Each `packages/*/package.json` — `test` script is plain `vitest run`, no coverage flag.

## Commands you will need

| Purpose        | Command                                  | Expected on success |
|-----------------|---------------------------------------------|----------------------|
| Install         | `pnpm install`                              | exit 0               |
| Run w/ coverage | `pnpm --filter @mediadrop/core test -- --coverage` | produces a coverage report |

## Scope

**In scope**: add `@vitest/coverage-v8` as a shared devDependency (via
the catalog, if `plans/021` has landed — otherwise a plain shared
version); each package's `vitest.config.ts` (or a shared root config, if
one exists — check before assuming one needs to be created) gets a
`coverage` block with `provider: "v8"` and initial thresholds; a new CI
step running tests with coverage and failing under threshold.

**Out of scope**: retroactively writing new tests to hit a target
percentage as part of this plan — that's `plans/024`/`plans/025`/future
work; this plan's job is to measure and gate, using whatever the
*current* coverage level turns out to be as the starting threshold (see
Step 2), not an aspirational one.

## Git workflow

- Branch: `advisor/023-coverage-measurement-and-threshold-gate`

## Steps

### Step 1: Add the coverage provider

```bash
pnpm add -Dw @vitest/coverage-v8
```

(`-w` for a root/workspace-level devDependency, shared by every
package's `vitest` invocation, avoiding N separate installs.)

**Verify**: `pnpm --filter @mediadrop/core test -- --coverage` → runs and produces a text/HTML coverage summary without erroring (thresholds not yet enforced at this step).

### Step 2: Measure current coverage as the starting baseline

Run coverage across every package, record the actual current line/branch
percentages per package (they will differ — `core` likely highest given
its test count, some packages likely lower).

**Verify**: no command beyond running and recording the numbers; this becomes the input to Step 3.

### Step 3: Set initial thresholds at (or slightly below) the measured baseline

In each package's `vitest.config.ts` (or a shared root config extended by
each):

```ts
export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			thresholds: {
				lines: <measured - small buffer, e.g. 2-3 points below>,
				branches: <measured - buffer>,
				functions: <measured - buffer>,
				statements: <measured - buffer>,
			},
		},
	},
});
```

Setting thresholds at (not above) current reality means this gate starts
as a **regression guard**, not an immediate CI failure — its job from day
one is "don't let coverage silently get worse," which is achievable
immediately, versus "coverage must reach X%" which would require the
separately-scoped follow-up work in `plans/024`/`plans/025`.

**Verify**: `pnpm test -- --coverage` (repo-wide) → passes at the newly-set thresholds.

### Step 4: Wire into CI

```yaml
      - run: pnpm test -- --coverage
```

(Replacing or supplementing the existing plain `pnpm test` step — decide
whether coverage should run on every CI invocation, which is simplest, or
only on a schedule/separate job if the coverage instrumentation
meaningfully slows the test run — measure the time difference before
deciding; if it's a matter of a few seconds, just always run it.)

**Verify**: push a branch, confirm CI runs with coverage and passes at the new thresholds; then deliberately drop below threshold locally (comment out an existing test) and confirm the coverage check fails, proving it's a real gate and not just a report.

## Test plan

- Coverage runs successfully across all 6 packages.
- CI fails when coverage drops below the newly-set threshold (Step 4's negative test).
- CI passes at current, unmodified test coverage (no new tests required to satisfy this plan alone).

## Done criteria

- [ ] `@vitest/coverage-v8` installed
- [ ] Coverage thresholds configured per package (or shared root config), set at/near current measured baseline
- [ ] CI runs tests with coverage and fails below threshold
- [ ] Negative test (Step 4) confirms the gate actually blocks a regression
- [ ] No files outside scope modified

## STOP conditions

- If measuring coverage reveals a package with near-zero coverage on a
  specific critical file (e.g. an entire error path never exercised),
  don't silently set the threshold low enough to pass and move on — flag
  it in the PR description as a candidate for `plans/024`/`plans/025`-style
  follow-up, since a threshold that's technically passing but trivially
  low defeats the purpose of the gate.

## Maintenance notes

- Coverage thresholds should be ratcheted upward over time as
  `plans/024`/`plans/025` and future test additions raise the real
  measured coverage — a threshold that never moves once genuine coverage
  has improved provides a weaker guarantee than it could.
