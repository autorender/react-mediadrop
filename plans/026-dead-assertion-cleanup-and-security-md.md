# Plan 026: Fix a meaningless test assertion; add SECURITY.md and issue/PR templates

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/xhr-upload/src/index.test.ts SECURITY.md .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: test coverage (Part A), docs (Part B — combined here since both are small, unrelated cleanups not worth separate plan files)
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

**Part A**: `packages/xhr-upload/src/index.test.ts:300` (confirmed by
direct read this audit) contains an assertion on a `"fieldId"` value that
doesn't actually verify meaningful behavior — the test passes regardless
of whether the real underlying logic it's meant to guard is correct,
making it a false-confidence assertion (a test that always passes
provides worse signal than no test at all, since it looks like coverage
without providing any). This should be corrected to assert the actual
behavior it appears to have been intended to check, or removed if it
turns out no meaningful assertion is possible/needed at that point in the
test.

**Part B**: Confirmed by direct inspection this audit: no `SECURITY.md`,
no `.github/ISSUE_TEMPLATE/`, no `.github/PULL_REQUEST_TEMPLATE.md`
exist anywhere in the repo. `CONTRIBUTING.md` (confirmed, lines 30-32)
explicitly defers these as future/deliberately-out-of-scope-for-now —
this is not an oversight, it's a documented decision. This plan adds
them anyway as a small, low-cost improvement now that the project has
matured somewhat (per the broader release-readiness push this audit's
plans collectively represent, e.g. `plans/003`/`plans/004`'s publish
automation) — cross-referencing `react-email` (confirmed via directory
listing) for structure/tone precedent, since it has both a
`SECURITY.md` and issue templates already.

## Current state

- `packages/xhr-upload/src/index.test.ts` line 300 — the specific assertion, needs re-reading in full context (a few lines before/after) to determine correct intended behavior before fixing.
- Repo root — no `SECURITY.md`, no `.github/ISSUE_TEMPLATE/`, no `.github/PULL_REQUEST_TEMPLATE.md` (confirmed absent).
- `CONTRIBUTING.md` lines 30-32 — the explicit prior deferral of these files; this plan should update that section once the files are added, so the docs don't contradict reality.

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|-------------------------------------------------------|----------------------|
| Install   | `pnpm install`                                       | exit 0               |
| Tests     | `pnpm --filter @mediadrop/xhr-upload test`           | all pass             |

## Scope

**In scope**: `packages/xhr-upload/src/index.test.ts` (the one
assertion and its surrounding test, Part A); new `SECURITY.md`,
`.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`,
`.github/PULL_REQUEST_TEMPLATE.md` (Part B); `CONTRIBUTING.md`'s lines
30-32 (update to reflect these are now added, not deferred).

**Out of scope**: any other test file's assertions — this plan fixes the
one specifically identified instance, not a general assertion-quality
audit (no other meaningless assertions were found elsewhere in this
audit's test-coverage pass).

## Git workflow

- Branch: `advisor/026-dead-assertion-cleanup-and-security-md`

## Steps

### Step 1: Re-read and fix the meaningless assertion

Read `packages/xhr-upload/src/index.test.ts` around line 300 in full
context (the whole `test(...)` block it belongs to) to understand what
behavior it was meant to verify, then either strengthen the assertion to
actually check that behavior, or remove the assertion (and, if it turns
out the surrounding test no longer checks anything meaningful without
it, remove the whole test and note in the PR why) — do not just delete
it silently without understanding what it was attempting to guard.

**Verify**: `pnpm --filter @mediadrop/xhr-upload test` → all pass, including the corrected/removed assertion; confirm via a deliberate temporary regression (break the real behavior locally, confirm the strengthened test now fails, then revert) that it's now load-bearing.

### Step 2: Add SECURITY.md

Model on `react-email`'s `SECURITY.md` structure (confirm its actual
current content via direct read before copying any specifics — don't
invent contact details/process steps that don't match this project's
real reporting channel). Cover: supported versions, how to report a
vulnerability (email/private channel — confirm the right contact with
the operator, don't guess), expected response timeline if known.

**Verify**: file exists, reads coherently, doesn't reference any
placeholder/fake contact info — flag to the operator if a real security
contact address needs to be supplied.

### Step 3: Add issue and PR templates

`.github/ISSUE_TEMPLATE/bug_report.md` and `feature_request.md` (basic
structure: reproduction steps, expected/actual behavior, environment for
bugs; motivation/proposed API for features); `.github/PULL_REQUEST_TEMPLATE.md`
(summary, related issue, test plan checklist — mirroring this very
plan-template's own "Test plan"/"Done criteria" spirit, kept lighter for
a PR description).

**Verify**: templates render correctly when starting a new issue/PR on GitHub (visually confirm in the GitHub UI on the branch, or at minimum confirm the file paths exactly match GitHub's expected convention: `.github/ISSUE_TEMPLATE/*.md` with front-matter `name`/`about`, `.github/PULL_REQUEST_TEMPLATE.md` singular file).

### Step 4: Update CONTRIBUTING.md's deferral note

Update lines 30-32 (or wherever they end up after Step 2/3's additions
land) to reflect these files now exist, removing the "deferred" framing.

**Verify**: re-read the updated section, confirm no remaining contradiction with reality.

## Test plan

- `packages/xhr-upload` test suite passes with the corrected/removed assertion, proven load-bearing via a temporary local regression (Step 1).
- Templates visually confirmed correct in GitHub's UI.

## Done criteria

- [ ] The `"fieldId"` assertion at `index.test.ts:300` fixed to be meaningful, or removed with justification
- [ ] `SECURITY.md` added with real (operator-confirmed) reporting contact
- [ ] Issue and PR templates added
- [ ] `CONTRIBUTING.md` updated to stop deferring these
- [ ] No files outside scope modified

## STOP conditions

- If no real security-contact channel exists yet (e.g. no dedicated
  security email), stop and ask the operator rather than inventing one
  — a `SECURITY.md` with a fake or unmonitored contact is worse than
  none, since it creates false expectations for a reporter.

## Maintenance notes

- None beyond keeping `CONTRIBUTING.md` in sync if these files' locations or content structure change later.
