import type { DurationAnnotation } from "../domain/annotations";
import type { Recipe } from "../domain/recipe";
import type { TimeUnit } from "../domain/unit";

export interface CookingTimer {
  id: string;
  stepId: string;
  label: string;
  durationMs: number;
  // Remaining time is always derived from this wall-clock target, so a
  // suspended webview never accumulates drift. "Done" is derived too
  // (endsAt <= now); whether the alarm already rang is the alarm
  // service's own record, never a field views could overwrite.
  endsAt: number;
  // For alerts raised while the recipe isn't on screen.
  recipeTitle?: string;
  // Set while paused: the time that was left. `endsAt` is stale until
  // resume sets it to now + this.
  pausedRemainingMs?: number;
}

export function isTimerPaused(timer: CookingTimer): boolean {
  return timer.pausedRemainingMs !== undefined;
}

export function timerRemainingMs(timer: CookingTimer, now: number): number {
  return timer.pausedRemainingMs ?? timer.endsAt - now;
}

export function isTimerDone(timer: CookingTimer, now: number): boolean {
  return !isTimerPaused(timer) && timer.endsAt <= now;
}

export function pauseTimer(timer: CookingTimer, now: number): CookingTimer {
  if (isTimerPaused(timer) || timer.endsAt <= now) return timer;
  return { ...timer, pausedRemainingMs: timer.endsAt - now };
}

export function resumeTimer(timer: CookingTimer, now: number): CookingTimer {
  if (timer.pausedRemainingMs === undefined) return timer;
  const { pausedRemainingMs, ...running } = timer;
  return { ...running, endsAt: now + pausedRemainingMs };
}

export interface CookingSession {
  stepId?: string;
  checkedIngredientIds: string[];
  ingredientsOpen: boolean;
  timers: CookingTimer[];
}

const UNIT_MS: Record<TimeUnit, number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
};

export interface TimerOption {
  durationMs: number;
  // "about 20 minutes", "at most 20 minutes": offered, but marked so the
  // label never claims more precision than the recipe text has.
  approximate: boolean;
}

/**
 * Timers a duration can start: its value, or both bounds of a range (the
 * cook picks). A timer is a reminder, so "about 20 minutes" and "until
 * golden, 20 minutes" still get one; durations with no number or no time
 * unit, or inside an instruction not to do something ("don't bake past
 * 15 min"), stay plain labels.
 */
export function timerOptions(duration: DurationAnnotation): TimerOption[] {
  if (!duration.unit || duration.negated) return [];
  const unitMs = UNIT_MS[duration.unit];
  const option = (value: number, approximate: boolean) =>
    value > 0 ? [{ durationMs: value * unitMs, approximate }] : [];
  switch (duration.value.kind) {
    case "exact":
      return option(duration.value.value, false);
    case "range":
      return [
        ...option(duration.value.min, false),
        ...option(duration.value.max, false),
      ];
    case "approximate":
    case "minimum":
    case "maximum":
      return option(duration.value.value, true);
    case "inexact":
      return [];
  }
}

const SESSION_PREFIX = "logseq-recipe:cooking:";

export function cookingSessionKey(graphKey: string, recipeId: string): string {
  return `${SESSION_PREFIX}${graphKey}:${recipeId}`;
}

// Save/clear notify in-page listeners (the alarm service, the timer dock);
// Web Storage raises no "storage" event within the same document.
const listeners = new Set<() => void>();

export function subscribeCookingSessions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyCookingSessions(): void {
  for (const listener of listeners) listener();
}

/** Every saved session of one graph, with the recipe id it belongs to. */
export function listCookingSessions(
  graphKey: string,
): Array<{ recipeId: string; session: CookingSession }> {
  const store = storage();
  if (!store) return [];
  const prefix = `${SESSION_PREFIX}${graphKey}:`;
  const result: Array<{ recipeId: string; session: CookingSession }> = [];
  try {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key?.startsWith(prefix)) continue;
      const session = parseCookingSession(store.getItem(key));
      if (session) result.push({ recipeId: key.slice(prefix.length), session });
    }
  } catch {
    return [];
  }
  return result;
}

