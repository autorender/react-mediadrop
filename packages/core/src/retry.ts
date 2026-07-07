export type RetryOptions = {
	/** Number of retries *after* the first attempt. `0` (default) disables retry. */
	retries?: number;
	/**
	 * Backoff delay in ms before each retry, indexed by retry number
	 * (0-indexed). The last value repeats if `retries` exceeds the array
	 * length. Defaults to a short exponential-ish backoff.
	 */
	retryDelays?: number[];
};

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000];

export type RetryAbortedError = Error & { isRetryAborted: true };

function createRetryAbortedError(): RetryAbortedError {
	const error = new Error("Retry aborted") as RetryAbortedError;
	error.isRetryAborted = true;
	return error;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(createRetryAbortedError());
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(createRetryAbortedError());
			},
			{ once: true },
		);
	});
}

/**
 * The one retry engine in mediadrop. `createUploadQueue` calls this around
 * every transport invocation — no transport adapter (including
 * `@mediadrop/xhr-upload`) implements its own retry/backoff. This is a
 * deliberate reaction to how Uppy's uploader plugins each carry their own
 * copy of retry/backoff logic (xhr-upload's `Fetcher`, tus's
 * `retryDelays`, aws-s3's `HTTPCommunicationQueue`, the last of which has
 * a code comment admitting it was "taken out of Tus" and that retry
 * "should [have] a centralized place").
 *
 * Retrying stops immediately once `signal` aborts — a cancel always wins
 * over a pending retry, it never waits out the backoff first.
 */
export async function withRetry<T>(
	attempt: (attemptNumber: number) => Promise<T>,
	options: RetryOptions,
	signal: AbortSignal,
): Promise<T> {
	const retries = options.retries ?? 0;
	const retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;

	let attemptNumber = 1;
	while (true) {
		try {
			return await attempt(attemptNumber);
		} catch (error) {
			if (signal.aborted || attemptNumber > retries) {
				throw error;
			}
			const delayMs =
				retryDelays[Math.min(attemptNumber - 1, retryDelays.length - 1)] ?? 0;
			await delay(delayMs, signal);
			attemptNumber += 1;
		}
	}
}
