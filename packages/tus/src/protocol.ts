import { TUS_RESUMABLE, TusError } from "./types.js";

type XhrResult = {
	status: number;
	getHeader: (name: string) => string | null;
	responseURL: string;
};

function sendXhr(
	method: string,
	url: string,
	options: {
		headers?: Record<string, string>;
		body?: Blob | null;
		signal: AbortSignal;
		onUploadProgress?: (loaded: number) => void;
	},
): Promise<XhrResult> {
	return new Promise((resolve, reject) => {
		if (options.signal.aborted) {
			reject(new TusError("aborted", "Upload aborted"));
			return;
		}
		const xhr = new XMLHttpRequest();
		xhr.open(method, url, true);
		for (const [key, value] of Object.entries(options.headers ?? {})) {
			xhr.setRequestHeader(key, value);
		}
		if (options.onUploadProgress) {
			const onUploadProgress = options.onUploadProgress;
			xhr.upload.onprogress = (event) => onUploadProgress(event.loaded);
		}
		xhr.onload = () => {
			resolve({
				status: xhr.status,
				getHeader: (name) => xhr.getResponseHeader(name),
				responseURL: xhr.responseURL,
			});
		};
		xhr.onerror = () =>
			reject(new Error(`${method} ${url} failed: network error`));
		xhr.onabort = () => reject(new TusError("aborted", "Upload aborted"));
		options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
		xhr.send(options.body ?? null);
	});
}

export async function createUpload(
	endpoint: string,
	options: {
		uploadLength: number;
		metadataHeader: string;
		headers?: Record<string, string>;
		signal: AbortSignal;
	},
): Promise<{ uploadUrl: string }> {
	const result = await sendXhr("POST", endpoint, {
		headers: {
			"Tus-Resumable": TUS_RESUMABLE,
			"Upload-Length": String(options.uploadLength),
			"Upload-Metadata": options.metadataHeader,
			...options.headers,
		},
		signal: options.signal,
	});
	if (result.status < 200 || result.status >= 300) {
		throw new TusError(
			"creation-failed",
			`tus upload creation failed with status ${result.status}`,
			result.status,
		);
	}
	const location = result.getHeader("Location");
	if (!location) {
		throw new TusError(
			"creation-failed",
			"tus server did not return a Location header",
		);
	}
	return {
		uploadUrl: new URL(location, result.responseURL || endpoint).toString(),
	};
}

export async function headUpload(
	uploadUrl: string,
	options: { headers?: Record<string, string>; signal: AbortSignal },
): Promise<{ offset: number }> {
	const result = await sendXhr("HEAD", uploadUrl, {
		headers: { "Tus-Resumable": TUS_RESUMABLE, ...options.headers },
		signal: options.signal,
	});
	if (result.status < 200 || result.status >= 300) {
		throw new TusError(
			"head-failed",
			`tus HEAD failed with status ${result.status}`,
			result.status,
		);
	}
	const offsetHeader = result.getHeader("Upload-Offset");
	if (offsetHeader === null) {
		throw new TusError(
			"head-failed",
			"tus HEAD response was missing the Upload-Offset header",
		);
	}
	const offset = Number.parseInt(offsetHeader, 10);
	if (!Number.isFinite(offset)) {
		throw new TusError(
			"head-failed",
			`tus HEAD returned a non-numeric Upload-Offset: "${offsetHeader}"`,
		);
	}
	return { offset };
}

export async function patchChunk(
	uploadUrl: string,
	options: {
		offset: number;
		chunk: Blob;
		headers?: Record<string, string>;
		signal: AbortSignal;
		onProgress?: (loaded: number) => void;
	},
): Promise<{ offset: number }> {
	const result = await sendXhr("PATCH", uploadUrl, {
		headers: {
			"Tus-Resumable": TUS_RESUMABLE,
			"Upload-Offset": String(options.offset),
			"Content-Type": "application/offset+octet-stream",
			...options.headers,
		},
		body: options.chunk,
		signal: options.signal,
		onUploadProgress: options.onProgress,
	});
	if (result.status < 200 || result.status >= 300) {
		throw new TusError(
			"patch-failed",
			`tus PATCH failed with status ${result.status}`,
			result.status,
		);
	}
	const offsetHeader = result.getHeader("Upload-Offset");
	if (offsetHeader === null) {
		throw new TusError(
			"offset-mismatch",
			"tus PATCH response was missing the Upload-Offset header",
		);
	}
	const offset = Number.parseInt(offsetHeader, 10);
	if (!Number.isFinite(offset)) {
		throw new TusError(
			"offset-mismatch",
			`tus PATCH returned a non-numeric Upload-Offset: "${offsetHeader}"`,
		);
	}
	return { offset };
}
