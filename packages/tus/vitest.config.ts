import { defineConfig } from "vitest/config";
import { coverageTest } from "../../vitest.config.base.js";

export default defineConfig({
	test: coverageTest({
		statements: 89,
		branches: 83,
		functions: 91,
		lines: 88,
	}),
});
