export type MediaDropErrorCode =
	| "file-invalid-type"
	| "file-too-large"
	| "file-too-small"
	| "too-many-files"
	| "validator-error"
	| "upload-error";

export type MediaDropError = {
	code: MediaDropErrorCode;
	message: string;
	/** The original error's HTTP status, when it had one (e.g. thrown via `createHttpError`) — omitted when not applicable. */
	status?: number;
	/**
	 * The original error's own classification code, when it had one distinct
	 * from `MediaDropErrorCode` — e.g. `@mediadrop/tus`'s `TusError.code`
	 * (`"offset-mismatch"`, `"head-failed"`, ...). `code` on this type stays
	 * `"upload-error"` for every upload failure (a stable, small union every
	 * consumer can switch over); `sourceCode` is the finer-grained detail a
	 * transport attached, preserved instead of discarded — omitted when the
	 * original error didn't have one.
	 */
	sourceCode?: string;
};

export type MediaDropFileStatus = "idle" | "accepted" | "rejected";

/**
 * Upload lifecycle, deliberately separate from `status`. `status` is the
 * intake/validation verdict and never changes once decided (Phase 1
 * contract, unchanged). `uploadStatus` is `undefined` until an upload is
 * requested for this file, and only ever applies to files that are
 * `status: "accepted"` — a rejected file can never be queued for upload.
 */
export type MediaDropUploadStatus =
	| "queued"
	| "uploading"
	| "done"
	| "error"
	| "canceled";

export type MediaDropUploadProgress = {
	loaded: number;
	/** `null` when the transport can't report a total (e.g. unknown length). */
	total: number | null;
};

export type MediaDropFile = {
	id: string;
	file: File;
	name: string;
	size: number;
	type: string;
	lastModified?: number;
	status: MediaDropFileStatus;
	errors: MediaDropError[];
	uploadStatus?: MediaDropUploadStatus;
	progress?: MediaDropUploadProgress;
	/** Set once an upload attempt has failed or been canceled; cleared on retry. */
	uploadError?: MediaDropError;
	/** Whatever the transport resolved with on success — opaque to core. */
	uploadResult?: unknown;
	/** 1-indexed attempt count for the current/last upload run. */
	uploadAttempts?: number;
};

export type MediaDropRestrictions = {
	maxFiles?: number;
	minSize?: number;
	maxSize?: number;
	accept?: string[] | string;
};

export type MediaDropValidator = (
	file: File,
) => MediaDropError | MediaDropError[] | null | undefined;

export type MediaDropOptions = {
	restrictions?: MediaDropRestrictions;
	validator?: MediaDropValidator;
};

export type MediaDropState = {
	files: MediaDropFile[];
};

/**
 * Drag/drop state for a single dropzone.
 *
 * - `isDragActive`: a drag payload is currently over this dropzone.
 * - `isDragAccept`: the current payload looks acceptable, best-effort.
 * - `isDragReject`: the current payload looks unacceptable, best-effort.
 *
 * Acceptance during an active drag is best-effort: browsers only expose
 * `DataTransferItem.type` (never the file name) while dragging, so
 * extension-based `accept` rules (e.g. ".png") cannot be evaluated until
 * drop. When acceptance can't be determined, both flags stay `false`.
 */
export type DragState = {
	isDragActive: boolean;
	isDragAccept: boolean;
	isDragReject: boolean;
};
