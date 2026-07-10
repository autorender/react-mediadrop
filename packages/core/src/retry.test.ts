import { expect, test, vi } from "vitest";
import { createHttpError, defaultShouldRetry, withRetry } from "./retry.js";

test("resolves on the first successful attempt without retrying", async () => {
	const attempt = vi.fn().mockResolvedValue("ok");

	const result = await withRetry(
		attempt,
		{ retries: 3 },
		new AbortController().signal,
	);

	expect(result).toBe("ok");
	expect(attempt).toHaveBeenCalledTimes(1);
});

test("retries up to the configured count, then resolves if a later attempt succeeds", async () => {
	const attempt = vi
		.fn()
		.mockRejectedValueOnce(new Error("fail 1"))
		.mockRejectedValueOnce(new Error("fail 2"))
		.mockResolvedValueOnce("ok");

	const result = await withRetry(
		attempt,
		{ retries: 2, retryDelays: [0, 0] },
		new AbortController().signal,
	);

	expect(result).toBe("ok");
	expect(attempt).toHaveBeenCalledTimes(3);
	expect(attempt).toHaveBeenNthCalledWith(1, 1);
	expect(attempt).toHaveBeenNthCalledWith(2, 2);
	expect(attempt).toHaveBeenNthCalledWith(3, 3);
});

test("delay() removes its abort listener when it resolves normally, not just when aborted", async () => {
	const controller = new AbortController();
	const addSpy = vi.spyOn(controller.signal, "addEventListener");
	const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

	const attempt = vi
		.fn()
		.mockRejectedValueOnce(new Error("fail 1"))
		.mockRejectedValueOnce(new Error("fail 2"))
		.mockResolvedValueOnce("ok");

	await withRetry(
		attempt,
		{ retries: 2, retryDelays: [0, 0] },
		controller.signal,
	);

	// Two retries => two delay() calls => two "abort" listeners added, and
	// (per this fix) both removed again once each delay resolves normally.
	const abortAdds = addSpy.mock.calls.filter(([type]) => type === "abort");
	const abortRemoves = removeSpy.mock.calls.filter(
		([type]) => type === "abort",
	);
	expect(abortAdds).toHaveLength(2);
	expect(abortRemoves).toHaveLength(2);
});

test("throws the last error once retries are exhausted", async () => {
	const attempt = vi.fn().mockRejectedValue(new Error("always fails"));

	await expect(
		withRetry(
			attempt,
			{ retries: 2, retryDelays: [0, 0] },
			new AbortController().signal,
		),
	).rejects.toThrow("always fails");
	expect(attempt).toHaveBeenCalledTimes(3);
});

test("defaults to zero retries when `retries` is omitted", async () => {
	const attempt = vi.fn().mockRejectedValue(new Error("fail"));

	await expect(
		withRetry(attempt, {}, new AbortController().signal),
	).rejects.toThrow("fail");
	expect(attempt).toHaveBeenCalledTimes(1);
});

test("stops retrying immediately once the signal aborts, without waiting out the backoff", async () => {
	const controller = new AbortController();
	const attempt = vi.fn().mockImplementation(() => {
		controller.abort();
		return Promise.reject(new Error("fail"));
	});

	const start = Date.now();
	await expect(
		withRetry(
			attempt,
			{ retries: 5, retryDelays: [50_000] },
			controller.signal,
		),
	).rejects.toThrow();
	const elapsed = Date.now() - start;

	expect(attempt).toHaveBeenCalledTimes(1);
	expect(elapsed).toBeLessThan(1000);
});

test("an already-aborted signal fails on the very first attempt's retry check", async () => {
	const controller = new AbortController();
	controller.abort();
	const attempt = vi.fn().mockRejectedValue(new Error("fail"));

	await expect(
		withRetry(attempt, { retries: 3 }, controller.signal),
	).rejects.toThrow("fail");
	expect(attempt).toHaveBeenCalledTimes(1);
});

test("shouldRetry: false fails fast without burning through the retry budget", async () => {
	class NonRetryableError extends Error {}
	const attempt = vi
		.fn()
		.mockRejectedValue(new NonRetryableError("bad request"));
	const shouldRetry = vi.fn(
		(error: unknown) => !(error instanceof NonRetryableError),
	);

	await expect(
		withRetry(
			attempt,
			{ retries: 5, retryDelays: [0], shouldRetry },
			new AbortController().signal,
		),
	).rejects.toThrow("bad request");

	expect(attempt).toHaveBeenCalledTimes(1);
	expect(shouldRetry).toHaveBeenCalledWith(expect.any(NonRetryableError), 1);
});

