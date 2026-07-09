#!/usr/bin/env node
// Enforces the gzipped size budget declared under `sizeLimit` in the
// current package's package.json. Run from a package directory after its
// build (`tsdown`) has produced `dist/`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const cwd = process.cwd();
const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
const budgets = pkg.sizeLimit;

if (!budgets || Object.keys(budgets).length === 0) {
	console.error(
		`✗ ${pkg.name}: no "sizeLimit" field in package.json — nothing to check.`,
	);
	process.exit(1);
}

function parseBudget(input) {
	const match = /^([\d.]+)\s*(B|KB|MB)$/i.exec(String(input).trim());
	if (!match) {
		throw new Error(`Invalid size budget "${input}" (expected e.g. "5 KB")`);
	}
	const value = Number.parseFloat(match[1]);
	const unit = match[2].toUpperCase();
	const multiplier = unit === "MB" ? 1024 * 1024 : unit === "KB" ? 1024 : 1;
	return value * multiplier;
}

let failed = false;

for (const [file, budget] of Object.entries(budgets)) {
	const path = join(cwd, file);
	let raw;
	try {
		raw = readFileSync(path);
	} catch {
		console.error(`✗ ${file}: not found — did the build run first?`);
		failed = true;
		continue;
	}

	const gzippedSize = gzipSync(raw).length;
	const limitBytes = parseBudget(budget);
	const overBudget = gzippedSize > limitBytes;
	if (overBudget) failed = true;

	console.log(
		`${overBudget ? "✗" : "✓"} ${file}: ${gzippedSize} B gzipped (raw ${raw.length} B) — budget ${budget}`,
	);
}

if (failed) {
	console.error("\nBundle size budget exceeded.");
	process.exit(1);
}
