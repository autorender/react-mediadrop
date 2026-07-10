# Plan 017: Don't set isDragActive for non-file drags (text/link drag-over)

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/core/src/dropzone.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness/bugs
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`packages/core/src/dropzone.ts`'s `handleDragEnter` (lines 117-126,
verified by direct read):

```ts
function handleDragEnter(
	event: DragEvent,
	accept?: MediaDropRestrictions["accept"],
	validator?: MediaDropValidator,
): DragState {
	depth += 1;
	const acceptance = evaluateAcceptance(event, accept, validator);
	state = { isDragActive: true, ...acceptance };
	return state;
}
```

`isDragActive` is set to `true` unconditionally on any `dragenter`,
regardless of whether the thing being dragged is actually a file.
Dragging a text selection, a link, or an image from another part of the
same page over the dropzone all fire native `dragenter` events too (drag
sources aren't limited to file drops), and none of those carry
`event.dataTransfer.types` containing `"Files"`. `evaluateAcceptance`
(lines 75-115) already has the data needed to detect this — it reads
`event.dataTransfer?.items` — but the current logic only uses that to
compute `isDragAccept`/`isDragReject`, defaulting both to `false` when
nothing evaluable is present (line 108-110), while `isDragActive` itself
is set unconditionally one level up in `handleDragEnter`, bypassing that
check entirely. The result: dragging a text selection over a mediadrop
dropzone shows the same "drag active" visual affordance as dragging an
actual file — a real, user-visible UX inaccuracy, and notably the
opposite bug from `@mediadrop/react`'s own document-level tracking
(`useMediaDrop.ts`'s `hasFiles` helper at lines 243-246), which *does*
correctly gate on `event.dataTransfer.types.includes("Files")` before
setting `isDragGlobal` — so the fix pattern already exists elsewhere in
this codebase, just not applied here.

## Current state

- `packages/core/src/dropzone.ts` lines 117-126 (`handleDragEnter`, shown above).
- `packages/react/src/useMediaDrop.ts` lines 243-246 (`hasFiles` helper — the existing, correct pattern to mirror): `const types = event.dataTransfer?.types; return types ? Array.from(types).includes("Files") : false;`

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/core typecheck`   | exit 0               |
| Tests     | `pnpm --filter @mediadrop/core test`        | all pass             |

## Scope

**In scope**: `packages/core/src/dropzone.ts`, `packages/core/src/dropzone.test.ts`.

**Out of scope**: `useMediaDrop.ts`'s own document-level `hasFiles` — already correct, used only as a reference pattern.

## Git workflow

- Branch: `advisor/017-fix-dropzone-nonfile-drag-state`

## Steps

### Step 1: Add a file-presence gate before setting isDragActive

```ts
function hasFiles(event: DragEvent): boolean {
	const types = event.dataTransfer?.types;
	return types ? Array.from(types).includes("Files") : false;
}

function handleDragEnter(
	event: DragEvent,
	accept?: MediaDropRestrictions["accept"],
	validator?: MediaDropValidator,
): DragState {
	depth += 1;
	if (!hasFiles(event)) {
		state = IDLE_DRAG_STATE;
		return state;
	}
	const acceptance = evaluateAcceptance(event, accept, validator);
	state = { isDragActive: true, ...acceptance };
	return state;
}
```

Note `depth` still increments even for a non-file drag entering — this
preserves the enter/leave depth-counting invariant for nested-element
drags of the same non-file content (a `dragleave` for that same drag must
still be able to decrement `depth` correctly on its way out). Only the
resulting `state` differs.

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0.

### Step 2: Add regression tests

In `dropzone.test.ts`: a `DragEvent`-like fixture with
`dataTransfer.types` not containing `"Files"` (e.g. only `"text/plain"`)
→ `handleDragEnter` returns `isDragActive: false`. A fixture with
`types` containing `"Files"` → existing behavior (isDragActive: true)
unchanged. Also test the depth-counting interaction: enter (non-file) →
leave → confirm depth returns to a state that doesn't leak into a
subsequent real file drag's accounting.

**Verify**: `pnpm --filter @mediadrop/core test -- dropzone` → all pass, including new tests.

## Test plan

- New test: non-file drag (`types: ["text/plain"]`) → `isDragActive: false` after `handleDragEnter`.
- Existing test: file drag → `isDragActive: true`, unchanged.
- Depth-counter interaction test per Step 2.

## Done criteria

- [ ] `handleDragEnter` no longer sets `isDragActive: true` for a drag with no `"Files"` in `dataTransfer.types`
- [ ] New regression tests pass
- [ ] All existing `@mediadrop/core` dropzone tests pass unchanged
- [ ] No files outside scope modified

## STOP conditions

- If any existing test's fixture doesn't set `dataTransfer.types` at all
  (only sets `dataTransfer.items`), the new `hasFiles` gate would treat
  it as a non-file drag and break that test — check every existing
  `dropzone.test.ts` fixture's shape before assuming this is purely
  additive; if fixtures are missing `types`, fix the fixtures to
  realistically include `types: ["Files"]` alongside `items`, since real
  browsers always populate both together for file drags.

## Maintenance notes

- `@mediadrop/vanilla`'s `handleDragEnter` wrapper (`vanilla/src/index.ts`)
  calls straight into this controller and will automatically benefit once
  fixed here — no separate vanilla-side change needed for this specific bug.
