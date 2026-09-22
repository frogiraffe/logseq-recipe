import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ConversionDraft,
  ConversionSourceNode,
} from "../../src/application/convert-recipe";
import { ConvertPreview } from "../../src/ui/components/ConvertPreview";
import { enMessages } from "../../src/ui/i18n";

// Unused by tests that never touch the parser-language/measurement-system
// selectors (ConvertPreview only re-derives from `source` when the user
// changes one of those) - a lightweight stand-in is enough for those.
const source: ConversionSourceNode = {
  id: "root",
  title: "Chocolate Cookie",
  children: [],
};

const draft: ConversionDraft = {
  rootId: "root",
  title: "Chocolate Cookie",
  locale: "en",
  sourceMeasurementSystem: "us",
  metadata: { baseYield: 8, prepMinutes: 15 },
  sections: [
    { blockId: "ingredients", role: "ingredients", confidence: "exact" },
    { blockId: "steps", role: "steps", confidence: "exact" },
  ],
  unknownSections: [],
  ingredients: [
    {
      blockId: "i1",
      parsed: {
        rawText: "flour to taste",
        ingredientText: "flour to taste",
        confidence: "unparsed",
      },
    },
  ],
  steps: [
    {
      blockId: "s1",
      rawText: "Mix.",
      annotations: { durations: [], temperatures: [], heat: [] },
    },
  ],
  issues: [
    {
      code: "ingredient-amount-unparsed",
      message: "One ingredient has no numeric amount.",
      blockId: "i1",
    },
  ],
};

