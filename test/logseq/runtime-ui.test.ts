import { afterEach, describe, expect, it } from "vitest";
import {
  isAlreadyDraftRecipe,
  loadConversionRoot,
} from "../../src/logseq/runtime-ui";

const originalLogseq = globalThis.logseq;

afterEach(() => {
  globalThis.logseq = originalLogseq;
});

describe("loadConversionRoot", () => {
  it("targets the current page for a palette invocation, never the focused block", async () => {
    let getCurrentPageCalls = 0;
    globalThis.logseq = {
      Editor: {
        // Deliberately no getCurrentBlock: if production code calls it for a
        // palette invocation (no explicit uuid), this test fails loudly
        // instead of silently converting the wrong subtree.
        getCurrentPage: async () => {
          getCurrentPageCalls += 1;
          return { uuid: "page-1" };
        },
        getPage: async (id: string) =>
          id === "page-1"
            ? { id: 1, uuid: "page-1", name: "Chocolate Cookie" }
            : null,
        getPageBlocksTree: async (id: string) =>
          id === "page-1"
            ? [
                {
                  id: 2,
                  uuid: "ingredients",
                  title: "Ingredients",
                  children: [],
                },
              ]
            : [],
      },
    } as unknown as typeof globalThis.logseq;

    const source = await loadConversionRoot(undefined);

    expect(getCurrentPageCalls).toBe(1);
    expect(source?.id).toBe("page-1");
    expect(source?.title).toBe("Chocolate Cookie");
    expect(source?.children).toHaveLength(1);
  });

  it("targets the explicit block/page for a context-menu invocation, ignoring the current page", async () => {
    let getCurrentPageCalls = 0;
    globalThis.logseq = {
      Editor: {
        getCurrentPage: async () => {
          getCurrentPageCalls += 1;
          return { uuid: "page-1" };
        },
        getBlock: async (id: string) =>
          id === "sub-block"
            ? {
                id: 5,
                uuid: "sub-block",
                title: "Leftover soup",
                children: [
                  {
                    id: 6,
                    uuid: "ingredients",
                    title: "Ingredients",
                    children: [],
                  },
                ],
              }
            : null,
        getPage: async () => null,
        getPageBlocksTree: async () => [],
      },
    } as unknown as typeof globalThis.logseq;

    const source = await loadConversionRoot("sub-block");

    expect(getCurrentPageCalls).toBe(0);
    expect(source?.id).toBe("sub-block");
    expect(source?.title).toBe("Leftover soup");
  });

  it("excludes a ref-property's own hidden value-carrier block from the conversion source", async () => {
    globalThis.logseq = {
      Editor: {
        getCurrentPage: async () => ({ uuid: "page-1" }),
        getPage: async (id: string) =>
          id === "page-1" ? { id: 1, uuid: "page-1", name: "Cookie" } : null,
        getPageBlocksTree: async (id: string) =>
          id === "page-1"
            ? [
                {
                  id: 2,
                  uuid: "ingredients",
                  title: "Ingredients",
                  children: [
                    { id: 3, uuid: "i1", title: "100 g flour", children: [] },
                    {
                      id: 4,
                      uuid: "ingredients-value-block",
                      title: "ingredients",
                      "created-from-property": { id: 99 },
                      children: [],
                    },
                  ],
                },
              ]
            : [],
      },
    } as unknown as typeof globalThis.logseq;

    const source = await loadConversionRoot(undefined);

    expect(source?.children).toHaveLength(1);
    expect(source?.children[0].children).toEqual([
      { id: "i1", title: "100 g flour", children: [] },
    ]);
  });
});

describe("isAlreadyDraftRecipe", () => {
  it("detects a page that already carries the recipe marker", async () => {
    globalThis.logseq = {
      Editor: {
        getBlockProperty: async (_id: string, key: string) =>
          key === "recipe_marker" ? true : undefined,
      },
    } as unknown as typeof globalThis.logseq;

    await expect(isAlreadyDraftRecipe("page-1")).resolves.toBe(true);
  });

  it("treats plain content with no marker as convertible", async () => {
    globalThis.logseq = {
      Editor: {
        getBlockProperty: async () => undefined,
      },
    } as unknown as typeof globalThis.logseq;

    await expect(isAlreadyDraftRecipe("page-1")).resolves.toBe(false);
  });
});
