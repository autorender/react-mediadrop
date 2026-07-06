import { expect, test } from "vitest";
import { VERSION } from "./index.js";

test("re-exports VERSION from @mediadrop/core", () => {
	expect(VERSION).toBe("0.0.0");
});
