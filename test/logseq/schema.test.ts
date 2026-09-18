import { describe, expect, it } from "vitest";
import { buildRecipeSchema } from "../../src/logseq/schema";

function schemaByKey(options: {
  jsonProperty: boolean;
  coverReference: "asset-node" | "asset-path" | "unsupported";
}) {
  return Object.fromEntries(
    buildRecipeSchema(options).map((definition) => [
      definition.key,
      definition,
    ]),
  );
}

describe("recipe DB schema", () => {
  it("keeps technical metadata hidden and useful recipe metadata visible", () => {
    const schema = schemaByKey({
      jsonProperty: true,
      coverReference: "asset-node",
    });

    expect(schema.recipe_marker).toMatchObject({
      type: "checkbox",
      hide: true,
    });
    expect(schema.schema_version).toMatchObject({ type: "number", hide: true });
    expect(schema.recipe_meta).toMatchObject({ type: "json", hide: true });
    expect(schema.ingredient_meta).toMatchObject({
      type: "default",
      hide: true,
      public: false,
    });
    expect(schema.cover_ref).toMatchObject({ type: "node", hide: true });
    expect(schema.section_role).toMatchObject({ type: "default", hide: true });
    expect(schema.scale_mode).toMatchObject({ type: "default", hide: true });

    expect(schema.base_yield.hide).toBe(false);
    expect(schema.yield_unit.hide).toBe(false);
    expect(schema.prep_minutes.hide).toBe(false);
    expect(schema.chill_minutes.hide).toBe(false);
    expect(schema.cook_minutes.hide).toBe(false);
    expect(schema.source_url.hide).toBe(false);
  });

  it("falls back to string-compatible hidden properties when richer capabilities are unavailable", () => {
    const schema = schemaByKey({
      jsonProperty: false,
      coverReference: "asset-path",
    });

    expect(schema.recipe_meta.type).toBe("default");
    expect(schema.ingredient_meta.type).toBe("default");
    expect(schema.cover_ref.type).toBe("default");
  });

  it("uses one hidden ingredient payload instead of duplicate amount/unit properties", () => {
    const keys = buildRecipeSchema({
      jsonProperty: true,
      coverReference: "asset-node",
    }).map((definition) => definition.key);

    expect(keys).toContain("ingredient_meta");
    expect(keys).not.toContain("amount");
    expect(keys).not.toContain("unit");
    expect(keys).not.toContain("duration");
    expect(keys).not.toContain("temperature");
  });
});
