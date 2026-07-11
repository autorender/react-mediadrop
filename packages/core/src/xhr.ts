import { createStallWatchdog } from "./stall-watchdog.js";

export type XhrSendOptions = {
	method: string;
	url: string;
	headers?: Record<string, string>;
	body?: Blob | FormData | null;
	withCredentials?: boolean;
	signal: AbortSignal;
	onUploadProgress?: (loaded: number, total: number | null) => void;
	/** Abort and reject if no upload progress happens for this many ms. `0` (default) disables it. See `createStallWatchdog`. */
	stallTimeoutMs?: number;
	/** Builds the rejection for an already-aborted signal or a plain (non-stall) abort mid-request. Default: `new Error("Upload aborted")`. */
	createAbortedError?: () => Error;
	/** Builds the rejection when the stall watchdog fires. Default: `` new Error(`Upload stalled: no progress for ${stallTimeoutMs}ms`) ``. */
	createStalledError?: (stallTimeoutMs: number) => Error;
	/** Builds the rejection for a network-level `XMLHttpRequest` error. Default: `new Error("Upload failed: network error")`. */
	createNetworkError?: () => Error;
};

/** The raw shape of a finished request — status/headers/body, uninterpreted. Callers decide success/failure from `status` themselves; this never rejects on a non-2xx response. */
export type XhrSendResult = {
	status: number;
	statusText: string;
	getHeader: (name: string) => string | null;
	responseURL: string;
	responseText: string;
};

/**
 * The one `XMLHttpRequest`-sending envelope in mediadrop: open, set headers,
 * wire `createStallWatchdog` + upload progress, resolve/reject on
 * load/error/abort, honor `signal`. Every transport that sends a request
 * over XHR (`@mediadrop/xhr-upload`, `@mediadrop/s3`'s `createS3UploadTransport`,
 * `@mediadrop/tus`'s protocol layer) calls this instead of each
 * hand-rolling the same open/watchdog/onload/onerror/onabort plumbing —
 * the same reasoning `withRetry` already applies to retry logic.
 *
 * Deliberately status-agnostic: this resolves on any response status,
 * including 4xx/5xx — interpreting `status` (success vs. `createHttpError`)
 * is the caller's job, since what counts as success/the right error
 * message differs per transport (see the `create*Error` options for the
 * same reason applied to abort/stall/network-error).
 */
export function sendXhr(options: XhrSendOptions): Promise<XhrSendResult> {
	const {
		method,
		url,
		headers,
		body = null,
		withCredentials = false,
		signal,
		onUploadProgress,
		stallTimeoutMs = 0,
		createAbortedError = () => new Error("Upload aborted"),
		createStalledError = (ms) =>
			new Error(`Upload stalled: no progress for ${ms}ms`),
		createNetworkError = () => new Error("Upload failed: network error"),
	} = options;

	return new Promise<XhrSendResult>((resolve, reject) => {
		if (signal.aborted) {
			reject(createAbortedError());
			return;
		}

		const xhr = new XMLHttpRequest();
		xhr.open(method, url, true);
		xhr.withCredentials = withCredentials;
		for (const [key, value] of Object.entries(headers ?? {})) {
			xhr.setRequestHeader(key, value);
		}

		let stalled = false;
		const watchdog = createStallWatchdog(() => {
			stalled = true;
			xhr.abort();
		}, stallTimeoutMs);

		if (onUploadProgress) {
			xhr.upload.onprogress = (event) => {
				watchdog.reset();
				onUploadProgress(
					event.loaded,
					event.lengthComputable ? event.total : null,
				);
			};
		}

		xhr.onload = () => {
			watchdog.clear();
			resolve({
				status: xhr.status,
				statusText: xhr.statusText,
				getHeader: (name) => xhr.getResponseHeader(name),
				responseURL: xhr.responseURL,
				responseText: xhr.responseText,
			});
		};
		xhr.onerror = () => {
			watchdog.clear();
			reject(createNetworkError());
		};
		xhr.onabort = () => {
			watchdog.clear();
			reject(
				stalled ? createStalledError(stallTimeoutMs) : createAbortedError(),
			);
		};

		signal.addEventListener("abort", () => xhr.abort(), { once: true });
		xhr.send(body);
	});
}
