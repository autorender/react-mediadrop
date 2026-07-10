# Plan 019: Allow arbitrary prop passthrough (aria-*, className, id, etc.) in getRootProps/getInputProps

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/react/src/useMediaDrop.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — purely additive to the argument/return type shapes; existing callers (which only pass the currently-recognized event handler props) are unaffected.
- **Depends on**: none
- **Category**: tech debt & architecture, direction (accessibility/DX parity with `react-dropzone`, the ecosystem convention this package's API deliberately mirrors)
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`packages/react/src/useMediaDrop.ts`'s `GetRootPropsArg` (lines 64-73) and
`GetInputPropsArg` (lines 88-91), verified by direct read:

```ts
export type GetRootPropsArg = {
	onClick?: (event: MouseEvent<HTMLElement>) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
	onFocus?: (event: FocusEvent<HTMLElement>) => void;
	onBlur?: (event: FocusEvent<HTMLElement>) => void;
	onDragEnter?: (event: ReactDragEvent<HTMLElement>) => void;
	onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
	onDragLeave?: (event: ReactDragEvent<HTMLElement>) => void;
	onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
};

export type GetInputPropsArg = {
	onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
	onClick?: (event: MouseEvent<HTMLInputElement>) => void;
};
```

Both types only recognize a fixed, closed set of event-handler
properties — there is no mechanism to pass through `aria-label`,
`aria-describedby`, `className`, `id`, `data-*` attributes, or any other
prop onto the element `getRootProps()`/`getInputProps()` produces. This
is a real gap relative to the `react-dropzone` convention this package's
API is modeled on (its `getRootProps(customProps)`/`getInputProps(customProps)`
spread *any* provided props onto the returned object, merging only the
recognized event handlers specially and passing everything else through
verbatim) — and it's a genuine accessibility limitation: a consumer
cannot label the dropzone region for screen readers (`aria-label`,
`aria-describedby` pointing at instructions text) or add a `className`
without reaching around this hook's API (e.g. spreading `getRootProps()`'s
result into a JSX element and then separately, manually adding
`aria-label` outside of it — which does work today since `getRootProps()`'s
result is just spread onto a `<div>`, but forces the consumer to duplicate
the "which props go on the root vs. rendered manually" decision rather
than the hook handling it uniformly).

## Current state

