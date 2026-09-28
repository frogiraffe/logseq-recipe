import { afterEach, describe, expect, it } from "vitest";
import { planRecipeConversion } from "../../src/application/convert-recipe";
import {
  findEnclosingRecipe,
  loadTrailingSectionSiblings,
} from "../../src/logseq/conversion-source";
import { defaultParseContext } from "../../src/parsing/context";

const originalLogseq = globalThis.logseq;

afterEach(() => {
  globalThis.logseq = originalLogseq;
});

describe("loadTrailingSectionSiblings", () => {
  it("folds flat section siblings of a pasted title block, stopping at the first non-section block", async () => {
    // Real shape Logseq stored for a pasted Turkish recipe on a journal page:
    // four flat siblings, the title block's metadata unindented, each
    // section's lines indented under its heading line.
    const blocks = [
      {
        id: 1,
        uuid: "title",
        title:
          "Mini Hoagie Rolls\nPorsiyon: 8 adet\nHazırlık: 30 dk\nKaynak: https://example.com/",
        children: [],
      },
      {
        id: 2,
        uuid: "ingredients",
        title: "Malzemeler\n  450 g ekmeklik un\n  290 g su (ılık)",
        children: [],
      },
      {
        id: 3,
        uuid: "steps",
        title: "Yapılış\n  Hamuru yoğur.\n    Kuruysa bekle.\n  Pişir.",
        children: [],
      },
      {
        id: 4,
        uuid: "notes",
        title: "Notlar\n  Çıtır olur.",
        children: [],
      },
      {
        id: 5,
        uuid: "journal",
        title: "Unrelated journal entry",
        children: [],
      },
      { id: 6, uuid: "steps-2", title: "Steps", children: [] },
    ];
    globalThis.logseq = {
      Editor: {
        getNextSiblingBlock: async (uuid: string) =>
          blocks[blocks.findIndex((block) => block.uuid === uuid) + 1] ?? null,
        getBlock: async (uuid: string) =>
          blocks.find((block) => block.uuid === uuid) ?? null,
      },
    } as unknown as typeof globalThis.logseq;

    const siblings = await loadTrailingSectionSiblings("title");
    expect(siblings.map((sibling) => sibling.id)).toEqual([
      "ingredients",
      "steps",
      "notes",
    ]);

    // The same planning Convert runs once the siblings are folded in.
    const plan = planRecipeConversion(
      { id: "title", title: blocks[0].title, children: siblings },
      defaultParseContext("en"),
    );
    if (plan.kind !== "split") throw new Error("expected a split");
    const outline = plan.outline;
    expect(outline.text).toBe("Mini Hoagie Rolls");
    expect(outline.children.map((child) => child.text)).toEqual([
      "Porsiyon: 8 adet",
      "Hazırlık: 30 dk",
      "Kaynak: https://example.com/",
      "Malzemeler",
      "Yapılış",
      "Notlar",
    ]);
    expect(outline.children[3].children).toHaveLength(2);
    expect(outline.children[4].children[0].children[0].text).toBe(
      "Kuruysa bekle.",
    );
  });
});

describe("loadTrailingSectionSiblings when Logseq has none to give", () => {
  it("treats a refused sibling lookup (a page) as no siblings", async () => {
    globalThis.logseq = {
      Editor: {
        getNextSiblingBlock: async () => {
          throw new Error("not a block");
        },
      },
    } as unknown as typeof globalThis.logseq;

    expect(await loadTrailingSectionSiblings("page-uuid")).toEqual([]);
  });
});

describe("findEnclosingRecipe", () => {
  // step-line -> steps-section -> recipe-1 (a block recipe) -> page 80;
  // loose-line -> page 81 (a journal); page-line -> page 82 (a page recipe).
  const blocks: Record<string | number, Record<string, unknown>> = {
    "step-line": {
      id: 6,
      uuid: "step-line",
      title: "Bake.",
      parent: { id: 5 },
      page: { id: 80 },
    },
    5: {
      id: 5,
      uuid: "steps-section",
      title: "Steps",
      parent: { id: 1 },
      page: { id: 80 },
    },
    1: {
      id: 1,
      uuid: "recipe-1",
      title: "Cookie",
      parent: { id: 80 },
      page: { id: 80 },
    },
    "loose-line": {
      id: 7,
      uuid: "loose-line",
      title: "Hello",
      parent: { id: 81 },
      page: { id: 81 },
    },
    "page-line": {
      id: 8,
      uuid: "page-line",
      title: "Mix.",
      parent: { id: 82 },
      page: { id: 82 },
    },
  };
  const pages: Record<number, Record<string, unknown>> = {
    80: { id: 80, uuid: "library", title: "Recipe Library" },
    81: { id: 81, uuid: "journal", title: "Sep 25th, 2026" },
    82: { id: 82, uuid: "page-recipe", title: "Soup" },
  };
  const recipes = new Set(["recipe-1", "page-recipe"]);

  function install() {
    globalThis.logseq = {
      Editor: {
        getBlock: async (id: string | number) => blocks[id] ?? null,
        getPage: async (id: number) => pages[id] ?? null,
        getBlockProperty: async (id: string, key: string) =>
          key === "recipe_marker" && recipes.has(id) ? true : undefined,
      },
    } as unknown as typeof globalThis.logseq;
  }

  it("finds the recipe a line belongs to", async () => {
    install();
    expect(await findEnclosingRecipe("step-line")).toEqual({
      id: "recipe-1",
      title: "Cookie",
    });
    expect(await findEnclosingRecipe("page-line")).toEqual({
      id: "page-recipe",
      title: "Soup",
    });
  });

  it("finds nothing for a block outside any recipe", async () => {
    install();
    expect(await findEnclosingRecipe("loose-line")).toBeNull();
  });
});
