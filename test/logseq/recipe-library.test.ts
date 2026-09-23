import { describe, expect, it } from "vitest";
import {
  ensureRecipeLibrary,
  moveRecipeToLibrarySection,
  type RecipeLibraryHost,
} from "../../src/logseq/recipe-library";

interface FakeBlock {
  uuid: string;
  id: number;
  title: string;
  children?: FakeBlock[];
}

function fakeLibraryHost(
  options: {
    page?: Record<string, unknown>;
    children?: FakeBlock[];
    properties?: Record<string, unknown>;
  } = {},
) {
  let page = options.page ?? null;
  const children = options.children ?? [];
  const properties = new Map(Object.entries(options.properties ?? {}));
  const createdPages: string[] = [];
  const restoredPages: string[] = [];
  const appended: Array<{ title: string; page: string }> = [];
  const moves: Array<[string, string, { children: true }]> = [];
  const removed: string[] = [];

  const host: RecipeLibraryHost = {
    getPage: async () => page,
    createPage: async (title) => {
      createdPages.push(title);
      page = { uuid: "library-page", id: 0, name: title };
      return page;
    },
    restorePage: async (title) => {
      restoredPages.push(title);
      return page;
    },
    getPageBlocksTree: async () => children,
    appendBlockInPage: async (pageTitle, title) => {
      appended.push({ page: pageTitle, title });
      const block = {
        uuid: `block-${appended.length}`,
        id: appended.length + 10,
        title,
      };
      children.push(block);
      return block;
    },
    getBlockProperty: async (id, key) => properties.get(`${id}:${key}`),
    upsertBlockProperty: async (id, key, value) => {
      properties.set(`${id}:${key}`, value);
    },
    moveBlock: async (source, target, opts) => {
      moves.push([source, target, opts]);
    },
  };

  return {
    host,
    createdPages,
    restoredPages,
    appended,
    moves,
    removed,
    properties,
  };
}

describe("Recipe Library", () => {
  it("creates one library page and marks its two sections", async () => {
    const fake = fakeLibraryHost();
    await expect(ensureRecipeLibrary(fake.host)).resolves.toEqual({
      recipes: "block-1",
      archived: "block-2",
    });
    await ensureRecipeLibrary(fake.host);
    expect(fake.createdPages).toEqual(["Recipe Library"]);
    expect(fake.appended.map(({ title }) => title)).toEqual([
      "Recipes",
      "Archived",
    ]);
    expect(fake.properties.get("block-1:recipe_library_section")).toBe(
      "recipes",
    );
    expect(fake.properties.get("block-2:recipe_library_section")).toBe(
      "archived",
    );
  });

  it("reuses marked sections and preserves unrelated user blocks", async () => {
    const fake = fakeLibraryHost({
      page: { uuid: "library-page", name: "Recipe Library" },
      children: [
        { uuid: "user-block", id: 1, title: "My content" },
        { uuid: "recipes", id: 2, title: "Renamed by user" },
        { uuid: "archived", id: 3, title: "Also renamed" },
      ],
      properties: {
        "recipes:recipe_library_section": "recipes",
        "archived:recipe_library_section": "archived",
      },
    });
    await expect(ensureRecipeLibrary(fake.host)).resolves.toEqual({
      recipes: "recipes",
      archived: "archived",
    });
    expect(fake.appended).toEqual([]);
    expect(fake.removed).toEqual([]);
  });

  it("reads library section markers concurrently", async () => {
    const fake = fakeLibraryHost({
      page: { uuid: "library-page", name: "Recipe Library" },
      children: [
        { uuid: "recipes", id: 2, title: "Recipes" },
        { uuid: "archived", id: 3, title: "Archived" },
      ],
      properties: {
        "recipes:recipe_library_section": "recipes",
        "archived:recipe_library_section": "archived",
      },
    });
    const originalGetBlockProperty = fake.host.getBlockProperty;
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake.host.getBlockProperty = async (id, key) => {
      started.push(id);
      await gate;
      return originalGetBlockProperty(id, key);
    };

    const loading = ensureRecipeLibrary(fake.host);
    while (started.length === 0) await Promise.resolve();
    try {
      expect(started).toEqual(["recipes", "archived"]);
    } finally {
      release();
      await loading;
    }
  });

  it("restores the exact recycled library page without removing its content", async () => {
    const fake = fakeLibraryHost({
      page: {
        uuid: "library-page",
        name: "Recipe Library",
        ":logseq.property/deleted-at": 123,
      },
      children: [{ uuid: "user-block", id: 1, title: "Keep me" }],
    });
    await ensureRecipeLibrary(fake.host);
    expect(fake.restoredPages).toEqual(["Recipe Library"]);
    expect(fake.createdPages).toEqual([]);
    expect(fake.removed).toEqual([]);
  });

  it("ignores section markers nested under unrelated blocks", async () => {
    const fake = fakeLibraryHost({
      page: { uuid: "library-page", name: "Recipe Library" },
      children: [
        {
          uuid: "user-block",
          id: 1,
          title: "My content",
          children: [{ uuid: "nested", id: 2, title: "Recipes" }],
        },
      ],
      properties: { "nested:recipe_library_section": "recipes" },
    });
    await ensureRecipeLibrary(fake.host);
    expect(fake.appended.map(({ title }) => title)).toEqual([
      "Recipes",
      "Archived",
    ]);
  });

  it("moves a recipe beneath the requested marked section", async () => {
    const fake = fakeLibraryHost();
    await moveRecipeToLibrarySection(fake.host, "recipe-1", "archived");
    expect(fake.moves).toEqual([["recipe-1", "block-2", { children: true }]]);
  });
});
