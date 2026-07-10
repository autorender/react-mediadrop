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
	 * Defaults to `defaultShouldRetry` (retries 408/429/5xx and anything
	 * without a recognizable status; skips other 4xx) — pass your own to
	 * override it entirely.
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

/** An `Error` with an HTTP status attached — see `createHttpError`. */
export type HttpError = Error & { status?: number };

/**
 * Builds an `Error` carrying `status` as a plain property, so callers of
 * `withRetry` (and anything reading a rejected upload's error) can branch
 * on it — e.g. this is exactly what `defaultShouldRetry` inspects. Every
 * transport that makes an HTTP request should throw through this instead
 * of a bare `new Error(...)`, so retry classification and error
 * inspection work the same way everywhere.
 */
export function createHttpError(message: string, status?: number): HttpError {
	const error = new Error(message) as HttpError;
	error.status = status;
	return error;
}

/**
 * The default `shouldRetry`: retries anything without a recognizable HTTP
 * status (network errors, aborts — aborts are already short-circuited
 * separately) and 408/429/5xx, but not other 4xx — a 400/401/403/404/413
 * etc. describes a request that will fail again unchanged, so retrying it
 * only burns the retry budget before failing anyway. Errors without a
 * `.status` (anything not built via `createHttpError`) always retry,
 * matching the original "retry everything" behavior for callers that
 * can't classify their errors.
 */
export function defaultShouldRetry(error: unknown): boolean {
	const status = (error as HttpError | null)?.status;
	if (status == null) return true;
	if (status === 408 || status === 429) return true;
	if (status >= 500) return true;
	if (status >= 400) return false;
	return true;
}

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
		// `{ once: true }` only removes `onAbort` if abort actually fires —
		// if the timer fires first and `resolve()` runs normally, the
		// listener is never removed on its own. Since `withRetry` calls
		// `delay()` again on the *same* signal for every subsequent retry,
		// an upload that retries N times would otherwise accumulate N
		// live-but-useless abort listeners on that signal for the rest of
		// its lifetime — remove it explicitly on the resolve path too.
		const onAbort = (): void => {
			clearTimeout(timer);
			reject(createRetryAbortedError());
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
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
 * over a pending retry, it never waits out the backoff first. Without an
 * explicit `shouldRetry`, `defaultShouldRetry` classifies by HTTP status
 * (via `createHttpError`) so a permanent 4xx doesn't burn the full retry
 * budget the same way a transient 5xx does.
 */
export async function withRetry<T>(
	attempt: (attemptNumber: number) => Promise<T>,
	options: RetryOptions,
	signal: AbortSignal,
): Promise<T> {
	const retries = options.retries ?? 0;
	const retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
	const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
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
