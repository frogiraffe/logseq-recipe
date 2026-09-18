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

    await runRecipeMigrations(host, "recipe-1", { jsonProperty: false });
    const firstWriteCount = writes.mock.calls.length;
    await runRecipeMigrations(host, "recipe-1", { jsonProperty: false });

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

    await expect(
      runRecipeMigrations(host, "recipe-1", { jsonProperty: true }),
    ).rejects.toBeInstanceOf(FutureRecipeSchemaError);
    expect(writes).not.toHaveBeenCalled();
  });
});
