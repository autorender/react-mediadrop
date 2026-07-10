# Plan 018: Pass validator into vanilla's handleDragEnter + expose drag state on VanillaMediaDrop

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/vanilla/src/index.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED — adding fields to `VanillaMediaDrop`'s public type and wiring a new DOM-visible behavior (drag-state class toggling or callback) is additive to the type but does touch a published package's public contract.
- **Depends on**: none
- **Category**: correctness/bugs, DX & tooling (feature parity gap between `@mediadrop/vanilla` and `@mediadrop/react`)
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Two related gaps in `@mediadrop/vanilla`, verified by direct read of `packages/vanilla/src/index.ts`:

1. **Missing validator argument** (line 146):
   ```ts
   function handleDragEnter(event: DragEvent): void {
   	event.preventDefault();
   	dropzone.handleDragEnter(event, restrictions?.accept);
   }
   ```
   `createDropzoneController().handleDragEnter` accepts a third,
   `validator` argument (confirmed in `packages/core/src/dropzone.ts`'s
   signature: `(event, accept?, validator?)`) which is used to preview
   whether a custom validator would reject the in-progress drag (setting
   `isDragReject` accordingly during the drag, before drop). `@mediadrop/react`'s
   `useMediaDrop.ts` correctly passes it (line 280:
   `optionsRef.current.validator`). `@mediadrop/vanilla` silently drops
   it — a consumer using `@mediadrop/vanilla` with a custom `validator`
   option gets no `isDragReject` preview during drag-over for
   validator-based rejections, only for `accept`-based ones. This is a
   real feature-parity gap between the two binding packages for
   identical `MediaDropOptions`.

2. **No drag state exposed on `VanillaMediaDrop` at all**: the
   `VanillaMediaDrop` type (lines 41-49) has no `isDragActive`/
   `isDragAccept`/`isDragReject`/`isFocused` fields, and
   `createMediaDrop`'s vanilla implementation never surfaces the
   `dropzone` controller's `getDragState()`/return values from
   `handleDragEnter`/`handleDragLeave`/`handleDrop` to the consumer at
   all — those calls' return values are discarded (`dropzone.handleDragEnter(event, restrictions?.accept)` at
   line 146 doesn't even capture the returned `DragState`). A vanilla
   consumer wanting to show a "drag active" visual state (e.g. toggling a
   CSS class on the root element) has no way to do so through this
   library's public API — they'd have to reimplement drag tracking
   themselves, defeating the purpose of a shared, framework-free
   dropzone controller.

## Current state

- `packages/vanilla/src/index.ts` lines 41-49 (`VanillaMediaDrop` type, no drag fields), lines 144-156 (`handleDragEnter`/`handleDragOver`/`handleDragLeave`/`handleDrop`, drag-state return values discarded), line 146 (2-arg `handleDragEnter` call missing `validator`).
- `packages/core/src/dropzone.ts` (`createDropzoneController`'s full public shape: `getDragState`, `handleDragEnter`, `handleDragOver`, `handleDragLeave`, `handleDrop`, `reset` — all already return/expose `DragState`; vanilla just isn't using what's already there).
- `packages/react/src/useMediaDrop.ts` lines 273-296 (the correct reference pattern: captures `dropzone.handleDragEnter(...)`'s return value into `setDragState`, passes `validator` as the third argument).

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/vanilla typecheck`| exit 0               |
| Tests     | `pnpm --filter @mediadrop/vanilla test`     | all pass             |

## Scope

**In scope**: `packages/vanilla/src/index.ts`, `packages/vanilla/src/index.test.ts`, `packages/vanilla/README.md` (document the new drag-state surface).

**Out of scope**: `packages/core/src/dropzone.ts` — already correct and sufficient; no core change needed, this is purely a vanilla-package wiring gap.

## Git workflow

- Branch: `advisor/018-fix-vanilla-drag-validator-and-state`

## Steps

### Step 1: Pass `validator` into `handleDragEnter`

```ts
function handleDragEnter(event: DragEvent): void {
	event.preventDefault();
	const nextState = dropzone.handleDragEnter(event, restrictions?.accept, validator);
	// (captured here for Step 2's use too)
}
```

**Verify**: `pnpm --filter @mediadrop/vanilla typecheck` → exit 0.

### Step 2: Decide and implement how vanilla exposes drag state

Two options — pick with the operator based on how "thin DOM plumbing" this package is meant to stay (per its own doc comment "Purely DOM plumbing — validation and state live in core"):

- **(a) Callback-based (matches existing `onChange` pattern)**: add an
  `onDragStateChange?: (state: DragState) => void` option, called from
  `handleDragEnter`/`handleDragOver`/`handleDragLeave`/`handleDrop` with
  the controller's returned state. Minimal API surface addition,
  consistent with this package's existing `onChange`-callback style.
- **(b) Method-based**: add `getDragState: () => DragState` to
  `VanillaMediaDrop`, and have consumers poll it or pair it with (a)'s
  callback to know when to re-read it. More surface, arguably redundant
  with (a) alone.

Recommend (a) alone (a callback), consistent with existing style and
sufficient for consumers to toggle CSS classes/attributes on drag-state
changes. Confirm with operator before implementing.

**Verify**: no command — a design decision, documented in the PR.

### Step 3: Implement the chosen option, wiring all four dropzone callbacks

Update `handleDragEnter`, `handleDragOver` (no state change, but confirm),
`handleDragLeave`, and `handleDrop` to capture the controller's returned
`DragState` and invoke the new `onDragStateChange` callback (if provided)
whenever it changes.

**Verify**: `pnpm --filter @mediadrop/vanilla typecheck` → exit 0.

### Step 4: Add tests and update README

Add tests in `index.test.ts` covering: `onDragStateChange` fires with
accept/reject state during a drag with a custom `validator` configured
(covering the Step 1 fix); fires with idle state after drop/leave.
Update `packages/vanilla/README.md` to document the new option, following
the same structure used to document `onChange`.

**Verify**: `pnpm --filter @mediadrop/vanilla test` → all pass, including new tests.

## Test plan

- New test: dragging a file that fails a custom `validator` (but passes
  `accept`) results in `isDragReject: true` being reported via the new
  callback — this is the regression test for the Step 1 fix, since
  without it this scenario incorrectly reports `isDragReject: false`.
- New tests for the Step 3 callback wiring across enter/leave/drop.
- All existing vanilla tests continue to pass unchanged.

## Done criteria

- [ ] `handleDragEnter` passes `validator` through to the core dropzone controller
- [ ] Vanilla exposes drag state to consumers via the chosen mechanism
- [ ] New tests pass; all existing tests pass unchanged
- [ ] README documents the new surface
- [ ] No files outside scope modified

## STOP conditions

- If the operator prefers a different API shape than callback-based
  (e.g. wants drag state folded into the existing `getState()`/`subscribe()`
  surface instead of a separate callback), stop and redesign around that
  preference rather than proceeding with (a) unilaterally — this is a
  public API design choice, not purely a bug fix.

## Maintenance notes

- Cross-reference `@mediadrop/react`'s `useMediaDrop.ts` (lines 273-296)
  whenever changing drag-state wiring in either package going forward —
  the two should stay in feature parity for the same underlying
  `@mediadrop/core` capabilities, since this parity gap is exactly what
  this plan fixes.
