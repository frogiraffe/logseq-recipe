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
import { defaultParseContext } from "../parsing/context";
import { unwrapBlockPropertyValue } from "./block-reader";
import { PROPERTY_KEYS } from "./property-keys";

export interface RecipeAuthoringHost {
  getPage(id: string): Promise<unknown>;
  createPage(title: string): Promise<unknown>;
  appendBlockInPage(page: string, title: string): Promise<unknown>;
  getBlockProperty(id: string, key: string): Promise<unknown>;
  upsertBlockProperty(
    id: string,
    key: string,
    value: unknown,
  ): Promise<unknown>;
  removeBlockProperty(id: string, key: string): Promise<unknown>;
  getPageBlocksTree(page: string): Promise<unknown>;
  removeBlock(id: string): Promise<unknown>;
  restorePage(page: string): Promise<unknown>;
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

function isRecycledPage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return (
    page[":logseq.property/deleted-at"] != null ||
    page["logseq.property/deleted-at"] != null ||
    page.deletedAt != null
  );
}

function topLevelChildIds(tree: unknown): string[] {
  if (!Array.isArray(tree)) return [];
  const ids: string[] = [];
  for (const entry of tree) {
    if (entry && typeof entry === "object") {
      const uuid = (entry as Record<string, unknown>).uuid;
      if (typeof uuid === "string") ids.push(uuid);
    }
  }
  return ids;
}

// Logseq's own page deletion is a recycle, not a purge: the page (and every
// block it ever had - old sections, old ingredients/steps/notes) can come
// back fully intact under the same title. Reusing a recycled title must not
// let that old content resurface as if it belonged to the new recipe.
async function clearExistingChildren(
  host: RecipeAuthoringHost,
  pageTitle: string,
): Promise<void> {
  const tree = await host.getPageBlocksTree(pageTitle);
  for (const childId of topLevelChildIds(tree)) {
    await host.removeBlock(childId);
  }
}

// Root (page-level) properties survive a recycle/restore even after every
// child block is wiped - they belong to the page entity itself, not to the
// children. A reused title must not let a *previous* recipe's yield unit,
// times, source, or cover leak into the new one just because nothing new
// was specified for that field yet.
const RESETTABLE_ROOT_PROPERTY_KEYS = [
  PROPERTY_KEYS.yieldUnit,
  PROPERTY_KEYS.prepMinutes,
  PROPERTY_KEYS.chillMinutes,
  PROPERTY_KEYS.cookMinutes,
  PROPERTY_KEYS.sourceUrl,
  PROPERTY_KEYS.coverRef,
] as const;

async function clearPluginOwnedRootProperties(
  host: RecipeAuthoringHost,
  rootId: string,
): Promise<void> {
  for (const key of RESETTABLE_ROOT_PROPERTY_KEYS) {
    await host.removeBlockProperty(rootId, key);
  }
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

// The marker is what makes a page discoverable as a recipe (listRecipeIds
// queries by its presence). Writing it only after every other structural
// write succeeds means a failure partway through Create/Convert leaves an
// incomplete page that the plugin still treats as "not a recipe" rather
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

function metaFromNewRecipe(input: NewRecipeInput): RecipeMeta {
  return {
    ...emptyRecipeMeta(),
    ...(input.locale ? { parserLocale: input.locale } : {}),
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
    await host.upsertBlockProperty(
      ingredient.blockId,
      PROPERTY_KEYS.ingredientMeta,
      encodeIngredientMeta(ingredient.parsed, context),
    );
  }
}

export async function createRecipeInLogseq(
  host: RecipeAuthoringHost,
  input: NewRecipeInput,
  capabilities: AuthoringCapabilities,
): Promise<CreatedRecipeStructure> {
  const title = input.title.trim();
  if (!title) throw new RangeError("Recipe title is required.");
  if (!Number.isFinite(input.baseYield) || input.baseYield <= 0) {
    throw new RangeError("Recipe base yield must be positive.");
  }

  const existing = await host.getPage(title);
  const reusingRecycledTitle = Boolean(existing) && isRecycledPage(existing);
  if (existing && !reusingRecycledTitle) {
    throw new Error(
      `A Logseq page named "${title}" already exists. Use Convert to Recipe for existing content or choose a different title.`,
    );
  }

  // A recycled page is still the same page under the hood - Logseq's
  // createPage can refuse to touch it (the title is still taken) rather
  // than silently resurrecting it. Bring it back through the dedicated
  // restore API instead of trying to create over it, then wipe it clean.
  let rootId: string;
  if (reusingRecycledTitle) {
    await host.restorePage(title);
    rootId = identity(existing);
    await clearExistingChildren(host, title);
    await clearPluginOwnedRootProperties(host, rootId);
  } else {
    const page = await host.createPage(title);
    rootId = identity(page);
  }
  const locale = input.locale ?? "en";
  const titles = SECTION_TITLES[locale];
  const sectionIds = {} as Record<RecipeSectionRole, string>;

  for (const role of ["ingredients", "steps", "notes"] as const) {
    const block = await host.appendBlockInPage(title, titles[role]);
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

  await markRecipeComplete(host, rootId);
  return { rootId, sections: sectionIds };
}

export async function markExistingRecipeInLogseq(
  host: RecipeAuthoringHost,
  structure: ExistingRecipeStructure,
  capabilities: AuthoringCapabilities,
): Promise<void> {
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
