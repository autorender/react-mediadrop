import { expect, test } from "vitest";
import { VERSION } from "./index.js";

test("exports a version string", () => {
	expect(VERSION).toBe("0.0.0");
});
