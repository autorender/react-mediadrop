# Examples

| Example | Binding | Transports covered |
|---|---|---|
| [`react-demo`](react-demo) | `@mediadrop/react` | `@mediadrop/xhr-upload`, `@mediadrop/s3` (`createS3UploadTransport` + `createS3MultipartUploadTransport`), `@mediadrop/tus` — switchable in the UI |
| [`vanilla-demo`](vanilla-demo) | `@mediadrop/vanilla` | Same four transports, switchable in the UI |
| [`test-server`](test-server) | — | Real Express backend for `react-demo` and `vanilla-demo`: xhr + tus work zero-config, S3 activates once you set `AWS_*` env vars |
