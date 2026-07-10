# Plan 011: Extract the duplicated XHR-send-with-stall-watchdog envelope into one shared helper

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/xhr-upload/src/index.ts packages/s3/src/simple.ts packages/tus/src/protocol.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — this touches the request-sending code path in three separately-published packages; a subtle behavioral change (e.g. in error-message text or header handling) could be a breaking change for consumers who pattern-match on error messages, and each of the three call sites has slightly different needs (see Current state).
- **Depends on**: none
- **Category**: tech debt & architecture
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

The same "send an XHR request, wire a stall watchdog, resolve/reject based
on status, translate abort into either a stall-error or a plain abort-error"
envelope is implemented three separate times, confirmed by direct read of
all three files this audit:

- `packages/xhr-upload/src/index.ts` (`upload()`, lines ~114-180): builds
  its own `XMLHttpRequest`, its own `createStallWatchdog`, its own
  `onload`/`onerror`/`onabort` handlers, resolving to
  `{ response: parseResponseBody(xhr) }`.
- `packages/s3/src/simple.ts` (`sendXhr`, lines 38-109): near-identical
  structure, different result shape.
- `packages/tus/src/protocol.ts` (`sendXhr`, lines 10-71): near-identical
  structure again, but resolves to a *third*, drifted shape:
  `{ status, getHeader, responseURL }` instead of a parsed body.

All three correctly use `@mediadrop/core`'s shared `createStallWatchdog`
(so the actual stall-detection *logic* is not duplicated — only the
XHR-plumbing envelope around it is). This is exactly the kind of
per-transport duplication `CONTRIBUTING.md` warns against in spirit
("every transport stays thin") even though it's phrased there specifically
about retry/concurrency, not request-sending — the architecture principle
generalizes. Read all three implementations end-to-end this audit and
found no additional bugs beyond the duplication itself — each is
individually correct, they've just drifted into three different result
shapes for what is functionally the same operation.

## Current state

- `packages/xhr-upload/src/index.ts` lines 114-180 (full `upload()` body, response parsed via `parseResponseBody`).
- `packages/s3/src/simple.ts` lines 38-109 (`sendXhr`).
- `packages/tus/src/protocol.ts` lines 10-71 (`sendXhr`, resolves `{status, getHeader, responseURL}` — this is the shape closest to a generically reusable "raw XHR result," since tus needs response *headers* (`Location`, `Upload-Offset`) rather than a parsed body, unlike xhr-upload and s3-simple which want a parsed body).
- `packages/core/src/stall-watchdog.ts` (not read line-by-line this pass,
  but its public shape — `createStallWatchdog(onStall, timeoutMs)` returning
  `{ reset, clear }` — is confirmed consistent across all three call sites).

The natural shared shape is closest to tus's `protocol.ts` version (raw
XHR result: `status`, `getHeader`, `responseURL`, plus upload-progress
wiring) since it's the strictly more general one — xhr-upload's and s3's
parsed-body behavior can be layered on top of the raw result rather than
baked into the shared primitive.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|------------------------|----------------------|
| Install   | `pnpm install`        | exit 0               |
| Typecheck | `pnpm typecheck`      | exit 0 for `core`, `xhr-upload`, `s3`, `tus` |
| Tests     | `pnpm test`           | all pass, all packages |

## Scope

**In scope**:
- New shared helper in `@mediadrop/core` (e.g. `packages/core/src/xhr.ts`), exported from `@mediadrop/core`'s public entrypoint.
- `packages/xhr-upload/src/index.ts` — refactor to use the shared helper.
- `packages/s3/src/simple.ts` — refactor to use the shared helper.
- `packages/tus/src/protocol.ts` — refactor to use the shared helper.
- Corresponding test files for all four.

**Out of scope**:
- `packages/s3/src/multipart.ts`'s own XHR sending (if it has one distinct
  from `simple.ts` — verify before assuming; if it delegates to `simple.ts`
  or has genuinely different needs like per-part concurrency, treat that
  separately and don't force it into this plan's helper if it doesn't fit).
- Changing `createStallWatchdog` itself — it's already shared and correct.

## Git workflow

- Branch: `advisor/011-dedupe-xhr-transport-envelope`
- Land the new shared helper + its own tests in one commit, then migrate
  each of the three call sites in separate commits so a regression is
  easy to bisect to one specific transport.

## Steps

### Step 1: Design the shared helper's shape

Propose (confirm against all three real call sites before finalizing):

```ts
// packages/core/src/xhr.ts
export type XhrSendOptions = {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: Blob | FormData | null;
	signal: AbortSignal;
	onUploadProgress?: (loaded: number) => void;
	stallTimeoutMs?: number;
};

export type XhrSendResult = {
	status: number;
	getHeader: (name: string) => string | null;
	responseURL: string;
	responseText: string;
};

export function sendXhr(options: XhrSendOptions): Promise<XhrSendResult>;
```

