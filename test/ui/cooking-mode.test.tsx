import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { CookingMode } from "../../src/ui/components/CookingMode";
import { enMessages } from "../../src/ui/i18n";
import { ingredientLine } from "./ingredient-line";

const recipe: Recipe = {
  id: "r1",
  title: "Pan Recipe",
  baseYield: 2,
  yieldUnit: "servings",
  categories: [],
  tags: [],
  ingredients: [
    {
      id: "i1",
      rawText: "100 g flour",
      amount: { kind: "exact", value: 100 },
      unit: "g",
      ingredientText: "flour",
      scaleMode: "linear",
    },
  ],
  steps: [
    {
      id: "s1",
      rawText: "Cook over medium heat for 5 minutes.",
      durations: [
        {
          kind: "duration",
          value: { kind: "exact", value: 5 },
          unit: "minute",
          rawText: "5 minutes",
          startOffset: 26,
          endOffset: 35,
        },
      ],
      temperatures: [],
      heat: [
        {
          kind: "heat",
          level: "medium",
          rawText: "medium heat",
          startOffset: 10,
          endOffset: 21,
        },
      ],
    },
    {
      id: "s2",
      rawText: "Bake in a preheated fan oven at 180°C for 10-12 minutes.",
      durations: [
        {
          kind: "duration",
          value: { kind: "range", min: 10, max: 12 },
          unit: "minute",
          rawText: "10-12 minutes",
          startOffset: 44,
          endOffset: 57,
        },
      ],
      temperatures: [
        {
          kind: "temperature",
          value: 180,
          unit: "celsius",
          ovenMode: "fan",
          preheat: true,
          rawText: "180°C",
          startOffset: 35,
          endOffset: 40,
        },
      ],
      heat: [],
    },
  ],
  notes: [],
  schemaVersion: 1,
  ingredientConversionOverrides: [],
};

function cookingMode(
  currentRecipe: Recipe,
  onExit: () => void = () => undefined,
  sessionKey: string | null = null,
) {
  return (
    <CookingMode
      ingredientUnitOverrides={{}}
      onIngredientUnitOverrideChange={() => undefined}
      recipe={currentRecipe}
      targetYield={2}
      measurementSystem="metric"
      messages={enMessages}
      sessionKey={sessionKey}
      onExit={onExit}
    />
  );
}

