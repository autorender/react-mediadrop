import type {
	MediaDropFile,
	UploadTransport,
	UploadTransportResult,
} from "@mediadrop/core";

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

function parseResponseBody(xhr: XMLHttpRequest): unknown {
	const contentType = xhr.getResponseHeader("Content-Type") ?? "";
	if (contentType.includes("json") && xhr.responseText) {
		try {
			return JSON.parse(xhr.responseText);
		} catch {
			return xhr.responseText;
		}
	}
	return xhr.responseText;
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
	} = options;

	return {
		upload(file, { onProgress, signal }) {
			return new Promise<UploadTransportResult>((resolvePromise, reject) => {
				if (signal.aborted) {
					reject(new Error("Upload aborted"));
					return;
				}

				const url = resolve(endpoint, file);
				const xhr = new XMLHttpRequest();
				xhr.open(method, url, true);
				xhr.withCredentials = withCredentials;

				const resolvedHeaders = headers ? resolve(headers, file) : undefined;
				for (const [key, value] of Object.entries(resolvedHeaders ?? {})) {
					xhr.setRequestHeader(key, value);
				}

				xhr.upload.onprogress = (event) => {
					onProgress({
						loaded: event.loaded,
						total: event.lengthComputable ? event.total : null,
					});
				};

				xhr.onload = () => {
					if (isSuccessStatus(xhr.status)) {
						resolvePromise({ response: parseResponseBody(xhr) });
					} else {
						reject(
							new Error(
								`Upload failed with status ${xhr.status}${
									xhr.statusText ? `: ${xhr.statusText}` : ""
								}`,
							),
						);
					}
				};
				xhr.onerror = () => reject(new Error("Upload failed: network error"));
				xhr.ontimeout = () => reject(new Error("Upload failed: timed out"));
				xhr.onabort = () => reject(new Error("Upload aborted"));

				signal.addEventListener("abort", () => xhr.abort(), { once: true });

				xhr.send(formData ? buildFormData(file, fieldName, fields) : file.file);
			});
		},
	};
}
