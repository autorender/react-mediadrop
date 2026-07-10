# Plan 008: Guard session-store's set/remove against storage write failures

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/core/src/session-store.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`packages/core/src/session-store.ts` (95 lines, confirmed by direct read
this audit): `get()` wraps its `JSON.parse` in a try/catch (lines 77-81) to
handle corrupted stored JSON gracefully. `set()` and `remove()` (lines
83-93) call `storage.setItem`/`storage.removeItem` with **no** try/catch.
`localStorage.setItem` throws in real, non-exotic conditions — most
commonly `QuotaExceededError` when storage is full (Safari private
browsing mode throws on essentially every `setItem` call; a full quota is
reachable in normal browsing too). Because `tus-upload.ts`'s `persist()`
(confirmed by direct read: `await sessionStore.set(sessionKey, {...})`,
called after every chunk) and the equivalent path in `@mediadrop/s3`
both `await` this call inside their upload loop with no surrounding
try/catch of their own, an uncaught `setItem` throw propagates up through
the transport's `upload()` promise as an unhandled rejection distinct from
(and misleading relative to) an actual network/upload failure — the user
sees an upload fail with a storage-quota error dressed up as an upload
error, and resumability (the entire point of persisting the session) may
silently never have worked without any dedicated signal.

## Current state

`packages/core/src/session-store.ts` lines 77-93 (from prior direct read
this audit):

```ts
async get(key: string): Promise<unknown> {
	// ...
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

async set(key: string, value: unknown): Promise<void> {
	storage.setItem(key, JSON.stringify(value));
}

async remove(key: string): Promise<void> {
	storage.removeItem(key);
}
```

(exact surrounding lines/signature to be confirmed against the live file —
this is a values-level, not line-level, guarantee from the earlier direct
read; re-open the file before editing.)

## Commands you will need

| Purpose   | Command                                     | Expected on success |
|-----------|-----------------------------------------------|----------------------|
| Install   | `pnpm install`                                | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/core typecheck`      | exit 0               |
| Tests     | `pnpm --filter @mediadrop/core test`           | all pass             |

## Scope

**In scope**: `packages/core/src/session-store.ts`,
`packages/core/src/session-store.test.ts`.

**Out of scope**: `packages/tus/src/tus-upload.ts` and
`packages/s3/src/multipart.ts` — their `persist()` calls should keep
`await`ing `sessionStore.set()` as today; this plan's fix makes that call
itself resilient (swallow-and-signal) rather than pushing try/catch
responsibility onto every transport that uses the store. If a future
follow-up decides transports should react differently to a persistence
failure (e.g. surface a warning), that is a separate, larger design
decision — out of scope here.

## Git workflow

- Branch: `advisor/008-guard-session-store-write-errors`

## Steps

### Step 1: Decide the resilience contract

Before writing code, confirm the intended behavior with the "Fix sketch"
approach below: `set`/`remove` should not let a storage-layer failure
propagate as an uncaught upload error. The simplest, safest contract:
catch the error, and treat persistence failure as "the session isn't
resumable this time" rather than "the upload failed" — i.e. swallow and
return normally (matching `get`'s existing swallow-on-parse-failure
precedent), optionally logging via a console warning so it isn't silently
invisible during development.

### Step 2: Wrap `set` and `remove` in try/catch

```ts
async set(key: string, value: unknown): Promise<void> {
	try {
		storage.setItem(key, JSON.stringify(value));
	} catch (error) {
		console.warn(`mediadrop: failed to persist upload session "${key}"`, error);
	}
}

async remove(key: string): Promise<void> {
	try {
		storage.removeItem(key);
	} catch (error) {
		console.warn(`mediadrop: failed to remove upload session "${key}"`, error);
	}
}
```

Match the existing file's style for how it references `storage` (already
resolved earlier in the file, per the prior read) and confirm whether the
codebase already has a shared logging helper (check other `@mediadrop/*`
files for a `console.warn`/logger convention) rather than introducing an
ad hoc one if a convention already exists.

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0.

### Step 3: Add regression tests

In `packages/core/src/session-store.test.ts`, add:
1. A test where the mocked storage's `setItem` throws (e.g.
   `QuotaExceededError`) — assert `sessionStore.set(...)` resolves without
   throwing.
2. A test where `removeItem` throws — assert `sessionStore.remove(...)`
   resolves without throwing.

Model these after the existing "throwing localStorage accessor" test
already in this file (per the test-coverage audit's TEST context notes) —
that existing test covers `get`'s error path; these two extend the same
pattern to `set`/`remove`.

**Verify**: `pnpm --filter @mediadrop/core test -- session-store` → all pass, including the two new tests.

## Test plan

- New tests: "set() does not throw when storage.setItem throws" and
  "remove() does not throw when storage.removeItem throws", both in
  `session-store.test.ts`.
- Confirm no existing test's expectations about `set`/`remove` throwing
  (if any exist) need updating — check first via `grep -n "\.set(\|\.remove(" packages/core/src/session-store.test.ts` before assuming none do.

## Done criteria

- [ ] `set()` and `remove()` both catch storage-layer errors and do not propagate them
- [ ] Two new regression tests pass
- [ ] `pnpm --filter @mediadrop/core test` and `typecheck` exit 0
- [ ] No files outside scope modified

## STOP conditions

- If any existing test asserts `set`/`remove` *does* throw on a storage
  error (i.e. this was a deliberate, tested behavior rather than an
  oversight), stop and report — the "Why this matters" analysis assumes
  this is unguarded-by-omission, not unguarded-by-design; confirm before
  changing.

## Maintenance notes

- If a shared logging/telemetry hook is added to `@mediadrop/core` in the
  future, route this warning through it instead of a bare `console.warn`.
