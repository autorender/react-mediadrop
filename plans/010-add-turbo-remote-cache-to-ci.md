# Plan 010: Enable Turborepo remote caching in CI

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- .github/workflows/ci.yml turbo.json`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/005-harden-and-restructure-ci-workflow.md` (if that plan splits `ci.yml` into multiple jobs, wire remote caching after that split so every job benefits, not just the pre-split single job)
- **Category**: performance, DX & tooling
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`.github/workflows/ci.yml` (confirmed by direct read) runs `pnpm build`
(which runs `turbo run build` per the repo's Turborepo setup) with no
Turbo remote cache configured — every CI run rebuilds every package from
scratch, even when a given package's inputs haven't changed since the
last run on `main`. Turborepo's whole selling point is skipping unchanged
work via its cache; without remote caching, CI never benefits from this —
only local developer machines get any caching (and only within a single
checkout's `.turbo` directory, which CI runners don't persist between
runs by default).

## Current state

- `.github/workflows/ci.yml` — no `TURBO_TOKEN`/`TURBO_TEAM` env vars, no
  cache-restore step for `.turbo` between runs.
- Turborepo is already the task runner (`turbo run build`/`test`/etc. per
  root `package.json` scripts, confirmed in prior reads this audit).

## Commands you will need

| Purpose        | Command                                | Expected on success |
|-----------------|------------------------------------------|----------------------|
| Local build     | `pnpm build`                             | exit 0, confirms Turbo task graph still runs |
| Turbo cache check | `turbo run build --dry-run` or `--summarize` | shows cache-hit/miss status per task |

## Scope

**In scope**: `.github/workflows/ci.yml` (add `TURBO_TOKEN`/`TURBO_TEAM`
env + optionally an `actions/cache` step for `.turbo` as a fallback if
Vercel Remote Cache isn't the chosen backend).

**Out of scope**: choosing which remote-cache backend (Vercel's hosted
Remote Cache vs. a self-hosted one) — that's a decision the operator must
make (it may involve a paid plan or new infra); this plan documents the
wiring pattern for whichever is chosen, but does not procure the backend.

## Git workflow

- Branch: `advisor/010-add-turbo-remote-cache-to-ci`

## Steps

### Step 1: Decide the remote-cache backend with the operator

Options: (a) Vercel Remote Cache (built into `turbo`, needs a Vercel
account/token), (b) a self-hosted cache server, (c) skip remote caching
entirely and instead just persist `.turbo`/`node_modules/.cache` via
`actions/cache` keyed on the lockfile hash — cheaper to set up, weaker
guarantee (only helps repeat runs on the same branch, not cross-branch).
Record the decision; this plan assumes (a) or (c) below since they need
no new backend to be running.

**Verify**: no command — a documented decision in the PR description.

### Step 2 (if Vercel Remote Cache): add token/team env vars

```yaml
      - run: pnpm build
        env:
          TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
          TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

Document in the PR that `TURBO_TOKEN` must be added as a repo/org secret
by the operator — this plan cannot create that secret itself.

**Verify**: push a branch with a dummy no-op change, confirm the `turbo`
CLI output in the CI log shows "Remote caching enabled" (or equivalent)
rather than "Remote caching disabled".

### Step 2 (alternative, if skipping Vercel): cache `.turbo` via `actions/cache`

```yaml
      - uses: actions/cache@<full-sha> # v4.x.y
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-
```

Place this step after checkout/install and before `pnpm build`/`pnpm test`.

**Verify**: on a second CI run with no source changes since the first, confirm the build/test steps show Turbo cache hits in the log (`>>> FULL TURBO` or similar marker Turbo prints on a cache hit).

### Step 3: Confirm cache correctness, not just speed

However caching is wired, confirm a run with an actual source change
still rebuilds the changed package (cache miss for that package,
cache hit for unrelated ones) — the risk with any caching layer is stale
output being served for changed code. Test this explicitly: touch one
file in `packages/core`, confirm `packages/react` (which depends on it)
also invalidates correctly per Turbo's dependency graph, not just the
touched package itself.

**Verify**: manual CI log inspection across two runs (before/after a
targeted source change) showing the expected hit/miss pattern.

## Test plan

- Two consecutive CI runs with no source changes between them: second run
  should show cache hits and complete meaningfully faster.
- One CI run with a change isolated to a single package: only that
  package and its dependents should show cache misses.

## Done criteria

- [ ] CI build/test steps have remote-cache (or `actions/cache`-backed) wiring
- [ ] A no-change re-run demonstrably hits cache (log evidence)
- [ ] A targeted-change re-run demonstrably invalidates only the affected packages
- [ ] PR description states the chosen backend and any operator follow-up (e.g. creating a `TURBO_TOKEN` secret)

## STOP conditions

- If the operator hasn't decided on a remote-cache backend and no
  Vercel/Turbo account exists yet, stop after Step 1 and hand off the
  decision rather than provisioning an account or picking one unilaterally.

## Maintenance notes

- If `plans/005` later re-splits `ci.yml` into more jobs, ensure the cache
  step is duplicated (or shared via a reusable workflow) across all of
  them, not just the first.
