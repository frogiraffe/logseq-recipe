import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebouncedCallback, ListenerBag } from "../../src/logseq/events";

afterEach(() => {
  vi.useRealTimers();
});

describe("Logseq lifecycle helpers", () => {
  it("coalesces rapid recipe changes into one refresh", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const debounced = createDebouncedCallback(refresh, 120);

    debounced.trigger();
    debounced.trigger();
    debounced.trigger();
    vi.advanceTimersByTime(119);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels pending work and disposes every owned listener", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const debounced = createDebouncedCallback(refresh, 120);
    const offA = vi.fn();
    const offB = vi.fn();
    const bag = new ListenerBag();
    bag.add(offA);
    bag.add(offB);

    debounced.trigger();
    debounced.dispose();
    bag.dispose();
    vi.runAllTimers();

    expect(refresh).not.toHaveBeenCalled();
    expect(offA).toHaveBeenCalledTimes(1);
    expect(offB).toHaveBeenCalledTimes(1);
  });
});
