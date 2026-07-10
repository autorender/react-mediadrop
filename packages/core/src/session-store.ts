/**
 * Metadata persistence for resumable transports (S3 multipart, tus). This
 * stores small JSON-serializable objects — upload IDs, completed part
 * numbers, byte offsets — never file bytes. A browser reload can lose the
 * user's in-memory `File` object regardless of what's persisted here; see
 * `skills/mediadrop/references/upload.md` for what resuming across a
 * reload actually requires (the user reselecting the same file).
 *
 * Core defines the interface and two implementations; `@mediadrop/s3` and
 * `@mediadrop/tus` consume it without knowing which one you picked.
 */
export type MediaDropUploadSessionStore = {
	get(key: string): Promise<unknown | null>;
	set(key: string, value: unknown): Promise<void>;
	remove(key: string): Promise<void>;
};

/**
 * In-memory only — gone on page reload, gone between tabs. Useful as a
 * default, in tests, or in non-browser environments (SSR, Node scripts).
 * Never throws, never touches any browser API.
 */
export function memoryUploadSessionStore(): MediaDropUploadSessionStore {
	const data = new Map<string, unknown>();
	return {
		async get(key) {
			return data.has(key) ? data.get(key) : null;
		},
		async set(key, value) {
			data.set(key, value);
		},
		async remove(key) {
			data.delete(key);
		},
	};
}

export type BrowserUploadSessionStoreOptions = {
	/** Prefix every key with this string, to avoid colliding with unrelated `localStorage` usage. Default `"mediadrop:upload-session:"`. */
	prefix?: string;
};

/**
 * `localStorage`-backed metadata persistence — this is what actually
 * survives a page reload/browser restart, unlike `memoryUploadSessionStore`.
 * Named "browser", not "durable" or "persistent": `localStorage` can be
 * cleared by the user, browser storage limits, or private browsing, same
 * as any other web storage. It is metadata persistence, not a guarantee.
 *
 * SSR-safe: every method checks `typeof window`/`localStorage` before
 * touching either, so importing or calling this on the server is a no-op
 * (`get` resolves `null`, `set`/`remove` resolve without doing anything)
 * rather than a crash.
 */
export function browserUploadSessionStore(
	options: BrowserUploadSessionStoreOptions = {},
): MediaDropUploadSessionStore {
	const prefix = options.prefix ?? "mediadrop:upload-session:";

	function getStorage(): Storage | null {
		if (typeof window === "undefined") return null;
		try {
			return window.localStorage;
		} catch {
			// Some browsers throw on `localStorage` access in certain contexts
			// (e.g. disabled storage, some private-browsing modes).
			return null;
		}
	}

	return {
		async get(key) {
			const storage = getStorage();
			if (!storage) return null;
			const raw = storage.getItem(prefix + key);
			if (raw === null) return null;
			try {
				return JSON.parse(raw);
			} catch {
				return null;
			}
		},
		async set(key, value) {
			const storage = getStorage();
			if (!storage) return;
			// `setItem` throws in real, unexceptional conditions —
			// `QuotaExceededError` when storage is full, or on essentially
			// every call in some browsers' private-browsing modes. A
			// persistence failure here means "this upload isn't resumable
			// this time," not "the upload itself failed" — swallow it
			// (matching `get`'s existing swallow-on-corrupt-JSON precedent)
			// rather than letting it surface as a confusing, unrelated
			// upload error.
			try {
				storage.setItem(prefix + key, JSON.stringify(value));
			} catch (error) {
				console.warn(
					`mediadrop: failed to persist upload session "${key}"`,
					error,
				);
			}
		},
		async remove(key) {
			const storage = getStorage();
			if (!storage) return;
			try {
				storage.removeItem(prefix + key);
			} catch (error) {
				console.warn(
					`mediadrop: failed to remove upload session "${key}"`,
					error,
				);
			}
		},
	};
}
