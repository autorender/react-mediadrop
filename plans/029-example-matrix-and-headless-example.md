# Plan 029: Add a per-transport example matrix + a headless (no-React) example

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- examples/`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW — purely additive new example projects; no existing package code touched.
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Confirmed by direct inspection this audit: `examples/` contains exactly
one project, `react-demo` (a 326-line `App.tsx`, confirmed via `wc -l`,
already covering a meaningful chunk of validation/drag states per this
audit's read of it). This is the *only* runnable example in the entire
repo — there is no example demonstrating `@mediadrop/vanilla` (plain
JS/DOM, no framework), no example demonstrating `@mediadrop/s3` or
`@mediadrop/tus` transports specifically (react-demo's transport choice
wasn't confirmed to cover all three — check as part of Step 1), and
nothing demonstrating the headless pattern this library's own README
emphasizes ("headless-first... you own all markup") without React at
all. For a library whose core value proposition is "framework-agnostic
core + thin bindings," having only one framework's example is a real gap
for anyone evaluating whether the `@mediadrop/vanilla` binding or a
custom-framework integration is viable — they have nothing to run and
read.

## Current state

- `examples/react-demo/` — the only example; uses `workspace:*`
  dependencies (per `plans/020`'s finding) and (confirm as part of Step 1)
  an unconfirmed subset of the three transport packages.
- `packages/vanilla/README.md` — has code snippets but no runnable,
  buildable example project a contributor can actually execute end-to-end.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|---------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Run demo  | `pnpm --filter react-demo dev` (or equivalent — confirm actual script name) | starts a local dev server |

## Scope

**In scope**: new `examples/vanilla-demo/` (plain JS/DOM, no framework,
demonstrating `@mediadrop/vanilla` + one transport); confirm whether
`examples/react-demo` already covers S3/tus or only `xhr-upload`, and if
it only covers one transport, either extend it or add a second demo
covering the others.

**Out of scope**: a full CLI scaffolder (`create-mediadrop`, per DIR-05
below) — this plan is about example *projects* living in this repo, not
a generator tool for external projects.

## Git workflow

- Branch: `advisor/029-example-matrix-and-headless-example`

## Steps

### Step 1: Audit what `react-demo` currently covers

Read `examples/react-demo/src/App.tsx` and its `package.json` in full to
confirm exactly which transport package(s) it depends on and demonstrates
(likely just `@mediadrop/xhr-upload`, given it's described as "the
reference transport" elsewhere in this audit's docs findings — confirm
rather than assume).

**Verify**: no command — a reading/confirmation step; document findings in the PR.

### Step 2: Build `examples/vanilla-demo/`

A minimal plain-JS/HTML/CSS project (no bundler-framework, or a minimal
Vite vanilla-JS template if some build tooling is still wanted for
dev-server convenience) using `@mediadrop/vanilla`'s `createMediaDrop`
directly, demonstrating drag/drop, validation feedback, and an upload via
one transport (`@mediadrop/xhr-upload`, matching `react-demo`'s choice
for easy side-by-side comparison).

**Verify**: `pnpm --filter vanilla-demo dev` (or equivalent) → starts, dropzone visibly works when manually tested in a browser.

### Step 3: Fill any transport gap found in Step 1

If Step 1 confirms `react-demo` only demonstrates `xhr-upload`, add a
second, minimal example (or a mode-switch within `react-demo` itself, if
that's simpler than a whole new project) demonstrating `@mediadrop/s3`
and `@mediadrop/tus` against a mock/local server — confirm whether a
local S3-compatible mock (e.g. `s3rver` or similar) or a real bucket is
more appropriate; a mock is preferable for a repo-hosted example so
contributors can run it without cloud credentials.

**Verify**: manually run the new/extended example, confirm an upload actually completes end-to-end against the local mock server.

### Step 4: Wire into CI's smoke-test awareness (optional but recommended)

If `plans/020`'s install-smoke-test infrastructure exists, consider
whether these new examples should also be built as part of CI (at
minimum, `pnpm build`/`typecheck` should already cover them if they're in
the workspace glob — confirm `examples/*` is covered by
`pnpm-workspace.yaml`, which it already is per prior audit reads).

**Verify**: `pnpm typecheck` and `pnpm build` (repo-wide) → include and pass for the new example(s).

## Test plan

- No new automated tests required (examples aren't unit-tested code) —
  but confirm `pnpm typecheck`/`pnpm build` pass for the new example(s),
  and manually verify each new example actually works end-to-end in a
  browser before considering this done.

## Done criteria

- [ ] `examples/vanilla-demo/` added, runnable, demonstrates `@mediadrop/vanilla` end-to-end
- [ ] Transport coverage gap (if any, per Step 1) filled
- [ ] `pnpm typecheck`/`pnpm build` pass repo-wide including new example(s)
- [ ] Each new/extended example manually verified to work in a browser
- [ ] No files outside scope modified

## STOP conditions

- If Step 3's S3/tus example would require real cloud credentials to run
  (no viable local mock found), stop and discuss with the operator
  whether that's acceptable (contributors without AWS access can't run
  it) or whether the example should instead point to clear, well-tested
  instructions rather than a runnable local demo.

## Maintenance notes

- Keep the example matrix (which example covers which
  binding × transport combination) documented somewhere visible (e.g.
  `examples/README.md`, add one if it doesn't exist) so gaps are obvious
  to future contributors, rather than only discoverable by reading each
  example's source.
