# mediadrop-internal — Improvement Plans

Deep-effort `/improve` audit of `mediadrop-internal`, all 9 categories
(correctness/bugs, security, performance, test coverage, tech debt &
architecture, dependencies & migrations, DX & tooling, docs, direction).
Every finding below was independently verified against actual source
before being planned or rejected — nothing here is a raw, unvetted
audit-subagent claim.

- **Audited at commit**: `4151298`
- **Audit date**: 2026-07-10
- **Cross-referenced against**: `/Users/vasanth/Codebase/autorender/react-email` (an established, similarly-shaped OSS TS monorepo) for every structural/DX/release-process finding, per instruction.
- **Hard rule enforced throughout**: nothing outside `plans/` was modified. No source file, config, or test in this repo was changed by this audit.

## Execution status (2026-07-10)

23 of 30 plans applied; 7 skipped (all release-automation-related, or
requiring an operator account/service decision this session couldn't
make unilaterally). See the "Outcome" column in the status table below
for the disposition of each plan, and each plan's git history for the
actual diff.

## How to use this index

1. Read a plan top to bottom before touching any code — each is fully self-contained (own Status block, Commands, Scope, Steps with Verify commands, Test plan, Done criteria, STOP conditions).
2. Follow the priority order below unless a dependency forces a different sequence (see "Dependency graph").
3. Every plan starts with a **Drift check** command (`git diff --stat 4151298..HEAD -- <paths>`) — run it first. If it shows unexpected changes, stop and re-read the current state of those files before proceeding; the plan's file/line references were captured at commit `4151298` and may have drifted.

## Priority order (by leverage)

### P1 — do first
| # | Plan | Category |
|---|------|----------|
| 001 | Fix upload-queue settle race (controller-identity guard) | correctness/bugs |
| 002 | Fix keyboard handler double-firing file dialog | correctness/bugs (a11y-adjacent) |
| 003 | Add Changesets release automation (canary + stable) | dependencies & migrations, direction (DIR-05) |
| 004 | Add publish-required package.json metadata, flip `private` | dependencies & migrations |
| 005 | Harden & restructure `ci.yml` (SHA-pin, permissions, jobs) | security, DX & tooling |

### P2 — do next
| # | Plan | Category |
|---|------|----------|
| 006 | pnpm/npm supply-chain hardening (CI audit gate) | security |
| 007 | Fix dangling abort listener in `withRetry`'s `delay()` | correctness/bugs |
| 008 | Guard session-store set/remove against write failures | correctness/bugs |
| 009 | Avoid O(n) full-list rebuilds on every progress tick | performance |
| 010 | Enable Turborepo remote caching in CI | performance, DX & tooling |
| 011 | Dedupe duplicated XHR-send-with-watchdog envelope | tech debt & architecture |
| 013 | Preserve HTTP status / tus error code through `toUploadError` | tech debt & architecture (bug-adjacent) |
| 018 | Pass validator into vanilla's `handleDragEnter`; expose drag state | correctness/bugs, DX & tooling |
| 019 | Allow arbitrary prop passthrough in `getRootProps`/`getInputProps` | tech debt & architecture, direction |
| 020 | Real packed-tarball install/import smoke test in CI | test coverage, DX & tooling |
| 023 | Coverage measurement + CI threshold gate | test coverage |
| 024 | Assert real byte-range contents in multipart/chunk tests | test coverage |
| 025 | Malformed/tampered resumable-session test coverage | test coverage |
| 029 | Per-transport example matrix + headless (no-React) example | direction |

### P3 — do when convenient
| # | Plan | Category |
|---|------|----------|
| 012 | Remove (or implement) dead `"unsupported-version"` TusErrorCode | tech debt & architecture |
| 014 | Share one `MockXhr` test double instead of three drifted copies | tech debt & architecture, test coverage |
| 015 | Fix fingerprint delimiter collision in `createFileFingerprint` | correctness/bugs |
| 016 | Fix `store.ts` doc/behavior drift on reentrant notify | correctness/bugs |
| 017 | Don't set `isDragActive` for non-file drags | correctness/bugs |
| 021 | Move shared dep versions into pnpm catalog; add root dev scripts | DX & tooling |
| 022 | CI check banning unpinned/floating production dependency ranges | dependencies & migrations |
| 026 | Fix meaningless test assertion; add SECURITY.md + issue/PR templates | test coverage, docs |
| 027 | Scaffold a Mintlify docs site (`apps/docs`) | docs |
| 028 | Add license/metadata/openclaw frontmatter to `SKILL.md` | docs |
| 030 | Zero-install browser playground (StackBlitz/CodeSandbox) | direction |

