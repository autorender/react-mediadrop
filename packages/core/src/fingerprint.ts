/**
 * A fast, synchronous, sufficiently-stable identifier for "this looks like
 * the same file" matching — used by resumable transports to decide
 * whether a freshly-selected file matches an in-progress upload session.
 *
 * Deliberately metadata-only (name/size/type/lastModified/relative path):
 * hashing file *contents* would let two selections of a multi-gigabyte
 * file be compared reliably, but reading the whole file to do it is
 * exactly the kind of cost this library avoids imposing by default. This
 * is "looks like the same file," not a content-addressed guarantee — two
 * different files with identical name/size/type/mtime would collide. If
 * that matters for your use case, a custom resumable transport can accept
 * its own `fingerprint` function instead of this one.
 */
export function createFileFingerprint(file: File): string {
	const relativePath =
		"webkitRelativePath" in file
			? (file as File & { webkitRelativePath?: string }).webkitRelativePath
			: "";
	// Length-prefixed, not delimiter-joined: `name`/`relativePath` are
	// arbitrary user/filesystem strings, and the previous encoding joined
	// them with a plain space character, which any of those strings can
	// legitimately contain — an easy collision to reintroduce if a plain
	// delimiter is used again. Prefixing each field with
	// its own length (the same technique bencode/netstrings use) makes a
	// delimiter collision structurally impossible regardless of what
	// characters end up in any field — a field's content can never be
	// mistaken for the next field's boundary.
	const fields = [
		file.name,
		String(file.size),
		file.type,
		String(file.lastModified),
		relativePath || "",
	];
	const descriptor = fields.map((field) => `${field.length}:${field}`).join("");

	return `mdf${hash(descriptor)}`;
}

/** FNV-1a, 32-bit — fast, dependency-free, plenty for a non-cryptographic match key. */
function hash(input: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}
