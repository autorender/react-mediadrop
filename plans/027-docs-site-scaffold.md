# Plan 027: Scaffold a Mintlify docs site

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- apps/docs`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW — purely additive new content; no existing package/example code touched.
- **Depends on**: none (but sequence *after* `plans/004`/`plans/003` if possible, so the docs site's install instructions can reference real, publishable package names/versions rather than `private: true` placeholders)
- **Category**: docs
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Confirmed by direct inspection this audit: there is no `apps/` directory,
no `mint.json`/`docs.json` anywhere in the repo — all documentation today
lives as `README.md` files per package plus prose docs under
`skills/mediadrop/references/` (`core-concepts.md`, `upload.md`,
`validation.md`, etc., confirmed accurate by this audit's docs-accuracy
pass). This is a real gap for discoverability and SEO/onboarding
compared to a proper documentation site: a prospective user has to find
and clone the GitHub repo and read READMEs in a code-browsing context,
rather than landing on a purpose-built docs site with search, a
quickstart, and per-package API reference pages. This finding directly
parallels the workspace-wide note that Autorender's own `docs` repo uses
Mintlify (per shared workspace context) — reusing the same tooling this
organization already knows and operates elsewhere is a reasonable,
low-friction choice rather than introducing a third docs framework.

## Current state

- No `apps/docs`, no `mint.json`/`docs.json`, no Mintlify dependency anywhere in this repo.
- `skills/mediadrop/references/*.md` — accurate, substantial prose content that can be adapted/ported into docs-site pages rather than written from scratch.
- Each `packages/*/README.md` — per-package usage docs, also portable source material.

## Commands you will need

| Purpose        | Command                      | Expected on success |
|-----------------|----------------------------------|----------------------|
| Local preview   | `mintlify dev` (from `apps/docs`) | starts a local docs preview server |

## Scope

**In scope**: new `apps/docs/` directory (Mintlify project: `docs.json`
or `mint.json` per whichever Mintlify config version is current,
`introduction.mdx`, per-package API reference pages ported from existing
`README.md`/`skills/mediadrop/references/*.md` content, navigation
config).

**Out of scope**: hosting/deployment (Mintlify's own hosted deploy
pipeline, custom domain setup, etc.) — that's an infrastructure/ops
decision for the operator to make separately; this plan scaffolds the
content and local-preview capability only.

## Git workflow

- Branch: `advisor/027-docs-site-scaffold`

## Steps

### Step 1: Scaffold the Mintlify project structure

```bash
mkdir -p apps/docs
cd apps/docs
# initialize per Mintlify's current CLI/quickstart (confirm current
# config filename — docs.json vs mint.json — against Mintlify's current
# docs before assuming one or the other, since this has changed across
# Mintlify versions)
```

Add `apps/docs` to `pnpm-workspace.yaml`'s existing `apps/*` glob if one
exists, or add an `apps/*` entry if not (confirm current
`pnpm-workspace.yaml` contents first — this audit found only
`packages/*`/`examples/*`, so an `apps/*` entry needs adding).

**Verify**: `mintlify dev` (or equivalent) starts without error, showing a placeholder page.

### Step 2: Port existing content into docs-site pages

Structure (adapt exact page breakdown as needed):
- `introduction.mdx` — from root `README.md`'s overview.
- `quickstart.mdx` — a minimal getting-started flow (install one
  package, render a dropzone) drawn from `packages/react/README.md`.
- `concepts/*.mdx` — ported from `skills/mediadrop/references/core-concepts.md`, `upload.md`, `validation.md`.
- `packages/core.mdx`, `packages/react.mdx`, `packages/vanilla.mdx`, `packages/xhr-upload.mdx`, `packages/s3.mdx`, `packages/tus.mdx` — one page per publishable package, ported from each `README.md`.

Preserve exact accuracy — this audit's docs-accuracy pass found all
existing docs sources accurate as of this commit; when porting, don't
introduce new claims not already verified/present in the source content.

**Verify**: `mintlify dev` → every new page renders without broken links/components; spot-check a handful of code examples against the actual current package APIs (this audit's own verified type signatures, e.g. `useMediaDrop`'s current `GetRootPropsArg`/`GetInputPropsArg` shapes) to confirm ported examples aren't stale relative to source.

### Step 3: Add navigation config

Wire up the sidebar/nav structure (`docs.json`/`mint.json`'s navigation
block) to organize the pages from Step 2 sensibly (Introduction →
Quickstart → Concepts → Package Reference).

**Verify**: `mintlify dev` → navigation renders correctly, every page reachable.

### Step 4: Cross-link from existing READMEs

Add a link from the root `README.md` (and each package's `README.md`) to
the new docs site's URL (placeholder/TBD if not yet deployed — see Scope
note on hosting being out of scope) so existing entry points route
readers to the fuller docs site once it's live.

**Verify**: re-read each updated README, confirm the link is present and not broken (once a real URL exists).

## Test plan

- No automated test framework exists for a docs site's content in this
  repo; verification is manual (Step 1-3's `mintlify dev` checks) plus a
  full read-through comparing ported content against the original source
  files for accuracy.

## Done criteria

- [ ] `apps/docs` Mintlify project scaffolded and runs locally via `mintlify dev`
- [ ] Introduction, quickstart, concepts, and per-package reference pages ported and accurate
- [ ] Navigation configured, every page reachable
- [ ] Existing READMEs cross-link to the new docs site
- [ ] No files outside scope modified (existing README/skill-reference content left as-is, only linked-to, not deleted — those remain the canonical in-repo docs even after this site exists, per this audit's own docs-accuracy note that they're already solid)

## STOP conditions

- If deployment/hosting decisions (custom domain, Mintlify account
  ownership) block even a local-preview-only version of this plan from
  being useful, stop and confirm with the operator what "done" means for
  this plan without deployment — a locally-previewable, content-complete
  docs site is still a valid, valuable deliverable on its own even before
  it's deployed anywhere public.

## Maintenance notes

- Once live, keep ported content in sync with source `README.md`/skill-reference changes — consider whether a future automation (e.g. a CI check diffing docs-site content against source READMEs) is worth adding, but that's out of scope for this initial scaffold.
