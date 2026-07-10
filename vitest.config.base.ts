import type { UserConfig } from "vitest/config";

export type CoverageThresholds = {
	statements: number;
	branches: number;
	functions: number;
	lines: number;
};

/**
 * Thresholds are set at (a small buffer below) each package's *measured*
 * baseline as of plan 023's coverage audit — this is a regression guard
 * ("coverage can't silently get worse"), not an aspirational target
 * ("coverage must reach X%"). Raise a package's thresholds as its real
 * measured coverage improves; don't lower them to make a shrinking
 * number pass.
 */
export function coverageTest(
	thresholds: CoverageThresholds,
): UserConfig["test"] {
	return {
		coverage: {
			provider: "v8",
			thresholds,
		},
	};
}
