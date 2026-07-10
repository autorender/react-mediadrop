# Plan 009: Avoid O(n) full-list rebuilds on every progress tick and per-file lookup

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/core/src/mediadrop.ts packages/s3/src/multipart.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — touches the hottest path in the library (every progress event, for every file, for every upload); a subtle regression here is easy to ship unnoticed in small test fixtures and only show up with many concurrent large files.
- **Depends on**: none
- **Category**: performance
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Three related O(n)-per-tick costs, confirmed by direct read this audit:

1. **`updateFile` rebuilds the whole file array on every call**
   (`packages/core/src/mediadrop.ts:172-178`):
   ```ts
   function updateFile(id: string, patch: Partial<MediaDropFile>): void {
   	store.setState((state) => ({
   		...state,
   		files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
   	}));
   }
   ```
   `state.files.map(...)` walks and reallocates the entire array every time
   *any* single file changes. `onProgress` callbacks fire many times per
   second per in-flight file (XHR's `upload.onprogress`, tus/S3 chunk
   progress) — so with N files uploading concurrently, this is O(n) work
   fired at up to N × (progress-event-rate) per second.

2. **Aggregate helpers are separately O(n) linear scans**
   (`packages/core/src/mediadrop.ts:94-97, 146-152`): `countAccepted`,
   `getAcceptedFiles`, `getRejectedFiles` all `.filter()`/count over the
   full file list on every call, with no memoization — cheap in isolation,
   but combined with (1) and (3) they compound the per-tick cost for any
   UI that reads these on every state-change render.

3. **S3 multipart's own progress reporting is a second O(parts) sum on
   every tick** (`packages/s3/src/multipart.ts:347-355`, `reportProgress()`):
   sums every part's loaded bytes from scratch on every single part's
   progress event, so a multipart upload with P parts does O(P) work P
   times per progress tick cycle — O(P²) total across a single file's
   upload, compounding on top of (1)'s O(n)-across-files cost whenever
   that file is one of several concurrently uploading.

None of these is currently a measured, reported-by-a-user performance bug
— they are structural inefficiencies proportional to (file count) ×
(progress event rate) × (part count), which only becomes visibly slow at
a scale (many large files, high concurrency) the test suite's small
fixtures don't exercise. Confirmed as real via direct code read, not
assumed from a general "avoid X" heuristic.

## Current state

- `packages/core/src/mediadrop.ts` — `updateFile` (172-178), `countAccepted`/`getAcceptedFiles`/`getRejectedFiles` (94-97, 146-152), `uploadAll` (187-191, iterates all files calling `enqueue` per accepted one — feeds the same O(n) surface, not a separate bug).
- `packages/s3/src/multipart.ts` — `reportProgress()` (347-355).
- `packages/core/src/store.ts` — the underlying `setState`/`subscribe` primitive; confirm its `map`-based reducer conventions before changing `updateFile`'s shape, since other call sites may rely on the same "always return a new files array" pattern for reference-equality-based re-render optimizations in `@mediadrop/react` (`useMediaDrop.ts` — check whether it does any `===` comparison on `state.files` itself, which a keyed-lookup optimization must preserve or intentionally change with full test coverage).

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|-------------------------------------------|----------------------|
| Install   | `pnpm install`                            | exit 0               |
| Typecheck | `pnpm typecheck`                          | exit 0               |
| Tests     | `pnpm test`                               | all pass, all packages |
| Build     | `pnpm build`                              | exit 0               |
| Size      | `pnpm size`                               | within existing budgets (`sizeLimit` in each package.json) |

## Scope

**In scope**: `packages/core/src/mediadrop.ts`, `packages/core/src/mediadrop.test.ts`, `packages/s3/src/multipart.ts`, `packages/s3/src/multipart.test.ts`.

**Out of scope**:
- `packages/react/src/useMediaDrop.ts` — its existing `useMemo` usage
  (confirmed lines 221-228) is a *consumer-side* memoization of derived
  values; it's downstream of whatever `mediadrop.ts` produces and doesn't
  need to change for this plan, though it will benefit automatically once
  (1)/(2) are fixed.
- `packages/tus` — tus doesn't have the same O(parts) progress-sum
  pattern (it reports cumulative offset directly, no per-chunk array to
  sum); no change needed there.

## Git workflow

- Branch: `advisor/009-avoid-on-progress-o-n-rebuilds`
- Consider splitting into two commits: one for `mediadrop.ts` (core), one
  for `multipart.ts` (s3) — they're independently reviewable and testable.

## Steps

### Step 1: Switch the core file collection to a Map keyed by id, or add an index

Two viable approaches — pick based on how invasive changing `MediaDropState.files`'s
public shape would be (check `packages/core/src/types.ts` and every
consumer of `state.files` first, since it's likely part of the public
API surface documented in READMEs):

