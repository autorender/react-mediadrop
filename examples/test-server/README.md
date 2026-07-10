# test-server

Real backend for [`../react-demo`](../react-demo) — a plain Express app so
every tab in the demo has somewhere real to send bytes, instead of the
demo just holding files client-side.

| Tab | Endpoint | Works out of the box? |
|---|---|---|
| XHR | `POST /api/upload` | Yes — writes the raw body to `uploads/` |
| tus | `POST/PATCH/HEAD /api/tus` | Yes — real [`@tus/server`](https://github.com/tus/tus-node-server) + local `@tus/file-store` |
| S3 (single + multipart) | `/api/s3/*` | Only once you set `AWS_S3_BUCKET`/`AWS_REGION` (+ credentials) — otherwise responds `501` with setup instructions |

## Run it

```sh
cd examples/test-server
pnpm install
pnpm dev
```

Listens on `http://localhost:8787` by default (matches `react-demo`'s
`VITE_API_BASE_URL` fallback — no env var needed on the demo side unless
you change the port).

In another terminal:

```sh
cd examples/react-demo
pnpm dev
```

Open the demo, pick the XHR or tus tab, drop a file, hit "Upload all" —
bytes land in `examples/test-server/uploads/` or `tus-data/` (both
git-ignored).

## Enabling S3

Copy `.env.example` to `.env` and fill in `AWS_S3_BUCKET` + `AWS_REGION`.
Credentials come from the default AWS SDK credential chain (env vars,
`~/.aws/credentials`, an assumed role, etc.) — not read directly from
`.env` by this app beyond what the SDK itself picks up from the process
environment. Restart `pnpm dev` after adding them; the S3 tabs will start
presigning against your real bucket instead of returning `501`.
