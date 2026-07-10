# Plan 028: Add license/metadata/openclaw frontmatter to skills/mediadrop/SKILL.md

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- skills/mediadrop/SKILL.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — metadata-only change to a documentation file's frontmatter.
- **Depends on**: `plans/004-add-package-publish-metadata.md` (the skill's `metadata.version`/`metadata.homepage`/`metadata.source` fields should point at real, publishable package info — most natural to fill in once packages actually have a real `version`/`repository`/`homepage`, rather than inventing placeholder values now)
- **Category**: docs
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Confirmed by direct read this audit: `skills/mediadrop/SKILL.md`'s
frontmatter (lines 1-4) has only `name` and `description` — no `license`,
`metadata` block, or `openclaw` install/links block. Cross-referencing
`react-email`'s `skills/react-email/SKILL.md` frontmatter (lines 1-18,
confirmed by direct read), which has all of these:

```yaml
license: MIT
metadata:
  author: Resend
  version: "2.1.0"
  homepage: https://react.email
  source: https://github.com/resend/react-email
  openclaw:
    install:
      - kind: node
        package: react-email
        label: React Email
    links:
      repository: https://github.com/resend/react-email
      documentation: https://resend.com/docs/react-email-skill
```

The `openclaw` block in particular is what lets an agent/tool consuming
this skill know how to actually install the thing it documents (`kind:
node`, `package: <npm name>`) and where to find its repository/docs —
without it, `skills/mediadrop/SKILL.md` documents *usage* patterns for
mediadrop but gives no machine-readable installation/provenance metadata
at all, a real functional gap for any tooling that consumes the
`openclaw` convention specifically (not just a cosmetic parity gap with
react-email).

## Current state

- `skills/mediadrop/SKILL.md` lines 1-4 — current frontmatter (`name`, `description` only).
- `packages/core/package.json` (and the other five publishable packages, per `plans/004`) — currently `"version": "0.0.0"`, `"private": true`, no `repository`/`homepage` fields — these need to be real (per `plans/004`) before this plan's `metadata.version`/`metadata.homepage`/`metadata.source` can be filled with real, non-placeholder values.

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|----------------------|
| (none — this is a documentation-only frontmatter edit; no build/test step validates SKILL.md frontmatter today) | | |

## Scope

**In scope**: `skills/mediadrop/SKILL.md`'s YAML frontmatter only.

**Out of scope**: the skill's body content — already confirmed accurate by this audit's docs-accuracy pass; no changes needed there.

## Git workflow

- Branch: `advisor/028-skill-frontmatter-metadata`

## Steps

### Step 1: Confirm real values are available (post `plans/004`)

Before filling in `metadata.version`/`homepage`/`source`, confirm
`plans/004` has landed (or land this plan after it) so
`packages/core/package.json` has a real, non-`0.0.0` version and a real
`repository` URL to reference — filling this frontmatter with
placeholder/fake values would be worse than leaving it absent.

**Verify**: `cat packages/core/package.json | grep -E '"version"|"repository"'` → real values present, not `0.0.0`/absent.

### Step 2: Add the frontmatter block

```yaml
---
name: mediadrop
description: Integrate mediadrop (Phase 1 + Phase 2 + Phase 3) — file intake, drag/drop, validation, and upload (queue/concurrency/retry/cancel, S3, tus) for React or plain JS. Use when a task asks to add a file picker, dropzone, or upload UI in a project that already depends on @mediadrop/core, @mediadrop/vanilla, @mediadrop/react, @mediadrop/xhr-upload, @mediadrop/s3, or @mediadrop/tus.
license: MIT
metadata:
  author: <confirm real org/author name with operator>
  version: "<packages/core's real version, post plans/004>"
  homepage: <confirm real homepage URL with operator, if one exists>
  source: <confirm real repository URL with operator>
  openclaw:
    install:
      - kind: node
        package: "@mediadrop/core"
        label: MediaDrop Core
      - kind: node
        package: "@mediadrop/react"
        label: MediaDrop React
      - kind: node
        package: "@mediadrop/vanilla"
        label: MediaDrop Vanilla
    links:
      repository: <same as source above>
      documentation: <confirm real docs URL — none may exist yet if plans/027's docs site isn't live; omit this key rather than invent a URL if so>
---
```

Do not guess at `author`/`homepage`/`source`/`documentation` — confirm
each with the operator; a skill frontmatter with fabricated URLs is
actively misleading to any tool that trusts it.

**Verify**: re-read the file, confirm valid YAML frontmatter (no syntax errors — spot-check by parsing with a quick `python3 -c "import yaml, sys; yaml.safe_load(open('skills/mediadrop/SKILL.md').read().split('---')[1])"` or equivalent).

### Step 3: List all six publishable packages, not just one, if `openclaw.install` is meant to be exhaustive

Confirm whether the `openclaw` convention expects one entry per
independently-installable package (this repo has six: `core`, `react`,
`vanilla`, `xhr-upload`, `s3`, `tus`) or just the primary/most-common
entry point — check `react-email`'s convention (single package, so this
question doesn't arise there) and use judgment; default to listing every
publishable package since a consumer may want any of them depending on
their chosen binding/transport.

**Verify**: re-read the final frontmatter, confirm every publishable package is represented if that's the chosen approach.

## Test plan

- No automated test exists for SKILL.md frontmatter validity in this
  repo; manual YAML-parse validation (Step 2's Verify) is the check.

## Done criteria

- [ ] `license`, `metadata` (author/version/homepage/source), and `openclaw` (install/links) added to `skills/mediadrop/SKILL.md`'s frontmatter
- [ ] No fabricated/placeholder URLs — every value confirmed real with the operator
- [ ] Frontmatter parses as valid YAML
- [ ] No files outside scope modified

## STOP conditions

- If the operator hasn't decided on a public homepage/docs URL yet (this
  audit found no `apps/docs`/Mintlify site exists — see `plans/027`),
  omit the `homepage`/`documentation` keys entirely rather than pointing
  them at something that doesn't exist yet; add them once `plans/027`
  (or an equivalent decision) lands.

## Maintenance notes

- Keep `metadata.version` in sync with `packages/core/package.json`'s
  actual released version going forward — consider whether this could be
  automated (e.g. a Changesets release-process step that also bumps this
  file) rather than manually maintained, once `plans/003`'s release
  automation lands.
