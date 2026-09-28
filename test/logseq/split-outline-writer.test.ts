import { afterEach, describe, expect, it } from "vitest";
import {
  applyOutlineSplit,
  writeImportedRecipe,
} from "../../src/logseq/split-outline-writer";

const originalLogseq = globalThis.logseq;

afterEach(() => {
  globalThis.logseq = originalLogseq;
});

describe("applyOutlineSplit", () => {
  it("rewrites the root block's own content and inserts nested children in order", async () => {
    const updates: Array<{ id: string; content: string }> = [];
    const inserts: Array<{
      anchor: string;
      content: string;
      sibling: boolean;
    }> = [];
    let nextId = 0;
    let exitEditingModeCalls = 0;

    globalThis.logseq = {
      Editor: {
        updateBlock: async (id: string, content: string) => {
          updates.push({ id, content });
        },
        insertBlock: async (
          anchor: string,
          content: string,
          opts?: { sibling?: boolean },
        ) => {
          inserts.push({
            anchor,
            content,
            sibling: Boolean(opts?.sibling),
          });
          nextId += 1;
          return { uuid: `new-${nextId}` };
        },
        exitEditingMode: async () => {
          exitEditingModeCalls += 1;
        },
      },
    } as unknown as typeof globalThis.logseq;

    const ids = await applyOutlineSplit("root-uuid", {
      text: "Classic Banana Bread",
      children: [
        { text: "Yield: 10 slices", children: [] },
        {
          text: "Ingredients",
          children: [
            { text: "3 ripe bananas", children: [] },
            { text: "120 g butter", children: [] },
          ],
        },
      ],
    });

    expect(updates).toEqual([
      { id: "root-uuid", content: "Classic Banana Bread" },
    ]);
    // Each written block by the preview id outlineToSource(outline,
    // "root-uuid") gave its line, so the previewed conversion can land.
    expect(Object.fromEntries(ids)).toEqual({
      "root-uuid": "root-uuid",
      "root-uuid.0": "new-1",
      "root-uuid.1": "new-2",
      "root-uuid.1.0": "new-3",
      "root-uuid.1.1": "new-4",
    });

    // Yield is the first child of the root; Ingredients is a sibling
    // chained off Yield (not another child of the root), guaranteeing
    // order regardless of Logseq's own default child-insertion position.
    expect(inserts[0]).toEqual({
      anchor: "root-uuid",
      content: "Yield: 10 slices",
      sibling: false,
    });
    expect(inserts[1]).toEqual({
      anchor: "new-1",
      content: "Ingredients",
      sibling: true,
    });
    // Ingredients' own children nest under its newly-created uuid.
    expect(inserts[2]).toEqual({
      anchor: "new-2",
      content: "3 ripe bananas",
      sibling: false,
    });
    expect(inserts[3]).toEqual({
      anchor: "new-3",
      content: "120 g butter",
      sibling: true,
    });
    // insertBlock leaves the last-created block in active editing mode -
    // exactly the state a real Logseq user's own typing never leaves
    // behind, since typing blurs/settles before Convert ever runs. Left
    // uncleared, property writes moments later during conversion commit
    // silently fail to persist on these blocks.
    expect(exitEditingModeCalls).toBe(1);
  });

  it("removes the stale flat chunk blocks before inserting the freshly-split tree", async () => {
    const removed: string[] = [];
    const inserts: string[] = [];

    globalThis.logseq = {
      Editor: {
        updateBlock: async () => undefined,
        removeBlock: async (id: string) => {
          removed.push(id);
        },
        insertBlock: async (_anchor: string, content: string) => {
          inserts.push(content);
          return { uuid: `new-${inserts.length}` };
        },
        exitEditingMode: async () => undefined,
      },
    } as unknown as typeof globalThis.logseq;

    await applyOutlineSplit(
      "root-uuid",
      {
        text: "Classic Banana Bread",
        children: [{ text: "Ingredients", children: [] }],
      },
      ["chunk-1", "chunk-2", "chunk-3"],
    );

    expect(removed).toEqual(["chunk-1", "chunk-2", "chunk-3"]);
    expect(inserts).toEqual(["Ingredients"]);
  });

  it("throws instead of silently continuing when Logseq returns no uuid for a new block", async () => {
    globalThis.logseq = {
      Editor: {
        updateBlock: async () => undefined,
        insertBlock: async () => null,
      },
    } as unknown as typeof globalThis.logseq;

    await expect(
      applyOutlineSplit("root-uuid", {
        text: "Title",
        children: [{ text: "Child", children: [] }],
      }),
    ).rejects.toThrow("Logseq did not return the newly created block.");
  });

  it("keeps the original blocks when inserting the new tree fails", async () => {
    const removed: string[] = [];
    const updates: string[] = [];
    globalThis.logseq = {
      Editor: {
        updateBlock: async (_id: string, content: string) => {
          updates.push(content);
        },
        removeBlock: async (id: string) => {
          removed.push(id);
        },
        insertBlock: async () => {
          throw new Error("insert failed");
        },
      },
    } as unknown as typeof globalThis.logseq;

    await expect(
      applyOutlineSplit(
        "root-uuid",
        { text: "Title", children: [{ text: "Child", children: [] }] },
        ["chunk-1"],
      ),
    ).rejects.toThrow("insert failed");
    expect(removed).toEqual([]);
    expect(updates).toEqual([]);
  });
});

describe("writeImportedRecipe", () => {
  it("adds the recipe at the end of the library's Recipes section and reports each block's preview id", async () => {
    const writes: string[] = [];
    let nextId = 0;
    globalThis.logseq = {
      Editor: {
        getPage: async () => ({ uuid: "library-page" }),
        getPageBlocksTree: async () => [
          { uuid: "recipes-section", id: 1, title: "Recipes" },
          { uuid: "archived-section", id: 2, title: "Archived" },
        ],
        getBlockProperty: async (id: string) =>
          id === "recipes-section" ? "recipes" : "archived",
        insertBlock: async (
          anchor: string,
          content: string,
          opts?: { sibling?: boolean; end?: boolean },
        ) => {
          const where = opts?.sibling
            ? "after"
            : opts?.end
              ? "end of"
              : "under";
          writes.push(`${where} ${anchor} > ${content}`);
          nextId += 1;
          return { uuid: `new-${nextId}` };
        },
        exitEditingMode: async () => {
          writes.push("exit");
        },
      },
    } as unknown as typeof globalThis.logseq;

    const ids = await writeImportedRecipe(
      {
        text: "Pancakes",
        children: [
          { text: "Servings: 4", children: [] },
          {
            text: "Ingredients",
            children: [
              { text: "200 g flour", children: [] },
              { text: "1 egg", children: [] },
            ],
          },
        ],
      },
      "import",
    );

    // Each written block by the preview id outlineToSource gave its line.
    expect(Object.fromEntries(ids)).toEqual({
      import: "new-1",
      "import.0": "new-2",
      "import.1": "new-3",
      "import.1.0": "new-4",
      "import.1.1": "new-5",
    });
    expect(writes).toEqual([
      "end of recipes-section > Pancakes",
      "under new-1 > Servings: 4",
      "after new-2 > Ingredients",
      "under new-3 > 200 g flour",
      "after new-4 > 1 egg",
      "exit",
    ]);
  });
});
