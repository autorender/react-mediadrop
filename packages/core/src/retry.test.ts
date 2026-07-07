import { expect, test, vi } from "vitest";
import { withRetry } from "./retry.js";

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
