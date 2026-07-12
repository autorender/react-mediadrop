# test-server

Real backend for [`../react-demo`](../react-demo) — a plain Express app so
the demo has somewhere real to send bytes, instead of holding files
client-side.

| Tab | Endpoint | Works out of the box? |
|---|---|---|
| XHR | `POST /api/upload` | Yes — writes the raw body to `uploads/` |

## Run it

```sh
cd examples/test-server
pnpm install
pnpm dev
```

Listens on `http://localhost:8787` by default (matches the demo's
`VITE_API_BASE_URL` fallback — no env var needed on the demo side unless
you change the port).

In another terminal:

```sh
cd examples/react-demo
pnpm dev
```

Open the demo, drop a file, hit "Upload all" — bytes land in
`examples/test-server/uploads/` (git-ignored).
