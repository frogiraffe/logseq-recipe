import type { CoverReferenceCapability } from "./capabilities";
import { PROPERTY_KEYS } from "./property-keys";

export type RecipePropertyType = "default" | "number" | "checkbox" | "node";

export interface RecipePropertyDefinition {
  key: string;
  type: RecipePropertyType;
  cardinality: "one" | "many";
  hide: boolean;
  public: boolean;
}

export interface RecipeSchemaCapabilities {
  coverReference: CoverReferenceCapability;
}

export interface PropertySchemaEditor {
  upsertProperty(
    key: string,
    schema: {
      type: string;
      cardinality: "one" | "many";
      hide: boolean;
      public: boolean;
    },
  ): Promise<unknown>;
}

export function buildRecipeSchema(
  capabilities: RecipeSchemaCapabilities,
): RecipePropertyDefinition[] {
  // Plugin bookkeeping stays hidden; the recipe's own fields show on it.
  const hidden = (key: string, type: RecipePropertyType) => ({
    key,
    type,
    cardinality: "one" as const,
    hide: true,
    public: false,
  });
  const shown = (key: string, type: RecipePropertyType) => ({
    ...hidden(key, type),
    hide: false,
    public: true,
  });
  return [
    hidden(PROPERTY_KEYS.recipeMarker, "checkbox"),
    hidden(PROPERTY_KEYS.archivedMarker, "checkbox"),
    hidden(PROPERTY_KEYS.archivedAt, "number"),
    hidden(PROPERTY_KEYS.librarySectionRole, "default"),
    hidden(PROPERTY_KEYS.schemaVersion, "number"),
    shown(PROPERTY_KEYS.baseYield, "number"),
    shown(PROPERTY_KEYS.yieldUnit, "default"),
    shown(PROPERTY_KEYS.prepMinutes, "number"),
    shown(PROPERTY_KEYS.chillMinutes, "number"),
    shown(PROPERTY_KEYS.cookMinutes, "number"),
    // Plain text, not the newer "url" type: nothing probes that a runtime
    // supports it, and an unsupported type makes upsertProperty throw and
    // block every mutation (Create/Convert/Duplicate all ensure the schema
    // first). Source is free text anyway; only the render path
    // (safeSourceUrl) decides what becomes a clickable http(s) link.
    shown(PROPERTY_KEYS.sourceUrl, "default"),
    hidden(PROPERTY_KEYS.recipeMeta, "default"),
    hidden(PROPERTY_KEYS.ingredientMeta, "default"),
    hidden(
      PROPERTY_KEYS.coverRef,
      capabilities.coverReference === "asset-node" ? "node" : "default",
    ),
    hidden(PROPERTY_KEYS.sectionRole, "default"),
    hidden(PROPERTY_KEYS.scaleMode, "default"),
  ];
}

export async function ensureRecipeSchema(
  editor: PropertySchemaEditor,
  capabilities: RecipeSchemaCapabilities,
): Promise<void> {
  for (const definition of buildRecipeSchema(capabilities)) {
    await editor.upsertProperty(definition.key, {
      type: definition.type,
      cardinality: definition.cardinality,
      hide: definition.hide,
      public: definition.public,
    });
  }
}
