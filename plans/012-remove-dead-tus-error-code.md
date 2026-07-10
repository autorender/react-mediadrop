# Plan 012: Remove (or implement) the dead `"unsupported-version"` TusErrorCode

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/tus/src/types.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — either removing an unused type-union member or adding one small version-check codepath; both are small and low-risk.
- **Depends on**: none
- **Category**: tech debt & architecture
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`packages/tus/src/types.ts` declares `TusErrorCode` as a union including
`"unsupported-version"`. Verified by direct grep this audit:
`grep -rn "unsupported-version" packages/tus/src/` returns exactly one
match — the type declaration itself in `types.ts:8`. It is never
constructed anywhere (`new TusError("unsupported-version", ...)` doesn't
appear in `protocol.ts` or `tus-upload.ts`). This is dead code: a
consumer who writes an exhaustive `switch` over `TusErrorCode` (a
reasonable, even encouraged, pattern for a discriminated-union-shaped
error type) is forced to handle a case that can structurally never occur,
and anyone reading the type signature reasonably infers a
version-mismatch check exists somewhere in the client, when it doesn't —
the tus server's own `Tus-Version`/`Tus-Resumable` negotiation is not
currently validated client-side at all.

## Current state

- `packages/tus/src/types.ts` — `TusErrorCode` union, `"unsupported-version"` member (line 8).
- `packages/tus/src/protocol.ts` — reads `TUS_RESUMABLE` constant (`"1.0.0"`), sends it as the `Tus-Resumable` header on every request, but never inspects the *server's* response `Tus-Resumable` header to confirm it matches (`createUpload`/`headUpload`/`patchChunk` all check `result.status` ranges and specific headers like `Location`/`Upload-Offset`, but none check `result.getHeader("Tus-Resumable")` against `TUS_RESUMABLE`).

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/tus typecheck`     | exit 0               |
| Tests     | `pnpm --filter @mediadrop/tus test`          | all pass             |

## Scope

**In scope**: `packages/tus/src/types.ts`, `packages/tus/src/protocol.ts`, `packages/tus/src/protocol.test.ts`.

**Out of scope**: `packages/tus/src/tus-upload.ts` — no change needed there under either resolution below.

## Git workflow

- Branch: `advisor/012-remove-dead-tus-error-code`

## Steps

### Step 1: Decide — remove the dead code, or implement the missing check

Two valid resolutions; pick with the operator/reviewer rather than
unilaterally:

- **(a) Remove**: delete `"unsupported-version"` from `TusErrorCode`. Simplest, matches "the client doesn't currently do version negotiation, so don't claim it does."
- **(b) Implement**: add a check in each of `createUpload`/`headUpload`/`patchChunk` (`protocol.ts`) that reads the response's `Tus-Resumable` header and throws `new TusError("unsupported-version", ...)` if it doesn't match `TUS_RESUMABLE`. This is a genuine, if minor, protocol-robustness improvement (a server running an incompatible tus version would otherwise fail with a more confusing downstream error, or silently misbehave).

Given this repo's tus client is explicitly "small, dependency-free,
covering only the core protocol flow" (per its own doc comment), (a) is
the lower-effort, more conservative choice and is the default unless the
operator prefers (b) for extra protocol robustness. Default to (a) if
no preference is stated in review.

### Step 2a (if removing): delete the dead union member

```ts
export type TusErrorCode =
	| "creation-failed"
	| "head-failed"
	| "patch-failed"
	| "offset-mismatch"
	| "aborted";
```

**Verify**: `pnpm --filter @mediadrop/tus typecheck` → exit 0 (confirms nothing referenced the removed member). `grep -rn "unsupported-version" packages/tus/` → no matches.

### Step 2b (if implementing): add the version check

In each of `createUpload`, `headUpload`, `patchChunk` (`protocol.ts`),
after receiving `result` from `sendXhr`/`sendXhr`-equivalent, before
checking status:

```ts
const serverVersion = result.getHeader("Tus-Resumable");
if (serverVersion !== null && serverVersion !== TUS_RESUMABLE) {
	throw new TusError(
		"unsupported-version",
		`tus server responded with unsupported version "${serverVersion}" (expected "${TUS_RESUMABLE}")`,
	);
}
```

(Only throw when the header is present but mismatched — a missing header
entirely may be a lenient/non-conforming-but-otherwise-fine server;
treat that leniently rather than failing, matching this client's overall
"cover the core protocol flow" pragmatism.)

**Verify**: `pnpm --filter @mediadrop/tus typecheck` → exit 0. Add a test in `protocol.test.ts`: mock server response with a mismatched `Tus-Resumable` header, assert `TusError` with code `"unsupported-version"` is thrown.

## Test plan

- If (a): confirm no test references the removed union member; full test suite for `@mediadrop/tus` passes unchanged.
- If (b): new test per function (`createUpload`/`headUpload`/`patchChunk`) covering the mismatched-version-header case, plus confirm existing tests (which presumably don't set a `Tus-Resumable` response header, or set a matching one) still pass unchanged.

## Done criteria

- [ ] Either the dead union member is removed, or a working version check is added and tested
- [ ] `pnpm --filter @mediadrop/tus typecheck` and `test` exit 0
- [ ] No files outside scope modified

## STOP conditions

- If choosing (b) and the mock test server fixture used across
  `protocol.test.ts` doesn't currently set a `Tus-Resumable` response
  header at all, adding the check might break every existing test unless
  the fixture is updated too — if that ripple is larger than expected,
  stop and reconsider defaulting to (a) instead.

## Maintenance notes

- If (a) is chosen now and version-negotiation robustness becomes wanted
  later, this plan's (b) steps are a ready-made reference for implementing it then.
