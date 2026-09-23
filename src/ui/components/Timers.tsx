import { useEffect, useState } from "react";
import {
  type CookingTimer,
  cookingSessionKey,
  formatRemaining,
  isTimerDone,
  isTimerPaused,
  listCookingSessions,
  loadCookingSession,
  pauseTimer,
  resumeTimer,
  saveCookingSession,
  subscribeCookingSessions,
  timerRemainingMs,
} from "../../application/cooking-session";
import type { UiMessages } from "../i18n";

/** Wall-clock "now" that ticks only while something is counting down. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!active) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}

/** True while any timer still counts down (not paused, not finished). */
export function anyTimerCounting(
  timers: readonly CookingTimer[],
  now: number,
): boolean {
  return timers.some((timer) => !isTimerPaused(timer) && timer.endsAt > now);
}

/** Pause a running timer, or resume a paused one. */
export function togglePause(timer: CookingTimer, now: number): CookingTimer {
  return isTimerPaused(timer)
    ? resumeTimer(timer, now)
    : pauseTimer(timer, now);
}

export function TimerRow({
  timer,
  now,
  messages,
  onRemove,
  onTogglePause,
  onOpen,
}: {
  timer: CookingTimer;
  now: number;
  messages: UiMessages;
  onRemove?(): void;
  onTogglePause?(): void;
  onOpen?(): void;
}) {
  const paused = isTimerPaused(timer);
  const done = isTimerDone(timer, now);
  const remaining = timerRemainingMs(timer, now);
  // Fraction still to go, for the shrinking bar under the row.
  const left = done ? 0 : Math.min(1, remaining / timer.durationMs);
  const label = onOpen ? (
    <button type="button" className="draft-recipe-timer-link" onClick={onOpen}>
      {timer.recipeTitle
        ? `${timer.recipeTitle} · ${timer.label}`
        : timer.label}
    </button>
  ) : (
    <span>{timer.label}</span>
  );
  const stateClass = done
    ? " draft-recipe-timer-done"
    : paused
      ? " draft-recipe-timer-paused"
      : "";
  return (
    <li className={`draft-recipe-timer${stateClass}`}>
      {label}
      <span role="timer" aria-live={done ? "assertive" : "off"}>
        {done ? messages.timerDone : formatRemaining(remaining)}
      </span>
      {onTogglePause && !done && (
        <button
          type="button"
          className="draft-recipe-icon-button"
          aria-label={`${paused ? messages.resumeTimer : messages.pauseTimer}: ${timer.label}`}
          title={paused ? messages.resumeTimer : messages.pauseTimer}
          aria-pressed={paused}
          onClick={onTogglePause}
        >
          <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`${done ? messages.dismissTimer : messages.cancelTimer}: ${timer.label}`}
          onClick={onRemove}
        >
          {done ? messages.dismissTimer : messages.cancelTimer}
        </button>
      )}
      <span
        className="draft-recipe-timer-bar"
        aria-hidden="true"
        style={{ transform: `scaleX(${left})` }}
      />
    </li>
  );
}

function runningTimers(
  graphKey: string,
): Array<{ recipeId: string; timer: CookingTimer }> {
  return listCookingSessions(graphKey).flatMap(({ recipeId, session }) =>
    session.timers.map((timer) => ({ recipeId, timer })),
  );
}

// The dock edits the saved session directly; Cooking Mode for that recipe
// isn't mounted while the dock shows, so nothing else owns it right now.
function updateTimers(
  graphKey: string,
  recipeId: string,
  change: (timers: CookingTimer[]) => CookingTimer[],
) {
  const key = cookingSessionKey(graphKey, recipeId);
  const session = loadCookingSession(key);
  if (!session) return;
  saveCookingSession(key, { ...session, timers: change(session.timers) });
}

/**
 * Timers of every recipe in this graph, shown wherever Cooking Mode isn't:
 * leaving the stove view never hides a running countdown. A running or
 * paused timer can be paused/resumed here; a finished one dismissed.
 */
export function TimerDock({
  graphKey,
  messages,
  onOpenRecipe,
}: {
  graphKey: string;
  messages: UiMessages;
  onOpenRecipe(recipeId: string): void;
}) {
  const [timers, setTimers] = useState(() => runningTimers(graphKey));
  useEffect(() => {
    setTimers(runningTimers(graphKey));
    return subscribeCookingSessions(() => setTimers(runningTimers(graphKey)));
  }, [graphKey]);
  const now = useNow(
    anyTimerCounting(
      timers.map(({ timer }) => timer),
      Date.now(),
    ),
  );

  if (timers.length === 0) return null;
  return (
    <section className="draft-recipe-timer-dock" aria-label={messages.timers}>
      <ul>
        {timers.map(({ recipeId, timer }) => (
          <TimerRow
            key={timer.id}
            timer={timer}
            now={now}
            messages={messages}
            onOpen={() => onOpenRecipe(recipeId)}
            onTogglePause={() =>
              updateTimers(graphKey, recipeId, (list) =>
                list.map((item) =>
                  item.id === timer.id ? togglePause(item, Date.now()) : item,
                ),
              )
            }
            onRemove={
              isTimerDone(timer, now)
                ? () =>
                    updateTimers(graphKey, recipeId, (list) =>
                      list.filter((item) => item.id !== timer.id),
                    )
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}
