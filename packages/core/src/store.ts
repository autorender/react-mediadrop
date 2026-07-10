export type Listener<T> = (state: T) => void;
export type Selector<T, S> = (state: T) => S;
export type Unsubscribe = () => void;

export type Store<T> = {
	getState: () => T;
	setState: (update: Partial<T> | ((state: T) => Partial<T>)) => void;
	subscribe(listener: Listener<T>): Unsubscribe;
	subscribe<S>(selector: Selector<T, S>, listener: Listener<S>): Unsubscribe;
};

/**
 * A minimal subscribable store. Selector subscriptions are implemented as a
 * thin wrapper around full-state subscriptions: the selector is re-run on
 * every change and the listener only fires when its result changes
 * (compared with `Object.is`).
 */
export function createStore<T extends object>(initialState: T): Store<T> {
	let state = initialState;
	const listeners = new Set<Listener<T>>();
	let isNotifying = false;

	function getState(): T {
		return state;
	}

	// A listener that calls `setState` again synchronously (reentrantly)
	// doesn't recurse into a second, nested notify pass — `isNotifying`
	// makes that inner call a no-op beyond updating `state`, and the
	// `do`/`while` below detects that `state` moved again after the
	// current pass finishes and runs one more pass so every listener still
	// eventually observes the latest value, in order, with none skipped.
	// A listener already past its own turn when a reentrant update happens
	// will see the new value immediately (since `state` is read live, not
	// snapshotted per pass) and then may be notified again, redundantly,
	// with that same value during the follow-up pass — listeners should be
	// idempotent with respect to repeat delivery of an unchanged value.
	// Listeners are snapshotted per pass so a subscribe/unsubscribe call
	// from inside a listener can't affect which listeners *this* pass
	// notifies.
	function notify(): void {
		if (isNotifying) return;
		isNotifying = true;
		try {
			let lastNotified: T;
			do {
				lastNotified = state;
				for (const listener of [...listeners]) {
					listener(state);
				}
			} while (lastNotified !== state);
		} finally {
			isNotifying = false;
		}
	}

	function setState(update: Partial<T> | ((current: T) => Partial<T>)): void {
		const partial = typeof update === "function" ? update(state) : update;
		state = { ...state, ...partial };
		notify();
	}

	function subscribe<S>(
		selectorOrListener: Listener<T> | Selector<T, S>,
		maybeListener?: Listener<S>,
	): Unsubscribe {
		if (maybeListener) {
			const selector = selectorOrListener as Selector<T, S>;
			const listener = maybeListener;
			let lastValue = selector(state);
			const wrapped: Listener<T> = (nextState) => {
				const nextValue = selector(nextState);
				if (!Object.is(nextValue, lastValue)) {
					lastValue = nextValue;
					listener(nextValue);
				}
			};
			listeners.add(wrapped);
			return () => listeners.delete(wrapped);
		}

		const listener = selectorOrListener as Listener<T>;
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	return { getState, setState, subscribe };
}
