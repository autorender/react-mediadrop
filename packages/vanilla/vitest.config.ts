import { defineConfig } from "vitest/config";
import { coverageTest } from "../../vitest.config.base.js";

export default defineConfig({
	test: coverageTest({
		statements: 93,
		branches: 87,
		functions: 83,
		lines: 95,
	}),
});
