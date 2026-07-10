# Plan 005: Harden ci.yml — SHA-pin actions, add permissions/concurrency/timeout, split into jobs

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- .github/workflows/ci.yml`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW — CI-only change; a mistake here fails CI loudly, it doesn't ship a bug to users.
- **Depends on**: none (can land independently of / before plan 003's release workflow, though both touch `.github/workflows/`)
- **Category**: security, DX & tooling
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Confirmed by direct read of `.github/workflows/ci.yml` (32 lines, single
`ci` job): every third-party action is pinned to a mutable tag
(`actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`) —
a tag can be moved by the action's maintainer (or, in a supply-chain
compromise, by an attacker who gains control of the tag) to point at a
different, malicious commit without the version string changing (SEC-01).
There is no top-level or job-level `permissions:` block, so the workflow's
`GITHUB_TOKEN` gets the repository's default token permissions rather than
an explicit least-privilege grant (SEC-02). There is no `concurrency:`
block, so concurrent pushes to the same PR/branch queue up rather than
canceling superseded runs — wasted CI minutes, not a security issue, but a
real DX cost (SEC-04 is the security framing: no `concurrency` also means
no automatic cancellation of a stale run before a newer commit's run,
which matters more once a release job exists). There is no
`timeout-minutes:`, so a hung job runs until GitHub's default (very long)
job timeout instead of failing fast (DX-02). Everything — lint, typecheck,
test, build, size — runs in one serial job, so a fast lint failure still
waits behind (or blocks) unrelated slower steps and there is no
parallelism across independent checks.

react-email's workflows (read directly this audit) demonstrate every one
of these practices: full-SHA-pinned actions throughout,
`concurrency: ${{ github.workflow }}-${{ github.ref }}`, explicit
`permissions` blocks (top-level `contents: read` in `release.yml`, narrower
grants added at job level only where needed), and `timeout-minutes` set
per job (30 in `bump.yml`, 45 in `release.yml`).

## Current state

`.github/workflows/ci.yml`, full contents as read this audit:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm size
```

No `permissions`, no `concurrency`, no `timeout-minutes`, tag-pinned
actions, single job. (Turbo remote caching, a related but separate
finding, is tracked in `plans/010-add-turbo-remote-cache-to-ci.md` — do
not fold that in here, it's a distinct opt-in infra dependency.)

## Commands you will need

| Purpose        | Command                                                   | Expected on success |
|-----------------|------------------------------------------------------------|----------------------|
| Validate YAML   | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` | no error |
| Lint workflow   | `actionlint .github/workflows/ci.yml` (if installed; otherwise skip) | no findings |
| Local script parity | `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size` | all exit 0, confirms the split jobs still cover the same commands |

## Scope

**In scope**: `.github/workflows/ci.yml` only.

**Out of scope**:
- `.github/workflows/release.yml`/`canary.yml` — new files, covered by plan 003.
- Turbo remote cache wiring — plan 010.
- `pnpm-workspace.yaml`/`renovate.json` — plan 021/022.

## Git workflow

- Branch: `advisor/005-harden-ci-workflow`
- One commit is fine for this file-only change.

## Steps

### Step 1: Resolve full SHAs for the three existing actions

Look up the exact commit SHA each `@v4` tag currently resolves to for
`actions/checkout`, `pnpm/action-setup`, `actions/setup-node` (e.g. via
`gh api repos/actions/checkout/git/refs/tags/v4...` or the GitHub UI —
do NOT reuse react-email's SHAs blindly if they pin a *different* action
or a different major version than this repo currently uses; verify each
SHA resolves to the same major version already in use here). Replace each
`@v4` with `@<full-40-char-sha> # v4.x.y` (comment noting the human-readable
version, matching common SHA-pinning convention).

**Verify**: `grep -E "uses: .+@[0-9a-f]{40}" .github/workflows/ci.yml` → 3 matches (one per action).

### Step 2: Add `permissions`, `concurrency`, `timeout-minutes`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<sha> # v4.x.y
      - uses: pnpm/action-setup@<sha> # v4.x.y
      - uses: actions/setup-node@<sha> # v4.x.y
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm size
```

Pick a `timeout-minutes` value with headroom over the slowest observed
local run of the full command chain (time it locally first, don't guess).

**Verify**: YAML parses; `grep -E "^permissions:|^concurrency:|timeout-minutes:" .github/workflows/ci.yml` → all three present.

### Step 3: Split into parallel jobs

Split the single `ci` job into independent jobs that can run in parallel,
each with its own checkout/setup (or a shared setup via
`actions/cache`/reusable steps — pick whichever this repo's existing
Turbo setup makes easiest):

```yaml
jobs:
  lint:
    ...
    steps: [checkout, pnpm setup, node setup, install, pnpm lint]
  typecheck:
    ...
    steps: [checkout, pnpm setup, node setup, install, pnpm typecheck]
  test:
    ...
    steps: [checkout, pnpm setup, node setup, install, pnpm test]
  build:
    ...
    steps: [checkout, pnpm setup, node setup, install, pnpm build, pnpm size]
```

Each job needs its own `timeout-minutes` (lint/typecheck can be short,
e.g. 10; test/build may need more, e.g. 15-20 — base on locally-timed
runs). Keep `permissions: contents: read` at the top level (inherited by
all jobs, none need write access for CI-only checks).

**Verify**: `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(list(d['jobs'].keys()))"` → prints 4 job names.

## Test plan

- Push this branch and confirm all 4 jobs run and pass in the GitHub
  Actions UI (or equivalent CI runner) before merging.
- Confirm a second push to the same branch/PR cancels the first run's
  in-progress jobs (tests the `concurrency` block).
- Confirm each job's local-command equivalent (`pnpm lint`, etc.) passes
  standalone, matching CI's expectation.

## Done criteria

- [ ] All actions pinned to full 40-char SHAs with version comments
- [ ] `permissions: contents: read` at top level
- [ ] `concurrency` block with `cancel-in-progress: true`
- [ ] `timeout-minutes` set on every job
- [ ] CI split into ≥2 parallel jobs (lint/typecheck/test/build at minimum)
- [ ] A real CI run on the branch is green

## STOP conditions

- If splitting into parallel jobs would lose Turbo's incremental-build
  cache benefits within a single runner (Turbo cache is currently
  filesystem-local per job/runner, so splitting into separate jobs without
  a shared cache could make each job redo `pnpm install`+build work) —
  flag this as a real tradeoff and confirm with the operator whether
  Turbo remote caching (plan 010) should land *before* this split, rather
  than silently accepting slower CI.

## Maintenance notes

- Re-pin action SHAs periodically (Renovate/Dependabot can automate this
  if configured — see plan 022 for the broader dependency-pinning
  question, which is currently scoped to npm deps, not Actions; consider
  extending it).
