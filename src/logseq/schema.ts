import type { CoverReferenceCapability } from "./capabilities";
import { PROPERTY_KEYS } from "./property-keys";

export type RecipePropertyType =
  | "default"
  | "number"
  | "checkbox"
  | "url"
  | "node"
  | "json";

export interface RecipePropertyDefinition {
  key: string;
  type: RecipePropertyType;
  cardinality: "one" | "many";
  hide: boolean;
  public: boolean;
}

export interface RecipeSchemaCapabilities {
  jsonProperty: boolean;
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
  return [
    {
      key: PROPERTY_KEYS.recipeMarker,
      type: "checkbox",
      cardinality: "one",
      hide: true,
      public: false,
    },
    {
      key: PROPERTY_KEYS.schemaVersion,
      type: "number",
      cardinality: "one",
      hide: true,
      public: false,
    },
    {
      key: PROPERTY_KEYS.baseYield,
      type: "number",
      cardinality: "one",
      hide: false,
      public: true,
    },
    {
      key: PROPERTY_KEYS.yieldUnit,
      type: "default",
      cardinality: "one",
      hide: false,
      public: true,
    },
    {
      key: PROPERTY_KEYS.prepMinutes,
      type: "number",
      cardinality: "one",
      hide: false,
      public: true,
    },
    {
      key: PROPERTY_KEYS.chillMinutes,
      type: "number",
      cardinality: "one",
      hide: false,
      public: true,
    },
    {
      key: PROPERTY_KEYS.cookMinutes,
      type: "number",
      cardinality: "one",
      hide: false,
      public: true,
    },
    // "url" is a less common/newer Logseq property type than
    // default/number/checkbox, with no probe to confirm it's actually
    // supported by the runtime the plugin is loaded into - an unsupported
    // type here would make upsertProperty throw and block every mutation
    // (Create/Convert/Duplicate all call ensureRecipeSchema first), not
    // just source URL handling. Source is free text (a citation, not
    // necessarily a URL); only the render path (safeSourceUrl) restricts
    // what becomes a clickable http(s) link, which a native "url" property
    // type wouldn't help with anyway - a plain text property is the safer
    // choice across runtimes.
    {
      key: PROPERTY_KEYS.sourceUrl,
      type: "default",
      cardinality: "one",
      hide: false,
      public: true,
    },
    {
      key: PROPERTY_KEYS.recipeMeta,
      type: capabilities.jsonProperty ? "json" : "default",
      cardinality: "one",
      hide: true,
      public: false,
    },
    {
      key: PROPERTY_KEYS.ingredientMeta,
      type: "default",
      cardinality: "one",
      hide: true,
      public: false,
    },
    {
      key: PROPERTY_KEYS.coverRef,
      type: capabilities.coverReference === "asset-node" ? "node" : "default",
      cardinality: "one",
      hide: true,
      public: false,
    },
    {
      key: PROPERTY_KEYS.sectionRole,
      type: "default",
      cardinality: "one",
      hide: true,
      public: false,
    },
    {
      key: PROPERTY_KEYS.scaleMode,
      type: "default",
      cardinality: "one",
      hide: true,
      public: false,
    },
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
