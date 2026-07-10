import { defineConfig } from "vitest/config";
import { coverageTest } from "../../vitest.config.base.js";

export default defineConfig({
	test: coverageTest({
		statements: 88,
		branches: 88,
		functions: 90,
		lines: 88,
	}),
});
