import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeCapabilities } from "../../src/logseq/capabilities";
import { createConversionInitialView } from "../../src/logseq/runtime-ui";

const runtimeContext = vi.hoisted(() => vi.fn());
vi.mock("../../src/logseq/ui-controller", () => ({
  createRuntimeUiContext: runtimeContext,
}));

const originalLogseq = globalThis.logseq;
const capabilities: RuntimeCapabilities = {
  dbGraph: true,
  hiddenProperty: true,
  numberProperty: true,
  textProperty: true,
  jsonProperty: false,
  dbChangeListener: true,
  stableMainUi: true,
  coverReference: "asset-path",
};

afterEach(() => {
  globalThis.logseq = originalLogseq;
  runtimeContext.mockReset();
});

describe("archived recipe conversion guard", () => {
  it.each(["block", "page"] as const)(
    "routes an archived %s root with a corrected ingredient to its existing recipe",
    async (kind) => {
      const correction = JSON.stringify({
        version: 1,
        locale: "en",
        sourceMeasurementSystem: "us",
        parsed: {
          rawText: "2 eggs",
          amount: { kind: "exact", value: 3 },
          unit: "egg",
          ingredientText: "large eggs, corrected",
          confidence: "exact",
        },
      });
      const values = new Map<string, unknown>([
        ["recipe-1:recipe_archived", true],
        ["ingredient-1:ingredient_meta", correction],
      ]);
      const writes: Array<{ id: string; key: string; value: unknown }> = [];
      const children = [
        {
          id: 2,
          uuid: "ingredients-section",
          title: "Ingredients",
          children: [
            { id: 3, uuid: "ingredient-1", title: "2 eggs", children: [] },
          ],
        },
      ];
      const root = {
        id: 1,
        uuid: "recipe-1",
        title: "Corrected Cookie",
        children,
      };
      globalThis.logseq = {
        Editor: {
          getBlock: async () => (kind === "block" ? root : null),
          getPage: async () =>
            kind === "page"
              ? { id: 1, uuid: root.uuid, name: root.title }
              : null,
          getPageBlocksTree: async () => children,
          getBlockProperty: async (id: string, key: string) =>
            values.get(`${id}:${key}`),
          upsertBlockProperty: async (
            id: string,
            key: string,
            value: unknown,
          ) => {
            writes.push({ id, key, value });
            values.set(`${id}:${key}`, value);
          },
        },
      } as unknown as typeof globalThis.logseq;
      runtimeContext.mockResolvedValue({
        defaultParserLocale: "en",
        defaultSourceMeasurementSystem: "us",
      });

      const view = await createConversionInitialView(capabilities, root.uuid);

      expect(view).toEqual({
        kind: "already-recipe",
        recipeId: "recipe-1",
        title: "Corrected Cookie",
      });
      expect(values.get("ingredient-1:ingredient_meta")).toBe(correction);
      expect(writes).toEqual([]);
      expect(values.has("recipe-1:recipe_marker")).toBe(false);
    },
  );
});
