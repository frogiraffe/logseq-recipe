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
          added: [{ tempId: "new:1", text: "2 eggs" }],
          updated: [{ id: "ingredient-1", text: "130 g butter" }],
          removed: [],
        },
        steps: { added: [], updated: [], removed: ["step-1"] },
        notes: { added: [], updated: [], removed: ["note-1"] },
        ingredientOrder: ["ingredient-1", "new:1"],
      }),
    );
  });

  it("reports prep, chill, cook, and source changes", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText(enMessages.prepTime), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.chillTime), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.cookTime), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText(enMessages.source), {
      target: { value: "https://example.com/cookie" },
    });
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        prepMinutes: 15,
        chillMinutes: 30,
        cookMinutes: 20,
        sourceUrl: "https://example.com/cookie",
      }),
    );
  });

  it("saves a free-text (non-URL) source instead of blocking Save", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText(enMessages.source), {
      target: { value: "me myself and i" },
    });
    expect(
      (
        screen.getByRole("button", {
          name: enMessages.save,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: "me myself and i" }),
    );
  });

  it("marks an ingredient as not scaling with servings", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    fireEvent.click(screen.getByLabelText(enMessages.doesNotScale));
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientScaleModeChanges: [
          { id: "ingredient-1", scaleMode: "fixed" },
        ],
      }),
    );
  });

  it("reorders ingredients via the move-down button", () => {
    const twoIngredientRecipe: Recipe = {
      ...recipe,
      ingredients: [
        ...recipe.ingredients,
        {
          id: "ingredient-2",
          rawText: "2 eggs",
          amount: { kind: "exact", value: 2 },
          ingredientText: "eggs",
          scaleMode: "linear",
        },
      ],
    };
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={twoIngredientRecipe}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: `${enMessages.moveDown}: 120 g butter`,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientOrder: ["ingredient-2", "ingredient-1"],
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

  it("cancels immediately with no changes made", () => {
    const onCancel = vi.fn();
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirms before discarding an unsaved edit, and respects the user's answer", () => {
    const onCancel = vi.fn();
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByLabelText(enMessages.title), {
      target: { value: "New Title" },
    });

    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));
    expect(confirmSpy).toHaveBeenCalledWith(enMessages.discardChangesConfirm);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: enMessages.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it("keeps Save/Cancel reachable via a sticky footer on a long form", () => {
    const { container } = render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(
      container.querySelector(".draft-recipe-sticky-actions"),
    ).not.toBeNull();
  });
});
