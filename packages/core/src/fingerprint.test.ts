import { expect, test } from "vitest";
import { createFileFingerprint } from "./fingerprint.js";

function makeFile(
	name: string,
	size: number,
	type: string,
	lastModified: number,
): File {
	return new File([new Uint8Array(size)], name, { type, lastModified });
}

test("is stable for the same file metadata across calls", () => {
	const file = makeFile("a.png", 1024, "image/png", 1700000000000);

	expect(createFileFingerprint(file)).toBe(createFileFingerprint(file));
});

test("is the same for two distinct File instances with identical metadata", () => {
	const a = makeFile("a.png", 1024, "image/png", 1700000000000);
	const b = makeFile("a.png", 1024, "image/png", 1700000000000);

	expect(createFileFingerprint(a)).toBe(createFileFingerprint(b));
});

test("changes when the name differs", () => {
	const a = makeFile("a.png", 1024, "image/png", 1700000000000);
	const b = makeFile("b.png", 1024, "image/png", 1700000000000);

	expect(createFileFingerprint(a)).not.toBe(createFileFingerprint(b));
});

test("changes when the size differs", () => {
	const a = makeFile("a.png", 1024, "image/png", 1700000000000);
	const b = makeFile("a.png", 2048, "image/png", 1700000000000);

	expect(createFileFingerprint(a)).not.toBe(createFileFingerprint(b));
});

test("changes when the type differs", () => {
	const a = makeFile("a.png", 1024, "image/png", 1700000000000);
	const b = makeFile("a.png", 1024, "image/jpeg", 1700000000000);

	expect(createFileFingerprint(a)).not.toBe(createFileFingerprint(b));
});

test("changes when lastModified differs", () => {
	const a = makeFile("a.png", 1024, "image/png", 1700000000000);
	const b = makeFile("a.png", 1024, "image/png", 1700000000001);

	expect(createFileFingerprint(a)).not.toBe(createFileFingerprint(b));
});

test("returns a short, storage-key-friendly string, not the raw metadata", () => {
	const file = makeFile(
		"a-very-long-filename-indeed.png",
		1024,
		"image/png",
		1700000000000,
	);

	const fingerprint = createFileFingerprint(file);
	expect(fingerprint.length).toBeLessThan(20);
	expect(fingerprint).not.toContain("a-very-long-filename-indeed.png");
});
