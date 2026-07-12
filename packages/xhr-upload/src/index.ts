import type {
	MediaDropFile,
	UploadTransport,
	UploadTransportResult,
	XhrSendResult,
} from "@mediadrop/core";
import { createHttpError, sendXhr } from "@mediadrop/core";

export type XhrUploadFields =
	| Record<string, string>
	| ((file: MediaDropFile) => Record<string, string>);

export type XhrUploadHeaders =
	| Record<string, string>
	| ((file: MediaDropFile) => Record<string, string>);

export type XhrUploadOptions = {
	/** Upload URL, or a function to compute one per file (e.g. a presigned URL you already fetched). */
	endpoint: string | ((file: MediaDropFile) => string);
	/** HTTP method. Default `"POST"`. */
	method?: string;
	/** Form field name the file is attached under. Ignored when `formData: false`. Default `"file"`. */
	fieldName?: string;
	/** Extra form fields sent alongside the file. Ignored when `formData: false`. */
	fields?: XhrUploadFields;
	/** Extra request headers. */
	headers?: XhrUploadHeaders;
	withCredentials?: boolean;
	/**
	 * `true` (default): send as `multipart/form-data` via `FormData`.
	 * `false`: send the file's raw bytes as the request body — e.g. for a
	 * presigned PUT URL that expects the object directly, not a multipart
	 * envelope. This is a single PUT/POST either way; it is not S3's
	 * multipart-upload API (multiple parts, an upload ID, a completion
	 * call) — that protocol is out of scope here, see the package README.
	 */
	formData?: boolean;
	/** Status codes treated as success. Default: `200 <= status < 300`. */
	isSuccessStatus?: (status: number) => boolean;
	/**
	 * Abort and reject if no upload progress happens for this many ms —
	 * catches a silently dead connection (dropped network, the machine
	 * sleeping mid-transfer) that would otherwise hang forever instead of
	 * erroring into the queue's retry. This is a *stall* timeout, reset on
	 * every progress event — not a flat total-duration timeout, so a large
	 * file on a slow-but-healthy connection is never falsely aborted.
	 * Default `0` (disabled), matching every other opt-in escape hatch
	 * here (`retries`, `jitter`, etc).
	 */
	stallTimeoutMs?: number;
};

function resolve<T>(
	value: T | ((file: MediaDropFile) => T),
	file: MediaDropFile,
): T {
	return typeof value === "function"
		? (value as (file: MediaDropFile) => T)(file)
		: value;
}

function buildFormData(
	file: MediaDropFile,
	fieldName: string,
	fields: XhrUploadFields | undefined,
): FormData {
	const formData = new FormData();
	const resolvedFields = fields ? resolve(fields, file) : undefined;
	for (const [key, value] of Object.entries(resolvedFields ?? {})) {
		formData.append(key, value);
	}
	formData.append(fieldName, file.file, file.name);
	return formData;
}

function parseResponseBody(result: XhrSendResult): unknown {
	const contentType = result.getHeader("Content-Type") ?? "";
	if (contentType.includes("json") && result.responseText) {
		try {
			return JSON.parse(result.responseText);
		} catch {
			return result.responseText;
		}
	}
	return result.responseText;
}

/**
 * A reference `UploadTransport` (see `@mediadrop/core`) that sends a file
 * with `XMLHttpRequest` — chosen over `fetch` specifically because `fetch`
 * still has no cross-browser upload-progress API, while
 * `XMLHttpRequest.upload.onprogress` does.
 *
 * This is deliberately thin: one file, one request, no retry and no
 * concurrency logic of its own — `@mediadrop/core`'s upload queue owns
 * both of those and calls this transport once per attempt. See the
 * package README for exactly what this does and does not do (no
 * resumability, no chunking, no S3 multipart-upload protocol).
 */
export function createXhrUploadTransport(
	options: XhrUploadOptions,
): UploadTransport {
	const {
		endpoint,
		method = "POST",
		fieldName = "file",
		fields,
		headers,
		withCredentials = false,
		formData = true,
		isSuccessStatus = (status) => status >= 200 && status < 300,
		stallTimeoutMs = 0,
	} = options;

	return {
		async upload(file, { onProgress, signal }) {
			const url = resolve(endpoint, file);
			const resolvedHeaders = headers ? resolve(headers, file) : undefined;

			const result = await sendXhr({
				method,
				url,
				headers: resolvedHeaders,
				withCredentials,
				body: formData ? buildFormData(file, fieldName, fields) : file.file,
				signal,
				stallTimeoutMs,
				onUploadProgress: (loaded, total) => onProgress({ loaded, total }),
			});

			if (!isSuccessStatus(result.status)) {
				throw createHttpError(
					`Upload failed with status ${result.status}${
						result.statusText ? `: ${result.statusText}` : ""
					}`,
					result.status,
				);
			}

			return {
				response: parseResponseBody(result),
			} satisfies UploadTransportResult;
		},
	};
}
