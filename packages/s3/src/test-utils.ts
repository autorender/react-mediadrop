import type { MediaDropFile } from "@mediadrop/core";

/**
 * A hand-rolled `XMLHttpRequest` double, shared by this package's tests —
 * jsdom's own implementation tries to perform a real network request,
 * which none of these tests want. Gives full, synchronous control over
 * every event a transport in this package listens to.
 */
export class MockXhr {
	static instances: MockXhr[] = [];

	method = "";
	url = "";
	status = 0;
	statusText = "";
	responseText = "";
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
	} = { onprogress: null };
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	ontimeout: (() => void) | null = null;
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
		this.responseText = body;
		this.responseHeaders = headers;
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