- `packages/react/src/useMediaDrop.ts` lines 64-73 (`GetRootPropsArg`), 75-86 (`RootProps`), 88-91 (`GetInputPropsArg`), 93-101 (`InputProps`), 341-364 (`getRootProps` implementation), 377-397 (`getInputProps` implementation).
- `composeHandlers` (lines 43-53) already correctly merges a user-supplied handler with the internal one for the currently-recognized handler props — this pattern should extend to arbitrary passthrough props too, just without any merging needed (non-handler props pass through as-is; only handler props need `composeHandlers`).

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/react typecheck`  | exit 0               |
| Tests     | `pnpm --filter @mediadrop/react test`       | all pass             |

## Scope

**In scope**: `packages/react/src/useMediaDrop.ts`, `packages/react/src/useMediaDrop.test.ts`, `packages/react/README.md` (document passthrough).

**Out of scope**: `@mediadrop/vanilla` — its DOM-plumbing model (consumer owns the actual elements, this library only attaches listeners) doesn't have the same `getXProps()` object-spread pattern, so this gap doesn't apply there the same way.

## Git workflow

- Branch: `advisor/019-improve-dropzone-accessibility-prop-passthrough`

## Steps

### Step 1: Widen `GetRootPropsArg`/`GetInputPropsArg` to accept arbitrary extra props

```ts
export type GetRootPropsArg = React.HTMLAttributes<HTMLElement> & {
	onClick?: (event: MouseEvent<HTMLElement>) => void;
	onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
	onFocus?: (event: FocusEvent<HTMLElement>) => void;
	onBlur?: (event: FocusEvent<HTMLElement>) => void;
	onDragEnter?: (event: ReactDragEvent<HTMLElement>) => void;
	onDragOver?: (event: ReactDragEvent<HTMLElement>) => void;
	onDragLeave?: (event: ReactDragEvent<HTMLElement>) => void;
	onDrop?: (event: ReactDragEvent<HTMLElement>) => void;
};
```

Using `React.HTMLAttributes<HTMLElement>` as a base (rather than a bare
`[key: string]: unknown` index signature) keeps the existing recognized
handler properties correctly typed (they're redeclared afterward with
this hook's own signatures, which TypeScript allows as a narrowing
override of the same-named base properties as long as they're
compatible) while gaining `aria-*`, `className`, `id`, `data-*`, `style`
(careful — see Step 2), etc. for free. Apply the equivalent treatment to
`GetInputPropsArg` with `React.InputHTMLAttributes<HTMLInputElement>`.

**Verify**: `pnpm --filter @mediadrop/react typecheck` → exit 0.

### Step 2: Update `getRootProps`/`getInputProps` to spread passthrough props

```ts
const getRootProps = useCallback(
	(arg: GetRootPropsArg = {}): RootProps => {
		const { onClick, onKeyDown, onFocus, onBlur, onDragEnter, onDragOver, onDragLeave, onDrop, ...rest } = arg;
		return {
			...rest,
			role: "presentation",
			tabIndex: optionsRef.current.noKeyboard ? undefined : 0,
			onClick: composeHandlers(onClick, handleClick),
			onKeyDown: composeHandlers(onKeyDown, handleKeyDown),
			onFocus: composeHandlers(onFocus, handleFocus),
			onBlur: composeHandlers(onBlur, handleBlur),
			onDragEnter: composeHandlers(onDragEnter, handleDragEnter),
			onDragOver: composeHandlers(onDragOver, handleDragOver),
			onDragLeave: composeHandlers(onDragLeave, handleDragLeave),
			onDrop: composeHandlers(onDrop, handleDrop),
		};
	},
	[handleClick, handleKeyDown, handleFocus, handleBlur, handleDragEnter, handleDragOver, handleDragLeave, handleDrop],
);
```

Note `...rest` is spread *before* the explicit fields so a consumer
cannot accidentally override `role`/`tabIndex`/the composed handlers by
passing same-named keys in `rest` — though TypeScript's structural typing
means `rest` shouldn't contain those keys anyway since they were
destructured out above; this ordering is a defense-in-depth habit, not
strictly required. For `getInputProps`, be careful with `style`: the
current `HIDDEN_INPUT_STYLE` (`display: none`) is load-bearing (per the
`handleInputClick`/click-forwarding comment at lines 366-369) — if a
consumer passes their own `style` in passthrough props, decide whether to
merge (`{ ...HIDDEN_INPUT_STYLE, ...rest.style }`) or ignore a
consumer-supplied `style` on the input specifically, since overriding
`display: none` on the real file input would break the intentional
"hidden native input, custom-styled root as the visible dropzone" pattern
this hook is built around. Recommend merging but keeping `display: none`
non-overridable (spread consumer style first, then force `display: "none"`
last) to prevent this foot-gun.

**Verify**: `pnpm --filter @mediadrop/react typecheck` → exit 0.

### Step 3: Add tests

In `useMediaDrop.test.ts`: `getRootProps({ "aria-label": "Drop files here", className: "my-dropzone" })` → resulting object includes those keys verbatim alongside the existing recognized ones; `getInputProps({ "aria-hidden": "true" })` → passthrough works; a test confirming a consumer-supplied `style.display` on `getInputProps()` does NOT defeat the hidden-input pattern (still resolves to `display: none` in the final merged style), if that mitigation from Step 2 is implemented.

**Verify**: `pnpm --filter @mediadrop/react test -- useMediaDrop` → all pass, including new tests.

### Step 4: Update README with an accessibility example

Add an example to `packages/react/README.md` showing
`getRootProps({ "aria-label": "...", "aria-describedby": "..." })` for
labeling the dropzone region, matching the kind of accessibility guidance
`react-dropzone`'s own docs provide.

**Verify**: re-read the added example, confirm it typechecks if extracted (spot-check by hand, no automated doc-example test exists in this repo per the docs audit).

## Test plan

- New tests per Step 3 (aria/className passthrough on both `getRootProps` and `getInputProps`; hidden-input style non-defeatable if that mitigation is built).
- All existing `useMediaDrop.test.ts` tests pass unchanged (purely additive change).

## Done criteria

- [ ] `GetRootPropsArg`/`GetInputPropsArg` accept arbitrary HTML attributes, not just the fixed handler set
- [ ] `getRootProps`/`getInputProps` spread those through onto the returned props object
- [ ] The hidden-input `display: none` pattern can't be silently defeated by passthrough `style`
- [ ] New tests pass; all existing tests pass unchanged
- [ ] README documents an accessibility-labeling example
- [ ] No files outside scope modified

## STOP conditions

- None expected — this is a purely additive, low-risk widening of an existing type/function pair.

## Maintenance notes

- Any future new recognized handler added to `RootProps`/`InputProps`
  should be destructured out of `rest` the same way the existing ones
  are, so it isn't accidentally double-included via passthrough.
