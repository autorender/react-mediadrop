#!/usr/bin/env node
// Fails if any published package's *production* `dependencies` (not
// `devDependencies` — dev tooling can reasonably float more loosely) has a
// wide-open, effectively-unpinned range. This is cheap insurance for a
// library whose whole architecture principle is "zero/minimal runtime
// deps" — every dependency addition is meant to be a deliberate,
// scrutinized decision, not one that can silently widen to "anything."
import { readdirSync, readFileSync } from "node:fs";

const BANNED = [/^\*$/, /^x$/i, /^$/];

let failed = false;

for (const pkg of readdirSync("packages")) {
	const pkgJsonPath = `packages/${pkg}/package.json`;
	let pkgJson;
	try {
		pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
	} catch {
		continue;
	}

	for (const [dep, range] of Object.entries(pkgJson.dependencies ?? {})) {
		// `workspace:*` is pnpm's intra-monorepo protocol, not a floating
		// external semver range — it's rewritten to the real published
		// version at publish time, so it's exempt from this check.
		if (range.startsWith("workspace:")) continue;

		if (BANNED.some((re) => re.test(range))) {
			console.error(
				`${pkgJsonPath}: dependency "${dep}" has an unpinned/wide-open range "${range}"`,
			);
			failed = true;
		}
	}
}

if (failed) {
	console.error("\nDependency range check failed.");
	process.exit(1);
}
console.log("All production dependency ranges OK.");
