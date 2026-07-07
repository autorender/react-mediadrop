let counter = 0;

/**
 * Generates a short, unique-enough id for a browser session.
 * Not cryptographically secure — do not use for anything security-sensitive.
 */
export function createId(): string {
	counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
	const time = Date.now().toString(36);
	const count = counter.toString(36);
	const random = Math.random().toString(36).slice(2, 8);
	return `mdf_${time}${count}${random}`;
}
