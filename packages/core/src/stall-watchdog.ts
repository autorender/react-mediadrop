export type StallWatchdog = {
	/** Call on every progress tick — resets the stall timer. */
	reset: () => void;
	/** Call once the request settles (success, failure, or abort) — stops the timer for good. */
	clear: () => void;
};

/**
 * Fires `onStall` if `reset()` isn't called again within `ms` of the
 * watchdog being created (or last reset). This is a *stall* timeout — no
 * progress for `ms` — not a flat total-duration timeout: a large file on
 * a slow-but-healthy connection keeps resetting it via progress events
 * and is never falsely aborted. Only a connection that goes silent (a
 * dropped connection, the machine sleeping mid-transfer) trips it — the
 * class of bug a bare `XMLHttpRequest.timeout` can't fix without also
 * false-aborting big, slow, otherwise-healthy uploads.
 *
 * `ms <= 0` (the default everywhere this is used) disables it entirely —
 * a no-op watchdog, matching every other opt-in escape hatch in
 * mediadrop (`retries`, `jitter`, etc. also default to off).
 */
export function createStallWatchdog(
	onStall: () => void,
	ms: number,
): StallWatchdog {
	let timer: ReturnType<typeof setTimeout> | undefined;

	function arm(): void {
		if (ms > 0) {
			timer = setTimeout(onStall, ms);
		}
	}

	function clear(): void {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	function reset(): void {
		clear();
		arm();
	}

	arm();
	return { reset, clear };
}
