# Examples

| Example | Binding | Transports covered |
|---|---|---|
| [`react-demo`](react-demo) | `@mediadrop/react` | `@mediadrop/xhr-upload`, `@mediadrop/s3` (`s3Upload` + `s3MultipartUpload`), `@mediadrop/tus` — switchable in the UI |

React is the only binding demonstrated with a runnable example right
now — a deliberate, current scope decision, not an oversight. See
`test-server/` (git-ignored, not part of this workspace) for the real
backend `react-demo` talks to when exercising S3/tus against actual
infra.

A `@mediadrop/vanilla` (plain JS/DOM, no framework) example is a natural
next addition once React coverage is further along — `packages/vanilla/README.md`
has code snippets today, but no standalone runnable project.
