# Plan 030: Add a zero-install browser playground (StackBlitz/CodeSandbox-embeddable)

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- examples/ playground/`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/029-example-matrix-and-headless-example.md` (a playground is most useful once there's more than one example to showcase; can build the playground around just `react-demo` first and extend it as `plans/029`'s new examples land)
- **Category**: direction
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

A zero-install, in-browser playground (a StackBlitz/CodeSandbox
"Open in ..." link, or an embeddable live-editable demo on a future docs
site per `plans/027`) is a well-established lever for library adoption —
someone evaluating whether to use `@mediadrop/*` can try it in seconds
without cloning the repo, running `pnpm install`, and starting a dev
server locally. This repo currently offers no such path — the only way
to see mediadrop in action is to clone the whole monorepo and run the
example locally (per `plans/029`'s findings about what exists today).
This is a direction/adoption-lever finding, not a bug — framed as a
recommendation the operator can choose to act on, sized here as a
concrete, scoped plan rather than left as a vague suggestion.

## Current state

- No `stackblitz.rc`/`.codesandbox/` config, no playground-specific
  build output anywhere in the repo.
- `examples/react-demo` (and `plans/029`'s planned `examples/vanilla-demo`)
  are the natural source material to adapt into a playground — they
  already demonstrate real usage; a playground just needs to make them
  launchable from a URL without a local clone.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|----------------------|
| (StackBlitz/CodeSandbox require no local build step — they clone from a GitHub URL directly at their own build time) | | |

## Scope

**In scope**: a `.stackblitzrc` (or CodeSandbox-equivalent) config file
for `examples/react-demo` (and any new example from `plans/029`) so an
"Open in StackBlitz" link works correctly out of the box; a
`README.md`-level (or docs-site-level, once `plans/027` lands) link/badge
pointing at it.

**Out of scope**: building a fully custom in-browser playground app (a
Monaco-editor-based, WebContainer-powered custom tool) — that's a much
larger, separate investment; this plan scopes to the low-cost
"link into an existing hosted playground service" version.

## Git workflow

- Branch: `advisor/030-zero-install-playground`

## Steps

### Step 1: Confirm a StackBlitz "Open" URL actually works against this monorepo's structure

StackBlitz can open a GitHub repo/subdirectory directly via a URL pattern
like `https://stackblitz.com/github/<org>/<repo>/tree/<branch>/examples/react-demo`
— but pnpm workspaces with `workspace:*` protocol dependencies (per
`plans/020`'s finding about `react-demo`'s current dependency style) may
not resolve correctly in StackBlitz's isolated environment, since it
doesn't have the rest of the monorepo's `packages/*` to link against.
Test this directly by opening the constructed URL and observing whether
install succeeds.

**Verify**: manually open the constructed StackBlitz URL in a browser, confirm the project installs and runs without a "package not found" error for any `@mediadrop/*` dependency.

### Step 2: If Step 1 fails due to workspace-linking, adapt the approach

Options if the raw monorepo-subdirectory link doesn't work:
- **(a)** Publish a lightweight, standalone "playground" variant of
  `react-demo` that depends on real npm-published versions of
  `@mediadrop/*` (once `plans/004` ships them) rather than `workspace:*`
  — this variant lives in a separate, tiny repo or branch built
  specifically for StackBlitz compatibility.
- **(b)** Use CodeSandbox's "Import from GitHub" instead, if it handles
  pnpm workspace protocol dependencies more gracefully (test both before
  committing to one).

**Verify**: whichever option is chosen, confirm end-to-end that the
resulting link opens, installs, and runs the demo with zero local setup.

### Step 3: Add the link/badge to visible docs

Add an "Open in StackBlitz" badge/link to the root `README.md` and (once
`plans/027` lands) the docs site's quickstart page.

**Verify**: click the badge from a fresh incognito browser session, confirm it works with no prior local state.

## Test plan

- Manual, human-in-the-loop verification only (this is inherently a
  "does the external hosted service work with our repo" check, not
  something CI can practically automate) — confirm once at
  implementation time, and re-confirm if `plans/004`'s package-metadata
  changes or `plans/029`'s new examples land afterward, since either
  could change whether the link still resolves correctly.

## Done criteria

- [ ] A working zero-install playground link confirmed functional end-to-end
- [ ] Link/badge added to root README (and docs site, once it exists)
- [ ] Approach documented (which service, why, and the Step 1/2 findings) so a future contributor understands why this specific approach was chosen
- [ ] No files outside scope modified

## STOP conditions

- If neither StackBlitz nor CodeSandbox can be made to work cleanly with
  this monorepo's pnpm-workspace structure without publishing a separate
  standalone variant (option (a) in Step 2), treat that as a real finding
  to report back rather than forcing a broken/flaky link into the README
  — a badge that doesn't reliably work is worse than no badge.

## Maintenance notes

- Re-verify the playground link whenever example dependencies or the
  workspace structure change materially, since these hosted services are
  sensitive to exactly that.
