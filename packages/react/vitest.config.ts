import { defineConfig } from "vitest/config";
import { coverageTest } from "../../vitest.config.base.js";

export default defineConfig({
	test: coverageTest({
		statements: 90,
		branches: 70,
		functions: 89,
		lines: 95,
	}),
});
