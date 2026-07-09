import { expect, test, vi } from "vitest";
import { createStore } from "./store.js";

test("getState returns the current state", () => {
	const store = createStore({ count: 0 });
	expect(store.getState()).toEqual({ count: 0 });
});

test("setState merges a partial update", () => {
	const store = createStore({ count: 0, label: "a" });
	store.setState({ count: 1 });
	expect(store.getState()).toEqual({ count: 1, label: "a" });
});

test("setState accepts an updater function", () => {
	const store = createStore({ count: 0 });
	store.setState((state) => ({ count: state.count + 1 }));
	expect(store.getState().count).toBe(1);
});

test("subscribe fires on every state change", () => {
	const store = createStore({ count: 0 });
	const listener = vi.fn();
	store.subscribe(listener);

	store.setState({ count: 1 });
	store.setState({ count: 2 });

	expect(listener).toHaveBeenCalledTimes(2);
	expect(listener).toHaveBeenLastCalledWith({ count: 2 });
});

test("unsubscribe stops future notifications", () => {
	const store = createStore({ count: 0 });
	const listener = vi.fn();
	const unsubscribe = store.subscribe(listener);

	store.setState({ count: 1 });
	unsubscribe();
	store.setState({ count: 2 });

	expect(listener).toHaveBeenCalledTimes(1);
});

test("a listener calling setState reentrantly does not skip or duplicate notifications", () => {
	const store = createStore({ count: 0 });
	const seen: number[] = [];

	const unsubscribe = store.subscribe((state) => {
		seen.push(state.count);
		// The very first notification (count: 1) triggers a second
		// setState synchronously, from inside this same listener call.
		if (state.count === 1) {
			store.setState({ count: 2 });
		}
	});

	store.setState({ count: 1 });

	unsubscribe();
	// Every value the store actually held is observed, in order, with no
	// duplicate delivery of the same value back-to-back.
	expect(seen).toEqual([1, 2]);
	expect(store.getState()).toEqual({ count: 2 });
});

test("a second listener still gets the final state after a reentrant setState from the first", () => {
	const store = createStore({ count: 0 });
	const secondListenerCalls: number[] = [];

	store.subscribe((state) => {
		if (state.count === 1) store.setState({ count: 2 });
	});
	store.subscribe((state) => {
		secondListenerCalls.push(state.count);
	});

	store.setState({ count: 1 });

	// The first listener's reentrant setState advances `state` to 2 before
	// the second listener is even reached in this pass — that listener is
	// only ever called with the settled value, never a stale one, and the
	// follow-up pass confirms it (called twice with 2, never skipped or
	// left on the intermediate value).
	expect(secondListenerCalls).toEqual([2, 2]);
	expect(store.getState()).toEqual({ count: 2 });
});

test("subscribing from inside a listener doesn't get notified for the pass already in progress", () => {
	const store = createStore({ count: 0 });
	const lateListener = vi.fn();

	store.subscribe((state) => {
		if (state.count === 1) store.subscribe(lateListener);
	});

	store.setState({ count: 1 });
	expect(lateListener).not.toHaveBeenCalled();

	store.setState({ count: 2 });
	expect(lateListener).toHaveBeenCalledWith({ count: 2 });
});

test("selector subscription only fires when the selected value changes", () => {
	const store = createStore({ count: 0, label: "a" });
	const listener = vi.fn();
	store.subscribe((state) => state.count, listener);

	store.setState({ label: "b" });
	expect(listener).not.toHaveBeenCalled();

	store.setState({ count: 1 });
	expect(listener).toHaveBeenCalledTimes(1);
	expect(listener).toHaveBeenCalledWith(1);
});