## Dependency graph

```
004 (publish metadata) ──> 003 (release automation)
004 (publish metadata) ──> 020 (tarball smoke test)
004 (publish metadata) ──> 028 (skill frontmatter — real version/repo)
005 (CI hardening)     ──> 010 (turbo remote cache: wire in after job split)
006 (supply-chain)     ~~> 022 (dep-pinning check — same theme, independent)
014 (shared MockXhr)   ~~> 024 (byte-range assertions — easier after, not required)
029 (example matrix)   ──> 030 (zero-install playground)
001 (settle race)      ~~ 007 (retry abort leak) — same file family, deliberately separate scopes, land either order
```
`──>` = hard prerequisite. `~~>` = soft/ordering-preference only, each side can land independently.

## Status table — all 30 plans

| # | Title | Category | Priority | Effort | Depends on | Outcome |
|---|-------|----------|----------|--------|------------|---------|
| 001 | Fix upload-queue settle race | correctness/bugs | P1 | S | none | ✅ Done |
| 002 | Fix keyboard double-fire | correctness/bugs | P1 | S | none | ✅ Done |
| 003 | Add Changesets release automation | dependencies, direction | P1 | L | 004 | ⏭️ Skipped — release automation |
| 004 | Add package publish metadata | dependencies | P1 | M | none | ⏭️ Skipped — release automation (gates 003) |
| 005 | Harden & restructure CI workflow | security, DX | P1 | M | none | ✅ Done |
| 006 | pnpm supply-chain hardening | security | P2 | S | none | ✅ Done |
| 007 | Fix retry abort listener leak | correctness/bugs | P2 | S | none | ✅ Done |
| 008 | Guard session-store write errors | correctness/bugs | P2 | S | none | ✅ Done |
| 009 | Avoid O(n) progress rebuilds | performance | P2 | M | none | ✅ Done |
| 010 | Turbo remote cache in CI | performance, DX | P2 | S | 005 (soft) | ⏭️ Skipped — needs operator's remote-cache backend choice (Vercel vs. self-hosted) |
| 011 | Dedupe XHR transport envelope | tech debt | P2 | M | none | ✅ Done |
| 012 | Remove dead tus error code | tech debt | P3 | S | none | ✅ Done |
| 013 | Preserve error classification through toUploadError | tech debt | P2 | M | none | ✅ Done |
| 014 | Dedupe test scaffolding (MockXhr) | tech debt, test coverage | P3 | M | none | ✅ Done |
| 015 | Fix fingerprint delimiter collision | correctness/bugs | P3 | S | none | ✅ Done |
| 016 | Fix store.ts notify doc drift | correctness/bugs | P3 | S | none | ✅ Done |
| 017 | Fix dropzone non-file drag state | correctness/bugs | P3 | S | none | ✅ Done |
| 018 | Fix vanilla drag validator + state parity | correctness/bugs, DX | P2 | M | none | ✅ Done |
| 019 | Dropzone accessibility prop passthrough | tech debt, direction | P2 | S | none | ✅ Done |
| 020 | Real published-install smoke test | test coverage, DX | P2 | M | 004 | ⏭️ Skipped — release automation (needs a real publish from 004) |
| 021 | Shared version catalog + dev scripts | DX | P3 | S | none | ✅ Done |
| 022 | Dependency pinning check | dependencies | P3 | S | 006 (soft) | ✅ Done |
| 023 | Coverage measurement + threshold gate | test coverage | P2 | M | none | ✅ Done |
| 024 | Byte-range chunk/part assertions | test coverage | P2 | M | 014 (soft) | ✅ Done |
| 025 | Resume-path malformed session tests | test coverage | P2 | M | none | ✅ Done |
| 026 | Dead assertion cleanup + SECURITY.md | test coverage, docs | P3 | S | none | ✅ Done |
| 027 | Docs site scaffold (Mintlify `apps/docs`) | docs | P3 | L | none | ⏭️ Skipped — needs operator's docs-hosting decision, requires external `mintlify` tooling |
| 028 | Skill frontmatter metadata | docs | P3 | S | 004 | ⏭️ Skipped — release automation (needs a real version/repo URL from 004) |
| 029 | Example matrix + headless example | direction | P2 | L | none | ✅ Done (partial) — transport-matrix gap was already closed by `react-demo`'s existing switcher; the headless/vanilla example was deliberately not added since it reverses this session's own explicit earlier "focus on react only" instruction |
| 030 | Zero-install playground | direction | P3 | M | 029 | ⏭️ Skipped — needs operator's external-service choice (StackBlitz/CodeSandbox), depends on 029 |