- **Option A (less invasive)**: keep `files: MediaDropFile[]` as the public
  shape, but maintain an internal `Map<string, number>` (id → index) or
  `Map<string, MediaDropFile>` inside the store's closure, updated
  incrementally, and have `updateFile` mutate/replace only the one entry's
  position instead of `.map()`-ing the whole array. This preserves the
  external contract exactly.
- **Option B (more invasive)**: change internal storage to a `Map`, derive
  the public `files` array lazily/memoized only when read. Only pursue
  this if Option A can't hit the perf goal, since it risks reference-
  identity assumptions elsewhere (React's `useMemo` dependency arrays, etc.).

Prefer Option A unless profiling shows it's insufficient — confirm this
choice makes sense given what `packages/core/README.md`'s documented API
promises about `state.files` (array vs. some other shape) before starting.

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0 after the chosen approach compiles.

### Step 2: Implement the chosen approach for `updateFile`

Whichever option, the goal: a single file's patch should not require
allocating a new array of length n and revisiting all n−1 unrelated
elements. Preserve the existing behavior that `state.files` array
reference changes on every update (if consumers rely on that for
reactivity) while making the per-element work O(1) instead of O(n) for
the actual patched element (the *array* reconstruction may still be O(n)
if the public shape must stay `files: MediaDropFile[]` — but avoid this by
having the Map be the source of truth and only rebuilding the derived array
when something actually reads it, not synchronously inside every
`updateFile` call. If reads happen on every progress tick too, e.g. via a
subscriber, evaluate whether a debounced/coalesced notify is more
appropriate — see `plans/README.md`'s notes on why this is a MED-risk item).

**Verify**: `pnpm --filter @mediadrop/core test` → all pass, no behavior change in test assertions.

### Step 3: Memoize the aggregate read helpers

For `countAccepted`, `getAcceptedFiles`, `getRejectedFiles`
(`mediadrop.ts:94-97, 146-152`): either derive them from the same Map-based
index in O(accepted-count)/O(rejected-count) rather than a full O(n)
filter over all files, or add simple memoization keyed on the files
array's reference (only recompute when the reference actually changed,
which Step 1/2 should make a meaningful signal again).

**Verify**: existing tests for these three functions in `mediadrop.test.ts` still pass unchanged.

### Step 4: Fix S3 multipart's `reportProgress` to maintain a running total instead of re-summing

In `packages/s3/src/multipart.ts`, change `reportProgress()` (347-355) from
summing every part's loaded bytes from scratch on every call to
maintaining a running total that's incrementally updated as each part's
individual progress changes (e.g. track `partLoaded: number[]` and a
running `totalLoaded`, updating `totalLoaded += (newLoaded - partLoaded[i])`
on each part's progress event instead of `parts.reduce(...)`).

**Verify**: `pnpm --filter @mediadrop/s3 test -- multipart` → all pass, especially the existing "progress aggregation without double-count" test (per the test-coverage audit's note that this exact property is already tested — confirm the new running-total implementation still satisfies that test, don't just make it pass by weakening the assertion).

## Test plan

- All existing tests in `mediadrop.test.ts` and `multipart.test.ts` must
  continue to pass unchanged — these changes are internal-implementation-
  only, the public behavior (final state shape, progress values) must be
  identical.
- Add one test asserting `updateFile` on file N of a large synthetic file
  list (e.g. 500 files) doesn't visit/reallocate all 500 on a single patch
  — this can be asserted indirectly by spying on `Array.prototype.map`
  call counts, or more simply by asserting the *identity* of unrelated
  file objects (files other than the patched one) is preserved
  (`===`) across the update if the chosen implementation makes that true —
  which is itself a nice, testable, and valuable property distinct from
  raw speed.

## Done criteria

- [ ] `updateFile` no longer does a full `O(n)` `.map()` over all files (verify via the identity-preservation test, or a call-count spy)
- [ ] `reportProgress` in S3 multipart maintains a running total instead of re-summing all parts each call
- [ ] All existing tests in both packages pass unchanged
- [ ] `pnpm build` and `pnpm size` stay within existing budgets
- [ ] No files outside scope modified

## STOP conditions

- If changing `updateFile`'s internal approach breaks an implicit
  assumption in `@mediadrop/react`'s `useMemo` dependency arrays (i.e.
  `useMediaDrop`'s tests start failing after this change even though
  `packages/react` wasn't touched), stop and investigate rather than
  patching `useMediaDrop.ts` reactively without understanding why — that
  would indicate the "Option A preserves the external contract exactly"
  assumption in Step 1 was wrong.

## Maintenance notes

- If `MediaDropState.files`'s public shape is ever changed to something
  other than a plain array (Option B), update every `packages/*/README.md`
  that documents `state.files`'s shape.
