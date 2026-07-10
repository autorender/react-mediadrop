import type { UploadTransport } from "@mediadrop/core";
import { browserUploadSessionStore } from "@mediadrop/core";
import type {
	S3MultipartCompleteResult,
	S3MultipartCreateResult,
	S3MultipartPartUrlResult,
	S3PresignedUpload,
} from "@mediadrop/s3";
import { s3MultipartUpload, s3Upload } from "@mediadrop/s3";
import { tusUpload } from "@mediadrop/tus";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

export const MAX_SIZE = 5 * 1024 * 1024;

// A real backend — see ../../test-server. Run it separately
// (`pnpm dev` in test-server/) alongside this app; xhr and tus work out
// of the box, the S3 tabs need AWS_* configured in its .env.
export const API_BASE =
	import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const detail = await res.text();
		throw new Error(`${path} failed with ${res.status}: ${detail}`);
	}
	return res.json();
}

/** For endpoints (like abort) that respond 204 with no body. */
async function post(path: string, body: unknown): Promise<void> {
	const res = await fetch(`${API_BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const detail = await res.text();
		throw new Error(`${path} failed with ${res.status}: ${detail}`);
	}
}

export type TransportKey = "xhr" | "s3-simple" | "s3-multipart" | "tus";

export type TransportDef = {
	label: string;
	description: string;
	/** True if this tab needs AWS_* configured in test-server/.env — false means it works with zero setup. */
	requiresAwsSetup: boolean;
	create: () => UploadTransport;
};

export const TRANSPORTS: Record<TransportKey, TransportDef> = {
	xhr: {
		label: "XHR — generic endpoint",
		description:
			"@mediadrop/xhr-upload — one request, the whole file, written to disk by test-server.",
		requiresAwsSetup: false,
		create: () =>
			createXhrUploadTransport({
				endpoint: `${API_BASE}/api/upload`,
				formData: false,
			}),
	},
	"s3-simple": {
		label: "S3 — single request",
		description:
			"@mediadrop/s3's s3Upload — one presigned PUT request, signed by test-server against your real S3 bucket.",
		requiresAwsSetup: true,
		create: () =>
			s3Upload({
				getUploadUrl: ({ file }) =>
					postJson<S3PresignedUpload>("/api/s3/presign", {
						filename: file.name,
						contentType: file.type,
					}),
			}),
	},
	"s3-multipart": {
		label: "S3 — multipart, resumable",
		description:
			"@mediadrop/s3's s3MultipartUpload — splits the file into parts, uploads them with bounded concurrency, and persists enough metadata (via browserUploadSessionStore) to skip already-uploaded parts if you reselect the same file after a reload.",
		requiresAwsSetup: true,
		create: () =>
			s3MultipartUpload({
				partSize: 5 * 1024 * 1024,
				sessionStore: browserUploadSessionStore(),
				createMultipartUpload: ({ file }) =>
					postJson<S3MultipartCreateResult>("/api/s3/multipart/create", {
						filename: file.name,
						contentType: file.type,
					}),
				getPartUploadUrl: ({ key, uploadId, partNumber }) =>
					postJson<S3MultipartPartUrlResult>("/api/s3/multipart/part", {
						key,
						uploadId,
						partNumber,
					}),
				completeMultipartUpload: ({ key, uploadId, parts }) =>
					postJson<S3MultipartCompleteResult>("/api/s3/multipart/complete", {
						key,
						uploadId,
						parts: parts.map((part) => ({
							partNumber: part.partNumber,
							etag: part.etag,
						})),
					}),
				abortMultipartUpload: ({ key, uploadId }) =>
					post("/api/s3/multipart/abort", { key, uploadId }),
			}),
	},
	tus: {
		label: "tus — resumable chunks",
		description:
			"@mediadrop/tus's tusUpload — POSTs to create, then PATCHes chunks, against test-server's real @tus/server instance. Resumes from the server-reported offset if you reselect the same file after a reload.",
		requiresAwsSetup: false,
		create: () =>
			tusUpload({
				endpoint: `${API_BASE}/api/tus`,
				sessionStore: browserUploadSessionStore(),
			}),
	},
};
