import { encodeIngredientMeta } from "../application/ingredient-meta";
import {
  decodeRecipeMeta,
  emptyRecipeMeta,
  encodeRecipeMeta,
} from "../application/recipe-meta";
import type {
  ExistingRecipeStructure,
  NewRecipeInput,
  RecipeSectionRole,
} from "../application/types";
import {
  RECIPE_SCHEMA_VERSION,
  type RecipeLocale,
  type RecipeMeta,
} from "../domain/recipe";
import { FutureRecipeSchemaError } from "../migrations/runner";
import { defaultParseContext } from "../parsing/context";
import { ingredientParseContext } from "../parsing/detect-locale";
import { propertyNumber, unwrapBlockPropertyValue } from "./block-reader";
import { PROPERTY_KEYS } from "./property-keys";
import { ensureRecipeLibrary, type RecipeLibraryHost } from "./recipe-library";

export interface RecipeAuthoringHost extends RecipeLibraryHost {
  insertBlock(
    parentId: string,
    content: string,
    options: { sibling: false; end: true },
  ): Promise<unknown>;
  removeBlockProperty(id: string, key: string): Promise<unknown>;
}

export interface AuthoringCapabilities {
  jsonProperty: boolean;
}

export interface CreatedRecipeStructure {
  rootId: string;
  sections: Record<RecipeSectionRole, string>;
}

const SECTION_TITLES: Record<
  RecipeLocale,
  Record<RecipeSectionRole, string>
> = {
  en: { ingredients: "Ingredients", steps: "Steps", notes: "Notes" },
  tr: { ingredients: "Malzemeler", steps: "Yapılış", notes: "Notlar" },
  fr: { ingredients: "Ingrédients", steps: "Préparation", notes: "Notes" },
  de: { ingredients: "Zutaten", steps: "Zubereitung", notes: "Notizen" },
  es: { ingredients: "Ingredientes", steps: "Preparación", notes: "Notas" },
};

function identity(value: unknown): string {
  if (!value || typeof value !== "object") {
    throw new Error(
      "Logseq did not return an entity for the authoring operation.",
    );
  }
  const entity = value as Record<string, unknown>;
  if (typeof entity.uuid === "string") return entity.uuid;
  if (typeof entity.id === "string" || typeof entity.id === "number") {
    return String(entity.id);
  }
  throw new Error("Logseq entity has no stable id/uuid.");
}

function metaStorageValue(
  meta: RecipeMeta,
  capabilities: AuthoringCapabilities,
): unknown {
  return capabilities.jsonProperty ? meta : encodeRecipeMeta(meta);
}

async function writeRootMetadata(
  host: RecipeAuthoringHost,
  rootId: string,
  meta: RecipeMeta,
  capabilities: AuthoringCapabilities,
): Promise<void> {
  await host.upsertBlockProperty(
    rootId,
    PROPERTY_KEYS.schemaVersion,
    RECIPE_SCHEMA_VERSION,
  );
  await host.upsertBlockProperty(
    rootId,
    PROPERTY_KEYS.recipeMeta,
    metaStorageValue(meta, capabilities),
  );
}

// The marker is what makes a root discoverable as a recipe (listRecipeIds
// queries by its presence). Writing it only after every other structural
// write succeeds means a failure partway through Create/Convert leaves an
// incomplete root that the plugin still treats as "not a recipe" rather
// than a broken one it might try to load.
async function markRecipeComplete(
  host: RecipeAuthoringHost,
  rootId: string,
): Promise<void> {
  await host.upsertBlockProperty(rootId, PROPERTY_KEYS.recipeMarker, true);
}

export async function writeOptionalRootFields(
  host: RecipeAuthoringHost,
  rootId: string,
  structure: Pick<
    ExistingRecipeStructure,
    | "baseYield"
    | "yieldUnit"
    | "prepMinutes"
    | "chillMinutes"
    | "cookMinutes"
    | "sourceUrl"
  >,
): Promise<void> {
  if (structure.baseYield !== undefined) {
    await host.upsertBlockProperty(
      rootId,
      PROPERTY_KEYS.baseYield,
      structure.baseYield,
    );
  }
  if (structure.yieldUnit?.trim()) {
    await host.upsertBlockProperty(
      rootId,
      PROPERTY_KEYS.yieldUnit,
      structure.yieldUnit.trim(),
    );
  }
  if (structure.prepMinutes !== undefined) {
    await host.upsertBlockProperty(
      rootId,
      PROPERTY_KEYS.prepMinutes,
      structure.prepMinutes,
    );
  }
  if (structure.chillMinutes !== undefined) {
    await host.upsertBlockProperty(
      rootId,
      PROPERTY_KEYS.chillMinutes,
      structure.chillMinutes,
    );
  }
  if (structure.cookMinutes !== undefined) {
    await host.upsertBlockProperty(
      rootId,
      PROPERTY_KEYS.cookMinutes,
      structure.cookMinutes,
    );
  }
  if (structure.sourceUrl?.trim()) {
    await host.upsertBlockProperty(
      rootId,
      PROPERTY_KEYS.sourceUrl,
      structure.sourceUrl.trim(),
    );
  }
}