describe("CookingMode", () => {
  it("navigates step boundaries and keeps qualitative heat non-numeric", () => {
    render(cookingMode(recipe));

    expect(
      screen.getByText("Cook over medium heat for 5 minutes."),
    ).toBeTruthy();
    expect(screen.getByText("medium heat")).toBeTruthy();
    expect(screen.queryByText(/medium heat.*°/i)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: enMessages.previous,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: enMessages.next }));
    expect(
      screen.getByText(
        "Bake in a preheated fan oven at 180°C for 10-12 minutes.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Fan · 180 °C · Preheated")).toBeTruthy();
    expect(screen.getByText("10–12 min")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: enMessages.next,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("supports keyboard navigation and Escape", () => {
    const onExit = vi.fn();
    render(cookingMode(recipe, onExit));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(
      screen.getByText(
        "Bake in a preheated fan oven at 180°C for 10-12 minutes.",
      ),
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(
      screen.getByText("Cook over medium heat for 5 minutes."),
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("shows scaled ingredients in the drawer", () => {
    render(
      <CookingMode
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
        recipe={recipe}
        targetYield={4}
        measurementSystem="metric"
        messages={enMessages}
        onExit={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );
    expect(screen.getByText(ingredientLine("200 g flour"))).toBeTruthy();
  });

  it("lets the cook check off ingredients as they're used", () => {
    render(
      <CookingMode
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
        recipe={recipe}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        onExit={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );

    const checkbox = screen.getByRole("checkbox", { name: /flour/i });
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect(checkbox.closest("li")?.className).toContain(
      "draft-recipe-ingredient-checked",
    );

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it("renders the resolved cover when cooking mode receives one", () => {
    render(
      <CookingMode
        ingredientUnitOverrides={{}}
        onIngredientUnitOverrideChange={() => undefined}
        recipe={recipe}
        targetYield={2}
        measurementSystem="metric"
        messages={enMessages}
        coverUrl="file:///graph/assets/pan.jpg"
        onExit={() => undefined}
      />,
    );
    const cover = screen.getByTestId("cooking-cover");
    expect(cover.querySelector("img")?.getAttribute("src")).toBe(
      "file:///graph/assets/pan.jpg",
    );
  });

  it("shows recipe notes in a boxed section, and hides it when there are none", () => {
    const { rerender } = render(cookingMode(recipe));
    expect(screen.queryByText(enMessages.notes)).toBeNull();

    const withNotes: Recipe = {
      ...recipe,
      notes: [{ id: "n1", text: "Centers stay soft, that is fine." }],
    };
    rerender(cookingMode(withNotes));
    expect(screen.getByText(enMessages.notes)).toBeTruthy();
    expect(screen.getByText("Centers stay soft, that is fine.")).toBeTruthy();
  });

  it("drops a checked ingredient's id once a live recipe refresh removes it", () => {
    const rendered = render(cookingMode(recipe));
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /flour/i }));
    expect(
      (screen.getByRole("checkbox", { name: /flour/i }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    const withoutFlour: Recipe = { ...recipe, ingredients: [] };
    rendered.rerender(cookingMode(withoutFlour));

    // Re-adding an ingredient that happens to reuse the same id must not
    // come back pre-checked from stale state.
    rendered.rerender(cookingMode(recipe));
    expect(
      (screen.getByRole("checkbox", { name: /flour/i }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("offers both exit-for-now and finish, never Cancel", () => {
    render(cookingMode(recipe));
    expect(
      screen.getByRole("button", { name: enMessages.exitCookingForNow }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: enMessages.finishCooking }),
    ).toBeTruthy();
  });

  it("exposes the ingredients disclosure's open/closed state to assistive tech", () => {
    render(cookingMode(recipe));
    const toggle = screen.getByRole("button", { name: enMessages.ingredients });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(
      document.querySelector("aside")?.id,
    );
  });

  it("marks the current step on a labelled step track and jumps by segment", () => {
    render(cookingMode(recipe));
    const track = screen.getByRole("list", { name: enMessages.stepProgress });
    expect(track).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: `${enMessages.stepProgress} 1` })
        .getAttribute("aria-current"),
    ).toBe("step");

    fireEvent.click(
      screen.getByRole("button", { name: `${enMessages.stepProgress} 2` }),
    );
    expect(screen.getByText(/Bake in a preheated fan oven/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: `${enMessages.stepProgress} 2` })
        .getAttribute("aria-current"),
    ).toBe("step");
  });

  it("clamps the active step when a live recipe refresh removes later steps", () => {
    const rendered = render(cookingMode(recipe));
    fireEvent.click(screen.getByRole("button", { name: enMessages.next }));
    expect(
      screen.getByText(
        "Bake in a preheated fan oven at 180°C for 10-12 minutes.",
      ),
    ).toBeTruthy();

    const shortened: Recipe = { ...recipe, steps: recipe.steps.slice(0, 1) };
    rendered.rerender(cookingMode(shortened));

    expect(
      screen.getByText("Cook over medium heat for 5 minutes."),
    ).toBeTruthy();
    expect(screen.getByText("1 / 1")).toBeTruthy();
  });
});

describe("CookingMode sessions and timers", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("starts an exact timer and signals completion from the target time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T10:00:00Z"));
    render(cookingMode(recipe));

    fireEvent.click(
      screen.getByRole("button", { name: `${enMessages.startTimer} 05:00` }),
    );
    expect(screen.getByRole("timer").textContent).toBe("05:00");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("04:00");

    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
    });
    expect(screen.getByRole("timer").textContent).toBe(enMessages.timerDone);
  });

  it("lets a range pick either bound and marks approximate durations", () => {
    render(cookingMode(recipe));
    fireEvent.click(screen.getByRole("button", { name: enMessages.next }));
    expect(
      screen.getByRole("button", { name: `${enMessages.startTimer} 10:00` }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: `${enMessages.startTimer} 12:00` }),
    ).toBeTruthy();

    const inexact: Recipe = {
      ...recipe,
      steps: [
        {
          id: "s9",
          rawText: "Rest it a while, about 5 minutes.",
          durations: [
            {
              kind: "duration",
              value: { kind: "inexact", expression: "a while" },
              unit: "minute",
              rawText: "a while",
              startOffset: 8,
              endOffset: 15,
            },
            {
              kind: "duration",
              value: { kind: "approximate", value: 5 },
              unit: "minute",
              rawText: "about 5 minutes",
              startOffset: 17,
              endOffset: 32,
            },
          ],
          temperatures: [],
          heat: [],
        },
      ],
    };
    const view = render(cookingMode(inexact));
    // Only the approximate value offers a timer, marked as approximate.
    const starts = view.container.querySelectorAll(".draft-recipe-timer-start");
    expect(starts).toHaveLength(1);
    expect(starts[0].getAttribute("aria-label")).toBe(
      `${enMessages.startTimer} ~05:00`,
    );
  });

  it("resumes step, checked ingredients, and timers after exit for now", () => {
    const key = "logseq-recipe:cooking:graph-a:r1";
    const first = render(cookingMode(recipe, () => undefined, key));
    fireEvent.click(screen.getByRole("button", { name: enMessages.next }));
    fireEvent.click(
      screen.getByRole("button", { name: `${enMessages.startTimer} 10:00` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.exitCookingForNow }),
    );
    first.unmount();

    render(cookingMode(recipe, () => undefined, key));
    expect(screen.getByText(/Bake in a preheated fan oven/)).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByRole("timer")).toBeTruthy();
  });

  it("finish cooking clears the saved session", () => {
    const key = "logseq-recipe:cooking:graph-a:r1";
    const onExit = vi.fn();
    render(cookingMode(recipe, onExit, key));
    fireEvent.click(screen.getByRole("button", { name: enMessages.next }));
    expect(sessionStorage.getItem(key)).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.finishCooking }),
    );
    expect(onExit).toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("never reads another graph's session", () => {
    const keyA = "logseq-recipe:cooking:graph-a:r1";
    const first = render(cookingMode(recipe, () => undefined, keyA));
    fireEvent.click(screen.getByRole("button", { name: enMessages.next }));
    first.unmount();

    render(
      cookingMode(recipe, () => undefined, "logseq-recipe:cooking:graph-b:r1"),
    );
    expect(
      screen.getByText("Cook over medium heat for 5 minutes."),
    ).toBeTruthy();
  });
});

