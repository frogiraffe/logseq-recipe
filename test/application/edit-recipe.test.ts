import { describe, expect, it } from "vitest";
import {
  commitRecipeEdit,
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
    markExistingRecipe: async () => undefined,
    listRecipeSummaries: async () => [],
    validateRecipe: async () => ({ valid: true, issues: [] }),
    watchRecipe: () => () => undefined,
    renameRecipe: async (id, title) => {
      calls.push(`rename:${id}:${title}`);
    },
    updateRecipeYield: async (id, patch) => {
      calls.push(`yield:${id}:${patch.baseYield}:${patch.yieldUnit}`);
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
      "yield:r1:6:cookies",
      "remove:i2",
      "update:i1:120 g flour",
      "add:ingredients:butter",
    ]);
  });

  it("skips rename/yield writes when the patch omits them", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      ingredients: { added: [], updated: [], removed: [] },
      steps: { added: ["Mix well."], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
    });

    expect(calls).toEqual(["add:steps:Mix well."]);
  });
});
