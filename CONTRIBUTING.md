# Contributing

Thanks for your interest in contributing to `react-mediadrop`. The short version:

1. **Install & verify**: `pnpm install`, then `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size` before opening a PR — this is exactly what CI runs (`.github/workflows/ci.yml`).
2. **Scope**: check
   [`skills/mediadrop/references/scope.md`](skills/mediadrop/references/scope.md)
   before adding a feature — it's the authoritative "what's real" list.
   Don't build around something listed as not implemented; raise it
   instead.
3. **Architecture non-negotiables**: `@mediadrop/core` stays framework-free
   with zero runtime dependencies; retry/backoff lives in one place
   (`@mediadrop/core`'s `withRetry`) and is never duplicated per
   transport; every transport stays thin (no retry, no concurrency logic
   of its own). See the root [`README.md`](README.md) for the full
   package layout and [`SKILL.md`](skills/mediadrop/SKILL.md) for the
   hard rules coding agents follow here — the same rules apply to human
   contributors.
4. **Style**: Biome (`pnpm format`) formats and lints; no comments beyond
   what explains a non-obvious *why* (a hidden constraint, a workaround,
   something that would surprise a reader) — code should read clearly
   enough not to need a *what* comment.
5. **Tests**: real regressions, not padding — new tests should exercise
   an actual race/edge case (cancel-vs-resolve races, retry exhaustion,
   reentrancy) the way the existing suite does, not just happy-path
   smoke tests.

## Opening a pull request

1. Maintainers branch directly off latest `main`. Outside contributors
   fork the repo first, then branch off their fork's `main`.
2. If the change is user-facing (bug fix, feature, behavior change), run
   `pnpm changeset` and commit the generated file — `changesets/action`
   (`.github/workflows/release.yml`) reads these to version and changelog
   the next release. Skip it for docs-only/internal changes.
3. Open the PR against `autorender/react-mediadrop:main`. If this is your
   first PR here, its CI run won't start until a maintainer manually
   approves it (standard GitHub protection for first-time contributors on
   public repos) — a one-time step.
4. Merging requires 1 approving review and all 4 CI checks
   (`lint`/`typecheck`/`test`/`build`) passing. `main` has a linear
   history — merges are squash or rebase only, no merge commits.

Issue and PR templates (`.github/ISSUE_TEMPLATE/`,
`.github/PULL_REQUEST_TEMPLATE.md`), a vulnerability-reporting process
([`SECURITY.md`](SECURITY.md)), and a [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
already exist. There's no CLA yet.
