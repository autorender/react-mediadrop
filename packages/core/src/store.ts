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

	function getState(): T {
		return state;
	}

	function setState(update: Partial<T> | ((current: T) => Partial<T>)): void {
		const partial = typeof update === "function" ? update(state) : update;
		state = { ...state, ...partial };
		for (const listener of listeners) {
			listener(state);
		}
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
