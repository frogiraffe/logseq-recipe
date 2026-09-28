export class ListenerBag {
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  add(off: () => void): () => void {
    if (this.disposed) {
      off();
      return () => undefined;
    }
    this.listeners.add(off);
    return () => {
      if (this.listeners.delete(off)) off();
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.listeners) off();
    this.listeners.clear();
  }
}

/**
 * Subscribes, and calls `callback` once a burst of events has been quiet for
 * `delayMs`. The returned stop also cancels a call still pending.
 */
export function watchDebounced(
  subscribe: (listener: () => void) => () => void,
  callback: () => void,
  delayMs: number,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  const off = subscribe(() => {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(callback, delayMs);
  });
  return () => {
    active = false;
    off();
    clearTimeout(timer);
  };
}