/** Drops references the recipe no longer has (edited while cooking). */
export function reconcileCookingSession(
  session: CookingSession,
  recipe: Recipe,
): CookingSession {
  const stepIds = new Set(recipe.steps.map((step) => step.id));
  const ingredientIds = new Set(recipe.ingredients.map((item) => item.id));
  return {
    ...(session.stepId && stepIds.has(session.stepId)
      ? { stepId: session.stepId }
      : {}),
    checkedIngredientIds: session.checkedIngredientIds.filter((id) =>
      ingredientIds.has(id),
    ),
    ingredientsOpen: session.ingredientsOpen,
    timers: session.timers.filter((timer) => stepIds.has(timer.stepId)),
  };
}

function isTimer(value: unknown): value is CookingTimer {
  if (!value || typeof value !== "object") return false;
  const timer = value as Record<string, unknown>;
  return (
    typeof timer.id === "string" &&
    typeof timer.stepId === "string" &&
    typeof timer.label === "string" &&
    Number.isFinite(timer.durationMs) &&
    Number.isFinite(timer.endsAt) &&
    (timer.pausedRemainingMs === undefined ||
      Number.isFinite(timer.pausedRemainingMs))
  );
}

/** Parses stored JSON defensively; anything malformed starts clean. */
export function parseCookingSession(raw: string | null): CookingSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object") return null;
    return {
      ...(typeof value.stepId === "string" ? { stepId: value.stepId } : {}),
      checkedIngredientIds: Array.isArray(value.checkedIngredientIds)
        ? value.checkedIngredientIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      ingredientsOpen: value.ingredientsOpen === true,
      timers: Array.isArray(value.timers) ? value.timers.filter(isTimer) : [],
    };
  } catch {
    return null;
  }
}

// localStorage, so an unfinished cook (step, checked ingredients, timers)
// survives a Logseq restart. It can be missing or throw (sandboxed/private
// contexts); the session is a convenience, so every failure degrades to "no
// saved session".
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// A session nobody touched for this long is a cook that was abandoned, not
// paused: drop it rather than keep it (and its timers) in storage forever.
const STALE_SESSION_MS = 7 * 24 * 60 * 60 * 1_000;

/** Removes one graph's sessions last saved more than a week ago. */
export function pruneStaleCookingSessions(graphKey: string, now: number): void {
  const store = storage();
  if (!store) return;
  const prefix = `${SESSION_PREFIX}${graphKey}:`;
  try {
    const stale: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key?.startsWith(prefix)) continue;
      const savedAt = savedAtOf(store.getItem(key));
      if (savedAt === null || now - savedAt > STALE_SESSION_MS) {
        stale.push(key);
      }
    }
    for (const key of stale) store.removeItem(key);
    if (stale.length > 0) notifyCookingSessions();
  } catch {
    // Pruning is housekeeping; a failure only leaves old entries behind.
  }
}

function savedAtOf(raw: string | null): number | null {
  try {
    const value = raw ? (JSON.parse(raw) as { savedAt?: unknown }) : null;
    return typeof value?.savedAt === "number" ? value.savedAt : null;
  } catch {
    return null;
  }
}

export function loadCookingSession(key: string): CookingSession | null {
  try {
    return parseCookingSession(storage()?.getItem(key) ?? null);
  } catch {
    return null;
  }
}

export function saveCookingSession(key: string, session: CookingSession): void {
  try {
    storage()?.setItem(
      key,
      JSON.stringify({ ...session, savedAt: Date.now() }),
    );
  } catch {
    // Quota or access failure: cooking continues, only resume is lost.
  }
  notifyCookingSessions();
}

export function clearCookingSession(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
  notifyCookingSessions();
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
