# Security Policy

## Supported versions

This project is pre-1.0 (`0.0.0` across every package). Security fixes are only
made against the latest published version of each `@mediadrop/*` package —
there is no long-term-support branch to backport fixes to.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Please report it privately using [GitHub's private vulnerability reporting](../../security/advisories/new)
(the "Report a vulnerability" button under this repository's **Security** tab).
This opens a private advisory visible only to maintainers until a fix is ready,
so the report doesn't disclose an exploitable issue before it's patched.

Include, where relevant:

- The affected package(s) and version(s).
- Steps to reproduce, or a minimal repro case.
- The potential impact (e.g. data exposure, code execution, DoS).

## What to expect

Maintainers will acknowledge new reports and investigate; a fix timeline
depends on severity and complexity. Once a fix is released, the advisory is
disclosed and credited to the reporter (unless anonymity is requested).

## Scope

This covers the `@mediadrop/*` packages published from this repository
(`core`, `react`, `vanilla`, `xhr-upload`, `s3`, `tus`). It does not cover
`examples/react-demo` or the local `test-server/` used for manual testing —
neither is published or intended for production use.
