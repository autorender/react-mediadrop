# Plan 006: Add pnpm/npm supply-chain hardening — CI audit gate + automated dependency updates

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- .github/workflows/ci.yml package.json`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Verified directly this audit: there is no `.npmrc` anywhere in the repo, no
Renovate/Dependabot config (`renovate.json`, `.github/dependabot.yml`, etc.
— none found), and `.github/workflows/ci.yml` never runs `pnpm audit` (or
any vulnerability scan) as a gate. `pnpm install --frozen-lockfile` in CI
already guards against an unreviewed lockfile drift, which is good — but
there is no automated signal when a dependency (direct or transitive)
gets a newly-disclosed vulnerability after the fact, and no automated PR
flow to bump dependencies at all, meaning updates (including security
patches) only happen when a human remembers to run `pnpm outdated`
manually. `pnpm audit` run manually this audit returned "No known
vulnerabilities found" — a clean baseline, which is exactly when it's
cheapest to add a gate (nothing to fix first).

Cross-referencing react-email: it does not have a `.npmrc` either (so this
is not a react-email parity gap — react-email doesn't demonstrate that
particular practice), but it does have a full `renovate.json` (`extends:
["config:recommended"]`, grouped package rules for dev-deps/React
ecosystem/tooling/GitHub-integration libs, `vulnerabilityAlerts` grouped
as `"security updates"`). Mediadrop-internal has no equivalent — this part
of the finding is a genuine react-email-parity gap.

## Current state

- No `.npmrc` in repo root.
- No `renovate.json`/`.github/dependabot.yml` in repo root or `.github/`.
- `.github/workflows/ci.yml` steps: install (`--frozen-lockfile`), lint,
  typecheck, test, build, size — no audit step.
- `pnpm audit` run manually (read-only, no changes) this audit: clean, zero known vulnerabilities.
- `pnpm outdated -r` run manually this audit: 7 packages outdated (see
  `plans/README.md`'s rejected-findings section for why bumping them isn't
  separately planned here — that's DEP-03, a "not worth doing right now"
  verdict, distinct from this plan's automation focus).

## Commands you will need

| Purpose      | Command            | Expected on success |
|---------------|----------------------|----------------------|
| Audit         | `pnpm audit`        | exit 0, "No known vulnerabilities found" (today's baseline) |
| Outdated      | `pnpm outdated -r`  | lists current drift (informational) |

## Scope

**In scope**: `.github/workflows/ci.yml` (add an audit step), new
`renovate.json` at repo root.

**Out of scope**:
- Actually bumping any of the 7 currently-outdated packages — that's a
  separate, rejected-for-now item (DEP-03, see README).
- GitHub Actions SHA-pinning — plan 005.
- `.npmrc` settings like `ignore-scripts` — evaluated below in Step 1 and
  intentionally left out unless it doesn't break any package's legitimate
  postinstall (verify before adding, don't add blind).

## Git workflow

- Branch: `advisor/006-add-pnpm-supply-chain-hardening`

## Steps

### Step 1: Evaluate (don't blindly add) an `.npmrc` with `ignore-scripts=true`

Check whether any dependency in the tree relies on a `postinstall`/
`preinstall` script for correct operation (native bindings, etc.) — for a
small ESM TS monorepo with no native deps this is likely safe, but verify:

```bash
pnpm list -r --depth Infinity 2>/dev/null | wc -l  # sanity: dep tree size
grep -rl "\"postinstall\"\|\"preinstall\"" node_modules/*/package.json 2>/dev/null | wc -l
```

If the count of packages with install scripts is non-trivial, decide
whether an allowlist (`pnpm.onlyBuiltDependencies` in root `package.json` —
pnpm's modern replacement for blanket `ignore-scripts`) is safer than a
global `ignore-scripts=true`, which can silently break legitimate native
builds. Record the decision; do not add `ignore-scripts=true` if it breaks
`pnpm install`.

**Verify**: `pnpm install --frozen-lockfile` still succeeds after any `.npmrc`/`pnpm.onlyBuiltDependencies` change.

### Step 2: Add a `pnpm audit` gate to CI

In `.github/workflows/ci.yml` (or the split `lint`/similar job if plan 005
has already landed), add:

```yaml
- run: pnpm audit --audit-level=high
```

Choose `--audit-level` deliberately (e.g. `high` to avoid noisy low-severity
transitive-dep alerts blocking merges) and document the choice in the PR.
Note: `pnpm audit` can fail on transient registry issues; if that proves
flaky in practice, consider `continue-on-error: true` with a separate
notification path rather than blocking merges — but start strict and relax
only if flakiness is actually observed, don't preemptively weaken it.

**Verify**: push a branch, confirm the new step runs and passes against
today's clean baseline.

### Step 3: Add `renovate.json`

Add a `renovate.json` at repo root, adapted from react-email's (do not
copy verbatim without reviewing which package groups actually apply here —
mediadrop-internal has no Next.js/React-heavy dependency surface the way
react-email does):

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "rebaseWhen": "never",
  "vulnerabilityAlerts": {
    "groupName": "security updates"
  },
  "packageRules": [
    {
      "description": "Group routine non-major dev-only updates to reduce PR noise.",
      "matchDepTypes": ["devDependencies"],
      "matchUpdateTypes": ["minor", "patch", "pin", "digest"],
      "groupName": "dev dependency updates"
    },
    {
      "description": "Keep build, test, and release tooling together.",
      "matchPackageNames": ["@biomejs/**", "@changesets/**", "tsdown", "@tsdown/**", "turbo", "typescript", "vite", "vitest"],
      "matchUpdateTypes": ["minor", "patch", "pin", "digest"],
      "groupName": "tooling updates"
    }
  ]
}
```

Requires the operator to enable the Renovate GitHub App on the repo
(outside this plan's diff — cannot be verified by a command, note it in
the PR description as a manual follow-up).

**Verify**: `python3 -c "import json; json.load(open('renovate.json'))"` → no error. Actual Renovate bot activity can't be verified until the app is installed on the repo — note this as a follow-up, not a done-criterion this plan can self-certify.

## Test plan

- CI run on the branch shows the new `pnpm audit` step passing.
- `renovate.json` validates as JSON and against Renovate's schema (if a
  local validator is available; otherwise Renovate's own dry-run / config
  validator action can be added as a stretch goal, not required here).

## Done criteria

- [ ] `.github/workflows/ci.yml` runs `pnpm audit --audit-level=<chosen level>`
- [ ] `renovate.json` exists and is valid JSON
- [ ] `pnpm install --frozen-lockfile` still succeeds (confirms no `.npmrc` change broke installs, if Step 1 resulted in a change)
- [ ] PR description notes that enabling the Renovate GitHub App itself is a manual operator follow-up

## STOP conditions

- If `pnpm audit --audit-level=high` would currently fail (i.e. a
  vulnerability appears between when this plan was written and when it's
  executed), do not just raise the threshold to make it pass silently —
  report the finding and let the operator decide whether to fix or
  explicitly accept the risk.

## Maintenance notes

- Revisit the `--audit-level` threshold periodically; a dependency's
  disclosed-but-unpatched vulnerability at "moderate" severity might
  eventually warrant tightening the gate.
