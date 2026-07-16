import { createHttpError, type UploadTransport } from "react-mediadrop";

export type MockTransportOptions = {
	/** How long a simulated upload takes to reach 100%. Default `1500`. */
	durationMs?: number;
	/** Checked once per attempt, right before it would resolve — return `true` to fail that attempt instead. */
	shouldFail?: () => boolean;
};

/**
 * A fake transport for the docs site, which has no live backend to upload
 * to. Simulates progress over `durationMs` via a timer and honors `signal`
 * for cancellation — everything downstream (progress bars, cancel, retry,
 * concurrency) exercises the real hook/queue behavior against this instead
 * of a real network call.
 */
export function createMockTransport(
	options: MockTransportOptions = {},
): UploadTransport {
	const durationMs = options.durationMs ?? 1500;

	return {
		upload(file, { onProgress, signal }) {
			return new Promise((resolve, reject) => {
				if (signal.aborted) {
					reject(createHttpError("Aborted before it started"));
					return;
				}

				const total = file.size;
				const start = performance.now();

				const onAbort = () => {
					clearInterval(interval);
					reject(createHttpError("Aborted"));
				};

				const interval = setInterval(() => {
					const elapsed = performance.now() - start;
					const loaded = Math.min(total, Math.round((elapsed / durationMs) * total));
					onProgress({ loaded, total });

					if (elapsed >= durationMs) {
						clearInterval(interval);
						signal.removeEventListener("abort", onAbort);
						if (options.shouldFail?.()) {
							reject(createHttpError("Simulated upload failure", 500));
						} else {
							resolve({ response: { simulated: true } });
						}
					}
				}, 100);

				signal.addEventListener("abort", onAbort, { once: true });
			});
		},
	};
}
