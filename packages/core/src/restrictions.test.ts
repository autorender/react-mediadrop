import { expect, test } from "vitest";
import { isAcceptedType, validateFile } from "./restrictions.js";

function makeFile(name: string, type: string, size: number): File {
	return new File([new Uint8Array(size)], name, { type });
}

test("isAcceptedType accepts everything when no accept list is given", () => {
	expect(isAcceptedType({ name: "a.png", type: "image/png" }, undefined)).toBe(
		true,
	);
});

test("isAcceptedType matches exact mime types", () => {
	expect(
		isAcceptedType({ name: "a.png", type: "image/png" }, ["image/png"]),
	).toBe(true);
	expect(
		isAcceptedType({ name: "a.pdf", type: "application/pdf" }, ["image/png"]),
	).toBe(false);
});

test("isAcceptedType matches wildcard mime types", () => {
	expect(
		isAcceptedType({ name: "a.png", type: "image/png" }, ["image/*"]),
	).toBe(true);
	expect(
		isAcceptedType({ name: "a.mp4", type: "video/mp4" }, ["image/*"]),
	).toBe(false);
});

test("isAcceptedType matches file extensions", () => {
	expect(isAcceptedType({ name: "a.PNG", type: "" }, [".png"])).toBe(true);
	expect(isAcceptedType({ name: "a.txt", type: "" }, [".png"])).toBe(false);
});

test("isAcceptedType accepts a comma-separated string", () => {
	expect(
		isAcceptedType(
			{ name: "a.png", type: "image/png" },
			"image/png,image/webp",
		),
	).toBe(true);
});

test("validateFile accepts a valid file", () => {
	const file = makeFile("photo.png", "image/png", 100);
	expect(validateFile(file, { accept: ["image/png"], maxSize: 1000 })).toEqual(
		[],
	);
});

test("validateFile rejects an invalid type", () => {
	const file = makeFile("doc.pdf", "application/pdf", 100);
	const errors = validateFile(file, { accept: ["image/png"] });
	expect(errors).toHaveLength(1);
	expect(errors[0]?.code).toBe("file-invalid-type");
});

test("validateFile rejects a file that is too large", () => {
	const file = makeFile("photo.png", "image/png", 2000);
	const errors = validateFile(file, { maxSize: 1000 });
	expect(errors).toHaveLength(1);
	expect(errors[0]?.code).toBe("file-too-large");
});

test("validateFile rejects a file that is too small", () => {
	const file = makeFile("photo.png", "image/png", 10);
	const errors = validateFile(file, { minSize: 1000 });
	expect(errors).toHaveLength(1);
	expect(errors[0]?.code).toBe("file-too-small");
});

test("validateFile applies a custom validator returning a single error", () => {
	const file = makeFile("photo.png", "image/png", 100);
	const errors = validateFile(file, {}, () => ({
		code: "validator-error",
		message: "nope",
	}));
	expect(errors).toEqual([{ code: "validator-error", message: "nope" }]);
});

test("validateFile applies a custom validator returning multiple errors", () => {
	const file = makeFile("photo.png", "image/png", 100);
	const errors = validateFile(file, {}, () => [
		{ code: "validator-error", message: "first" },
		{ code: "validator-error", message: "second" },
	]);
	expect(errors).toHaveLength(2);
});

test("validateFile ignores a validator that returns nothing", () => {
	const file = makeFile("photo.png", "image/png", 100);
	expect(validateFile(file, {}, () => null)).toEqual([]);
	expect(validateFile(file, {}, () => undefined)).toEqual([]);
});
