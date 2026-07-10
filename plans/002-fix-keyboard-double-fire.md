# Plan 002: Fix keyboard handler firing the file dialog for any Enter/Space inside the root, not just on the root itself

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on.
> Stop and report on any "STOP conditions" match — don't improvise.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/react/src/useMediaDrop.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (accessibility-adjacent)
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`useMediaDrop`'s `handleKeyDown` (`packages/react/src/useMediaDrop.ts:325-331`) opens the
file dialog on Enter/Space with no check that `event.target` is the root
element itself:

```ts
const handleKeyDown = useCallback(
	(event: React.KeyboardEvent) => {
		if (noKeyboard || noClick) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openFileDialog();
		}
	},
	[noKeyboard, noClick, openFileDialog],
);
```

Because `getRootProps()` spreads this handler onto the root `div`, and React's
synthetic events bubble, pressing Enter/Space on **any** focusable descendant
of the root (a button, a link, a "remove file" control) also triggers
`openFileDialog()` — unless the descendant's own handler calls
`stopPropagation()`. `examples/react-demo/src/App.tsx:184` only calls
`event.stopPropagation()` in the descendant button's **click** handler, not
its keydown handler, so keyboard activation of that in-root button in the
live demo double-fires: it does its own action *and* opens the file picker.
This is a real, demonstrated bug in the shipped example, not a hypothetical.

## Current state

- `packages/react/src/useMediaDrop.ts` lines 325-331 — the handler in question.
- `packages/core/src/dropzone.ts` has no equivalent keydown handling (it's a
  React-only concern — vanilla wires its own click/keyboard directly, see
  `packages/vanilla/src/index.ts`, which has no `handleKeyDown` at all
  because vanilla's `open()` is only exposed as an explicit method, not
  bound to a keydown listener on `root`).
- `examples/react-demo/src/App.tsx` lines 160-250, specifically the button
  around line 184 with `event.stopPropagation()` present only on `onClick`.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
|-----------|------------------------------------------------|----------------------|
| Install   | `pnpm install`                                 | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/react typecheck`     | exit 0               |
| Tests     | `pnpm --filter @mediadrop/react test`          | all pass             |
| Lint      | `pnpm lint`                                    | exit 0               |

## Scope

**In scope**:
- `packages/react/src/useMediaDrop.ts`
- `packages/react/src/useMediaDrop.test.tsx`
- `examples/react-demo/src/App.tsx` (fix the demo's own bug as a real-world regression check, not just the library)

**Out of scope**:
- `packages/vanilla` and `packages/core` — vanilla has no equivalent handler; no change needed there.
- Any accessibility improvements beyond this exact issue (see `plans/019-improve-dropzone-accessibility.md` for BIND-02/03).

## Git workflow

- Branch: `advisor/002-fix-keyboard-double-fire`
- One commit for the hook fix + test, one for the demo fix (or combined).

## Steps

### Step 1: Guard on `event.target === event.currentTarget`

In `packages/react/src/useMediaDrop.ts`, change:

```ts
const handleKeyDown = useCallback(
	(event: React.KeyboardEvent) => {
		if (noKeyboard || noClick) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openFileDialog();
		}
	},
	[noKeyboard, noClick, openFileDialog],
);
```

to:

```ts
const handleKeyDown = useCallback(
	(event: React.KeyboardEvent) => {
		if (noKeyboard || noClick) return;
		if (event.target !== event.currentTarget) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openFileDialog();
		}
	},
	[noKeyboard, noClick, openFileDialog],
);
```

This mirrors the standard react-dropzone-style guard: only react when the
event's original target *is* the root itself (i.e. the root has focus and
was activated directly), not when it bubbled up from a focusable descendant.

**Verify**: `pnpm --filter @mediadrop/react typecheck` → exit 0.

### Step 2: Add a regression test

In `packages/react/src/useMediaDrop.test.tsx`, add a test: render the hook's
root props on a `div` containing a nested `<button>`; fire a `keydown`
(`Enter`) on the nested button; assert `openFileDialog`'s effect (the mocked
`input.click()`) was **not** called. Add a second assertion that pressing
Enter directly on the root div itself still opens the dialog (regression
guard for the existing behavior).

**Verify**: `pnpm --filter @mediadrop/react test -- useMediaDrop` → all pass.

### Step 3: Fix the demo's matching bug

In `examples/react-demo/src/App.tsx` around line 184, the button with
`event.stopPropagation()` on `onClick` needs the same call on its keydown
handler (or, simpler, add `onKeyDown={(e) => e.stopPropagation()}` alongside
the existing `onClick`). Confirm by keyboard-testing the demo manually if a
browser is available, otherwise rely on Step 2's unit coverage as the
proof the underlying library behavior is fixed.

**Verify**: `pnpm --filter react-demo typecheck` → exit 0.

## Test plan

- New test in `useMediaDrop.test.tsx`: "keydown on a nested focusable
  element inside the root does not open the file dialog" + "keydown on the
  root itself still does."
- `pnpm --filter @mediadrop/react test` → all pass, including the new tests.

## Done criteria

- [ ] `event.target !== event.currentTarget` guard added to `handleKeyDown`
- [ ] New regression tests pass
- [ ] `examples/react-demo/src/App.tsx` keydown propagation fixed to match its click handler
- [ ] `pnpm --filter @mediadrop/react typecheck` and `test` both exit 0
- [ ] No files outside scope modified

## STOP conditions

- If `event.currentTarget` isn't reliably the root div in the actual JSX
  structure (e.g. `getRootProps()` is spread onto something other than a
  single root element in some consumer pattern), stop — the fix assumes a
  standard single-root usage.

## Maintenance notes

- Any new handler added to `getRootProps()` in the future should default to
  this same target-check pattern to avoid reintroducing bubble-triggered
  double-fires.