## What was audited

All 9 required categories were covered by parallel Phase-2 audits, then every
finding was independently re-verified against live source in Phase 3 before
being written up (no finding below was planned or rejected purely on an
audit-subagent's word). Verification included direct reads of:
`upload-queue.ts`, `retry.ts`, `store.ts` (+ its test file), `dropzone.ts`,
`useMediaDrop.ts`, `session-store` code, all three package `test-utils.ts`
/ inline `MockXhr` copies, `fingerprint.ts`, `multipart.ts` + its tests,
`tus-upload.ts` + its tests, every package's `package.json`,
`pnpm-workspace.yaml`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`,
`skills/mediadrop/SKILL.md`, and the `examples/react-demo` tree — each
cross-checked line-by-line against the claims made about it.

## What was explicitly rejected / not worth doing

These were investigated and consciously **not** turned into plans —
recorded here instead of silently dropped, per instruction.

| Finding | Why rejected |
|---|---|
| **BIND-06** — ref-callback churn in a React binding | Confirmed benign: re-creates a stable-identity callback each render but has no observable effect (no extra DOM mutation, no listener churn). Not worth a plan. |
| **DEBT-05** — S3 multipart's `runWithConcurrency` shape | By design. The pattern looked unusual on first pass but is a deliberate, correct concurrency limiter; only a doc/comment clarification would help future readers, not worth a numbered plan on its own. |
| **DEP-03** — TypeScript version currency | Repo already tracks a recent 5.9.x release; the delta to bleeding-edge is marginal and not worth a churn-inducing bump right now. |
| **DX-05** — No root `CLAUDE.md` / `.editorconfig` | Downgraded after cross-referencing `react-email`, which also lacks both — this is not an outlier gap relative to a comparable, healthy OSS TS monorepo. |
| **DOCS-03** — Docs accuracy pass | Clean. Existing `README.md`s and `skills/mediadrop/references/*.md` were checked line-by-line against current source/APIs; no stale claims found. No action. |
| **DOCS-05** — JSDoc coverage/quality | Mostly strong across the public API surface already. No significant gaps found worth a dedicated plan. |

## Direction findings (DIR-01 .. DIR-05)

Direction findings are exploratory/strategic, not bugs — listed separately
per instruction, not folded into the numbered priority order above except
where a finding was concrete enough to become a full plan.

**Planned (full plan files):**
- **DIR-01** → `plans/029-example-matrix-and-headless-example.md` — only one example (`react-demo`) exists today; proposes a per-transport matrix plus a headless/no-React example.
- **DIR-02** → `plans/030-zero-install-playground.md` — StackBlitz/CodeSandbox-embeddable playground, sequenced after DIR-01's expanded example set.
- **DIR-05 (release-automation half)** → folded into `plans/003-add-release-automation.md` (Changesets canary+stable, modeled concretely on `react-email`'s own release setup).

**Spike / non-numbered entries** (deliberately not written as full plans — these are open design questions, not yet ready to scope into concrete steps):
- **DIR-03 — Vue/Svelte bindings.** Would extend the `@mediadrop/react`/`@mediadrop/vanilla` pattern to other frameworks. Worth a spike to decide priority order (Vue vs. Svelte vs. neither) and whether `@mediadrop/core`'s existing framework-free design (confirmed zero runtime deps, per `CONTRIBUTING.md`'s architecture non-negotiables) is already sufficient scaffolding, before committing to a full package.
- **DIR-04 — Multi-dropzone nearness arbitration.** A UX question (which of several overlapping/nested dropzones on a page should claim a drag event) with no existing prior art in this codebase to extend — needs a design spike/RFC before it's plannable as concrete steps.
- **DIR-05 (CLI-scaffolder half)** — a `create-mediadrop-app`-style CLI scaffolder. The release-automation half of DIR-05 is already covered by `plans/003`; the CLI-scaffolder half is a separate, larger strategic bet (build vs. buy, which frameworks to template) that needs a product decision before it's a plannable engineering task.

## Verification

`git status` confirms the only changes made by this audit are new, untracked
files under `plans/` (this README plus 30 numbered plan files) — no
existing source, test, config, or doc file elsewhere in the repository was
modified.
