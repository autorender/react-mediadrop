# Examples

| Example | Binding | Transports covered |
|---|---|---|
| [`react-demo`](react-demo) | `@mediadrop/react` | `@mediadrop/xhr-upload`, `@mediadrop/s3` (`s3Upload` + `s3MultipartUpload`), `@mediadrop/tus` — switchable in the UI |
| [`test-server`](test-server) | — | Real Express backend for `react-demo`: xhr + tus work zero-config, S3 activates once you set `AWS_*` env vars |

React is the only binding demonstrated with a runnable example right
now — a deliberate, current scope decision, not an oversight.

A `@mediadrop/vanilla` (plain JS/DOM, no framework) example is a natural
next addition once React coverage is further along — `packages/vanilla/README.md`
has code snippets today, but no standalone runnable project.
