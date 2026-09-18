import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../src/domain/recipe";
import { RecipeSettingsPanel } from "../../src/ui/components/RecipeSettingsPanel";
import { enMessages } from "../../src/ui/i18n";

function commitChip(labelText: string, value: string) {
  const input = screen.getByLabelText(labelText);
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

const recipe: Recipe = {
  id: "r1",
  title: "Cookie",
  baseYield: 8,
  categories: ["Dessert"],
  tags: ["Chocolate"],
  ingredients: [],
  steps: [],
  notes: [],
  schemaVersion: 1,
  parserLocale: "en",
  sourceMeasurementSystem: "us",
  ingredientConversionOverrides: [],
};

describe("RecipeSettingsPanel", () => {
  it("saves free-form categories/tags and an explicit conversion rule", () => {
    const onSave = vi.fn();
    render(
      <RecipeSettingsPanel
        recipe={recipe}
        assets={["assets/cookie.jpg"]}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    commitChip(enMessages.category, "Party");
    fireEvent.change(screen.getByLabelText(enMessages.ingredientKey), {
      target: { value: "butter" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.gramsPerUnit), {
      target: { value: "14.2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.addConversion }),
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ["Dessert", "Party"],
        ingredientConversionOverrides: [
          expect.objectContaining({
            ingredientKey: "butter",
            gramsPerVolumeUnit: 14.2,
          }),
        ],
      }),
      undefined,
    );
  });

  it("shows a readable asset filename instead of the raw graph path", () => {
    render(
      <RecipeSettingsPanel
        recipe={recipe}
        assets={["assets/1699999999999_cookie-photo.jpg"]}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(
      screen.getByRole("option", { name: "1699999999999_cookie-photo.jpg" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("option", {
        name: "assets/1699999999999_cookie-photo.jpg",
      }),
    ).toBeNull();
  });

  it("offers contextual autocomplete without restricting free-form values", () => {
    const onSave = vi.fn();
    render(
      <RecipeSettingsPanel
        recipe={recipe}
        assets={[]}
        messages={enMessages}
        categorySuggestions={[
          { value: "Dessert", count: 12 },
          { value: "Breakfast", count: 3 },
        ]}
        tagSuggestions={[{ value: "Quick", count: 5 }]}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    // Suggestions must not be permanently visible before the user types.
    expect(screen.queryByRole("listbox")).toBeNull();

    const categoryInput = screen.getByLabelText(enMessages.category);
    fireEvent.change(categoryInput, { target: { value: "break" } });
    fireEvent.click(screen.getByRole("option", { name: "Breakfast" }));

    const tagInput = screen.getByLabelText(enMessages.tags);
    fireEvent.change(tagInput, { target: { value: "qui" } });
    fireEvent.click(screen.getByRole("option", { name: "Quick" }));
    commitChip(enMessages.tags, "My Custom Tag");
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        categories: ["Dessert", "Breakfast"],
        tags: ["Chocolate", "Quick", "My Custom Tag"],
      }),
      undefined,
    );
  });

  it("never shows internal canonical unit ids in the volume-unit selector", () => {
    render(
      <RecipeSettingsPanel
        recipe={recipe}
        assets={[]}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const select = screen.getByLabelText(
      enMessages.volumeUnit,
    ) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map(
      (option) => option.textContent,
    );
    for (const text of optionTexts) {
      expect(text).not.toMatch(/_us|_metric|_imperial/);
    }
    expect(optionTexts).toContain("tbsp US");
  });

  it("only offers volume units for the recipe's source measurement system", () => {
    render(
      <RecipeSettingsPanel
        recipe={{ ...recipe, sourceMeasurementSystem: "metric" }}
        assets={[]}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const select = screen.getByLabelText(
      enMessages.volumeUnit,
    ) as HTMLSelectElement;
    const optionTexts = Array.from(select.options).map(
      (option) => option.textContent,
    );
    expect(optionTexts).toContain("tbsp Metric");
    expect(optionTexts).not.toContain("tbsp US");
    expect(optionTexts).not.toContain("tbsp Imperial");
  });

  it("does not render a raw canonical unit id in the saved conversion-rule list", () => {
    render(
      <RecipeSettingsPanel
        recipe={recipe}
        assets={[]}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText(enMessages.ingredientKey), {
      target: { value: "butter" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.gramsPerUnit), {
      target: { value: "14.2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.addConversion }),
    );

    expect(screen.getByText("butter: 1 tbsp US = 14.2 g")).toBeTruthy();
  });

  it("labels the conversion-rule editor to avoid confusion with ingredient authoring", () => {
    render(
      <RecipeSettingsPanel
        recipe={recipe}
        assets={[]}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText(enMessages.conversionRulesTitle)).toBeTruthy();
    expect(screen.getByText(enMessages.conversionRulesHelp)).toBeTruthy();
  });
});
