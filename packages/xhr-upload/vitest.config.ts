import { defineConfig } from "vitest/config";
import { coverageTest } from "../../vitest.config.base.js";

export default defineConfig({
	test: coverageTest({
		statements: 93,
		branches: 93,
		functions: 97,
		lines: 93,
	}),
});
