# Plan 003: Add Changesets-based release automation (canary + stable) modeled on react-email

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- .changeset .github/workflows package.json`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED — touches publish/release plumbing; a mistake here can publish a broken package to npm. Test on a scoped/private dry run before enabling real publish.
- **Depends on**: `plans/004-add-package-publish-metadata.md` (npm needs `repository`/`publishConfig` on every package before a real publish; do that first or land both together)
- **Category**: dependencies/release-process, direction (DIR-05)
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`uppy-oss-research.md:268` explicitly decided "canary pre-release mode
enabled from day one" (modeled on react-email's
`changeset pre enter canary` flow). Today: `.changeset/` holds only
`README.md` + `config.json` — no `pre.json` (canary mode never entered);
root `package.json` has only a `"changeset"` script, no `version`/
`release`/`publish` script; `.github/workflows/ci.yml` has no release job
at all. There is currently no path from a merged changeset to a published
package, canary or stable — this is a stated launch property that is
undelivered, and it directly blocks a real npm publish on launch day.

## Current state

- `.changeset/config.json` — exists, default Changesets config, no `pre.json`.
- Root `package.json` — scripts are `build`, `test`, `typecheck`, `lint`,
  `format`, `size`, `changeset` only (confirmed by direct read this audit).
- `.github/workflows/ci.yml` — single `ci` job, no release/publish workflow file exists anywhere in `.github/workflows/`.
- **react-email benchmark** (`/Users/vasanth/Codebase/autorender/react-email`), read directly this audit:
  - `.github/workflows/bump.yml`: triggered on push to a canary branch; uses
    `actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349`
    (full-SHA-pinned, GitHub App token instead of a PAT); sets
    `concurrency: ${{ github.workflow }}-${{ github.ref }}`; top-level
    `permissions: contents: write, pull-requests: write`; `timeout-minutes: 30`;
    runs `changesets/action@6a0a831ff30acef54f2c6aa1cbbc1096b066edaf` in
    canary/version-bump mode.
  - `.github/workflows/release.yml`: triggered on push to `main`/`canary`;
    top-level `permissions: contents: read` (least-privilege default), with
    the publish job escalating only what it needs at job level
    (`id-token: write` for npm OIDC "trusted publishing", `contents: write`
    for the release commit/tag); `concurrency` block; `timeout-minutes: 45`;
    runs `pnpm release` (a root script that runs `changeset publish`).
  - All actions are pinned to full commit SHAs, not tags (`@v4`-style), a
    supply-chain hardening pattern SEC-03/plan 006 also calls for in `ci.yml`.

## Commands you will need

| Purpose               | Command                              | Expected on success |
|------------------------|---------------------------------------|----------------------|
| Install                | `pnpm install`                        | exit 0               |
| Enter changeset (test) | `pnpm changeset`                      | prompts, writes a `.changeset/*.md` |
| Version (dry run)      | `pnpm changeset version --dry-run` (or without `--dry-run` on a scratch branch) | prints intended version bumps |
| Build                  | `pnpm build`                          | exit 0               |
| Publish (dry run)      | `npm publish --dry-run` per package, or `pnpm changeset publish --dry-run` if supported by the installed changesets version | shows what would be published, no actual publish |

## Scope

**In scope**:
- `.changeset/config.json` (add canary config if needed)
- New `.github/workflows/release.yml` and `.github/workflows/canary.yml` (or `bump.yml`, matching react-email's naming if the operator prefers parity)
- Root `package.json` (add `release`/`version` scripts)
- npm org/token setup is **out of this repo's diff** — document the required secret name(s) in the plan but do not attempt to create actual npm tokens or GitHub App credentials (that's an operator action, not a code change)

**Out of scope**:
- Publishing anything for real — this plan wires the automation; a human must review and trigger the first real publish.
- `create-mediadrop` CLI scaffolder (DIR-05's other half) — tracked separately, not part of this plan; do not build it here.
- Package metadata fields (`repository`, `homepage`, etc.) — that's plan 004; don't duplicate here, just depend on it.

## Git workflow

- Branch: `advisor/003-add-release-automation`
- Do NOT push tags or trigger an actual `npm publish` from this branch. Everything here is workflow/config wiring, verified via dry-run only.

## Steps

### Step 1: Decide and document npm trusted publishing vs. token

Confirm with whoever owns the npm org whether OIDC "trusted publishing"
(react-email's approach: job-level `id-token: write`, no long-lived
`NPM_TOKEN` secret) is set up for the `@mediadrop/*` org on npmjs.com. If
not yet configured there, the workflow can still be written now using a
classic `NPM_TOKEN` secret as a fallback — note this explicitly as a TODO
comment in the workflow file, and flag it in the PR description so the
operator can switch to OIDC once npm-side setup is done.

**Verify**: no command — this is a decision point; record the decision in the PR description before proceeding.

### Step 2: Add the release workflow

Create `.github/workflows/release.yml` modeled on react-email's, adapted:

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

permissions:
  contents: read

jobs:
  release:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@<pin-to-full-sha>
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@<pin-to-full-sha>
      - uses: actions/setup-node@<pin-to-full-sha>
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@<pin-to-full-sha>
        with:
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Pin every `uses:` to the exact same commit SHAs react-email uses where the
action is identical (`actions/checkout`, `actions/setup-node`,
`pnpm/action-setup`, `changesets/action`) — look them up from
`/Users/vasanth/Codebase/autorender/react-email/.github/workflows/release.yml`
directly rather than guessing a SHA.

**Verify**: `actionlint .github/workflows/release.yml` if available, or at minimum valid YAML (`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"`).

### Step 3: Add `release`/`version` scripts to root `package.json`

```json
"scripts": {
  "release": "changeset publish",
  "version": "changeset version"
}
```

**Verify**: `pnpm run release --dry-run` isn't a real flag for `changeset publish` — instead verify with `pnpm changeset publish --dry-run` directly, confirm it lists intended packages with no actual publish network call succeeding (or use `--no-git-tag`/a scratch npm registry if truly testing end-to-end; do not publish to the real npm registry from this step).

### Step 4: Enter canary pre-release mode

```bash
pnpm changeset pre enter canary
```

This writes `.changeset/pre.json`. Commit it. Add a `canary.yml` workflow
(or extend `release.yml` with a branch condition) that runs on pushes to a
`canary` branch, mirroring react-email's `bump.yml` (GitHub App token,
`changesets/action` in version-bump mode, same permissions/concurrency/
timeout pattern).

**Verify**: `cat .changeset/pre.json` shows `{"mode": "pre", "tag": "canary", ...}`.

## Test plan

- Dry-run `pnpm changeset version --dry-run` on a scratch branch with a
  throwaway changeset file, confirm it computes a sane version bump.
- Validate both new workflow YAML files parse and their `permissions`/
  `concurrency`/`timeout-minutes` blocks are present (grep-checkable).
- No live publish as part of this plan's verification — that is an
  operator-supervised follow-up once secrets are confirmed configured.

## Done criteria

- [ ] `.github/workflows/release.yml` exists with `permissions`, `concurrency`, `timeout-minutes` set, all actions SHA-pinned
- [ ] `.github/workflows/canary.yml` (or equivalent) exists for canary pushes
- [ ] `.changeset/pre.json` exists (canary mode entered)
- [ ] Root `package.json` has `release`/`version` scripts
- [ ] PR description explicitly states whether OIDC trusted publishing or `NPM_TOKEN` is used, and what secret(s) the operator must configure before the first real run
- [ ] No actual `npm publish` executed as part of this plan

## STOP conditions

- If the npm org/package names aren't finalized yet (blocking real publish
  configuration), stop after wiring the workflow and document the
  dependency rather than guessing package names.
- If `changesets/action` version compatibility with the installed
  `@changesets/cli` version is unclear, verify compatibility before wiring — don't guess a version pin.

## Maintenance notes

- Keep this workflow's action SHAs in sync manually or via Renovate/Dependabot once configured (see `plans/022-add-dependency-pinning-check.md`, which is about pinning `pnpm`/npm deps, not Actions — note the two are related but distinct maintenance surfaces).
- Revisit this plan once `create-mediadrop` (DIR-05's CLI half) exists, since a scaffolder is often published on the same cadence.
