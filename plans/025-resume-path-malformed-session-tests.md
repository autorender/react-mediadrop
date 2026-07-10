# Plan 025: Add malformed/tampered resumable-session test coverage

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/s3/src/multipart.ts packages/s3/src/multipart.test.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW — test-only, though findings from this work may motivate a follow-up production-code hardening plan if a real gap is confirmed (see STOP conditions).
- **Depends on**: none
- **Category**: test coverage (may surface a correctness/bugs finding as a byproduct — see below)
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Confirmed by direct inspection this audit: `packages/s3/src/multipart.test.ts`
(around line 478) only exercises the resume path with well-formed,
internally-consistent stored session metadata (matching fingerprint,
plausible part/offset data). There is no test for a resumed session whose
stored metadata is malformed or inconsistent with the file actually being
resumed — e.g. a stored `uploadId` for an S3 multipart upload that no
longer exists server-side (expired/aborted out-of-band), a stored parts
list whose byte ranges don't sum to the current file's actual size
(could happen if a browser's `localStorage`/`MediaDropUploadSessionStore`
implementation returns stale data from a previous version of the file, or
if a consumer's custom session store has a bug), or simply corrupted JSON
in a custom store implementation. The resume path
(`packages/s3/src/multipart.ts` per the earlier audit, ~line 478) appears
to trust stored metadata without a consistency check against the file
actually being resumed. This test gap means nobody knows today whether
that's actually safe (e.g. does it gracefully fall back to a fresh
upload, or does it crash / silently corrupt / hang?) — this plan's first
job is to find out via tests, and only propose a production-code fix if
the tests reveal a real problem.

## Current state

- `packages/s3/src/multipart.ts` — resume-path logic (~line 478 per this audit's earlier read) reads stored session metadata and resumes from it; exact trust/validation behavior needs re-confirming line-by-line as part of Step 1 below, since this plan's job is partly investigative.
- `packages/s3/src/multipart.test.ts` — existing resume tests only use well-formed metadata.
- `packages/core/src/types.ts` — `MediaDropUploadSessionStore` interface (the pluggable storage contract resumable transports use) — confirm its exact shape before writing fixtures that implement a custom, deliberately-malformed store.

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|--------------------------------------------------|----------------------|
| Install   | `pnpm install`                                   | exit 0               |
| Tests     | `pnpm --filter @mediadrop/s3 test -- multipart`  | all pass             |

## Scope

**In scope**: `packages/s3/src/multipart.test.ts` (new tests);
`packages/tus/src/tus-upload.test.ts` if tus has an analogous
resume-from-stored-session path (confirm before assuming parity —
tus's protocol has its own resume mechanism via `HEAD` requests to the
server, which may be inherently more self-correcting than S3's
client-trusts-stored-metadata model, since the server's own reported
offset is authoritative rather than the client's stored guess).

**Out of scope**: fixing any discovered issue in production code — that
becomes a new, separate plan if this investigation finds one (see STOP
conditions); this plan's primary deliverable is the test coverage and
the finding, not necessarily a shipped fix.

## Git workflow

- Branch: `advisor/025-resume-path-malformed-session-tests`

## Steps

### Step 1: Re-read the resume path in full, and characterize current behavior precisely

Read `packages/s3/src/multipart.ts`'s resume logic end-to-end, tracing
exactly what it does with stored `uploadId`/`parts`/offsets: does it
validate the stored part list's total bytes against the current file's
`size` before trusting it? Does it call S3's `ListParts` (or equivalent)
to confirm the `uploadId` is still valid server-side before resuming, or
does it just optimistically PATCH/PUT the next part and handle whatever
error S3 returns if the upload ID is gone?

**Verify**: no command — a close-reading step; write down the exact current behavior before writing tests, so the tests describe reality rather than assumptions.

### Step 2: Write tests for each identified malformed-input case

At minimum:
- Stored `uploadId` that the mock S3 endpoint responds to with a 404 (upload no longer exists) — assert the library either falls back cleanly to starting a new upload, or surfaces a clear, typed error — whichever Step 1 found is the actual intended behavior, and assert that (not an idealized one).
- Stored parts list whose summed byte length doesn't match the current file's `size` — assert current behavior (may reveal it silently resumes from a wrong offset, which would be a real bug).
- Stored fingerprint that doesn't match the current file's fingerprint — confirm existing behavior already handles this correctly (per this being the *documented* purpose of fingerprinting) and add a regression test if none exists yet for this specific case.

**Verify**: `pnpm --filter @mediadrop/s3 test -- multipart` → new tests pass, documenting (not necessarily endorsing) current behavior.

### Step 3: Evaluate whether any discovered behavior is a real bug worth fixing now

If Step 2 reveals a case where malformed metadata causes silent
corruption (wrong byte range resumed, no error surfaced) rather than a
clean fallback/clear error, flag this explicitly.

**Verify**: no command — a judgment call, documented in the PR description with specific repro steps from Step 2's tests.

## Test plan

- New tests per Step 2, all passing (whether they document safe fallback
  behavior or, if found, an actual gap).
- If Step 3 finds a real gap, this plan's PR should include a clear
  written recommendation (not necessarily an implemented fix) for a
  follow-up plan, e.g. "add a stored-parts-length vs. file-size
  consistency check before trusting a resume, falling back to a fresh
  upload on mismatch."

## Done criteria

- [ ] Resume-path behavior traced and documented for each malformed-input scenario in Step 1/2
- [ ] New tests added covering each scenario, passing against current behavior
- [ ] If a real correctness gap is found, it's clearly flagged in the PR with a specific recommendation for follow-up (new plan number, not implemented here)
- [ ] No files outside scope modified

## STOP conditions

- If Step 2 confirms silent data corruption is possible (a resumed
  upload proceeds from a wrong-but-plausible-looking offset with no
  error), stop before considering this plan "done" in the sense of "no
  further action needed" — this would be a genuine, higher-priority
  correctness bug and should be escalated (new plan, higher priority
  than this one) rather than just documented and left as-is.

## Maintenance notes

- Any future resumable transport (a hypothetical `@mediadrop/gcs` or
  similar) should be tested against this same set of malformed-metadata
  scenarios from day one.
