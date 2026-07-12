import type { MediaDropFile } from "@mediadrop/core";

/**
 * A hand-rolled `XMLHttpRequest` double, shared across every transport
 * package's tests — jsdom's own implementation tries to perform a real
 * network request, which none of these tests want. Gives full, synchronous
 * control over every event a transport listens to, and lets tests assert
 * exactly which method/headers/body were sent.
 *
 * This shape is a union of what `@mediadrop/xhr-upload` and (previously)
 * two other now-removed transport packages' tests each independently
 * needed before they shared this one double — see plan 014 in `plans/`
 * for why three near-identical, independently-drifted copies existed and
 * were merged into this one. Kept as a superset rather than trimmed down,
 * so a future transport's tests don't have to widen it again.
 */
export class MockXhr {
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

	respond(
		status: number,
		body = "",
		headers: Record<string, string> = {},
	): void {
		this.status = status;
		this.statusText = status >= 200 && status < 300 ? "OK" : "Error";
		this.responseText = body;
		this.responseHeaders = headers;
		this.onload?.();
	}

	progress(loaded: number, total: number | null = null): void {
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

/**
 * Installs `MockXhr` as `globalThis.XMLHttpRequest` for the duration of a
 * test, clearing `MockXhr.instances`. Returns a restore function — call it
 * in `afterEach` to put the real (or previous) `XMLHttpRequest` back.
 */
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
