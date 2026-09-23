import {
  type CookingTimer,
  isTimerPaused,
  listCookingSessions,
  subscribeCookingSessions,
} from "../application/cooking-session";

// setTimeout's delay is a signed 32-bit int; longer timers re-arm on the
// next session change or plugin load (a ~24-day kitchen timer is moot).
const MAX_DELAY_MS = 2_147_483_647;

function alertedKey(graphKey: string): string {
  return `logseq-recipe:alerted:${graphKey}`;
}

function readAlerted(graphKey: string): Set<string> {
  try {
    const raw = globalThis.sessionStorage?.getItem(alertedKey(graphKey));
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function writeAlerted(graphKey: string, ids: Set<string>): void {
  try {
    globalThis.sessionStorage?.setItem(
      alertedKey(graphKey),
      JSON.stringify([...ids]),
    );
  } catch {
    // Worst case a timer rings again after a reload.
  }
}

/**
 * Rings every timer of one graph when it ends, whatever the plugin is
 * showing - including nothing, after the UI was closed. The screens only
 * render state; this is the single place an alarm fires, and each timer id
 * fires once (the record survives reloads within the Logseq session).
 * Returns a stop function.
 */
export function watchTimerAlarms(
  graphKey: string,
  onAlarm: (timer: CookingTimer) => void,
): () => void {
  const pending = new Map<string, { handle: number; endsAt: number }>();

  const schedule = () => {
    const alerted = readAlerted(graphKey);
    const live = new Map<string, CookingTimer>();
    for (const { session } of listCookingSessions(graphKey)) {
      for (const timer of session.timers) {
        // Paused timers have no end time to wait for; resuming saves the
        // session again, which reschedules them with their new end.
        if (!alerted.has(timer.id) && !isTimerPaused(timer)) {
          live.set(timer.id, timer);
        }
      }
    }
    // Cancelled or finished-cooking timers disappear from storage.
    for (const [id, entry] of pending) {
      if (!live.has(id)) {
        window.clearTimeout(entry.handle);
        pending.delete(id);
      }
    }
    for (const timer of live.values()) {
      if (pending.get(timer.id)?.endsAt === timer.endsAt) continue;
      if (pending.has(timer.id)) {
        window.clearTimeout(pending.get(timer.id)?.handle);
      }
      const delay = Math.min(
        MAX_DELAY_MS,
        Math.max(0, timer.endsAt - Date.now()),
      );
      pending.set(timer.id, {
        endsAt: timer.endsAt,
        handle: window.setTimeout(() => {
          pending.delete(timer.id);
          if (timer.endsAt > Date.now()) return schedule();
          const current = readAlerted(graphKey);
          if (current.has(timer.id)) return;
          current.add(timer.id);
          writeAlerted(graphKey, current);
          onAlarm(timer);
        }, delay),
      });
    }
  };

  schedule();
  const unsubscribe = subscribeCookingSessions(schedule);
  return () => {
    unsubscribe();
    for (const entry of pending.values()) window.clearTimeout(entry.handle);
    pending.clear();
  };
}

// Audible cue without shipping an asset; silently skipped where Web Audio is
// unavailable (tests, locked-down webviews).
export function playTimerCue(): void {
  try {
    const AudioCtor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    const start = context.currentTime;
    for (const offset of [0, 0.35, 0.7, 1.4, 1.75, 2.1]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.25);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.3);
    }
    window.setTimeout(() => void context.close(), 3_000);
  } catch {
    // The visual "done" state still shows.
  }
}

export function notifyTimerDone(title: string, body: string): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    // Optional; the in-app state is authoritative.
  }
}

export function requestNotificationPermission(): void {
  try {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission().catch(() => undefined);
    }
  } catch {
    // Optional capability.
  }
}
