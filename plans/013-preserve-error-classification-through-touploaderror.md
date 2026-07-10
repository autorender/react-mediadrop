# Plan 013: Preserve HTTP status / tus error code through toUploadError instead of collapsing every error to "upload-error"

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/core/src/upload-queue.ts packages/core/src/types.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — `MediaDropErrorCode` is a public, documented type; adding new codes (or a new field) to it is close to (but not quite, if done additively) a breaking API change. Consumers who exhaustively `switch` on `MediaDropErrorCode` today will need to handle new cases.
- **Depends on**: none
- **Category**: tech debt & architecture (originally scoped as "unify error construction convention"; re-scoped after direct verification to the more precise, higher-value bug below)
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Verified by direct read this audit, across `packages/core/src/errors.ts`,
`packages/core/src/retry.ts`, `packages/core/src/upload-queue.ts`,
`packages/tus/src/types.ts`, and every transport's error-throwing sites:

Three different, deliberate error-classification mechanisms exist in this
codebase:
1. `createHttpError(message, status)` (`retry.ts:42-46`) attaches an HTTP
   `status` to a plain `Error`, explicitly so callers "can branch on it" —
   its own doc comment says "every transport that makes an HTTP request
   should throw through this... so retry classification and error
   inspection work the same way everywhere."
2. `TusError` (`tus/src/types.ts:11-19`) attaches a typed `code` (one of
   `creation-failed`/`head-failed`/`patch-failed`/`offset-mismatch`/
   `aborted`, per plan 012) plus an optional `status`.
3. Plain `new Error("Upload aborted")` etc. for abort/stall cases across
   `xhr-upload`, `s3/simple.ts`, `s3/multipart.ts`, `tus/protocol.ts` —
   these carry no structured code at all, by design (aborts are handled
   by the upload queue via `controller.signal.aborted`, not by inspecting
   the error).

All three are then funneled through `upload-queue.ts`'s `toUploadError`
(lines 47-50):

```ts
function toUploadError(error: unknown): MediaDropError {
	const message = error instanceof Error ? error.message : String(error);
	return { code: "upload-error", message };
}
```

This discards `HttpError.status` and `TusError.code` entirely — every
single upload failure surfaced to a consumer via
`MediaDropFile.uploadError` has the exact same `code: "upload-error"`,
regardless of whether it was an HTTP 403 (permission denied — not
retryable, actionable), an HTTP 503 (transient — already retried per
`defaultShouldRetry`, but useful to know it was a 5xx if surfaced after
retries exhaust), or a tus `offset-mismatch` (a protocol-level anomaly
worth surfacing distinctly from a generic network failure). A consumer
building a "why did this fail" UI, or logging/telemetry that classifies
failure types, has no way to distinguish these today — the rich
classification `createHttpError`/`TusError` deliberately built is thrown
away at exactly the point it would be useful.

## Current state

- `packages/core/src/upload-queue.ts` lines 47-50 (`toUploadError`, shown above) — the single point where this information loss happens.
- `packages/core/src/types.ts` — `MediaDropErrorCode` union (defines the fixed set of codes `MediaDropError.code` can be; confirm the full existing union before adding to it, since this plan proposes new members).
- `packages/core/src/errors.ts` — `createError(code, message)`, the existing helper for building a `MediaDropError`; `toUploadError` should likely be rewritten in terms of this same helper for consistency, and to make the added cases discoverable alongside it.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Typecheck | `pnpm typecheck`                            | exit 0, all packages |
| Tests     | `pnpm test`                                 | all pass, all packages |

## Scope

**In scope**: `packages/core/src/upload-queue.ts`, `packages/core/src/types.ts`, `packages/core/src/upload-queue.test.ts`, and any `packages/*/README.md`/`skills/mediadrop/references/upload.md` that documents `MediaDropErrorCode`'s members (update docs to match, per the earlier docs-accuracy audit finding that these are currently accurate — keep them that way).

**Out of scope**:
- Changing `HttpError`/`TusError` themselves — they already carry the
  right information; this plan only stops `toUploadError` from discarding it.
- `plans/012-remove-dead-tus-error-code.md`'s handling of `"unsupported-version"` — independent change to the same `TusErrorCode` union (not `MediaDropErrorCode`); no conflict expected, but land in either order and re-check for merge conflicts if both are in flight simultaneously.

## Git workflow

- Branch: `advisor/013-preserve-error-classification`

## Steps

### Step 1: Decide the shape of the enriched `MediaDropError`

