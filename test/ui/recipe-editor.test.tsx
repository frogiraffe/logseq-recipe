import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecipeEditPatch } from "../../src/application/edit-recipe";
import type { Recipe } from "../../src/domain/recipe";
import { RecipeEditor } from "../../src/ui/components/RecipeEditor";
import { moveRow } from "../../src/ui/components/SortableList";
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

  it("keeps the line breaks of a multi-line step", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    const multiLine = "Melt the butter.\nDo not brown it.";
    render(
      <RecipeEditor
        recipe={{
          ...recipe,
          steps: [{ ...recipe.steps[0], rawText: multiLine }],
        }}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );

    const field = screen.getByDisplayValue(multiLine, { normalizer: (v) => v });
    expect((field as HTMLTextAreaElement).value).toBe(multiLine);
    fireEvent.change(field, { target: { value: `${multiLine}\nThen cool.` } });
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave.mock.calls[0][0].steps.updated).toEqual([
      { id: "step-1", text: `${multiLine}\nThen cool.` },
    ]);
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

    fireEvent.change(screen.getByLabelText(`${enMessages.ingredients} 1`), {
      target: { value: "130 g butter" },
    });

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

    fireEvent.change(
      screen.getByLabelText(
        `${enMessages.prepTime} (${enMessages.minutesUnit})`,
      ),
      {
        target: { value: "15" },
      },
    );
    fireEvent.change(
      screen.getByLabelText(
        `${enMessages.chillTime} (${enMessages.minutesUnit})`,
      ),
      {
        target: { value: "30" },
      },
    );
    fireEvent.change(
      screen.getByLabelText(
        `${enMessages.cookTime} (${enMessages.minutesUnit})`,
      ),
      {
        target: { value: "20" },
      },
    );
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

describe("RecipeEditor step notes and media", () => {
  it("adds a step note and attaches an existing asset", async () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={recipe}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
        listStepMediaAssets={async () => ["assets/dough.jpg"]}
      />,
    );

    const noteInput = screen.getByRole("textbox", {
      name: enMessages.addStepNote,
    });
    fireEvent.change(noteInput, { target: { value: "Don't overmix." } });
    fireEvent.keyDown(noteInput, { key: "Enter" });
    fireEvent.change(
      await screen.findByRole("combobox", {
        name: `${enMessages.attachAsset}: Mix well.`,
      }),
      { target: { value: "assets/dough.jpg" } },
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        stepChildren: [
          {
            stepId: "step-1",
            diff: {
              added: [
                { tempId: "new:1", text: "Don't overmix." },
                { tempId: "new:2", text: "![dough](../assets/dough.jpg)" },
              ],
              updated: [],
              removed: [],
            },
            order: ["new:1", "new:2"],
          },
        ],
      }),
    );
  });

  it("shows an attached photo as the file, not as its markup", async () => {
    const markup = "![butter](../assets/brown-butter.webp)";
    render(
      <RecipeEditor
        recipe={{
          ...recipe,
          steps: [
            {
              ...recipe.steps[0],
              children: [
                {
                  id: "c1",
                  kind: "image",
                  text: markup,
                  path: "assets/brown-butter.webp",
                  alt: "butter",
                },
              ],
            },
          ],
        }}
        messages={enMessages}
        onSave={() => undefined}
        onCancel={() => undefined}
        resolveAssetUrl={async (path) => `file:///graph/${path}`}
      />,
    );

    expect(screen.queryByDisplayValue(markup)).toBeNull();
    expect(screen.getByText("brown-butter.webp")).toBeTruthy();
    expect(
      ((await screen.findByAltText("butter")) as HTMLImageElement).src,
    ).toBe("file:///graph/assets/brown-butter.webp");
    // Still removable like any line.
    expect(
      screen.getByRole("button", { name: `${enMessages.remove}: ${markup}` }),
    ).toBeTruthy();
  });

  it("reports removing an existing step note", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={{
          ...recipe,
          steps: [
            {
              ...recipe.steps[0],
              children: [{ id: "c1", kind: "note", text: "Old tip" }],
            },
          ],
        }}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: `${enMessages.remove}: Old tip` }),
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));
    expect(onSave.mock.calls[0][0].stepChildren).toEqual([
      { stepId: "step-1", diff: { added: [], updated: [], removed: ["c1"] } },
    ]);
  });
});

