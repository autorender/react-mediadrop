import { expect, test } from "vitest";
import { createFileItem } from "./file.js";

test("wraps a File into an idle MediaDropFile with a generated id", () => {
	const file = new File(["hello"], "hello.txt", { type: "text/plain" });
	const item = createFileItem(file);

	expect(item.id).toBeTruthy();
	expect(item.file).toBe(file);
	expect(item.name).toBe("hello.txt");
	expect(item.size).toBe(file.size);
	expect(item.type).toBe("text/plain");
	expect(item.status).toBe("idle");
	expect(item.errors).toEqual([]);
});
