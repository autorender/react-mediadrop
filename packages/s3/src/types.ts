import type { MediaDropFile } from "@mediadrop/core";

/** What your backend's presign endpoint returns for a simple (single-request) upload. */
export type S3PresignedUpload = {
	url: string;
	/** Default `"PUT"`. `"POST"` is S3's presigned-POST form-upload style. */
	method?: "PUT" | "POST";
	/** Sent as request headers. For `PUT`, only what you list here is sent — nothing is invented, since an unexpected header can break SigV4 signature validation. */
	headers?: Record<string, string>;
	/** POST-only: the presigned policy's form fields, sent before the file field (S3 requires the file field last). */
	fields?: Record<string, string>;
	key?: string;
	bucket?: string;
};

export type S3MultipartPart = {
	partNumber: number;
	etag: string;
	size: number;
};

export type S3MultipartResult = {
	key?: string;
	location?: string;
	uploadId?: string;
	parts: S3MultipartPart[];
};

/**
 * Persisted metadata for a resumable multipart upload — never file bytes,
 * see `@mediadrop/core`'s `MediaDropUploadSessionStore`. Matching this
 * back up to a real upload requires the user to reselect a file with the
 * same fingerprint; nothing here lets mediadrop resume without that.
 */
export type S3MultipartSession = {
	type: "s3-multipart";
	fingerprint: string;
	uploadId: string;
	key: string;
	partSize: number;
	completedParts: S3MultipartPart[];
	createdAt: number;
	updatedAt: number;
};

export type S3MultipartCreateContext = { file: MediaDropFile };
export type S3MultipartCreateResult = { uploadId: string; key: string };

export type S3MultipartPartUrlContext = {
	file: MediaDropFile;
	key: string;
	uploadId: string;
	partNumber: number;
};
export type S3MultipartPartUrlResult = {
	url: string;
	headers?: Record<string, string>;
};

export type S3MultipartCompleteContext = {
	file: MediaDropFile;
	key: string;
	uploadId: string;
	parts: S3MultipartPart[];
};
export type S3MultipartCompleteResult = { key?: string; location?: string };

export type S3MultipartAbortContext = {
	file: MediaDropFile;
	key: string;
	uploadId: string;
};

export type S3MultipartListPartsContext = {
	file: MediaDropFile;
	key: string;
	uploadId: string;
};
