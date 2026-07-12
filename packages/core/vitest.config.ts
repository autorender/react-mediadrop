import { defineConfig } from "vitest/config";
import { coverageTest } from "../../vitest.config.base.js";

export default defineConfig({
	test: coverageTest({
		statements: 92,
		branches: 87,
		functions: 91,
		lines: 93,
	}),
});