describe("RecipeEditor drag-and-drop", () => {
  // dnd-kit measures on animation frames; let a few pass between keys.
  const settle = () =>
    act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));

  const twoNotes: Recipe = {
    ...recipe,
    notes: [
      { id: "note-1", text: "First" },
      { id: "note-2", text: "Second" },
    ],
  };

  // happy-dom has no layout: give each row a 40px slot by list position so
  // dnd-kit's keyboard sensor can measure where "down" is.
  function mockRowLayout() {
    return vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const row = this.closest("li");
        const index = row?.parentElement
          ? [...row.parentElement.children].indexOf(row)
          : 0;
        const top = index * 40;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          right: 300,
          bottom: top + 40,
          width: 300,
          height: 40,
          toJSON: () => ({}),
        } as DOMRect;
      });
  }

  it("reorders with the keyboard through the drag handle", async () => {
    const layout = mockRowLayout();
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    try {
      render(
        <RecipeEditor
          recipe={twoNotes}
          messages={enMessages}
          onSave={onSave}
          onCancel={() => undefined}
        />,
      );
      const handle = screen.getByRole("button", {
        name: `${enMessages.dragToReorder}: First`,
      });
      handle.focus();
      fireEvent.keyDown(handle, { code: "Space", key: " " });
      await settle();
      fireEvent.keyDown(handle, { code: "ArrowDown", key: "ArrowDown" });
      await settle();
      fireEvent.keyDown(handle, { code: "Space", key: " " });
      await settle();

      fireEvent.click(screen.getByRole("button", { name: enMessages.save }));
      expect(onSave.mock.calls[0][0].noteOrder).toEqual(["note-2", "note-1"]);
    } finally {
      layout.mockRestore();
    }
  });

  it("leaves the order unchanged when a keyboard drag is cancelled", async () => {
    const layout = mockRowLayout();
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    try {
      render(
        <RecipeEditor
          recipe={twoNotes}
          messages={enMessages}
          onSave={onSave}
          onCancel={() => undefined}
        />,
      );
      const handle = screen.getByRole("button", {
        name: `${enMessages.dragToReorder}: First`,
      });
      handle.focus();
      fireEvent.keyDown(handle, { code: "Space", key: " " });
      await settle();
      fireEvent.keyDown(handle, { code: "ArrowDown", key: "ArrowDown" });
      await settle();
      fireEvent.keyDown(handle, { code: "Escape", key: "Escape" });
      await settle();

      fireEvent.click(screen.getByRole("button", { name: enMessages.save }));
      expect(onSave.mock.calls[0][0].noteOrder).toBeUndefined();
    } finally {
      layout.mockRestore();
    }
  });
});

