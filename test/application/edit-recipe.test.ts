import { describe, expect, it } from "vitest";
import {
  commitRecipeEdit,
  IncompleteSaveError,
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
      added: [{ tempId: "new:1", text: "vanilla" }],
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
    listArchivedRecipeSummaries: async () => [],
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
    addStepChild: async (stepId, text) => {
      calls.push(`child:${stepId}:${text}`);
      return `child-${text}`;
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
    archiveRecipe: async () => undefined,
    restoreRecipe: async () => undefined,
    deleteArchivedRecipe: async () => undefined,
    validateRename: async () => undefined,
  };
  return { repository, calls };
}

describe("commitRecipeEdit", () => {
  it("adds, updates, renames, re-yields, and removes last", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      title: "New Title",
      baseYield: 6,
      yieldUnit: "cookies",
      ingredients: {
        added: [{ tempId: "new:1", text: "butter" }],
        updated: [{ id: "i1", text: "120 g flour" }],
        removed: ["i2"],
      },
      steps: { added: [], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
    });

    expect(calls).toEqual([
      "add:ingredients:butter",
      "update:i1:120 g flour",
      "rename:r1:New Title",
      `fields:r1:${JSON.stringify({ baseYield: 6, yieldUnit: "cookies" })}`,
      "remove:i2",
    ]);
  });

  const emptySections = {
    ingredients: { added: [], updated: [], removed: [] },
    steps: { added: [], updated: [], removed: [] },
    notes: { added: [], updated: [], removed: [] },
  };

  it.each([
    ["a blank title", { title: "  " }],
    ["a non-positive yield", { baseYield: 0 }],
    ["a negative time", { cookMinutes: -1 }],
    ["a duplicate order entry", { stepOrder: ["s1", "s1"] }],
  ])("writes nothing for %s", async (_label, fields) => {
    const { repository, calls } = fakeRepository();
    await expect(
      commitRecipeEdit(repository, "r1", { ...emptySections, ...fields }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(calls).toEqual([]);
  });

  it("writes nothing when an order still lists a removed item", async () => {
    const { repository, calls } = fakeRepository();
    await expect(
      commitRecipeEdit(repository, "r1", {
        ...emptySections,
        steps: { added: [], updated: [], removed: ["s2"] },
        stepOrder: ["s1", "s2"],
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(calls).toEqual([]);
  });

  it("writes nothing when the new title is refused", async () => {
    const { repository, calls } = fakeRepository();
    const refusal = new Error('A Logseq page named "Soup" already exists.');
    repository.validateRename = async () => {
      throw refusal;
    };
    await expect(
      commitRecipeEdit(repository, "r1", {
        ...emptySections,
        title: "Soup",
        ingredients: {
          added: [{ tempId: "new:1", text: "salt" }],
          updated: [],
          removed: ["i1"],
        },
      }),
    ).rejects.toBe(refusal);
    expect(calls).toEqual([]);
  });

  it("reports an incomplete save and keeps removals when a later write fails", async () => {
    const { repository, calls } = fakeRepository();
    const failure = new Error("Logseq write failed");
    repository.updateSectionItem = async () => {
      throw failure;
    };
    const saving = commitRecipeEdit(repository, "r1", {
      ...emptySections,
      ingredients: {
        added: [{ tempId: "new:1", text: "salt" }],
        updated: [{ id: "i1", text: "pepper" }],
        removed: ["i2"],
      },
    });
    await expect(saving).rejects.toBeInstanceOf(IncompleteSaveError);
    await expect(saving).rejects.toMatchObject({ cause: failure });
    expect(calls).toEqual(["add:ingredients:salt"]);
  });

  it("resolves same-named temp ids per list, not across lists", async () => {
    const { repository, calls } = fakeRepository();
    await commitRecipeEdit(repository, "r1", {
      ...emptySections,
      ingredients: {
        added: [{ tempId: "new:1", text: "salt" }],
        updated: [],
        removed: [],
      },
      steps: {
        added: [{ tempId: "new:1", text: "Stir" }],
        updated: [],
        removed: [],
      },
      ingredientOrder: ["i0", "new:1"],
      stepOrder: ["new:1", "s0"],
      stepChildren: [
        {
          stepId: "new:1",
          diff: {
            added: [{ tempId: "new:1", text: "Use a whisk" }],
            updated: [],
            removed: [],
          },
        },
      ],
    });
    expect(calls).toEqual([
      "add:ingredients:salt",
      "add:steps:Stir",
      "child:new-Stir:Use a whisk",
      "reorder:i0,new-salt",
      "reorder:new-Stir,s0",
    ]);
  });

  it("rejects attachments outside the graph's assets before writing", async () => {
    const { repository, calls } = fakeRepository();
    await expect(
      commitRecipeEdit(repository, "r1", {
        ...emptySections,
        stepChildren: [
          {
            stepId: "s1",
            diff: {
              added: [
                { tempId: "new:1", text: "![x](https://example.com/x.png)" },
              ],
              updated: [],
              removed: [],
            },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(calls).toEqual([]);
  });

  it("passes the original error through when the first write fails", async () => {
    const { repository } = fakeRepository();
    const failure = new Error("Logseq write failed");
    repository.addSectionItem = async () => {
      throw failure;
    };
    await expect(
      commitRecipeEdit(repository, "r1", {
        ...emptySections,
        steps: {
          added: [{ tempId: "new:1", text: "Stir" }],
          updated: [],
          removed: [],
        },
      }),
    ).rejects.toBe(failure);
  });

  it("skips rename/field writes when the patch omits them", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      ingredients: { added: [], updated: [], removed: [] },
      steps: {
        added: [{ tempId: "new:1", text: "Mix well." }],
        updated: [],
        removed: [],
      },
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

  it("maps a new item's temp id to its real created id before reordering", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      ingredients: {
        added: [{ tempId: "new:1", text: "butter" }],
        updated: [],
        removed: [],
      },
      steps: { added: [], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
      ingredientOrder: ["i1", "new:1"],
    });

    expect(calls).toEqual(["add:ingredients:butter", "reorder:i1,new-butter"]);
  });

  it("maps a new item's temp id to its real created id before applying a scale-mode change", async () => {
    const { repository, calls } = fakeRepository();

    await commitRecipeEdit(repository, "r1", {
      ingredients: {
        added: [{ tempId: "new:1", text: "salt" }],
        updated: [],
        removed: [],
      },
      steps: { added: [], updated: [], removed: [] },
      notes: { added: [], updated: [], removed: [] },
      ingredientScaleModeChanges: [{ id: "new:1", scaleMode: "fixed" }],
    });

    expect(calls).toEqual(["add:ingredients:salt", "scaleMode:new-salt:fixed"]);
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

  it("ignores removed items that simply vanished from the list", () => {
    expect(
      orderDiff([{ id: "a" }, { id: "b" }], [{ id: "a" }]),
    ).toBeUndefined();
  });

  it("reports the full order (temp ids included) when a new item is added, even without reordering", () => {
    expect(
      orderDiff(
        [{ id: "a" }, { id: "b" }],
        [{ id: "a" }, { id: "b" }, { id: "new:1" }],
      ),
    ).toEqual(["a", "b", "new:1"]);
  });

  it("reports the full order when a new item is inserted in the middle", () => {
    expect(
      orderDiff(
        [{ id: "a" }, { id: "b" }],
        [{ id: "a" }, { id: "new:1" }, { id: "b" }],
      ),
    ).toEqual(["a", "new:1", "b"]);
  });
});
