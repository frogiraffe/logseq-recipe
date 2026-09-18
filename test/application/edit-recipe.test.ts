import { describe, expect, it } from "vitest";
import {
  commitRecipeEdit,
  orderDiff,
  sectionDiff,
} from "../../src/application/edit-recipe";
import type { RecipeRepository } from "../../src/application/recipe-repository";

describe("sectionDiff", () => {
  it("classifies new items, text edits, and removals", () => {
    const diff = sectionDiff(
      [
        { id: "a", text: "flour" },
        { id: "b", text: "sugar" },
        { id: "c", text: "salt" },
      ],
      [
        { id: "a", text: "flour" },
        { id: "b", text: "brown sugar" },
        { id: "new:1", text: "vanilla" },
      ],
    );

    expect(diff).toEqual({
      added: ["vanilla"],
      updated: [{ id: "b", text: "brown sugar" }],
      removed: ["c"],
    });
  });

  it("ignores blank new/edited text and trims edits", () => {
    const diff = sectionDiff(
      [{ id: "a", text: "flour" }],
      [
        { id: "a", text: "  flour  " },
        { id: "new:1", text: "   " },
      ],
    );

    expect(diff).toEqual({ added: [], updated: [], removed: [] });
  });
});

function fakeRepository() {
  const calls: string[] = [];
  const repository: RecipeRepository = {
    getRecipe: async () => null,
    createRecipe: async () => {
      throw new Error("unused");
    },
    duplicateRecipe: async () => {
      throw new Error("unused");
    },
    markExistingRecipe: async () => undefined,
    listRecipeSummaries: async () => [],
    validateRecipe: async () => ({ valid: true, issues: [] }),
    watchRecipe: () => () => undefined,
    renameRecipe: async (id, title) => {
      calls.push(`rename:${id}:${title}`);
    },
    updateRecipeFields: async (id, patch) => {
      calls.push(`fields:${id}:${JSON.stringify(patch)}`);
    },
    addSectionItem: async (_id, role, text) => {
      calls.push(`add:${role}:${text}`);
      return `new-${text}`;
    },
    updateSectionItem: async (itemId, text) => {
      calls.push(`update:${itemId}:${text}`);
    },
    removeSectionItem: async (itemId) => {
      calls.push(`remove:${itemId}`);
    },
    setIngredientScaleMode: async (id, scaleMode) => {
      calls.push(`scaleMode:${id}:${scaleMode}`);
    },
    reorderSectionItems: async (orderedIds) => {
      calls.push(`reorder:${orderedIds.join(",")}`);
    },
    deleteRecipe: async (id) => {
      calls.push(`delete:${id}`);
    },
  };
  return { repository, calls };
}

describe("commitRecipeEdit", () => {
  it("renames, re-yields, and applies each section's diff in remove/update/add order", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      title: "New Title",
      baseYield: 6,
      yieldUnit: "cookies",
      ingredients: {
        added: ["butter"],
        updated: [{ id: "i1", text: "120 g flour" }],
        removed: ["i2"],
      },
      steps: { added: [], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
    });

    expect(calls).toEqual([
      "rename:r1:New Title",
      `fields:r1:${JSON.stringify({ baseYield: 6, yieldUnit: "cookies" })}`,
      "remove:i2",
      "update:i1:120 g flour",
      "add:ingredients:butter",
    ]);
  });

  it("skips rename/field writes when the patch omits them", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      ingredients: { added: [], updated: [], removed: [] },
      steps: { added: ["Mix well."], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
    });

    expect(calls).toEqual(["add:steps:Mix well."]);
  });

  it("writes prep/chill/cook/source alongside yield when provided", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      prepMinutes: 15,
      cookMinutes: 20,
      sourceUrl: "https://example.com/recipe",
      ingredients: { added: [], updated: [], removed: [] },
      steps: { added: [], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
    });

    expect(calls).toEqual([
      `fields:r1:${JSON.stringify({
        prepMinutes: 15,
        cookMinutes: 20,
        sourceUrl: "https://example.com/recipe",
      })}`,
    ]);
  });

  it("applies ingredient scale-mode changes after section diffs", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      ingredients: { added: [], updated: [], removed: [] },
      steps: { added: [], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
      ingredientScaleModeChanges: [{ id: "i1", scaleMode: "fixed" }],
    });

    expect(calls).toEqual(["scaleMode:i1:fixed"]);
  });

  it("reorders each section independently when an order is supplied", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      ingredients: { added: [], updated: [], removed: [] },
      steps: { added: [], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
      ingredientOrder: ["i2", "i1"],
      noteOrder: ["n2", "n1"],
    });

    expect(calls).toEqual(["reorder:i2,i1", "reorder:n2,n1"]);
  });
});

describe("orderDiff", () => {
  it("returns the existing-item order when it changed", () => {
    expect(
      orderDiff(
        [{ id: "a" }, { id: "b" }, { id: "c" }],
        [{ id: "b" }, { id: "a" }, { id: "c" }],
      ),
    ).toEqual(["b", "a", "c"]);
  });

  it("returns undefined when the order is unchanged", () => {
    expect(
      orderDiff([{ id: "a" }, { id: "b" }], [{ id: "a" }, { id: "b" }]),
    ).toBeUndefined();
  });

  it("ignores newly added items and removed items", () => {
    expect(
      orderDiff([{ id: "a" }, { id: "b" }], [{ id: "a" }, { id: "new:1" }]),
    ).toBeUndefined();
  });
});
