import { describe, expect, it } from "vitest";
import {
  buildRecipeSchema,
  buildTaxonomySchema,
  ensureTaxonomySchema,
} from "../../src/logseq/schema";

function schemaByKey(
  coverReference: "asset-node" | "asset-path" | "unsupported",
) {
  return Object.fromEntries(
    buildRecipeSchema({ coverReference }).map((definition) => [
      definition.key,
      definition,
    ]),
  );
}

describe("recipe DB schema", () => {
  it("keeps technical metadata hidden and useful recipe metadata visible", () => {
    const schema = schemaByKey("asset-node");

    expect(schema.recipe_marker).toMatchObject({
      type: "checkbox",
      hide: true,
    });
    expect(schema.recipe_archived).toMatchObject({
      type: "checkbox",
      hide: true,
      public: false,
    });
    expect(schema.recipe_archived_at).toMatchObject({
      type: "number",
      hide: true,
      public: false,
    });
    expect(schema.recipe_library_section).toMatchObject({
      type: "default",
      hide: true,
      public: false,
    });
    expect(schema.schema_version).toMatchObject({ type: "number", hide: true });
    expect(schema.recipe_meta).toMatchObject({ type: "default", hide: true });
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
    // Plain text, not the "url" property type: source URL is already
    // validated at the application level, and a less common/unprobed
    // native type risks breaking every mutation across runtimes where it
    // isn't supported.
    expect(schema.source_url.type).toBe("default");
  });

  it("stores covers as plain asset paths unless asset nodes are available", () => {
    const schema = schemaByKey("asset-path");

    expect(schema.recipe_meta.type).toBe("default");
    expect(schema.ingredient_meta.type).toBe("default");
    expect(schema.cover_ref.type).toBe("default");
  });

  it("uses one hidden ingredient payload instead of duplicate amount/unit properties", () => {
    const keys = buildRecipeSchema({ coverReference: "asset-node" }).map(
      (definition) => definition.key,
    );

    expect(keys).toContain("ingredient_meta");
    expect(keys).not.toContain("amount");
    expect(keys).not.toContain("unit");
    expect(keys).not.toContain("duration");
    expect(keys).not.toContain("temperature");
  });
});

describe("category and tag properties", () => {
  const taxonomyKeys = (taxonomyProperties?: boolean) =>
    buildRecipeSchema({ coverReference: "asset-path", taxonomyProperties })
      .map((definition) => definition.key)
      .filter((key) => key === "recipe_categories" || key === "recipe_tags");

  it("are visible, page-valued sets", () => {
    for (const definition of buildTaxonomySchema()) {
      expect(definition).toMatchObject({
        type: "node",
        cardinality: "many",
        hide: false,
        public: true,
      });
    }
  });

  it("join the schema only once the graph accepted them", () => {
    expect(taxonomyKeys()).toEqual([]);
    expect(taxonomyKeys(false)).toEqual([]);
    expect(taxonomyKeys(true)).toEqual(["recipe_categories", "recipe_tags"]);
  });

  it("report a runtime that refuses them instead of failing", async () => {
    const refusing = {
      upsertProperty: async () => {
        throw new Error("unsupported property type");
      },
    };
    const accepted: string[] = [];
    const accepting = {
      upsertProperty: async (key: string) => {
        accepted.push(key);
      },
    };

    await expect(ensureTaxonomySchema(refusing)).resolves.toBe(false);
    await expect(ensureTaxonomySchema(accepting)).resolves.toBe(true);
    expect(accepted).toEqual(["recipe_categories", "recipe_tags"]);
  });
});
