// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { sendXhr } from "./xhr.js";

/**
 * A hand-rolled `XMLHttpRequest` double — jsdom's own implementation tries
 * to perform a real network request, which we don't want in a unit test.
 * This gives full, synchronous control over every event `sendXhr` listens to.
 */
class MockXhr {
	static instances: MockXhr[] = [];

	method = "";
	url = "";
	withCredentials = false;
	status = 0;
	statusText = "";
	responseText = "";
	responseURL = "";
	requestHeaders: Record<string, string> = {};
	responseHeaders: Record<string, string> = {};
	sentBody: unknown;
	aborted = false;
	upload: {
		onprogress:
			| ((event: {
					loaded: number;
					total: number;
					lengthComputable: boolean;
			  }) => void)
			| null;
	} = {
		onprogress: null,
	};
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onabort: (() => void) | null = null;

	constructor() {
		MockXhr.instances.push(this);
	}

	open(method: string, url: string): void {
		this.method = method;
		this.url = url;
	}

	setRequestHeader(key: string, value: string): void {
		this.requestHeaders[key] = value;
	}

	send(body: unknown): void {
		this.sentBody = body;
	}

	abort(): void {
		this.aborted = true;
		this.onabort?.();
	}

	getResponseHeader(name: string): string | null {
		return this.responseHeaders[name] ?? null;
	}

	respond(
		status: number,
		body = "",
		headers: Record<string, string> = {},
	): void {
		this.status = status;
		this.statusText = status >= 200 && status < 300 ? "OK" : "Error";
		this.responseText = body;
		this.responseHeaders = headers;
		this.responseURL = this.url;
		this.onload?.();
	}

	progress(loaded: number, total: number | null): void {
		this.upload.onprogress?.({
			loaded,
			total: total ?? 0,
			lengthComputable: total !== null,
		});
	}

	networkError(): void {
		this.onerror?.();
	}
}

let originalXhr: typeof XMLHttpRequest;

beforeEach(() => {
	MockXhr.instances = [];
	originalXhr = globalThis.XMLHttpRequest;
	globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
	globalThis.XMLHttpRequest = originalXhr;
});

test("resolves with the raw status/headers/body on any status, including non-2xx", async () => {
	const promise = sendXhr({
		method: "POST",
		url: "https://example.test/upload",
		signal: new AbortController().signal,
	});

	MockXhr.instances[0]?.respond(404, "not found", {
		"Content-Type": "text/plain",
	});

	const result = await promise;
	expect(result.status).toBe(404);
	expect(result.responseText).toBe("not found");
	expect(result.getHeader("Content-Type")).toBe("text/plain");
});

test("sends the given method, url, headers, and body", async () => {
	const body = new Blob(["raw body"]);
	const promise = sendXhr({
		method: "PUT",
		url: "https://example.test/upload",
		headers: { "X-Custom": "yes" },
		body,
		signal: new AbortController().signal,
	});

	const xhr = MockXhr.instances[0];
	expect(xhr?.method).toBe("PUT");
	expect(xhr?.url).toBe("https://example.test/upload");
	expect(xhr?.requestHeaders["X-Custom"]).toBe("yes");
	expect(xhr?.sentBody).toBe(body);

	xhr?.respond(200);
	await promise;
});

test("relays upload progress", async () => {
	const onUploadProgress = vi.fn();
	const promise = sendXhr({
		method: "POST",
		url: "https://example.test/upload",
		signal: new AbortController().signal,
		onUploadProgress,
	});

	MockXhr.instances[0]?.progress(50, 100);
	expect(onUploadProgress).toHaveBeenCalledWith(50, 100);

	MockXhr.instances[0]?.respond(200);
	await promise;
});

test("rejects with a network error on XHR's onerror", async () => {
	const promise = sendXhr({
		method: "POST",
		url: "https://example.test/upload",
		signal: new AbortController().signal,
	});

	MockXhr.instances[0]?.networkError();

	await expect(promise).rejects.toThrow("Upload failed: network error");
});

test("rejects immediately (without opening an XHR) when the signal is already aborted", async () => {
	const controller = new AbortController();
	controller.abort();

	await expect(
		sendXhr({
			method: "POST",
			url: "https://example.test/upload",
			signal: controller.signal,
		}),
	).rejects.toThrow("Upload aborted");
	expect(MockXhr.instances).toHaveLength(0);
});

test("aborting the signal mid-request aborts the XHR and rejects with a plain abort error", async () => {
	const controller = new AbortController();
	const promise = sendXhr({
		method: "POST",
		url: "https://example.test/upload",
		signal: controller.signal,
	});

	controller.abort();

	await expect(promise).rejects.toThrow("Upload aborted");
	expect(MockXhr.instances[0]?.aborted).toBe(true);
});

test("a stall (no progress within stallTimeoutMs) aborts the XHR and rejects with a stalled error, not a plain abort error", async () => {
	vi.useFakeTimers();
	try {
		const promise = sendXhr({
			method: "POST",
			url: "https://example.test/upload",
			signal: new AbortController().signal,
			stallTimeoutMs: 1000,
		});
		// Suppress the unhandled-rejection warning until we actually assert below.
		promise.catch(() => {});

		await vi.advanceTimersByTimeAsync(1000);

		await expect(promise).rejects.toThrow(
			"Upload stalled: no progress for 1000ms",
		);
		expect(MockXhr.instances[0]?.aborted).toBe(true);
	} finally {
		vi.useRealTimers();
	}
});

test("progress resets the stall watchdog so a slow-but-healthy upload is never falsely aborted", async () => {
	vi.useFakeTimers();
	try {
		const promise = sendXhr({
			method: "POST",
			url: "https://example.test/upload",
			signal: new AbortController().signal,
			stallTimeoutMs: 1000,
			onUploadProgress: () => {},
		});

		await vi.advanceTimersByTimeAsync(900);
		MockXhr.instances[0]?.progress(50, 100);
		await vi.advanceTimersByTimeAsync(900);

		MockXhr.instances[0]?.respond(200);
		await expect(promise).resolves.toMatchObject({ status: 200 });
	} finally {
		vi.useRealTimers();
	}
});

test("sets withCredentials on the underlying XHR", () => {
	sendXhr({
		method: "POST",
		url: "https://example.test/upload",
		signal: new AbortController().signal,
		withCredentials: true,
	});

	expect(MockXhr.instances[0]?.withCredentials).toBe(true);
});
