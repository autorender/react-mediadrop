// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import {
	browserUploadSessionStore,
	memoryUploadSessionStore,
} from "./session-store.js";

test("memoryUploadSessionStore: set/get/remove round-trip", async () => {
	const store = memoryUploadSessionStore();

	expect(await store.get("a")).toBeNull();

	await store.set("a", { uploadId: "u1" });
	expect(await store.get("a")).toEqual({ uploadId: "u1" });

	await store.remove("a");
	expect(await store.get("a")).toBeNull();
});

test("memoryUploadSessionStore: independent instances don't share state", async () => {
	const a = memoryUploadSessionStore();
	const b = memoryUploadSessionStore();

	await a.set("key", "from-a");

	expect(await a.get("key")).toBe("from-a");
	expect(await b.get("key")).toBeNull();
});

test("browserUploadSessionStore: persists JSON-serializable values in localStorage", async () => {
	localStorage.clear();
	const store = browserUploadSessionStore();

	await store.set("session-1", { uploadId: "u1", completedParts: [1, 2] });
	expect(await store.get("session-1")).toEqual({
		uploadId: "u1",
		completedParts: [1, 2],
	});

	// Actually landed in localStorage, under the prefixed key, not just in memory.
	expect(localStorage.getItem("mediadrop:upload-session:session-1")).toBe(
		JSON.stringify({ uploadId: "u1", completedParts: [1, 2] }),
	);
});

test("browserUploadSessionStore: remove deletes the key", async () => {
	localStorage.clear();
	const store = browserUploadSessionStore();

	await store.set("session-1", { uploadId: "u1" });
	await store.remove("session-1");

	expect(await store.get("session-1")).toBeNull();
	expect(localStorage.getItem("mediadrop:upload-session:session-1")).toBeNull();
});

test("browserUploadSessionStore: a custom prefix isolates keys from the default store", async () => {
	localStorage.clear();
	const storeA = browserUploadSessionStore({ prefix: "app-a:" });
	const storeB = browserUploadSessionStore({ prefix: "app-b:" });

	await storeA.set("session-1", "a-value");
	await storeB.set("session-1", "b-value");

	expect(await storeA.get("session-1")).toBe("a-value");
	expect(await storeB.get("session-1")).toBe("b-value");
});

test("browserUploadSessionStore: get returns null for malformed stored JSON instead of throwing", async () => {
	localStorage.clear();
	localStorage.setItem("mediadrop:upload-session:broken", "{not json");
	const store = browserUploadSessionStore();

	await expect(store.get("broken")).resolves.toBeNull();
});

test("browserUploadSessionStore: is SSR-safe when window/localStorage is unavailable", async () => {
	const originalWindow = globalThis.window;
	// @ts-expect-error simulating an SSR environment where `window` doesn't exist
	delete globalThis.window;
	try {
		const store = browserUploadSessionStore();
		await expect(store.get("anything")).resolves.toBeNull();
		await expect(store.set("anything", "value")).resolves.toBeUndefined();
		await expect(store.remove("anything")).resolves.toBeUndefined();
	} finally {
		globalThis.window = originalWindow;
	}
});

test("browserUploadSessionStore: set() does not throw when storage.setItem throws (e.g. quota exceeded)", async () => {
	const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	const setItemSpy = vi
		.spyOn(Storage.prototype, "setItem")
		.mockImplementation(() => {
			throw new Error("QuotaExceededError");
		});
	try {
		const store = browserUploadSessionStore();
		await expect(
			store.set("session-1", { uploadId: "u1" }),
		).resolves.toBeUndefined();
		expect(warnSpy).toHaveBeenCalled();
	} finally {
		setItemSpy.mockRestore();
		warnSpy.mockRestore();
	}
});

test("browserUploadSessionStore: remove() does not throw when storage.removeItem throws", async () => {
	const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	const removeItemSpy = vi
		.spyOn(Storage.prototype, "removeItem")
		.mockImplementation(() => {
			throw new Error("storage disabled");
		});
	try {
		const store = browserUploadSessionStore();
		await expect(store.remove("session-1")).resolves.toBeUndefined();
		expect(warnSpy).toHaveBeenCalled();
	} finally {
		removeItemSpy.mockRestore();
		warnSpy.mockRestore();
	}
});

test("browserUploadSessionStore: swallows a throwing localStorage accessor instead of crashing", async () => {
	const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		get() {
			throw new Error("storage disabled");
		},
	});
	try {
		const store = browserUploadSessionStore();
		await expect(store.get("x")).resolves.toBeNull();
	} finally {
		if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
	}
});
