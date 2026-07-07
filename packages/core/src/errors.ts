import type { MediaDropError, MediaDropErrorCode } from "./types.js";

export function createError(
	code: MediaDropErrorCode,
	message: string,
): MediaDropError {
	return { code, message };
}
