import type { MediaDropFile } from "@mediadrop/core";

/**
 * A hand-rolled `XMLHttpRequest` double — jsdom's own implementation tries
 * to perform a real network request, which these tests don't want. Gives
 * full, synchronous control over every event this package's transport
 * listens to, and lets tests assert exactly which method/headers/body
 * were sent for each POST/HEAD/PATCH.
 */
export class MockXhr {
	static instances: MockXhr[] = [];

	method = "";
	url = "";
	status = 0;
	requestHeaders: Record<string, string> = {};
	responseHeaders: Record<string, string> = {};
	sentBody: unknown;
	aborted = false;
	responseURL = "";
	upload: { onprogress: ((event: { loaded: number }) => void) | null } = {
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
		// Real browsers always resolve `XMLHttpRequest.responseURL` to an
		// absolute URL, even when `open()` was called with a relative one.
		this.responseURL = new URL(url, "https://mediadrop.test/").toString();
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

	respond(status: number, headers: Record<string, string> = {}): void {
		this.status = status;
		this.responseHeaders = headers;
		this.onload?.();
	}

	progress(loaded: number): void {
		this.upload.onprogress?.({ loaded });
	}

	networkError(): void {
		this.onerror?.();
	}
}

export function installMockXhr(): () => void {
	MockXhr.instances = [];
	const original = globalThis.XMLHttpRequest;
	globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;
	return () => {
		globalThis.XMLHttpRequest = original;
	};
}

export function makeFile(
	name = "a.png",
	type = "image/png",
	size = 1,
	overrides: Partial<MediaDropFile> = {},
): MediaDropFile {
	return {
		id: "a",
		file: new File([new Uint8Array(size)], name, { type }),
		name,
		size,
		type,
		status: "accepted",
		errors: [],
		...overrides,
	};
}
