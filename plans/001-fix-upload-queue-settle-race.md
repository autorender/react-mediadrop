# Plan 001: Fix upload-queue settle handlers to check controller identity before mutating state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/core/src/upload-queue.ts`
> If the file changed since this plan was written, compare the "Current
> state" excerpt below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — the fix adds a guard condition to existing branches; it does not change the happy path.
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`createUploadQueue`'s `scheduleForceFree` (the safety net for a transport that
ignores `AbortSignal`) already guards against acting on a stale controller —
it checks `active.get(id) === controller` before freeing the slot. The
`withRetry(...).then/.catch/.finally` chain in `startUpload` that actually
settles the upload does **not** have the same guard. Concretely: if a
non-conforming transport ignores `signal` and its promise settles *after*
`cancelGraceMs` has already force-freed the slot (which allows a **new**
`AbortController` B to be enqueued for the same file `id`), the stale
promise's `.then`/`.catch`/`.finally` still fire unconditionally — calling
`store.updateFile(id, ...)` and `active.delete(id)` — and will silently
overwrite upload B's live `uploadStatus` and delete its live `active` map
entry, corrupting a healthy in-progress re-upload. Separately, `.then`
(the success path) sets `uploadStatus: "done"` without ever checking
`controller.signal.aborted`, while `.catch` does check it — so a transport
that resolves instead of rejecting after being aborted gets reported as
`"done"` instead of `"canceled"`. Both bugs live in the same ~20-line block
and should be fixed together.

## Current state

- `packages/core/src/upload-queue.ts` — owns all upload concurrency/retry
  orchestration; this is the one file affected.

Current code (lines 92–167), as read at commit `4151298`:

```ts
function startUpload(id: string): void {
	const controller = new AbortController();
	active.set(id, controller);

	withRetry(
		(attemptNumber) => {
			const file = store.getFile(id);
			if (!file) {
				throw new Error(`mediadrop: file "${id}" was removed mid-upload.`);
			}
			store.updateFile(id, {
				uploadStatus: "uploading",
				uploadAttempts: attemptNumber,
				uploadError: undefined,
				progress: { loaded: 0, total: null },
			});
			return transport.upload(file, {
				signal: controller.signal,
				onProgress: (progress) => store.updateFile(id, { progress }),
			});
		},
		{ retries, retryDelays },
		controller.signal,
	)
		.then((result) => {
			store.updateFile(id, {
				uploadStatus: "done",
				uploadResult: result.response,
			});
		})
		.catch((error) => {
			if (controller.signal.aborted) {
				store.updateFile(id, { uploadStatus: "canceled" });
				return;
			}
			store.updateFile(id, {
				uploadStatus: "error",
				uploadError: toUploadError(error),
			});
		})
		.finally(() => {
			clearGraceTimer(id);
			active.delete(id);
			pump();
		});
}

// ...

function scheduleForceFree(id: string, controller: AbortController): void {
	const timer = setTimeout(() => {
		graceTimers.delete(id);
		if (active.get(id) === controller) {
			active.delete(id);
			store.updateFile(id, { uploadStatus: "canceled" });
			pump();
		}
	}, cancelGraceMs);
	graceTimers.set(id, timer);
}
```

Note `scheduleForceFree`'s `if (active.get(id) === controller)` guard
(the pattern to replicate) versus the unconditional `.then`/`.catch`/`.finally`
above.

- Existing test coverage: `packages/core/src/upload-queue.test.ts` has a test
  around line 243 (per prior audit note) covering "transport never settles"
  (the force-free path in isolation) but nothing covering "transport settles
  *late*, after force-free already ran" — this is the untested gap this plan
  closes with a new test.
