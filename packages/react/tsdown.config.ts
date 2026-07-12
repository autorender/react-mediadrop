import { defineConfig } from "tsdown";

export default defineConfig({
	// Two independent entries, two independent output files. src/index.ts
	// (the hook) and src/xhr-upload.ts (the transport) never import each
	// other, so each dist file only contains what it actually needs —
	// importing "react-mediadrop" alone never bundles the xhr-upload
	// transport, and vice versa. This is what makes the package
	// tree-shakeable per-subpath rather than relying on a bundler to
	// dead-code-eliminate across a single shared entry.
	entry: ["src/index.ts", "src/xhr-upload.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	// @mediadrop/core and @mediadrop/xhr-upload are workspace-only,
	// unpublished packages — their code (and types) are inlined directly
	// into whichever entry imports them instead of staying an external
	// import, so a consumer only ever installs react-mediadrop.
	// `react`/`react-dom` (real peerDependencies) are untouched by this and
	// stay external, as normal.
	deps: {
		alwaysBundle: ["@mediadrop/core", "@mediadrop/xhr-upload"],
		dts: {
			alwaysBundle: ["@mediadrop/core", "@mediadrop/xhr-upload"],
		},
	},
});
