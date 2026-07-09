# Contributing

This is `autorenderhq/mediadrop-internal` — a private staging workspace,
not yet the public `mediadrop` repo. If you're reading this from inside
Autorender, the short version:

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

Once this becomes the public repo, this file will cover external PRs
(issue templates, review process, CLA if any) — none of that exists yet
because there isn't an external contributor audience yet.
