export type RetryOptions = {
	/** Number of retries *after* the first attempt. `0` (default) disables retry. */
	retries?: number;
	/**
	 * Backoff delay in ms before each retry, indexed by retry number
	 * (0-indexed). The last value repeats if `retries` exceeds the array
	 * length. Defaults to a short exponential-ish backoff.
	 */
	retryDelays?: number[];
	/**
	 * Called with the thrown error before scheduling a retry. Return `false`
	 * for errors that will never succeed on retry (e.g. a 4xx response, or a
	 * validation error) to fail fast instead of burning through `retries`.
	 * Default: retries every error, which is Phase 2's original behavior —
	 * existing callers that don't pass this are unaffected.
	 */
	shouldRetry?: (error: unknown, attemptNumber: number) => boolean;
	/**
	 * Randomizes each backoff delay by up to this fraction (0–1) so that
	 * many clients retrying the same failure don't all retry in lockstep
	 * ("thundering herd") — e.g. every part of a multipart upload failing
	 * at once on a transient network blip. `0` (default) disables jitter,
	 * using `retryDelays` exactly as given.
	 */
	jitter?: number;
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

function applyJitter(baseMs: number, jitter: number): number {
	if (jitter <= 0 || baseMs <= 0) return baseMs;
	const spread = baseMs * Math.min(jitter, 1);
	return Math.max(0, baseMs - spread + Math.random() * spread * 2);
}

/**
 * The one retry engine in mediadrop. `createUploadQueue` calls this around
 * every file-level transport invocation, and transport adapters that need
 * finer-grained retry (S3 multipart retrying one failed part, tus retrying
 * one failed chunk) call it too, with their own `shouldRetry`/backoff —
 * nobody hand-rolls a second retry loop. This is a deliberate reaction to
 * how Uppy's uploader plugins each carry their own copy of retry/backoff
 * logic (xhr-upload's `Fetcher`, tus's `retryDelays`, aws-s3's
 * `HTTPCommunicationQueue`, the last of which has a code comment admitting
 * it was "taken out of Tus" and that retry "should [have] a centralized
 * place").
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
	const shouldRetry = options.shouldRetry ?? (() => true);
	const jitter = options.jitter ?? 0;

	let attemptNumber = 1;
	while (true) {
		try {
			return await attempt(attemptNumber);
		} catch (error) {
			if (
				signal.aborted ||
				attemptNumber > retries ||
				!shouldRetry(error, attemptNumber)
			) {
				throw error;
			}
			const baseDelay =
				retryDelays[Math.min(attemptNumber - 1, retryDelays.length - 1)] ?? 0;
			await delay(applyJitter(baseDelay, jitter), signal);
			attemptNumber += 1;
		}
	}
}
