# Plan 024: Assert actual byte-range contents sent for multipart/chunked uploads, not just call counts

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/s3/src/multipart.test.ts packages/tus/src/tus-upload.test.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW — test-only change.
- **Depends on**: `plans/014-dedupe-test-scaffolding.md` (not required, but easier to write these assertions against a single shared `MockXhr` if that's landed first — can proceed independently either way, using whichever `test-utils.ts` currently exists in each package)
- **Category**: test coverage
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Confirmed by direct inspection this audit: `packages/s3/src/multipart.test.ts`
and `packages/tus/src/tus-upload.test.ts` (e.g. around line 69 in the
latter) test that the *right number* of parts/chunks are sent, and that
byte offsets/part numbers are tracked correctly in the *state* the
library reports back — but never assert on the actual *bytes* placed in
each part/chunk's request body. A file is sliced into parts via `File.slice(start, end)`
(or equivalent) before being sent; a bug that off-by-ones the slice
boundaries (sending byte ranges `[0,100), [100,200), [200,300)` instead
of the correct `[0,100), [99,199), [199,299)`, for example) would still
produce the right *count* of parts and the right reported *offsets* in
this library's own bookkeeping, while silently corrupting the actual
uploaded file content (a byte duplicated or dropped at each part
boundary) — and no existing test would catch it, since none inspect the
`sentBody`'s actual byte content against the expected slice of the
source file.

## Current state

- `packages/s3/src/multipart.test.ts` — part-count and progress-aggregation tests exist (confirmed); no test reads `MockXhr.instances[i].sentBody` and compares its bytes against the expected slice of the original test file.
- `packages/tus/src/tus-upload.test.ts` line 69 area — chunk-count/offset tests exist; same gap for chunk body bytes.
- `packages/s3/src/test-utils.ts` / `packages/tus/src/test-utils.ts` — `MockXhr.sentBody` already captures whatever was passed to `send()`, so the data needed for this assertion is already captured by the existing test double; it's just never asserted on.

## Commands you will need

| Purpose   | Command                                      | Expected on success |
|-----------|--------------------------------------------------|----------------------|
| Install   | `pnpm install`                                   | exit 0               |
| Tests     | `pnpm --filter @mediadrop/s3 test && pnpm --filter @mediadrop/tus test` | all pass |

## Scope

**In scope**: `packages/s3/src/multipart.test.ts`, `packages/tus/src/tus-upload.test.ts`.

**Out of scope**: `packages/s3/src/simple.ts`'s non-multipart path — a
single-part upload has no boundary-slicing to get wrong in the same way;
lower priority, skip unless trivial to add alongside.

## Git workflow

- Branch: `advisor/024-part-chunk-byte-range-assertions`

## Steps

### Step 1: Add byte-content assertions to S3 multipart tests

For a test file of known, deterministic content (e.g.
`new Uint8Array(300).map((_, i) => i % 256)` — distinguishable bytes at
every position, not all-zero, so a boundary bug is actually detectable
rather than invisible against uniform padding), after the multipart
upload completes, read each `MockXhr` instance's `sentBody` (converting
from whatever body type `send()` receives — likely a `Blob`/`ArrayBuffer`
slice — into bytes via `await sentBody.arrayBuffer()` or equivalent) and
assert each part's bytes exactly match the corresponding slice of the
original source array, with no overlap or gap between consecutive parts'
ranges.

**Verify**: `pnpm --filter @mediadrop/s3 test -- multipart` → new assertions pass against the current (presumably correct) implementation.

### Step 2: Add the equivalent assertion for tus chunks

Same pattern in `tus-upload.test.ts`: known-content test file, assert
each `PATCH` request's `sentBody` bytes match the exact expected chunk
range, with consecutive chunks' ranges forming a gapless, non-overlapping
partition of the whole file.

**Verify**: `pnpm --filter @mediadrop/tus test -- tus-upload` → new assertions pass.

### Step 3: Prove the new assertions actually catch a boundary bug (temporary, local-only)

Temporarily introduce a deliberate off-by-one in the slicing logic
(`multipart.ts`/`tus-upload.ts`'s part/chunk boundary calculation), confirm
the new tests fail with a clear byte-mismatch message, then revert the
deliberate bug — do not commit it.

**Verify**: manual local confirmation the new tests are load-bearing, not tautological.

## Test plan

- New byte-range assertions in both test files, passing against current (correct) implementation.
- Step 3's negative test proves they'd catch a real regression.

## Done criteria

- [ ] S3 multipart test asserts actual sent bytes per part match expected file slice, gapless and non-overlapping
- [ ] Tus chunk test asserts the same for PATCH request bodies
- [ ] Step 3's negative test confirms real regression-catching power (not committed, just verified locally)
- [ ] No files outside scope modified

## STOP conditions

- If `sentBody`'s actual runtime type in either package's real transport
  code turns out to be something the test's `MockXhr` double doesn't
  faithfully capture bytes-for-bytes (e.g. it stores a `Blob` reference
  without an easy synchronous way to read bytes in the test environment),
  stop and adjust the `MockXhr`/test-utils double first (in coordination
  with `plans/014` if that's in flight) rather than writing a shallower
  assertion that doesn't actually check byte content.

## Maintenance notes

- Any future change to part/chunk slicing logic in either package should
  keep these byte-range tests passing — they are the load-bearing
  regression guard for exactly the class of bug (off-by-one slice
  boundaries) that silently corrupts uploaded file content without
  breaking any count/offset-based test.
