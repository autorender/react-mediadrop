# react-mediadrop

## 0.1.1

### Patch Changes

- 663b5f9: Update package READMEs to match the current docs (install steps, quickstart, entry points).

## 0.1.0

### Initial release

- `useMediaDrop` — headless file intake: drag/drop + picker, sync validation
  (`accept`/`maxFiles`/`minSize`/`maxSize` + custom validator), typed
  `MediaDropError`s, best-effort `isDragAccept`/`isDragReject` drag state.
- Upload (opt-in via `transport`): a pluggable transport contract, a queue
  with concurrency/retry/cancel, and per-file `uploadStatus`/`progress`/
  `uploadError`/`uploadResult`. Without a transport, nothing changes about
  the existing file intake/validation behavior above.
- `react-mediadrop/xhr-upload` — reference `XMLHttpRequest` transport,
  tree-shakeable as a separate entry point so consumers who don't import it
  never bundle it.
- `@mediadrop/core` bundled directly into `react-mediadrop`'s dist — one
  package to install, no separate core dependency.
