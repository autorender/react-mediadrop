import { expect, test } from "vitest";
import { createId } from "./id.js";

test("generates unique ids across many calls", () => {
	const ids = new Set(Array.from({ length: 1000 }, () => createId()));
	expect(ids.size).toBe(1000);
});

test("generates string ids", () => {
	expect(typeof createId()).toBe("string");
});
