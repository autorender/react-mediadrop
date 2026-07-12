import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	// @mediadrop/core is a workspace-only, unpublished package — inline its
	// code/types directly into this package's dist instead of leaving an
	// external import a published consumer couldn't resolve. See
	// react-mediadrop's tsdown.config.ts for the same treatment.
	deps: {
		alwaysBundle: ["@mediadrop/core"],
		dts: {
			alwaysBundle: ["@mediadrop/core"],
		},
	},
});