// `input.locale` only picks the section heading language. It is not pinned
// as the recipe's parser language: the recipe is still empty, and its
// language is detected from what the cook writes into it later.
function metaFromNewRecipe(input: NewRecipeInput): RecipeMeta {
  return {
    ...emptyRecipeMeta(),
    ...(input.sourceMeasurementSystem
      ? { sourceMeasurementSystem: input.sourceMeasurementSystem }
      : {}),
    ...(input.measurementSystemOverride
      ? { measurementSystemOverride: input.measurementSystemOverride }
      : {}),
  };
}

async function mergedExistingMeta(
  host: RecipeAuthoringHost,
  structure: ExistingRecipeStructure,
): Promise<RecipeMeta> {
  const raw = await host.getBlockProperty(
    structure.rootId,
    PROPERTY_KEYS.recipeMeta,
  );
  const existing = decodeRecipeMeta(unwrapBlockPropertyValue(raw));

  return {
    ...existing,
    ...(structure.locale ? { parserLocale: structure.locale } : {}),
    ...(structure.sourceMeasurementSystem
      ? { sourceMeasurementSystem: structure.sourceMeasurementSystem }
      : {}),
  };
}

async function writeIngredientMetadata(
  host: RecipeAuthoringHost,
  structure: ExistingRecipeStructure,
): Promise<void> {
  if (!structure.ingredientMetadata?.length) return;

  const context = defaultParseContext(structure.locale ?? "en");
  if (structure.sourceMeasurementSystem) {
    context.sourceMeasurementSystem = structure.sourceMeasurementSystem;
  }

  for (const ingredient of structure.ingredientMetadata) {
    // Stamped with the same per-line language the recipe loader will pick
    // for this line, or the loader discards it - and with it any correction
    // made in Convert Preview - as parsed under a different context.
    await host.upsertBlockProperty(
      ingredient.blockId,
      PROPERTY_KEYS.ingredientMeta,
      encodeIngredientMeta(
        ingredient.parsed,
        ingredientParseContext(
          ingredient.parsed.rawText,
          context,
          structure.sourceMeasurementSystem,
        ),
      ),
    );
  }
}

export async function createRecipeInLogseq(
  host: RecipeAuthoringHost,
  input: NewRecipeInput,
  capabilities: AuthoringCapabilities,
  options: { deferMarker?: boolean } = {},
): Promise<CreatedRecipeStructure> {
  const title = input.title.trim();
  if (!title) throw new RangeError("Recipe title is required.");
  if (!Number.isFinite(input.baseYield) || input.baseYield <= 0) {
    throw new RangeError("Recipe base yield must be positive.");
  }

  const library = await ensureRecipeLibrary(host);
  const rootId = identity(
    await host.insertBlock(library.recipes, title, {
      sibling: false,
      end: true,
    }),
  );
  const locale = input.locale ?? "en";
  const titles = SECTION_TITLES[locale];
  const sectionIds = {} as Record<RecipeSectionRole, string>;

  for (const role of ["ingredients", "steps", "notes"] as const) {
    const block = await host.insertBlock(rootId, titles[role], {
      sibling: false,
      end: true,
    });
    sectionIds[role] = identity(block);
  }

  await writeRootMetadata(host, rootId, metaFromNewRecipe(input), capabilities);
  await host.upsertBlockProperty(
    rootId,
    PROPERTY_KEYS.baseYield,
    input.baseYield,
  );
  if (input.yieldUnit?.trim()) {
    await host.upsertBlockProperty(
      rootId,
      PROPERTY_KEYS.yieldUnit,
      input.yieldUnit.trim(),
    );
  }

  for (const role of ["ingredients", "steps", "notes"] as const) {
    await host.upsertBlockProperty(
      sectionIds[role],
      PROPERTY_KEYS.sectionRole,
      role,
    );
  }

  if (!options.deferMarker) await markRecipeComplete(host, rootId);
  return { rootId, sections: sectionIds };
}

export async function markExistingRecipeInLogseq(
  host: RecipeAuthoringHost,
  structure: ExistingRecipeStructure,
  capabilities: AuthoringCapabilities,
): Promise<void> {
  const schemaVersion = propertyNumber(
    await host.getBlockProperty(structure.rootId, PROPERTY_KEYS.schemaVersion),
  );
  if (schemaVersion && schemaVersion > RECIPE_SCHEMA_VERSION) {
    throw new FutureRecipeSchemaError(schemaVersion, RECIPE_SCHEMA_VERSION);
  }

  const meta = await mergedExistingMeta(host, structure);

  await writeRootMetadata(host, structure.rootId, meta, capabilities);
  await writeOptionalRootFields(host, structure.rootId, structure);

  for (const section of structure.sectionRoles) {
    await host.upsertBlockProperty(
      section.blockId,
      PROPERTY_KEYS.sectionRole,
      section.role,
    );
  }

  await writeIngredientMetadata(host, structure);
  await markRecipeComplete(host, structure.rootId);
}