- Convention: this file is the only place upload concurrency/retry state is
  mutated (per `CONTRIBUTING.md`: "retry/backoff lives in one place ... every
  transport stays thin") — keep the fix inside `startUpload`/`scheduleForceFree`,
  do not add a parallel tracking structure.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|-------------------------------------------------------|---------------------|
| Install   | `pnpm install`                                        | exit 0              |
| Typecheck | `pnpm --filter @mediadrop/core typecheck`              | exit 0, no errors   |
| Tests     | `pnpm --filter @mediadrop/core test`                   | all pass            |
| Lint      | `pnpm lint`                                           | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `packages/core/src/upload-queue.ts`
- `packages/core/src/upload-queue.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `packages/core/src/retry.ts` — a related but separate bug (dangling abort
  listener) is tracked in `plans/007-fix-retry-abort-listener-leak.md`. Do not
  fix it here.
- Any transport package (`s3`, `tus`, `xhr-upload`) — they only need to honor
  `signal`, which is already their contract; this plan does not touch them.

## Git workflow

- Branch: `advisor/001-fix-upload-queue-settle-race`
- Commit per logical unit (one commit for the fix, one for tests is fine, or
  combined — match whatever is smallest and reviewable).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Capture the controller identity check as a helper

In `packages/core/src/upload-queue.ts`, add a small helper next to
`clearGraceTimer` that both `startUpload`'s settle handlers and
`scheduleForceFree` can share:

```ts
function isStillActive(id: string, controller: AbortController): boolean {
	return active.get(id) === controller;
}
```

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0 (no behavior change yet).

### Step 2: Guard the `.then` (success) handler

Change:

```ts
.then((result) => {
	store.updateFile(id, {
		uploadStatus: "done",
		uploadResult: result.response,
	});
})
```

to:

```ts
.then((result) => {
	if (!isStillActive(id, controller)) return;
	if (controller.signal.aborted) {
		store.updateFile(id, { uploadStatus: "canceled" });
		return;
	}
	store.updateFile(id, {
		uploadStatus: "done",
		uploadResult: result.response,
	});
})
```

This fixes both bugs at once: the stale-controller case (`!isStillActive`)
now no-ops instead of clobbering a newer upload, and the "resolved after
abort" case now reports `"canceled"` instead of `"done"`, matching what
`.catch` already does for the reject path.

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0.

### Step 3: Guard the `.catch` handler

Change:

```ts
.catch((error) => {
	if (controller.signal.aborted) {
		store.updateFile(id, { uploadStatus: "canceled" });
		return;
	}
	store.updateFile(id, {
		uploadStatus: "error",
		uploadError: toUploadError(error),
	});
})
```

to:

```ts
.catch((error) => {
	if (!isStillActive(id, controller)) return;
	if (controller.signal.aborted) {
		store.updateFile(id, { uploadStatus: "canceled" });
		return;
	}
	store.updateFile(id, {
		uploadStatus: "error",
		uploadError: toUploadError(error),
	});
})
```

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0.

### Step 4: Guard the `.finally` handler

Change:

```ts
.finally(() => {
	clearGraceTimer(id);
	active.delete(id);
	pump();
});
```

to:

```ts
.finally(() => {
	clearGraceTimer(id);
	if (isStillActive(id, controller)) {
		active.delete(id);
	}
	pump();
});
```

`pump()` still runs unconditionally — it is idempotent and cheap (a no-op
if there's no room/nothing pending) — but `active.delete(id)` must not run
if `id` now points at a different, live controller. Note `clearGraceTimer(id)`
is keyed by `id` only, not by controller — leave it as-is: a stale grace
timer for this `id` was already consumed/cleared by the force-free path
itself if it ran, and clearing an already-cleared timer is a no-op.

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0.

### Step 5: Add a regression test for the late-settle race

In `packages/core/src/upload-queue.test.ts`, add a test modeled on the
existing "transport never settles" test near line 243. Shape:

1. Create a queue with `cancelGraceMs: 10` and a transport whose `upload()`
   returns a promise you control manually (resolve it yourself later in the
   test, don't let it ever reject/resolve on its own).
2. `enqueue(id)`, then `cancel(id)` — this aborts the controller and starts
   the grace timer.
3. Advance time past `cancelGraceMs` (fake timers) so force-free runs:
   assert `store.getFile(id).uploadStatus === "canceled"`.
4. `enqueue(id)` again (simulating a fast user retry) — this creates a new
   controller and starts a new upload attempt for the same `id`.
5. **Now** resolve the *original* stuck transport promise from step 1.
6. Assert the file's `uploadStatus` is unaffected by the stale resolution —
   it should still reflect whatever the *second* upload attempt is doing
   (e.g. `"uploading"`), not `"done"`.

**Verify**: `pnpm --filter @mediadrop/core test -- upload-queue` → all pass,
including the new test.

## Test plan

- New test: "a transport that settles after force-free does not corrupt a
  later re-upload of the same id" in `packages/core/src/upload-queue.test.ts`,
  covering the exact race described in Step 5.
- Model the fake-timer/manual-promise-control pattern after the existing
  "never settles" test in the same file (same file, same setup style).
- Verification: `pnpm --filter @mediadrop/core test` → all pass, including
  the new test.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm --filter @mediadrop/core typecheck` exits 0
- [ ] `pnpm --filter @mediadrop/core test` exits 0; the new late-settle test exists and passes
- [ ] `grep -n "isStillActive" packages/core/src/upload-queue.ts` shows it used in `.then`, `.catch`, and `.finally`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `packages/core/src/upload-queue.ts` doesn't match the "Current
  state" excerpt above (drifted since this plan was written).
- The new regression test can't reproduce the race after a reasonable
  attempt (e.g. fake timers don't interact with the queue's internal
  `setTimeout` the way expected) — report the mismatch rather than deleting
  the test to make it pass.
- Fixing this appears to require changing `UploadQueueStore`'s interface
  (`getFile`/`updateFile`) — it shouldn't; if it does, the assumption that
  this is purely a same-file fix is false.

## Maintenance notes

- Any future change to `startUpload`'s settle handlers must preserve the
  `isStillActive` check — it's now the load-bearing guard against exactly
  this class of race.
- If `cancelGraceMs` is ever removed or reworked, re-review whether this
  guard is still necessary (it exists specifically because force-free can
  reassign `id` to a new controller while an old promise is still pending).
