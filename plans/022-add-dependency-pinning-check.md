# Plan 022: Add a CI check that fails on unpinned/floating production dependency ranges

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- .github/workflows/ci.yml packages/*/package.json`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/006-add-pnpm-supply-chain-hardening.md` (same general "supply chain hygiene" theme; can land independently, but review together since both touch dependency-management CI gates)
- **Category**: dependencies & migrations
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

This library's own architecture principle is "zero runtime deps" for
`@mediadrop/core` and minimal deps for every transport package — a
principle worth protecting not just at "zero deps" but at "the deps that
do exist can't silently float to an unreviewed new major/minor version."
Today there is no CI check preventing a contributor from adding a new
dependency with a wide-open range (e.g. `"^1.0.0"` when a narrower pin
would do, or worse, a range with no lower bound like `"*"`) — nothing
catches this at review time beyond a human noticing during code review.
For a small-dependency-count library where every dependency addition is
already meant to be a deliberate, scrutinized decision (implied by
`CONTRIBUTING.md`'s framing, per the earlier audit), an automated check
is cheap insurance against an unreviewed wide-range dependency creeping
in.

## Current state

- No existing CI step checks dependency range strictness.
- `packages/*/package.json` — dependency counts and ranges not
  exhaustively re-audited in this plan; the check this plan adds will
  surface any current outliers as part of its first run, which the
  operator should review before merging (may require a follow-up commit
  to tighten any range this new check flags).

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |

## Scope

**In scope**: a small script (e.g. `scripts/check-dependency-ranges.mjs`)
run in CI, checking every `packages/*/package.json`'s `dependencies` (not
`devDependencies` — dev tooling can reasonably float more loosely) for
disallowed range prefixes (`*`, `x`, empty/any, or optionally disallowing
bare `^`/`~` in favor of exact pins, depending on the policy the operator
prefers — see Step 1).

**Out of scope**: `devDependencies`, `examples/*` (dev-only, not published).

## Git workflow

- Branch: `advisor/022-add-dependency-pinning-check`

## Steps

### Step 1: Decide the exact policy with the operator

Options, from loosest to strictest:
- **(a) Ban only wide-open ranges** (`*`, `x`, empty string) — catches
  the worst case, allows normal semver `^`/`~` ranges.
- **(b) Require exact pins** (no `^`/`~` at all) for production
  `dependencies` — matches the "every dependency addition is a
  deliberate decision" framing most strictly, but is more maintenance
  overhead (each dependency bump needs an explicit PR rather than
  floating within semver automatically, though Renovate — see
  `plans/006` — handles that automatically anyway if adopted).

Given `plans/006` already proposes adopting Renovate (which makes exact
pins low-maintenance, since Renovate opens the bump PR automatically),
recommend (b) if `plans/006` is adopted, or (a) as a standalone
lighter-weight guard if it isn't. Confirm with the operator; this plan
defaults to (a) as the safer, less coupled default.

**Verify**: no command — a policy decision, documented in the PR.

### Step 2: Write the check script

```js
// scripts/check-dependency-ranges.mjs
import { readFileSync, readdirSync } from "node:fs";

const BANNED = [/^\*$/, /^x$/i, /^$/];
let failed = false;

for (const pkg of readdirSync("packages")) {
	const pkgJsonPath = `packages/${pkg}/package.json`;
	let pkgJson;
	try {
		pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
	} catch {
		continue;
	}
	for (const [dep, range] of Object.entries(pkgJson.dependencies ?? {})) {
		if (BANNED.some((re) => re.test(range))) {
			console.error(`${pkgJsonPath}: dependency "${dep}" has an unpinned/wide-open range "${range}"`);
			failed = true;
		}
	}
}

if (failed) process.exit(1);
console.log("All production dependency ranges OK.");
```

(Adjust `BANNED` patterns if policy (b) from Step 1 is chosen — add a
check that the range doesn't start with `^`/`~`.)

**Verify**: `node scripts/check-dependency-ranges.mjs` → exits 0 today (confirm current deps already pass; if any package currently has a banned pattern, fix that package's range as part of this same PR before adding the enforcing CI step, so CI doesn't immediately go red on merge).

### Step 3: Wire into CI

```yaml
      - name: Check dependency ranges
        run: node scripts/check-dependency-ranges.mjs
```

**Verify**: push a branch, confirm the step runs and passes.

## Test plan

- Local dry run (Step 2's Verify) against current `package.json` files — must pass before this ships (fix any pre-existing violation first).
- Manual negative test: temporarily set one dependency's range to `"*"`, confirm the script exits 1 with a clear message identifying the offending package/dependency; revert before committing.

## Done criteria

- [ ] Policy (a) or (b) decided and documented
- [ ] Check script added, passes against current dependency ranges
- [ ] CI step wired and passing
- [ ] Manual negative test confirms it catches a real violation
- [ ] No files outside scope modified

## STOP conditions

- If Step 2's initial dry run reveals an existing dependency with a
  banned range, do not silently loosen the check to accommodate it —
  fix that package's range (bump to a specific, reviewed version) as
  part of this same change, then add the enforcing check.

## Maintenance notes

- If `plans/006`'s Renovate adoption lands later, revisit whether policy
  (b)'s stricter exact-pin requirement becomes worth adopting, now that
  bump PRs are automated rather than manual.
