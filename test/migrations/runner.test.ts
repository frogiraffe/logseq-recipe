import { describe, expect, it, vi } from "vitest";
import {
  FutureRecipeSchemaError,
  runRecipeMigrations,
} from "../../src/migrations/runner";

describe("recipe migration runner", () => {
  it("migrates legacy metadata to v1 exactly once", async () => {
    const values = new Map<string, unknown>([
      ["schema_version", 0],
      ["recipe_meta", JSON.stringify({ categories: ["Dessert"] })],
    ]);
    const writes = vi.fn(async (_id: string, key: string, value: unknown) => {
      values.set(key, value);
    });
    const host = {
      getBlockProperty: async (_id: string, key: string) => values.get(key),
      upsertBlockProperty: writes,
    };

    await runRecipeMigrations(host, "recipe-1");
    const firstWriteCount = writes.mock.calls.length;
    await runRecipeMigrations(host, "recipe-1");

    expect(values.get("schema_version")).toBe(1);
    expect(firstWriteCount).toBeGreaterThan(0);
    expect(writes.mock.calls.length).toBe(firstWriteCount);
  });

  it("refuses a future schema without writing anything", async () => {
    const writes = vi.fn();
    const host = {
      getBlockProperty: async (_id: string, key: string) =>
        key === "schema_version" ? 99 : null,
      upsertBlockProperty: writes,
    };

    await expect(runRecipeMigrations(host, "recipe-1")).rejects.toBeInstanceOf(
      FutureRecipeSchemaError,
    );
    expect(writes).not.toHaveBeenCalled();
  });

  it("finishes an interrupted migration on the next load", async () => {
    const values = new Map<string, unknown>([
      ["recipe_meta", JSON.stringify({ categories: ["Dessert"], tags: 3 })],
    ]);
    let failVersionWrite = true;
    const host = {
      getBlockProperty: async (_id: string, key: string) => values.get(key),
      upsertBlockProperty: async (_id: string, key: string, value: unknown) => {
        if (key === "schema_version" && failVersionWrite) {
          throw new Error("Logseq went away");
        }
        values.set(key, value);
      },
    };

    await expect(runRecipeMigrations(host, "recipe-1")).rejects.toThrow();
    expect(values.get("schema_version")).toBeUndefined();

    failVersionWrite = false;
    expect(await runRecipeMigrations(host, "recipe-1")).toBe(1);
    expect(JSON.parse(values.get("recipe_meta") as string)).toEqual({
      categories: ["Dessert"],
      tags: [],
      ingredientConversionOverrides: [],
    });
  });
});