describe("CookingMode custom timer", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("starts a timer of any length for the current step", () => {
    render(cookingMode(recipe));
    fireEvent.click(
      screen.getByRole("button", { name: `+ ${enMessages.addTimer}` }),
    );
    fireEvent.change(screen.getByLabelText(enMessages.timerMinutes), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.startTimer }),
    );
    expect(screen.getByRole("timer").textContent).toBe("02:00");
    expect(
      screen.getByText(`${enMessages.stepProgress} 1 · 02:00`),
    ).toBeTruthy();
  });
});

describe("CookingMode servings", () => {
  it("rescales the ingredient panel when servings change while cooking", () => {
    function Harness() {
      const [servings, setServings] = useState(2);
      return (
        <CookingMode
          ingredientUnitOverrides={{}}
          onIngredientUnitOverrideChange={() => undefined}
          recipe={recipe}
          targetYield={servings}
          measurementSystem="metric"
          messages={enMessages}
          onTargetYieldChange={setServings}
          onExit={() => undefined}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );
    expect(screen.getByText(ingredientLine("100 g flour"))).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.moreServings }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.moreServings }),
    );
    expect(
      (screen.getByLabelText(enMessages.servings) as HTMLInputElement).value,
    ).toBe("4");
    expect(screen.getByText(ingredientLine("200 g flour"))).toBeTruthy();
  });
});

describe("CookingMode timer pause", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("freezes a paused timer and continues from where it stopped", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T10:00:00Z"));
    render(cookingMode(recipe));
    fireEvent.click(
      screen.getByRole("button", { name: `${enMessages.startTimer} 05:00` }),
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const label = `${enMessages.stepProgress} 1 · 05:00`;
    fireEvent.click(
      screen.getByRole("button", {
        name: `${enMessages.pauseTimer}: ${label}`,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("04:00");

    fireEvent.click(
      screen.getByRole("button", {
        name: `${enMessages.resumeTimer}: ${label}`,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("03:00");
  });
});