`responseText` is added to the tus-shaped result so `xhr-upload` and
`s3/simple.ts` can build their parsed-body behavior (`parseResponseBody`)
on top of the shared primitive without a second XHR property access
pattern. Confirm this covers every field each of the three current
implementations actually reads (re-check `xhr.getResponseHeader`,
`xhr.responseText`, `xhr.responseURL`, `xhr.status` usage in all three
files) before implementing.

**Verify**: no command — a design check; re-read all three source files
once more against this proposed shape before writing code, since this is
the step most likely to reveal a shape mismatch.

### Step 2: Implement `sendXhr` in `@mediadrop/core`, with its own tests

Port the common envelope logic (open, set headers, wire
`createStallWatchdog`, `xhr.upload.onprogress`, `onload`/`onerror`/`onabort`,
`signal.addEventListener("abort", ...)`, `xhr.send(body)`) into this one
function. The stall-vs-plain-abort error distinction (`stalled` flag
pattern, identical across all three current implementations) belongs
here too.

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0. Add
`packages/core/src/xhr.test.ts` covering: success, HTTP error status
passthrough (that's the caller's job to interpret, not this helper's —
confirm this helper resolves on any status and lets the caller decide
success/failure, matching all three current callers' behavior of checking
status themselves), network error, plain abort, stall-triggered abort,
upload-progress relay.

### Step 3: Migrate `packages/tus/src/protocol.ts`

This is the closest-shaped caller — replace its local `sendXhr` with a
thin call into `@mediadrop/core`'s `sendXhr`, keeping `createUpload`/
`headUpload`/`patchChunk`'s own status-code and header-parsing logic
unchanged (that logic is tus-protocol-specific, not part of the
duplication — don't move it into core).

**Verify**: `pnpm --filter @mediadrop/tus test` → all existing tests pass unchanged (this is a pure refactor from tus's perspective, so no test behavior should change).

### Step 4: Migrate `packages/s3/src/simple.ts`

Replace its local `sendXhr` with a call into the shared helper, then apply
`parseResponseBody`-equivalent logic (may need to move `parseResponseBody`
itself into `@mediadrop/core` too, or keep a thin per-package copy if it's
genuinely package-specific — check whether `xhr-upload`'s and `s3`'s
`parseResponseBody` implementations are actually identical before deciding;
if identical, dedupe them into the shared helper's module as a small
exported utility).

**Verify**: `pnpm --filter @mediadrop/s3 test -- simple` → all existing tests pass unchanged.

### Step 5: Migrate `packages/xhr-upload/src/index.ts`

Same pattern as Step 4.

**Verify**: `pnpm --filter @mediadrop/xhr-upload test` → all existing tests pass unchanged.

### Step 6: Full-repo verification

**Verify**: `pnpm typecheck && pnpm test && pnpm build && pnpm size` → all exit 0, all packages within size budgets (extracting shared code into `@mediadrop/core` will grow core's bundle slightly — confirm it stays under core's `sizeLimit` in `package.json`, and that each transport package's own bundle *shrinks* correspondingly since duplicated code moved out of them).

## Test plan

- New `packages/core/src/xhr.test.ts` covering the shared helper directly (Step 2).
- All pre-existing tests in `xhr-upload`, `s3` (simple), and `tus` (protocol) must pass unchanged post-migration — this is the primary regression guard, since the goal is a pure refactor with zero behavior change.
- Re-run the full `pnpm test` suite (183 tests per the test-coverage audit's baseline) and confirm the count doesn't drop (only the new `core/xhr.test.ts` tests should be additions).

## Done criteria

- [ ] `@mediadrop/core` exports a shared `sendXhr` (name TBD by executor, document final name in PR)
- [ ] All three transports (`xhr-upload`, `s3/simple.ts`, `tus/protocol.ts`) use it, with no local duplicate XHR-envelope logic remaining
- [ ] All pre-existing tests pass unchanged; new core-level tests added
- [ ] `pnpm build`/`pnpm size` stay within budgets for all affected packages
- [ ] Each transport's own README/docs are checked for any internal-implementation claims that might now be stale (unlikely, since this is implementation-only, but verify quickly)

## STOP conditions

- If any of the three current implementations turns out to have a
  behavioral difference beyond result shape (e.g. a header-casing
  difference, a status-range difference) that this plan's "Current state"
  section didn't already catch, stop and report the discrepancy rather
  than silently picking one behavior to keep — that would be a real,
  possibly-intentional per-transport difference this plan shouldn't erase
  without a deliberate decision.

## Maintenance notes

- Any *new* transport package added in the future should use this shared
  helper from day one rather than reimplementing the envelope a fourth time.
