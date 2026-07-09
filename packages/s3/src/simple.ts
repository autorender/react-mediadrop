import type {
	MediaDropFile,
	UploadTransport,
	UploadTransportResult,
} from "@mediadrop/core";
import { createHttpError, createStallWatchdog } from "@mediadrop/core";
import type { S3PresignedUpload } from "./types.js";

export type S3UploadOptions = {
	/** Called once per upload attempt — ask your backend to sign a URL for this file. */
	getUploadUrl: (context: {
		file: MediaDropFile;
	}) => Promise<S3PresignedUpload>;
	/** Status codes treated as success. Default: `200 <= status < 300`. */
	isSuccessStatus?: (status: number) => boolean;
	/**
	 * Abort and reject if no upload progress happens for this many ms — a
	 * *stall* timeout (reset on every progress event), not a flat
	 * total-duration one, so a large file on a slow-but-healthy connection
	 * is never falsely aborted. Default `0` (disabled).
	 */
	stallTimeoutMs?: number;
};

function buildPostFormData(
	file: MediaDropFile,
	fields: Record<string, string> | undefined,
): FormData {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields ?? {})) {
		formData.append(key, value);
	}
	// S3's presigned-POST policy requires the file field to come last.
	formData.append("file", file.file, file.name);
	return formData;
}

function sendXhr(
	presigned: S3PresignedUpload,
	file: MediaDropFile,
	onProgress: (loaded: number, total: number | null) => void,
	signal: AbortSignal,
	isSuccessStatus: (status: number) => boolean,
	stallTimeoutMs: number,
): Promise<UploadTransportResult> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error("Upload aborted"));
			return;
		}

		const method = presigned.method ?? "PUT";
		const xhr = new XMLHttpRequest();
		xhr.open(method, presigned.url, true);
		for (const [key, value] of Object.entries(presigned.headers ?? {})) {
			xhr.setRequestHeader(key, value);
		}

		let stalled = false;
		const watchdog = createStallWatchdog(() => {
			stalled = true;
			xhr.abort();
		}, stallTimeoutMs);

		xhr.upload.onprogress = (event) => {
			watchdog.reset();
			onProgress(event.loaded, event.lengthComputable ? event.total : null);
		};

		xhr.onload = () => {
			watchdog.clear();
			if (isSuccessStatus(xhr.status)) {
				resolve({
					response: {
						key: presigned.key,
						bucket: presigned.bucket,
						status: xhr.status,
					},
				});
			} else {
				reject(
					createHttpError(
						`S3 upload failed with status ${xhr.status}${xhr.statusText ? `: ${xhr.statusText}` : ""}`,
						xhr.status,
					),
				);
			}
		};
		xhr.onerror = () => {
			watchdog.clear();
			reject(new Error("S3 upload failed: network error"));
		};
		xhr.onabort = () => {
			watchdog.clear();
			reject(
				stalled
					? new Error(`Upload stalled: no progress for ${stallTimeoutMs}ms`)
					: new Error("Upload aborted"),
			);
		};
		signal.addEventListener("abort", () => xhr.abort(), { once: true });

		if (method === "POST") {
			xhr.send(buildPostFormData(file, presigned.fields));
		} else {
			xhr.send(file.file);
		}
	});
}

/**
 * A single-request S3 upload — presigned PUT (the object bytes as the
 * request body) or presigned POST (S3's policy-based form upload). This
 * is `@mediadrop/xhr-upload` with S3's two presigned-request shapes
 * instead of a generic endpoint; for large files where a single request
 * isn't practical, see `s3MultipartUpload` in this package instead.
 *
 * No retry here — same as every transport in mediadrop, retry is
 * `@mediadrop/core`'s upload queue's job, not this adapter's.
 */
export function s3Upload(options: S3UploadOptions): UploadTransport {
	const {
		getUploadUrl,
		isSuccessStatus = (status) => status >= 200 && status < 300,
		stallTimeoutMs = 0,
	} = options;

	return {
		async upload(file, { onProgress, signal }) {
			if (signal.aborted) {
				throw new Error("Upload aborted");
			}
			const presigned = await getUploadUrl({ file });
			return sendXhr(
				presigned,
				file,
				(loaded, total) => onProgress({ loaded, total }),
				signal,
				isSuccessStatus,
				stallTimeoutMs,
			);
		},
	};
}
