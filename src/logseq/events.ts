export interface DebouncedCallback {
  trigger(): void;
  flush(): void;
  dispose(): void;
}

export function createDebouncedCallback(
  callback: () => void,
  delayMs: number,
): DebouncedCallback {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    trigger() {
      if (disposed) return;
      clear();
      timer = setTimeout(() => {
        timer = null;
        if (!disposed) callback();
      }, delayMs);
    },
    flush() {
      if (disposed || timer === null) return;
      clear();
      callback();
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}

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

export function watchDebounced(
  subscribe: (listener: () => void) => () => void,
  callback: () => void,
  delayMs = 120,
): () => void {
  const debounced = createDebouncedCallback(callback, delayMs);
  const off = subscribe(() => debounced.trigger());
  return () => {
    off();
    debounced.dispose();
  };
}
