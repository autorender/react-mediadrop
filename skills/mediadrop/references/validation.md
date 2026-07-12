# Validation and restrictions

Pass the same `restrictions`/`validator` shape to `useMediaDrop`.

## Restrictions

```ts
type MediaDropRestrictions = {
	maxFiles?: number;
	minSize?: number; // bytes
	maxSize?: number; // bytes
	accept?: string[] | string; // mime types, wildcards, or extensions
};
```

`accept` tokens can be:

- An exact mime type: `"image/png"`
- A wildcard mime type: `"image/*"`
- A file extension: `".png"` (matched against the file name, case-insensitive)

You can pass an array or a comma-separated string (`"image/png,image/webp"`
is equivalent to `["image/png", "image/webp"]`).

An empty/missing `accept` accepts every file type.

## Error codes and shape

```ts
type MediaDropErrorCode =
	| "file-invalid-type"
	| "file-too-large"
	| "file-too-small"
	| "too-many-files"
	| "validator-error"
	| "upload-error";

type MediaDropError = {
	code: MediaDropErrorCode;
	message: string; // for display — don't branch on this
	status?: number; // HTTP status, upload errors only
	sourceCode?: string; // transport-specific finer-grained code, upload errors only
};
```

Every rejected `MediaDropFile` has a non-empty `errors` array using these
codes (plus whatever code your custom validator assigns — see below). Switch
on `code`, not on `message` — messages are for display, not branching logic.
`status`/`sourceCode` are only ever populated on upload errors (see
[upload.md](upload.md#mediadropfiles-upload-fields)) — always absent on a
Core validation error.

## Custom validators

```ts
type MediaDropValidator = (
	file: File,
) => MediaDropError | MediaDropError[] | null | undefined;
```

Return `null`/`undefined` to pass. Return one error or an array of errors to
reject the file — you choose the `code` (use `"validator-error"` unless you
have a better fit from the built-in codes) and the `message`.

```ts
function validator(file: File) {
	if (file.name.includes(" ")) {
		return { code: "validator-error", message: "Filenames can't contain spaces" };
	}
	return null;
}
```

Do not reimplement `accept`/`maxSize`/`minSize` checks inside a custom
validator — use `restrictions` for those. Reserve the validator for rules
`restrictions` can't express (content sniffing, naming conventions,
cross-file business rules, etc.).

## Validator and drag preview

The validator's primary job is drop-time validation, but React's
`useMediaDrop` also runs it as part of the best-effort `isDragAccept`/
`isDragReject` preview during an active drag — see
[core-concepts.md](core-concepts.md#drag-state). This only happens when the
browser hands back a real `File` via `DataTransferItem.getAsFile()` before
drop; when it doesn't, the preview silently falls back to accept-only
evaluation. Don't rely on this for correctness — the authoritative
accept/reject decision is always the one made at drop time in `addFiles`.

## What validation does not do (Core)

- No async validators. The validator runs synchronously against the `File`
  object (name/size/type only) — it cannot read file contents or await a
  network check.
- No re-validation after the fact. Once a file is added, its `status` and
  `errors` don't change unless you remove and re-add it.
- No image-specific checks (dimensions, aspect ratio, decode-ability). If
  you need that, it's a custom validator today, not a first-class option.
