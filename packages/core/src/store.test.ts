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