describe("ConvertPreview", () => {
  it("shows recognized structure and warnings before commit", () => {
    render(
      <ConvertPreview
        source={source}
        draft={draft}
        messages={enMessages}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(
      screen.getByText(enMessages.ingredients).nextElementSibling?.textContent,
    ).toBe("1");
    expect(
      screen.getByText(enMessages.steps).nextElementSibling?.textContent,
    ).toBe("1");
    expect(
      screen.getByText("One ingredient has no numeric amount."),
    ).toBeTruthy();
  });

  it("commits the resolved draft only after explicit confirmation", () => {
    const onConfirm = vi.fn();
    render(
      <ConvertPreview
        source={source}
        draft={draft}
        messages={enMessages}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.confirm }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(draft);
  });

  it("disables confirmation when required conversion data is missing", () => {
    const invalid: ConversionDraft = {
      ...draft,
      metadata: {},
      issues: [
        {
          code: "missing-base-yield",
          message: "A positive base yield is required.",
          blockId: "root",
        },
      ],
    };

    render(
      <ConvertPreview
        source={source}
        draft={invalid}
        messages={enMessages}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: enMessages.confirm,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("classifies an unknown section before enabling confirmation", () => {
    const onConfirm = vi.fn();
    const ambiguous: ConversionDraft = {
      rootId: "root",
      title: "Recipe root",
      locale: "en",
      sourceMeasurementSystem: "us",
      metadata: { baseYield: 8 },
      sections: [{ blockId: "steps", role: "steps", confidence: "exact" }],
      unknownSections: [
        {
          blockId: "unknown",
          title: "What you need",
          children: [{ id: "i1", title: "100 g flour", children: [] }],
        },
      ],
      ingredients: [],
      steps: [
        {
          blockId: "s1",
          rawText: "Mix.",
          annotations: { durations: [], temperatures: [], heat: [] },
        },
      ],
      issues: [
        {
          code: "unrecognized-section",
          message: 'Could not determine the role of section "What you need".',
          blockId: "unknown",
        },
        {
          code: "no-ingredients-section",
          message: "No recognized ingredients section was found.",
          blockId: "root",
        },
      ],
    };

    render(
      <ConvertPreview
        source={source}
        draft={ambiguous}
        messages={enMessages}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    const confirm = screen.getByRole("button", { name: enMessages.confirm });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("What you need")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.ingredients }),
    );

    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    expect(
      screen.getByText(enMessages.ingredients).nextElementSibling?.textContent,
    ).toBe("1");

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0].unknownSections).toEqual([]);
    expect(onConfirm.mock.calls[0][0].sections).toContainEqual({
      blockId: "unknown",
      role: "ingredients",
      confidence: "exact",
    });
  });

  it("lets the user correct an unparsed ingredient without fabricating a value", () => {
    const onConfirm = vi.fn();
    render(
      <ConvertPreview
        source={source}
        draft={draft}
        messages={enMessages}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText("flour to taste")).toBeTruthy();

    const useStructured = screen.getByRole("button", {
      name: enMessages.useStructuredAmount,
    }) as HTMLButtonElement;
    expect(useStructured.disabled).toBe(true);

    fireEvent.change(
      screen.getByLabelText(`${enMessages.amount}: flour to taste`),
      { target: { value: "200" } },
    );
    fireEvent.change(
      screen.getByLabelText(`${enMessages.unit}: flour to taste`),
      { target: { value: "g" } },
    );

    expect(useStructured.disabled).toBe(false);
    fireEvent.click(useStructured);

    expect(
      screen.queryByText("One ingredient has no numeric amount."),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: enMessages.confirm }));
    const committed = onConfirm.mock.calls[0][0];
    expect(committed.ingredients[0].parsed).toEqual({
      rawText: "flour to taste",
      amount: { kind: "exact", value: 200 },
      unit: "g",
      ingredientText: "flour to taste",
      confidence: "exact",
    });
  });

  it("lets the user keep an unparsed ingredient as raw text", () => {
    render(
      <ConvertPreview
        source={source}
        draft={draft}
        messages={enMessages}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.keepAsWritten }),
    );

    expect(
      screen.queryByText("One ingredient has no numeric amount."),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: enMessages.keepAsWritten }),
    ).toBeNull();
  });

  it("shows what is being converted", () => {
    render(
      <ConvertPreview
        source={source}
        draft={draft}
        messages={enMessages}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText("Chocolate Cookie")).toBeTruthy();
  });

  it("lets the user supply a missing yield instead of dead-ending the conversion", () => {
    const onConfirm = vi.fn();
    const missingYieldDraft: ConversionDraft = {
      ...draft,
      metadata: {},
      ingredients: [],
      issues: [
        {
          code: "missing-base-yield",
          message:
            "A positive base yield/serving count is required before this subtree can be converted.",
          blockId: "root",
        },
      ],
    };

    render(
      <ConvertPreview
        source={source}
        draft={missingYieldDraft}
        messages={enMessages}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    const confirmButton = screen.getByRole("button", {
      name: enMessages.confirm,
    }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(enMessages.servings), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.yieldUnit), {
      target: { value: "cookies" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.useThisYield }),
    );

    expect(
      screen.queryByText(
        "A positive base yield/serving count is required before this subtree can be converted.",
      ),
    ).toBeNull();
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);
    expect(onConfirm.mock.calls[0][0].metadata).toMatchObject({
      baseYield: 8,
      yieldUnit: "cookies",
    });
  });

  it("re-analyzes the original source (not the resolved draft) when the parser language changes", () => {
    const turkishSource: ConversionSourceNode = {
      id: "root",
      title: "Kurabiye",
      children: [
        { id: "yield", title: "Yield: 8", children: [] },
        {
          id: "ingredients",
          title: "Malzemeler",
          children: [{ id: "i1", title: "120 g un", children: [] }],
        },
        {
          id: "steps",
          title: "Yapılış",
          children: [{ id: "s1", title: "Karıştır.", children: [] }],
        },
      ],
    };
    const englishFirstPass: ConversionDraft = {
      rootId: "root",
      title: "Kurabiye",
      locale: "en",
      sourceMeasurementSystem: "us",
      metadata: { baseYield: 8 },
      sections: [],
      unknownSections: [
        {
          blockId: "ingredients",
          title: "Malzemeler",
          children: [{ id: "i1", title: "120 g un", children: [] }],
        },
        {
          blockId: "steps",
          title: "Yapılış",
          children: [{ id: "s1", title: "Karıştır.", children: [] }],
        },
      ],
      ingredients: [],
      steps: [],
      issues: [
        {
          code: "unrecognized-section",
          message: 'Could not determine the role of section "Malzemeler".',
          blockId: "ingredients",
        },
      ],
    };

    render(
      <ConvertPreview
        source={turkishSource}
        draft={englishFirstPass}
        messages={enMessages}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    // English locale doesn't recognize "Malzemeler"/"Yapılış" as sections.
    expect(screen.getByText("Malzemeler")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(enMessages.parserLanguage), {
      target: { value: "tr" },
    });

    // Switching to Turkish re-analyzes the ORIGINAL source and now
    // recognizes both sections - the unknown-section list is gone and the
    // ingredient count reflects the fresh Turkish-locale parse.
    expect(screen.queryByText("Malzemeler")).toBeNull();
    expect(
      screen.getByText(enMessages.ingredients).nextElementSibling?.textContent,
    ).toBe("1");
  });

  it("re-analyzes ambiguous units when the source measurement system changes", () => {
    const cupSource: ConversionSourceNode = {
      id: "root",
      title: "Recipe",
      children: [
        { id: "yield", title: "Yield: 4", children: [] },
        {
          id: "ingredients",
          title: "Ingredients",
          children: [{ id: "i1", title: "1 cup flour", children: [] }],
        },
        {
          id: "steps",
          title: "Steps",
          children: [{ id: "s1", title: "Mix.", children: [] }],
        },
      ],
    };
    const usFirstPass: ConversionDraft = {
      rootId: "root",
      title: "Recipe",
      locale: "en",
      sourceMeasurementSystem: "us",
      metadata: { baseYield: 4 },
      sections: [
        { blockId: "ingredients", role: "ingredients", confidence: "exact" },
        { blockId: "steps", role: "steps", confidence: "exact" },
      ],
      unknownSections: [],
      ingredients: [
        {
          blockId: "i1",
          parsed: {
            rawText: "1 cup flour",
            amount: { kind: "exact", value: 1 },
            unit: "cup_us",
            ingredientText: "flour",
            confidence: "exact",
          },
        },
      ],
      steps: [
        {
          blockId: "s1",
          rawText: "Mix.",
          annotations: { durations: [], temperatures: [], heat: [] },
        },
      ],
      issues: [],
    };

    const onConfirm = vi.fn();
    render(
      <ConvertPreview
        source={cupSource}
        draft={usFirstPass}
        messages={enMessages}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(
      screen.getByLabelText(enMessages.sourceMeasurementSystem),
      { target: { value: "imperial" } },
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.confirm }));

    // A US cup and an imperial cup are different canonical units - the
    // measurement-system change must have re-run the parser against the
    // original source, not just relabeled the already-resolved draft.
    expect(onConfirm.mock.calls[0][0].ingredients[0].parsed.unit).toBe(
      "cup_imperial",
    );
  });

  it("confirms before discarding an in-progress ingredient correction", () => {
    const onCancel = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ConvertPreview
        source={source}
        draft={draft}
        messages={enMessages}
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(
      screen.getByLabelText(`${enMessages.amount}: flour to taste`),
      { target: { value: "200" } },
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));

    expect(confirmSpy).toHaveBeenCalledWith(enMessages.discardChangesConfirm);
    expect(onCancel).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