test("shouldRetry: true keeps retrying exactly like the default", async () => {
	const attempt = vi
		.fn()
		.mockRejectedValueOnce(new Error("transient"))
		.mockResolvedValueOnce("ok");

	const result = await withRetry(
		attempt,
		{ retries: 2, retryDelays: [0], shouldRetry: () => true },
		new AbortController().signal,
	);

	expect(result).toBe("ok");
	expect(attempt).toHaveBeenCalledTimes(2);
});

test("jitter randomizes the backoff delay within the configured fraction", async () => {
	const originalRandom = Math.random;
	try {
		const observedDelays: number[] = [];
		const originalSetTimeout = globalThis.setTimeout;
		// @ts-expect-error narrowing setTimeout's overloads isn't worth it for a test spy
		globalThis.setTimeout = (fn: () => void, ms?: number) => {
			observedDelays.push(ms ?? 0);
			return originalSetTimeout(fn, 0);
		};

		Math.random = () => 1; // maximum jitter every time, for a deterministic assertion
		const attempt = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail"))
			.mockResolvedValueOnce("ok");

		await withRetry(
			attempt,
			{ retries: 1, retryDelays: [1000], jitter: 0.5 },
			new AbortController().signal,
		);

		// base 1000, jitter 0.5 => spread 500, Math.random()=1 => 1000 - 500 + 1*500*2 = 1500
		expect(observedDelays).toEqual([1500]);
		globalThis.setTimeout = originalSetTimeout;
	} finally {
		Math.random = originalRandom;
	}
});

test("createHttpError attaches status to a real Error", () => {
	const error = createHttpError("failed with 403", 403);
	expect(error).toBeInstanceOf(Error);
	expect(error.message).toBe("failed with 403");
	expect(error.status).toBe(403);
});

test("defaultShouldRetry: retries errors with no status (network errors, aborts aside)", () => {
	expect(defaultShouldRetry(new Error("network error"))).toBe(true);
	expect(defaultShouldRetry("not even an Error instance")).toBe(true);
});

test("defaultShouldRetry: retries 408, 429, and every 5xx", () => {
	expect(defaultShouldRetry(createHttpError("timeout", 408))).toBe(true);
	expect(defaultShouldRetry(createHttpError("rate limited", 429))).toBe(true);
	expect(defaultShouldRetry(createHttpError("server error", 500))).toBe(true);
	expect(defaultShouldRetry(createHttpError("bad gateway", 502))).toBe(true);
});

test("defaultShouldRetry: does not retry other 4xx — they'll fail identically every time", () => {
	expect(defaultShouldRetry(createHttpError("bad request", 400))).toBe(false);
	expect(defaultShouldRetry(createHttpError("unauthorized", 401))).toBe(false);
	expect(defaultShouldRetry(createHttpError("forbidden", 403))).toBe(false);
	expect(defaultShouldRetry(createHttpError("not found", 404))).toBe(false);
	expect(defaultShouldRetry(createHttpError("payload too large", 413))).toBe(
		false,
	);
});

test("withRetry's default shouldRetry skips a permanent 4xx instead of burning the retry budget", async () => {
	const attempt = vi.fn().mockRejectedValue(createHttpError("forbidden", 403));

	await expect(
		withRetry(
			attempt,
			{ retries: 5, retryDelays: [0] },
			new AbortController().signal,
		),
	).rejects.toMatchObject({ status: 403 });

	expect(attempt).toHaveBeenCalledTimes(1);
});

test("withRetry's default shouldRetry keeps retrying a transient 503 up to the configured count", async () => {
	const attempt = vi
		.fn()
		.mockRejectedValueOnce(createHttpError("unavailable", 503))
		.mockResolvedValueOnce("ok");

	const result = await withRetry(
		attempt,
		{ retries: 2, retryDelays: [0] },
		new AbortController().signal,
	);

	expect(result).toBe("ok");
	expect(attempt).toHaveBeenCalledTimes(2);
});

test("jitter: 0 (default) uses the exact retryDelays value, unaffected by Math.random", async () => {
	const originalRandom = Math.random;
	Math.random = () => 1;
	try {
		const observedDelays: number[] = [];
		const originalSetTimeout = globalThis.setTimeout;
		// @ts-expect-error narrowing setTimeout's overloads isn't worth it for a test spy
		globalThis.setTimeout = (fn: () => void, ms?: number) => {
			observedDelays.push(ms ?? 0);
			return originalSetTimeout(fn, 0);
		};

		const attempt = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail"))
			.mockResolvedValueOnce("ok");
		await withRetry(
			attempt,
			{ retries: 1, retryDelays: [1000] },
			new AbortController().signal,
		);

		expect(observedDelays).toEqual([1000]);
		globalThis.setTimeout = originalSetTimeout;
	} finally {
		Math.random = originalRandom;
	}
});
