# Plan 016: Fix store.ts doc comment / actual reentrant-notify behavior drift

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/core/src/store.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW-MED — depends which resolution is picked (doc fix is LOW risk; behavior change to dedupe repeat deliveries is MED risk, since it changes an observable contract other code may implicitly rely on).
- **Depends on**: none
- **Category**: correctness/bugs (doc/behavior drift)
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`packages/core/src/store.ts` lines 27-35's doc comment states:

> "...so every listener still eventually observes the latest value, in
> order, with no listener visited twice for the same state and none
> skipped."

Verified by direct read/trace of `notify()` (lines 36-50) against
`store.test.ts`'s own test "a second listener still gets the final state
after a reentrant setState from the first" (lines 67-87): when a first
listener reentrantly calls `setState` during the first notify pass, the
second listener (called later in that same pass, via the *live* `state`
closure variable, not a per-pass snapshot) already observes the new value
— and then the `do`/`while` re-run (needed because `lastNotified !==
state`) calls the second listener *again* with that same final value. The
test explicitly asserts this: `secondListenerCalls` ends up `[2, 2]` —
the exact same state value delivered to the same listener twice in a row.
This directly contradicts "no listener visited twice for the same state."
The code is not necessarily *wrong* (delivering an extra, redundant
notification with unchanged state is a relatively benign inefficiency,
not a correctness bug for idempotent listeners), but the doc comment
overclaims a guarantee the implementation doesn't provide, which could
mislead a future maintainer relying on it (e.g. writing a listener that
does non-idempotent work per invocation, trusting the comment's promise).

## Current state

- `packages/core/src/store.ts` lines 27-50 (`notify`'s doc comment and implementation).
- `packages/core/src/store.test.ts` lines 67-87 (the test that proves the actual behavior — do not weaken or remove this test; it's correct, it's the comment that's wrong).

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/core typecheck`   | exit 0               |
| Tests     | `pnpm --filter @mediadrop/core test`        | all pass             |

## Scope

**In scope**: `packages/core/src/store.ts`'s doc comment (lines 27-35).

**Out of scope**: changing `notify()`'s actual dedup behavior — see Step 1's two options; only pursue the behavior-change option if explicitly chosen, and treat it as materially higher risk than the doc-only fix.

## Git workflow

- Branch: `advisor/016-fix-store-notify-doc-drift`

## Steps

### Step 1: Choose doc-fix (default) or behavior-fix

- **(a) Fix the doc comment (default, lower risk)**: correct the claim to
  match reality — a listener *can* be invoked more than once with the
  same state value if a reentrant `setState` occurs during its own
  notify pass; this is intentional/acceptable because listeners are
  expected to be idempotent re-renders/selectors, not one-shot side
  effects.
- **(b) Change `notify()` to actually dedupe repeat same-value
  deliveries**: track the last value delivered to each listener and skip
  calling it again if unchanged since its last call within the same
  overall `notify()` invocation. This makes the comment's claim literally
  true, but changes observable behavior for any code relying on (or
  merely tolerating) the current "gets called again after a reentrant
  update" pattern — riskier, and the existing test at lines 67-87 would
  need to be rewritten (from asserting `[2, 2]` to asserting `[2]`),
  which is a behavior change to a currently-passing, intentionally
  written test, not just a bug fix.

Default to (a) unless the operator specifically wants the stronger
guarantee — this is a documentation-accuracy fix, not a reported bug with
real-world impact, per the audit's classification.

**Verify**: no command — a design decision, document the choice in the PR.

### Step 2a (if doc fix): correct the comment

Replace the incorrect claim with an accurate one, e.g.:

```ts
// A listener that calls `setState` again synchronously (reentrantly)
// doesn't recurse into a second, nested notify pass — `isNotifying`
// makes that inner call a no-op beyond updating `state`, and the
// `do`/`while` below detects that `state` moved again after the
// current pass finishes and runs one more pass so every listener still
// eventually observes the latest value, in order, with none skipped.
// A listener already past its own turn when a reentrant update happens
// will see the new value immediately (since `state` is read live, not
// snapshotted per pass) and then may be notified again, redundantly,
// with that same value during the follow-up pass — listeners should be
// idempotent with respect to repeat delivery of an unchanged value.
```

**Verify**: re-read the comment against `store.test.ts:67-87`'s actual assertions, confirm no remaining discrepancy.

### Step 2b (if behavior fix): dedupe repeat deliveries per listener

Track a `WeakMap<Listener<T>, T>` (or similar) of the last value each
listener was called with during the current `notify()` invocation, and
skip re-invoking a listener whose value hasn't changed since its last
call this pass. Update `store.test.ts:67-87`'s assertion from `[2, 2]`
to `[2]` since this is the deliberate behavior change this option makes.

**Verify**: `pnpm --filter @mediadrop/core test -- store` → all pass with the updated assertion.

## Test plan

- (a): no test changes needed beyond re-confirming existing tests pass — this is a comment-only fix.
- (b): update the one affected assertion in `store.test.ts`, confirm all other store tests pass unchanged.

## Done criteria

- [ ] Doc comment accurately describes actual `notify()` behavior (or behavior changed to match the original claim, per whichever option chosen)
- [ ] All `@mediadrop/core` tests pass
- [ ] No files outside scope modified

## STOP conditions

- None beyond the Step 1 decision itself — this is a small, well-contained fix either way.

## Maintenance notes

- If (b) is chosen, note in the comment that the "no listener visited twice for the same state" guarantee is O(listeners) extra bookkeeping per notify pass — a negligible cost given typical listener counts, but worth knowing if this store is ever used somewhere with very many listeners.
