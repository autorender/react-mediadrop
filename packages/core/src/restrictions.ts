import { createError } from "./errors.js";
import type {
	MediaDropError,
	MediaDropRestrictions,
	MediaDropValidator,
} from "./types.js";

export type AcceptCandidate = {
	name: string;
	type: string;
};

export function normalizeAccept(
	accept: string[] | string | undefined,
): string[] {
	if (!accept) return [];
	const list = Array.isArray(accept) ? accept : accept.split(",");
	return list.map((token) => token.trim()).filter((token) => token.length > 0);
}

function matchesToken(candidate: AcceptCandidate, token: string): boolean {
	if (token.startsWith(".")) {
		return candidate.name.toLowerCase().endsWith(token.toLowerCase());
	}
	if (token.endsWith("/*")) {
		return candidate.type.startsWith(token.slice(0, -1));
	}
	return candidate.type === token;
}

/**
 * Checks a candidate file against an `accept` restriction. An empty/missing
 * `accept` list accepts everything.
 */
export function isAcceptedType(
	candidate: AcceptCandidate,
	accept: string[] | string | undefined,
): boolean {
	const tokens = normalizeAccept(accept);
	if (tokens.length === 0) return true;
	return tokens.some((token) => matchesToken(candidate, token));
}

/**
 * Validates a single file against restrictions and an optional custom
 * validator. Does not evaluate aggregate rules like `maxFiles` — those
 * depend on the batch/current state and are handled by the intake engine.
 */
export function validateFile(
	file: File,
	restrictions: MediaDropRestrictions = {},
	validator?: MediaDropValidator,
): MediaDropError[] {
	const errors: MediaDropError[] = [];

	if (!isAcceptedType(file, restrictions.accept)) {
		errors.push(
			createError(
				"file-invalid-type",
				`File type "${file.type || "unknown"}" is not an accepted type.`,
			),
		);
	}

	if (
		typeof restrictions.maxSize === "number" &&
		file.size > restrictions.maxSize
	) {
		errors.push(
			createError(
				"file-too-large",
				`File size ${file.size} exceeds the maximum of ${restrictions.maxSize} bytes.`,
			),
		);
	}

	if (
		typeof restrictions.minSize === "number" &&
		file.size < restrictions.minSize
	) {
		errors.push(
			createError(
				"file-too-small",
				`File size ${file.size} is below the minimum of ${restrictions.minSize} bytes.`,
			),
		);
	}

	if (validator) {
		const result = validator(file);
		if (result) {
			errors.push(...(Array.isArray(result) ? result : [result]));
		}
	}

	return errors;
}
