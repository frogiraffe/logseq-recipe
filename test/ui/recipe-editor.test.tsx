import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecipeEditPatch } from "../../src/application/edit-recipe";
import type { Recipe } from "../../src/domain/recipe";
import { RecipeEditor } from "../../src/ui/components/RecipeEditor";
import { enMessages } from "../../src/ui/i18n";

const recipe: Recipe = {
  id: "r1",
  title: "Cookie",
  baseYield: 8,
  yieldUnit: "cookies",
  categories: [],
  tags: [],
  ingredients: [
    {
      id: "ingredient-1",
      rawText: "120 g butter",
      amount: { kind: "exact", value: 120 },
      unit: "g",
      ingredientText: "butter",
      scaleMode: "linear",
    },
  ],
  steps: [
    {
      id: "step-1",
      rawText: "Mix well.",
      durations: [],
      temperatures: [],
      heat: [],
    },
  ],
  notes: [{ id: "note-1", text: "Serve warm." }],
  schemaVersion: 1,
  ingredientConversionOverrides: [],
};

describe("RecipeEditor", () => {
  it("only reports the fields that actually changed", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith({
      ingredients: { added: [], updated: [], removed: [] },
      steps: { added: [], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
    });
  });

  it("reports a title and yield change", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText(enMessages.title), {
      target: { value: "New Cookie" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.servings), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Cookie", baseYield: 12 }),
    );
  });

  it("adds, edits, and removes ingredients/steps/notes as a diff", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(
      screen.getByLabelText(`${enMessages.ingredients}: ingredient-1`),
      {
        target: { value: "130 g butter" },
      },
    );

    const addIngredientInput = screen.getByLabelText(enMessages.addIngredient);
    fireEvent.change(addIngredientInput, { target: { value: "2 eggs" } });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.addIngredient }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: `${enMessages.remove}: Mix well.` }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: `${enMessages.remove}: Serve warm.` }),
    );

    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: {
          added: ["2 eggs"],
          updated: [{ id: "ingredient-1", text: "130 g butter" }],
          removed: [],
        },
        steps: { added: [], updated: [], removed: ["step-1"] },
        notes: { added: [], updated: [], removed: ["note-1"] },
      }),
    );
  });

  it("disables Save while the title is empty or servings is invalid", () => {
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText(enMessages.title), {
      target: { value: "   " },
    });
    expect(
      (
        screen.getByRole("button", {
          name: enMessages.save,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText(enMessages.title), {
      target: { value: "Cookie" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.servings), {
      target: { value: "0" },
    });
    expect(
      (
        screen.getByRole("button", {
          name: enMessages.save,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
