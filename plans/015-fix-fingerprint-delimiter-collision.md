# Plan 015: Fix fingerprint delimiter collision in createFileFingerprint

> **Executor instructions**: Follow step by step, verify each step, stop on
> any STOP condition.
>
> **Drift check (run first)**: `git diff --stat 4151298..HEAD -- packages/core/src/fingerprint.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — the fix changes the fingerprint string's exact bytes, which is only a problem for any already-persisted session store keyed by the old fingerprint (see STOP conditions).
- **Depends on**: none
- **Category**: correctness/bugs
- **Planned at**: commit `4151298`, 2026-07-10

## Why this matters

`packages/core/src/fingerprint.ts` line 26 (verified by direct read):

```ts
const descriptor = [
	file.name,
	file.size,
	file.type,
	file.lastModified,
	relativePath || "",
].join(" ");
```

`.join(" ")` concatenates `name`, `size`, `type`, `lastModified`, and
`relativePath` with a single-space delimiter. Because `name` and
`relativePath` are arbitrary user/filesystem-controlled strings that can
themselves contain spaces, two structurally different tuples can produce
an identical descriptor string, e.g. a file named `"a b"` combined with
one set of size/type/mtime values can collide with a different `name`
whose extra token absorbs into an adjacent field's position in the joined
string. This is a real, if narrow, hash-input-collision class of bug (not
a cryptographic concern — the file's own doc comment already says this is
"looks like the same file," not content-addressed — but the fields that
are supposed to jointly disambiguate two files can be defeated by a
delimiter that appears inside the data itself). Since this fingerprint is
used by resumable transports (`@mediadrop/s3`, `@mediadrop/tus`) to decide
whether a freshly-selected file matches an in-progress upload session,
a collision here means a *different* file could be mistaken for a resume
match, resuming from a stale/incorrect byte offset.

## Current state

- `packages/core/src/fingerprint.ts` lines 15-29 (`createFileFingerprint`), the `.join(" ")` on line 26.
- `packages/core/src/fingerprint.test.ts` (check existing coverage before writing new tests, to avoid duplicating an already-covered case).

## Commands you will need

| Purpose   | Command                                       | Expected on success |
|-----------|------------------------------------------------|----------------------|
| Install   | `pnpm install`                                 | exit 0               |
| Typecheck | `pnpm --filter @mediadrop/core typecheck`      | exit 0               |
| Tests     | `pnpm --filter @mediadrop/core test`           | all pass             |

## Scope

**In scope**: `packages/core/src/fingerprint.ts`, `packages/core/src/fingerprint.test.ts`.

**Out of scope**: `@mediadrop/s3`/`@mediadrop/tus`'s use of the fingerprint — they just call `createFileFingerprint`/accept a custom one; no change needed there since the function's signature and general contract are unchanged, only its internal collision-resistance improves.

## Git workflow

- Branch: `advisor/015-fix-fingerprint-delimiter-collision`

## Steps

### Step 1: Replace the naive `.join(" ")` with a length-prefixed or otherwise unambiguous encoding

Simplest fix: prefix each field with its length before joining, so no
content within a field can be mistaken for a delimiter:

```ts
const fields = [
	file.name,
	String(file.size),
	file.type,
	String(file.lastModified),
	relativePath || "",
];
const descriptor = fields.map((f) => `${f.length}:${f}`).join("");
```

This is the same encoding technique Bencode/netstrings use specifically
to make delimiter collisions structurally impossible — a field's own
`length:` prefix cannot itself be forged into looking like a different
field boundary the way a plain separator can.

**Verify**: `pnpm --filter @mediadrop/core typecheck` → exit 0.

### Step 2: Add a regression test proving the old collision no longer occurs

Construct two `File`-like inputs (via `new File(...)` in the vitest/jsdom
environment already used by this test file) whose old `.join(" ")`
descriptors would have collided (e.g. `name: "a b", size: 1` vs. a
different `name`/`size` combination chosen to produce the same
concatenation under the old scheme), and assert
`createFileFingerprint(a) !== createFileFingerprint(b)`.

**Verify**: `pnpm --filter @mediadrop/core test -- fingerprint` → all pass, including the new collision-regression test.

## Test plan

- New test: two distinct files that collided under the old `.join(" ")` scheme now produce different fingerprints.
- Existing fingerprint tests (stability for the same file, difference for genuinely different files) continue to pass unchanged — this change alters the *internal* encoding, not the *external* "same input → same output, different input → almost-certainly-different output" contract.

## Done criteria

- [ ] `createFileFingerprint` uses a collision-resistant encoding (length-prefixed or equivalent) instead of a bare-space join
- [ ] New regression test passes
- [ ] All existing `@mediadrop/core` tests pass unchanged
- [ ] No files outside scope modified

## STOP conditions

- This changes the fingerprint's exact output bytes for every file (even
  non-colliding ones), since the encoding itself changes. Any consumer
  persisting fingerprints across a deploy (e.g. as part of a resumable
  session's stored key, per `MediaDropUploadSessionStore`) would see
  existing in-flight resumable sessions stop matching after this ships.
  Flag this in the PR description as a "resume compatibility" note — it
  is not this plan's place to decide whether that's acceptable, since it
  depends on how `@mediadrop/s3`/`@mediadrop/tus` consumers use session
  storage in production, which this plan's author doesn't have visibility
  into. If the operator confirms no persisted session ever survives a
  library upgrade in practice, proceed without further mitigation;
  otherwise consider versioning the fingerprint format (e.g. prefixing
  with `mdf2` instead of `mdf`) so old and new formats are distinguishable.

## Maintenance notes

- Any future field added to the fingerprint's input tuple should go
  through the same length-prefixed encoding, not a plain delimiter join.