Two viable approaches:

- **(a) Add optional fields**: keep `code: "upload-error"` as the default
  for anything not otherwise classified, but add optional `status?: number`
  and/or `cause?: unknown` fields to `MediaDropError` so a consumer *can*
  inspect the original error's status/code without mediadrop needing to
  invent new top-level `MediaDropErrorCode` members for every transport's
  error taxonomy. This is the more additive, less consumer-breaking option.
- **(b) Add new MediaDropErrorCode members**: e.g. `"upload-http-error"`,
  `"upload-network-error"`, mapping `HttpError`/network errors to distinct
  codes. More structured, but grows the public union and is a bigger
  surface for consumers to handle.

Recommend (a) as the default — it's additive (an existing exhaustive
`switch` on `MediaDropErrorCode` still compiles, since no new code values
are introduced) and still solves the core problem (status/tus-code are no
longer silently dropped). Confirm this preference with the operator before
implementing, since it does still touch the public `MediaDropError` type
shape documented in `packages/core/README.md`.

**Verify**: no command — a design decision; document the choice in the PR description.

### Step 2: Implement the chosen approach

For (a):

```ts
function toUploadError(error: unknown): MediaDropError {
	const message = error instanceof Error ? error.message : String(error);
	const status = error instanceof Error && "status" in error
		? (error as { status?: number }).status
		: undefined;
	const tusCode = error instanceof Error && "code" in error && typeof (error as { code?: unknown }).code === "string"
		? (error as { code: string }).code
		: undefined;
	return {
		code: "upload-error",
		message,
		...(status !== undefined ? { status } : {}),
		...(tusCode !== undefined ? { cause: tusCode } : {}),
	};
}
```

(Exact field names/shape per the Step 1 decision — this is illustrative,
not prescriptive; confirm against the real `MediaDropError` type
definition and don't introduce a `cause` field if that name collides with
something else already in the type.) Update `MediaDropError`'s type in
`types.ts` to add these optional fields.

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0.

### Step 3: Add regression tests

In `upload-queue.test.ts`, add tests: a transport that rejects with
`createHttpError("Forbidden", 403)` → assert the resulting
`uploadError.status === 403`; a transport that rejects with
`new TusError("offset-mismatch", "...")` → assert the resulting error
preserves that code via whichever field Step 1 chose; a transport that
rejects with a bare `new Error("boom")` → assert it still produces
`{ code: "upload-error", message: "boom" }` with no extra fields (baseline
unchanged for the common case).

**Verify**: `pnpm --filter @mediadrop/core test -- upload-queue` → all pass, including new tests.

### Step 4: Update documentation

Check `packages/core/README.md` and `skills/mediadrop/references/upload.md`
(and `validation.md`, per the earlier docs audit's note that it
deliberately omits `upload-error` from its own list — don't touch that
file, it's out of scope by design) for any place `MediaDropError`'s shape
is documented, and add the new optional field(s).

**Verify**: re-read the updated doc section, confirm it matches the new type exactly.

## Test plan

- New tests in `upload-queue.test.ts` per Step 3 (HTTP-status preservation, tus-code preservation, baseline-unchanged case).
- Full `pnpm test` run to confirm no existing test asserts the old
  behavior (`code: "upload-error"` with *no* other fields) in a way that
  would now fail because extra optional fields are present — check
  existing assertions use something like `toEqual` (exact-match, would
  break) vs. `toMatchObject`/individual property checks (would tolerate
  additive fields) before assuming this is purely additive; fix any
  brittle exact-match assertions if found.

## Done criteria

- [ ] `toUploadError` preserves HTTP status and/or tus error code instead of discarding them
- [ ] `MediaDropError`'s type updated to include the new optional field(s)
- [ ] New regression tests pass; no existing test broken by the additive change
- [ ] Relevant README/skill docs updated to match
- [ ] No files outside scope modified

## STOP conditions

- If any existing test uses an exact-match assertion (`toEqual`) against
  a `MediaDropError` object that would now fail due to added optional
  fields, fix that test's assertion style rather than avoiding adding the
  fields — but if there are many such call sites, report the scope before
  proceeding, since it may be larger than this plan's Effort estimate assumed.

## Maintenance notes

- Any new transport package should throw via `createHttpError` (for HTTP
  errors) so this classification-preservation continues to work
  automatically; a transport that invents its own ad hoc error-tagging
  convention will not be picked up by `toUploadError` unless this plan's
  detection logic is extended to recognize it too.
