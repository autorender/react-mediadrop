import type {
	MediaDropFile,
	UploadTransport,
	UploadTransportResult,
} from "@mediadrop/core";
import type { S3PresignedUpload } from "./types.js";

export type S3UploadOptions = {
	/** Called once per upload attempt — ask your backend to sign a URL for this file. */
	getUploadUrl: (context: {
		file: MediaDropFile;
	}) => Promise<S3PresignedUpload>;
	/** Status codes treated as success. Default: `200 <= status < 300`. */
	isSuccessStatus?: (status: number) => boolean;
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

		xhr.upload.onprogress = (event) => {
			onProgress(event.loaded, event.lengthComputable ? event.total : null);
		};

		xhr.onload = () => {
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
					new Error(
						`S3 upload failed with status ${xhr.status}${xhr.statusText ? `: ${xhr.statusText}` : ""}`,
					),
				);
			}
		};
		xhr.onerror = () => reject(new Error("S3 upload failed: network error"));
		xhr.ontimeout = () => reject(new Error("S3 upload failed: timed out"));
		xhr.onabort = () => reject(new Error("Upload aborted"));
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
			);
		},
	};
}
