# Prebuilt blocks (shadcn registry)

Four ready-made, copy-into-the-project blocks exist on top of
`useMediaDrop` — a task asking for a dropzone/avatar-uploader/upload-form
UI in a project that already uses shadcn/ui does **not** need one
hand-rolled from scratch; installing the matching block is usually the
right first move.

| Block | Item name | What it is |
|---|---|---|
| Dropzone | `dropzone` | Minimal drag/drop zone, no upload |
| Avatar uploader | `avatar-uploader` | Circular single-image picker, click/drag replace, upload progress |
| Multi-file upload form | `multi-file-upload-form` | Multi-file picker + list + per-file progress |
| S3 direct-upload | `s3-direct-upload` | Presigned-URL direct-to-S3 upload flow |

## Install

```sh
npx shadcn@latest add autorender/react-mediadrop/<item-name>
# e.g.
npx shadcn@latest add autorender/react-mediadrop/dropzone
```

This is the GitHub-registry address form (`owner/repo/item`) — works
today, no extra setup on the consumer's side. A shorter
`@mediadrop/<item-name>` namespace form is pending shadcn Registry
Directory review; don't assume it works yet.

## Before reaching for a block

- The project must already be a shadcn/ui project (ran `shadcn init`) —
  every block's className strings use shadcn/ui's theme tokens
  (`border-input`, `bg-muted`, `text-muted-foreground`,
  `bg-destructive`, etc.), not raw Tailwind colors. Installing a block
  into a plain Tailwind project without those CSS variables defined will
  render, but the theme colors will be wrong/undefined.
- Each block depends on `react-mediadrop` (added automatically by the
  CLI) — nothing else. No other shadcn/ui component is a dependency.
- A block is a starting point copied into the project's own source tree
  (standard shadcn behavior), not a black-box import — after install,
  it's just another component the user (or you) can edit directly. Don't
  treat it as a fixed API surface the way `react-mediadrop` itself is.
- If the task's UI needs don't match any of the four blocks (custom
  layout, extra fields, a different transport), build directly on
  `useMediaDrop` per [react.md](react.md) instead of forcing a block to
  fit — the blocks are a shortcut for the common cases, not the only
  supported path.