describe("RecipeEditor ingredient groups", () => {
  const grouped: Recipe = {
    ...recipe,
    ingredients: [
      {
        ...recipe.ingredients[0],
        id: "flour",
        rawText: "200 g flour",
        group: { id: "dough", title: "For the dough:" },
      },
      {
        ...recipe.ingredients[0],
        id: "egg",
        rawText: "1 egg",
        group: { id: "dough", title: "For the dough:" },
      },
    ],
  };

  function renderGrouped() {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    render(
      <RecipeEditor
        recipe={grouped}
        messages={enMessages}
        onSave={onSave}
        onCancel={() => undefined}
      />,
    );
    return onSave;
  }

  it("lists a group as a heading row and saves nothing when unchanged", () => {
    const onSave = renderGrouped();

    expect(
      (
        screen.getByLabelText(
          `${enMessages.ingredientGroup} 1`,
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("For the dough:");
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave.mock.calls[0][0]).not.toHaveProperty("ingredientLayout");
    expect(onSave.mock.calls[0][0].ingredients).toEqual({
      added: [],
      updated: [],
      removed: [],
    });
  });

  it("adds a new group with an ingredient and sends the whole arrangement", () => {
    const onSave = renderGrouped();
    const add = screen.getByLabelText(enMessages.addIngredient);

    fireEvent.change(add, { target: { value: "For the filling:" } });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.addIngredientGroup }),
    );
    fireEvent.change(add, { target: { value: "250 g cheese" } });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.addIngredient }),
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    const patch = onSave.mock.calls[0][0];
    expect(patch.ingredients.added).toEqual([
      { tempId: "new:1", text: "For the filling:" },
      { tempId: "new:2", text: "250 g cheese" },
    ]);
    expect(patch.ingredientLayout).toEqual([
      { id: "dough", items: ["flour", "egg"] },
      { id: "new:1", items: ["new:2"] },
    ]);
    expect(patch).not.toHaveProperty("ingredientOrder");
  });

  it("saves a one-line group's heading with a colon so it reads back as a group", () => {
    const onSave = renderGrouped();
    const add = screen.getByLabelText(enMessages.addIngredient);

    fireEvent.change(add, { target: { value: "Garnish" } });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.addIngredientGroup }),
    );
    fireEvent.change(add, { target: { value: "parsley" } });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.addIngredient }),
    );
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSave.mock.calls[0][0].ingredients.added).toEqual([
      { tempId: "new:1", text: "Garnish:" },
      { tempId: "new:2", text: "parsley" },
    ]);
  });

  it("blocks saving a group with no ingredient under it", () => {
    const onSave = renderGrouped();
    const add = screen.getByLabelText(enMessages.addIngredient);

    fireEvent.change(add, { target: { value: "For the topping:" } });
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.addIngredientGroup }),
    );

    expect(screen.getByText(enMessages.emptyIngredientGroup)).toBeTruthy();
    const save = screen.getByRole("button", {
      name: enMessages.save,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("RecipeEditor when the recipe changes in Logseq", () => {
  it("keeps a line added elsewhere, warns, and offers the current version", () => {
    const onSave = vi.fn<(patch: RecipeEditPatch) => void>();
    const onReload = vi.fn();
    const props = {
      messages: enMessages,
      onSave,
      onCancel: () => undefined,
      onReload,
    };
    const { rerender } = render(<RecipeEditor recipe={recipe} {...props} />);
    expect(screen.queryByText(enMessages.recipeChangedElsewhere)).toBeNull();

    rerender(
      <RecipeEditor
        recipe={{
          ...recipe,
          ingredients: [
            ...recipe.ingredients,
            {
              ...recipe.ingredients[0],
              id: "added-in-logseq",
              rawText: "1 egg",
            },
          ],
        }}
        {...props}
      />,
    );
    expect(screen.getByText(enMessages.recipeChangedElsewhere)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(enMessages.title), {
      target: { value: "Cookies" },
    });
    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      title: "Cookies",
      ingredients: { added: [], updated: [], removed: [] },
    });

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.loadCurrentVersion }),
    );
    expect(confirm).toHaveBeenCalled();
    expect(onReload).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("does not warn when a reload brings the same content", () => {
    const props = {
      messages: enMessages,
      onSave: () => undefined,
      onCancel: () => undefined,
    };
    const { rerender } = render(<RecipeEditor recipe={recipe} {...props} />);
    rerender(<RecipeEditor recipe={structuredClone(recipe)} {...props} />);
    expect(screen.queryByText(enMessages.recipeChangedElsewhere)).toBeNull();
  });
});

describe("moveRow", () => {
  const rows = ["a", "b", "#H1", "x", "y", "#H2", "z"].map((text) => ({
    id: text,
    text,
    ...(text.startsWith("#") ? { heading: true } : {}),
  }));
  const ids = (list: Array<{ id: string }>) => list.map((row) => row.id);

  it("moves a plain row on its own", () => {
    expect(ids(moveRow(rows, 3, 6))).toEqual([
      "a",
      "b",
      "#H1",
      "y",
      "#H2",
      "z",
      "x",
    ]);
  });

  it("moves a group heading with its ingredients, between groups", () => {
    expect(ids(moveRow(rows, 2, 6))).toEqual([
      "a",
      "b",
      "#H2",
      "z",
      "#H1",
      "x",
      "y",
    ]);
    // Dropped on the ungrouped rows at the top: it stops below them.
    expect(ids(moveRow(rows, 5, 0))).toEqual([
      "a",
      "b",
      "#H2",
      "z",
      "#H1",
      "x",
      "y",
    ]);
    // Dropped on one of its own ingredients: nothing moves.
    expect(ids(moveRow(rows, 2, 4))).toEqual(ids(rows));
  });
});
