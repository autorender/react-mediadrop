# Plan 007: Remove the dangling abort-event listener in withRetry's delay()

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/core/src/retry.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (touches the same file as CORE's other-adjacent-but-separate settle-race fix in plan 001, which deliberately does not touch `retry.ts` — see plan 001's "out of scope")
- **Category**: bug
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`packages/core/src/retry.ts`'s `delay()` (lines 75-91, confirmed by direct
read this audit):

```ts
function delay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(createRetryAbortedError());
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(createRetryAbortedError());
			},
			{ once: true },
		);
	}, ms);
}
```

The `abort` listener is added with `{ once: true }` (so it self-removes
*if* it ever fires), but if the timer fires first and `resolve()` runs
normally, the listener is **never removed** — `{ once: true }` only
guarantees removal after the event fires, not after the promise settles
some other way. Because `withRetry` calls `delay()` once per retry attempt
on the *same* `AbortController`'s signal (the controller lives for the
whole upload, across every retry), a file that retries N times before
succeeding accumulates N live-but-useless abort listeners on that one
signal for the rest of the upload's lifetime. This is a real, bounded-but-
real memory leak per upload attempt — worse the more retries an upload
needs — not a hypothetical.

## Current state

- `packages/core/src/retry.ts` — `delay()` function, lines 75-91 as shown above.
- `withRetry` (elsewhere in the same file) calls `delay(computedDelay, signal)` once per retry between attempts.

## Commands you will need

| Purpose   | Command                                     | Expected on success |
|-----------|-----------------------------------------------|----------------------|
| Install   | `pnpm install`                                | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/core typecheck`      | exit 0               |
| Tests     | `pnpm --filter @mediadrop/core test`           | all pass             |

## Scope

**In scope**: `packages/core/src/retry.ts`, `packages/core/src/retry.test.ts`.

**Out of scope**: `packages/core/src/upload-queue.ts` (plan 001 already
covers its own, separate settle-handler races — do not fix retry.ts inside
that plan, and do not fix upload-queue.ts here).

## Git workflow

- Branch: `advisor/007-fix-retry-abort-listener-leak`

## Steps

### Step 1: Remove the listener on the resolve path too

Change:

```ts
function delay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(createRetryAbortedError());
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(createRetryAbortedError());
			},
			{ once: true },
		);
	});
}
```

to:

```ts
function delay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(createRetryAbortedError());
			return;
		}
		const onAbort = () => {
			clearTimeout(timer);
			reject(createRetryAbortedError());
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
```

(Note: the original code has a stray extra `, ms)` — confirm the exact
existing brace/paren structure against the live file before editing; the
excerpt above may have been reflowed for the plan and the executor should
match against the real file, not retype from memory.)

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0.

### Step 2: Add a regression test

In `packages/core/src/retry.test.ts`, add a test that:
1. Creates an `AbortController` and calls `withRetry` with a function that
   fails N times then succeeds (forcing N `delay()` calls on the same signal).
2. After the retry sequence completes successfully, asserts the signal has
   no remaining `abort` listeners. `AbortSignal` doesn't expose a listener
   count directly in all environments — use a wrapper: spy on
   `signal.addEventListener`/`removeEventListener` calls and assert the
   count of `addEventListener("abort", ...)` calls equals the count of
   matching `removeEventListener("abort", ...)` calls by the time
   `withRetry` resolves.

**Verify**: `pnpm --filter @mediadrop/core test -- retry` → all pass, including the new test.

## Test plan

- New test: "delay() removes its abort listener when it resolves normally,
  not just when aborted" — asserts add/remove call parity as described in Step 2.
- Existing abort-mid-delay tests must continue to pass unchanged (confirms the reject path still works).

## Done criteria

- [ ] `delay()` removes its `abort` listener on both the resolve and reject paths
- [ ] New listener-parity regression test passes
- [ ] `pnpm --filter @mediadrop/core test` and `typecheck` exit 0
- [ ] No files outside scope modified

## STOP conditions

- If `AbortSignal` in the test environment (jsdom/Node) doesn't support
  spying on `addEventListener`/`removeEventListener` cleanly, find an
  alternative verification (e.g. a real memory-growth proxy is out of
  reach for a unit test — a call-count spy is the intended approach; if
  that's not feasible, report back rather than skipping the regression test).

## Maintenance notes

- Any future timer/signal-based helper added to `retry.ts` should follow
  this same explicit-remove-on-both-paths pattern.
