export const TUS_RESUMABLE = "1.0.0";

export type TusErrorCode =
	| "creation-failed"
	| "head-failed"
	| "patch-failed"
	| "offset-mismatch"
	| "aborted";

export class TusError extends Error {
	code: TusErrorCode;
	status?: number;

	constructor(code: TusErrorCode, message: string, status?: number) {
		super(message);
		this.name = "TusError";
		this.code = code;
		this.status = status;
	}
}

/**
 * Persisted metadata for a resumable tus upload — never file bytes, see
 * `@mediadrop/core`'s `MediaDropUploadSessionStore`. `offset` is
 * informational only: on resume, the real current offset always comes
 * from a fresh `HEAD` to `uploadUrl`, never from this stale local value.
 */
export type TusSession = {
	type: "tus";
	fingerprint: string;
	uploadUrl: string;
	offset: number;
	createdAt: number;
	updatedAt: number;
};
