# Plan 004: Add publish-required metadata to every package.json (and flip `private: true`)

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/*/package.json`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW — metadata-only changes, but `private: true → false` is the one field that actually changes publish behavior; get it right.
- **Depends on**: none (this should land *before* `plans/003-add-release-automation.md`'s first real publish attempt)
- **Category**: dependencies/release-process
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

Every publishable package (`core`, `react`, `s3`, `tus`, `vanilla`,
`xhr-upload` — confirmed via direct read of all six `packages/*/package.json`
files) is missing every one of: `repository`, `bugs`, `homepage`,
`keywords`, `engines`, `publishConfig`. **More importantly, every one of
them has `"private": true`** — which means `npm publish`/`changeset publish`
will refuse to publish any of them at all, not just publish them with thin
metadata. This is a harder blocker than a metadata-quality nit: without
this fix, `plans/003-add-release-automation.md`'s release workflow cannot
succeed even once wired correctly.

react-email's `packages/render/package.json` (confirmed via direct grep
this audit) has all six fields: `repository`, `bugs`, `homepage`,
`keywords`, `engines`, `publishConfig`. Use it as the field-shape reference.

## Current state

All six `packages/*/package.json` (excluding `packages/tsconfig`, which is
an internal-only workspace package and should very likely stay
`private: true` — see Scope) currently look like:

```json
{
	"name": "@mediadrop/core",
	"private": true,
	"version": "0.0.0",
	"description": "...",
	"license": "MIT",
	...
}
```

No `repository`, `bugs`, `homepage`, `keywords`, `engines`, or
`publishConfig` field on any of them.

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|----------------------------------------------|----------------------|
| Install   | `pnpm install`                              | exit 0               |
| Typecheck | `pnpm typecheck`                            | exit 0 (metadata doesn't affect this, but confirms nothing broke) |
| Build     | `pnpm build`                                | exit 0               |
| Pack check| `npm pack --dry-run` (run inside each `packages/*` dir after build) | lists the files that would be published; confirm `dist/` is included and nothing unexpected |

## Scope

**In scope**: `packages/core/package.json`, `packages/react/package.json`,
`packages/s3/package.json`, `packages/tus/package.json`,
`packages/vanilla/package.json`, `packages/xhr-upload/package.json`.

**Out of scope**:
- `packages/tsconfig/package.json` — internal shared tsconfig, not meant to
  be published; leave `private: true` as-is. Do not add publish metadata to it.
- Root `package.json` — not a publishable package itself.
- `examples/react-demo/package.json` — not published.
- Actually running `npm publish`/`changeset publish` for real — that's covered by plan 003; this plan only prepares metadata.

## Git workflow

- Branch: `advisor/004-add-package-publish-metadata`
- One commit is reasonable since all six files get a near-identical, mechanical change.

## Steps

### Step 1: Confirm the final repo URL and package scope with the operator

Before writing `repository`/`bugs`/`homepage` URLs, confirm the actual
public GitHub org/repo name this project will launch under (per
`uppy-oss-research.md`, the working repo is `mediadrop-internal` and gets
copied into a fresh public repo at launch — the *public* repo name is the
one that belongs in these URLs, not `mediadrop-internal`). If unconfirmed,
use a clearly-marked placeholder (e.g. `https://github.com/ORG/REPO` ) and
flag it in the PR description as needing a final URL before publish — do
not invent a plausible-looking but fake URL.

**Verify**: no command — a documented decision, recorded in the PR description.

### Step 2: Add the metadata block to each of the six packages

For each of `core`, `react`, `s3`, `tus`, `vanilla`, `xhr-upload`, add
(matching react-email's field shapes):

```json
"repository": {
	"type": "git",
	"url": "git+https://github.com/ORG/REPO.git",
	"directory": "packages/core"
},
"homepage": "https://github.com/ORG/REPO/tree/main/packages/core#readme",
"bugs": {
	"url": "https://github.com/ORG/REPO/issues"
},
"keywords": ["file-upload", "drag-and-drop", "dropzone", "headless"],
"engines": {
	"node": ">=18"
},
"publishConfig": {
	"access": "public"
}
```

Adjust `directory`/`homepage` per package, and tailor `keywords` per
package (e.g. `tus` should include `"tus"`/`"resumable-upload"`; `s3`
should include `"s3"`/`"multipart-upload"`; `react` should include
`"react"`/`"hook"`). Confirm the `node` engine floor against whatever the
repo's actual `.nvmrc`/CI `node-version` is (CI uses Node 22 per
`ci.yml`, but the *published package's* minimum supported Node version may
reasonably be lower — don't just copy 22 without checking whether any
runtime feature requires it; if unsure, ask rather than guess, since this
is a real compatibility promise to consumers).

**Verify**: `node -e "JSON.parse(require('fs').readFileSync('packages/core/package.json'))"` (repeat per package) → no parse error.

### Step 3: Flip `"private": true` to `"private": false"` (or remove the field)

This is the load-bearing change — without it, nothing above matters for
an actual publish. Change `"private": true` to `"private": false` in all
six in-scope `package.json` files (removing the field entirely is
equivalent and also acceptable — npm treats its absence as publishable by
default; keep whichever style matches the rest of the monorepo's
conventions, `packages/tsconfig`'s remaining `true` is the contrast case).

**Verify**: `grep -L '"private": true' packages/{core,react,s3,tus,vanilla,xhr-upload}/package.json` → lists all six (i.e. none of them still say `true`); `grep -l '"private": true' packages/tsconfig/package.json` → still present there.

### Step 4: Dry-run pack each package

```bash
pnpm build
for pkg in core react s3 tus vanilla xhr-upload; do
  (cd packages/$pkg && npm pack --dry-run)
done
```

Confirm each package's dry-run tarball listing includes `dist/` and
`package.json`/`README.md`, and does NOT include `src/`, `*.test.*`, or
anything not intended for consumers (the existing `"files": ["dist"]`
field should already constrain this — this step verifies it still does
after the metadata additions).

**Verify**: each `npm pack --dry-run` output's file list matches the above expectation.

## Test plan

- `npm pack --dry-run` per package (Step 4) is the primary verification — it's the closest thing to a real publish without actually publishing.
- No unit tests are affected by this change; `pnpm test` should be unaffected — run it once to confirm (`pnpm test` → all pass, unchanged from baseline).

## Done criteria

- [ ] All six publishable packages have `repository`, `bugs`, `homepage`, `keywords`, `engines`, `publishConfig`
- [ ] All six have `private: false` (or the field removed); `packages/tsconfig` still `private: true`
- [ ] `npm pack --dry-run` succeeds and looks correct for all six
- [ ] `pnpm build` and `pnpm test` still exit 0
- [ ] PR description states the confirmed (or placeholder-flagged) repo URL used

## STOP conditions

- If the final public repo name/org is genuinely undecided and no
  placeholder convention is acceptable to the operator, stop after Step 1
  rather than guessing a URL that could end up embedded in a published
  package's metadata permanently (npm doesn't let you un-publish a version).

## Maintenance notes

- Once the public repo exists at its final URL, do a final grep for any
  leftover placeholder URL before the *first real* publish.
