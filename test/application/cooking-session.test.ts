import { describe, expect, it } from "vitest";
import {
  cookingSessionKey,
  formatRemaining,
  listCookingSessions,
  parseCookingSession,
  pruneStaleCookingSessions,
  reconcileCookingSession,
  saveCookingSession,
  timerOptions,
} from "../../src/application/cooking-session";
import type { DurationAnnotation } from "../../src/domain/annotations";
import type { Recipe } from "../../src/domain/recipe";

function duration(overrides: Partial<DurationAnnotation>): DurationAnnotation {
  return {
    kind: "duration",
    value: { kind: "exact", value: 5 },
    unit: "minute",
    rawText: "5 minutes",
    startOffset: 0,
    endOffset: 9,
    ...overrides,
  };
}

describe("timerOptions", () => {
  const ms = (d: DurationAnnotation) =>
    timerOptions(d).map((o) => [o.durationMs, o.approximate]);

  it("offers exact values and both range bounds as precise timers", () => {
    expect(ms(duration({}))).toEqual([[300_000, false]]);
    expect(
      ms(duration({ value: { kind: "range", min: 1, max: 2 }, unit: "hour" })),
    ).toEqual([
      [3_600_000, false],
      [7_200_000, false],
    ]);
    expect(ms(duration({ conditionText: "or until golden" }))).toEqual([
      [300_000, false],
    ]);
  });

  it("marks approximate and open-ended values instead of dropping them", () => {
    expect(ms(duration({ value: { kind: "approximate", value: 20 } }))).toEqual(
      [[1_200_000, true]],
    );
    expect(ms(duration({ value: { kind: "maximum", value: 20 } }))).toEqual([
      [1_200_000, true],
    ]);
  });

  it("gives no timer for a time inside an instruction not to do something", () => {
    expect(ms(duration({ negated: true }))).toEqual([]);
  });

  it("gives no timer without a number or a time unit", () => {
    expect(
      ms(duration({ value: { kind: "inexact", expression: "a while" } })),
    ).toEqual([]);
    expect(ms(duration({ unit: undefined }))).toEqual([]);
  });
});

describe("cooking session state", () => {
  const recipe = {
    steps: [{ id: "s1" }],
    ingredients: [{ id: "i1" }],
  } as unknown as Recipe;

  it("drops references the edited recipe no longer has", () => {
    expect(
      reconcileCookingSession(
        {
          stepId: "gone",
          checkedIngredientIds: ["i1", "gone"],
          ingredientsOpen: true,
          timers: [
            { id: "t1", stepId: "s1", label: "a", durationMs: 1, endsAt: 1 },
            { id: "t2", stepId: "gone", label: "b", durationMs: 1, endsAt: 1 },
          ],
        },
        recipe,
      ),
    ).toEqual({
      checkedIngredientIds: ["i1"],
      ingredientsOpen: true,
      timers: [
        { id: "t1", stepId: "s1", label: "a", durationMs: 1, endsAt: 1 },
      ],
    });
  });

  it("treats malformed storage as no session", () => {
    expect(parseCookingSession(null)).toBeNull();
    expect(parseCookingSession("{not json")).toBeNull();
    expect(
      parseCookingSession(
        JSON.stringify({ checkedIngredientIds: [1, "i1"], timers: [{}] }),
      ),
    ).toEqual({
      checkedIngredientIds: ["i1"],
      ingredientsOpen: false,
      timers: [],
    });
  });

  it("formats remaining time without going negative", () => {
    expect(formatRemaining(65_000)).toBe("01:05");
    expect(formatRemaining(3_725_000)).toBe("1:02:05");
    expect(formatRemaining(-5)).toBe("00:00");
  });
});

describe("cooking session persistence", () => {
  const session = {
    checkedIngredientIds: ["i1"],
    ingredientsOpen: true,
    timers: [],
  };

  it("keeps a session in localStorage so it survives a restart", () => {
    localStorage.clear();
    saveCookingSession(cookingSessionKey("g", "r1"), session);
    expect(localStorage.getItem(cookingSessionKey("g", "r1"))).toContain(
      "savedAt",
    );
    expect(listCookingSessions("g").map((entry) => entry.recipeId)).toEqual([
      "r1",
    ]);
  });

  it("prunes only this graph's sessions untouched for over a week", () => {
    localStorage.clear();
    const week = 7 * 24 * 60 * 60 * 1_000;
    const stale = JSON.stringify({
      ...session,
      savedAt: Date.now() - week - 1,
    });
    localStorage.setItem(cookingSessionKey("g", "old"), stale);
    localStorage.setItem(cookingSessionKey("other", "old"), stale);
    saveCookingSession(cookingSessionKey("g", "fresh"), session);

    pruneStaleCookingSessions("g", Date.now());

    expect(listCookingSessions("g").map((entry) => entry.recipeId)).toEqual([
      "fresh",
    ]);
    expect(localStorage.getItem(cookingSessionKey("other", "old"))).not.toBe(
      null,
    );
  });
});
