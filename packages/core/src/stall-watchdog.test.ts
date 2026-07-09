import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createStallWatchdog } from "./stall-watchdog.js";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

test("fires onStall if reset() is never called within ms", () => {
	const onStall = vi.fn();
	createStallWatchdog(onStall, 1000);

	vi.advanceTimersByTime(999);
	expect(onStall).not.toHaveBeenCalled();

	vi.advanceTimersByTime(1);
	expect(onStall).toHaveBeenCalledTimes(1);
});

test("reset() postpones the stall — repeated progress never trips it", () => {
	const onStall = vi.fn();
	const watchdog = createStallWatchdog(onStall, 1000);

	for (let i = 0; i < 5; i++) {
		vi.advanceTimersByTime(900);
		watchdog.reset();
	}
	expect(onStall).not.toHaveBeenCalled();

	vi.advanceTimersByTime(1000);
	expect(onStall).toHaveBeenCalledTimes(1);
});

test("clear() stops the timer for good — no late firing after the request settled", () => {
	const onStall = vi.fn();
	const watchdog = createStallWatchdog(onStall, 1000);

	watchdog.clear();
	vi.advanceTimersByTime(10_000);
	expect(onStall).not.toHaveBeenCalled();
});

test("ms <= 0 disables the watchdog entirely", () => {
	const onStall = vi.fn();
	createStallWatchdog(onStall, 0);

	vi.advanceTimersByTime(1_000_000);
	expect(onStall).not.toHaveBeenCalled();
});
