import { afterEach, describe, expect, it, vi } from "vitest";
import { ListenerBag, watchDebounced } from "../../src/logseq/events";

afterEach(() => {
  vi.useRealTimers();
});

function watched(refresh: () => void) {
  let emit: () => void = () => undefined;
  const off = vi.fn();
  const stop = watchDebounced(
    (listener) => {
      emit = listener;
      return off;
    },
    refresh,
    120,
  );
  return { emit: () => emit(), off, stop };
}

describe("Logseq lifecycle helpers", () => {
  it("coalesces rapid recipe changes into one refresh", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const { emit } = watched(refresh);

    emit();
    emit();
    emit();
    vi.advanceTimersByTime(119);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels pending work and disposes every owned listener", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const { emit, off, stop } = watched(refresh);
    const offA = vi.fn();
    const offB = vi.fn();
    const bag = new ListenerBag();
    bag.add(offA);
    bag.add(offB);

    emit();
    stop();
    emit();
    bag.dispose();
    vi.runAllTimers();

    expect(refresh).not.toHaveBeenCalled();
    expect(off).toHaveBeenCalledTimes(1);
    expect(offA).toHaveBeenCalledTimes(1);
    expect(offB).toHaveBeenCalledTimes(1);
  });
});
