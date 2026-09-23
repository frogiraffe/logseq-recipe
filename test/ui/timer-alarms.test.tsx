import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cookingSessionKey,
  saveCookingSession,
} from "../../src/application/cooking-session";
import { TimerDock } from "../../src/ui/components/Timers";
import { enMessages } from "../../src/ui/i18n";
import { watchTimerAlarms } from "../../src/ui/timer-alarms";

const START = new Date("2026-09-24T10:00:00Z").getTime();

function saveTimer(graph: string, recipeId: string, minutes: number) {
  saveCookingSession(cookingSessionKey(graph, recipeId), {
    checkedIngredientIds: [],
    ingredientsOpen: false,
    timers: [
      {
        id: `${recipeId}-t`,
        stepId: "s1",
        label: "Step 1 · 05:00",
        durationMs: minutes * 60_000,
        endsAt: START + minutes * 60_000,
        recipeTitle: `Recipe ${recipeId}`,
      },
    ],
  });
}

describe("watchTimerAlarms", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("rings each timer of its own graph once, even with no view mounted", () => {
    const rung: string[] = [];
    const stop = watchTimerAlarms("graph-a", (timer) => rung.push(timer.id));
    saveTimer("graph-a", "r1", 5);
    saveTimer("graph-b", "r2", 1);

    vi.advanceTimersByTime(4 * 60_000);
    expect(rung).toEqual([]);
    vi.advanceTimersByTime(60_000);
    expect(rung).toEqual(["r1-t"]);

    // A later save of the same session must not ring it again.
    saveTimer("graph-a", "r1", 5);
    vi.advanceTimersByTime(60_000);
    expect(rung).toEqual(["r1-t"]);
    stop();
  });

  it("remembers rung timers across a restart of the watcher", () => {
    const rung: string[] = [];
    saveTimer("graph-a", "r1", 1);
    let stop = watchTimerAlarms("graph-a", (timer) => rung.push(timer.id));
    vi.advanceTimersByTime(60_000);
    stop();
    stop = watchTimerAlarms("graph-a", (timer) => rung.push(timer.id));
    vi.advanceTimersByTime(60_000);
    expect(rung).toEqual(["r1-t"]);
    stop();
  });

  it("holds a paused timer and rings it at its new end after resume", () => {
    const rung: string[] = [];
    const stop = watchTimerAlarms("graph-a", (timer) => rung.push(timer.id));
    const key = cookingSessionKey("graph-a", "r1");
    const timer = {
      id: "r1-t",
      stepId: "s1",
      label: "Step 1 · 05:00",
      durationMs: 5 * 60_000,
      endsAt: START + 5 * 60_000,
    };
    const save = (t: typeof timer & { pausedRemainingMs?: number }) =>
      saveCookingSession(key, {
        checkedIngredientIds: [],
        ingredientsOpen: false,
        timers: [t],
      });
    save(timer);
    vi.advanceTimersByTime(60_000);
    save({ ...timer, pausedRemainingMs: 4 * 60_000 });
    vi.advanceTimersByTime(10 * 60_000);
    expect(rung).toEqual([]);

    save({ ...timer, endsAt: Date.now() + 4 * 60_000 });
    vi.advanceTimersByTime(4 * 60_000 - 1);
    expect(rung).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(rung).toEqual(["r1-t"]);
    stop();
  });

  it("does not ring a timer cancelled before it ends", () => {
    const rung: string[] = [];
    const stop = watchTimerAlarms("graph-a", (timer) => rung.push(timer.id));
    saveTimer("graph-a", "r1", 5);
    saveCookingSession(cookingSessionKey("graph-a", "r1"), {
      checkedIngredientIds: [],
      ingredientsOpen: false,
      timers: [],
    });
    vi.advanceTimersByTime(10 * 60_000);
    expect(rung).toEqual([]);
    stop();
  });
});

describe("TimerDock", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("shows this graph's running timers and opens their recipe", () => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    try {
      saveTimer("graph-a", "r1", 5);
      saveTimer("graph-b", "r2", 5);
      const onOpenRecipe = vi.fn();
      render(
        <TimerDock
          graphKey="graph-a"
          messages={enMessages}
          onOpenRecipe={onOpenRecipe}
        />,
      );
      expect(screen.getAllByRole("timer")).toHaveLength(1);
      expect(screen.getByRole("timer").textContent).toBe("05:00");
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByRole("timer").textContent).toBe("04:00");
      fireEvent.click(screen.getByRole("button", { name: /Recipe r1/ }));
      expect(onOpenRecipe).toHaveBeenCalledWith("r1");
    } finally {
      vi.useRealTimers();
    }
  });
});
