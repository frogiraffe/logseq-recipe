import { recipeNotFound, titleTaken } from "../application/errors";
import {
  decodeIngredientMeta,
  encodeIngredientMeta,
} from "../application/ingredient-meta";
import { sameTitle } from "../application/list-recipes";
import { encodeRecipeMeta } from "../application/recipe-meta";
import type { RecipeRepository } from "../application/recipe-repository";
import type {
  ExistingRecipeStructure,
  IngredientLayoutEntry,
  NewRecipeInput,
} from "../application/types";
import type { Recipe, RecipeMeta } from "../domain/recipe";
import { defaultParseContext } from "../parsing/context";
import { parseIngredient } from "../parsing/ingredient";
import { setRecipeCover } from "./assets";
import {
  createRecipeInLogseq,
  markExistingRecipeInLogseq,
  type RecipeAuthoringHost,
  writeOptionalRootFields,
} from "./authoring";
import {
  type RecipeBlockSnapshot,
  toRecipeBlockSnapshot,
  unwrapBlockPropertyValue,
} from "./block-reader";
import {
  createLogseqRecipeRepository,
  currentLogseqRecipeHost,
  type LogseqRecipeHost,
} from "./logseq-recipe-repository";
import { PROPERTY_KEYS } from "./property-keys";
import {
  ensureRecipeSchema,
  type PropertySchemaEditor,
  type RecipeSchemaCapabilities,
} from "./schema";
import type { DraftRecipeSettings } from "./settings";

function uniqueDuplicateTitle(
  existingTitles: readonly string[],
  baseTitle: string,
): string {
  const used = new Set(
    existingTitles.map((title) => title.trim().toLocaleLowerCase()),
  );
  let attempt = 1;
  let candidate = `${baseTitle} (copy)`;
  while (used.has(candidate.toLocaleLowerCase())) {
    attempt += 1;
    candidate = `${baseTitle} (copy ${attempt})`;
  }
  return candidate;
}

export interface DraftRecipeHost extends LogseqRecipeHost {
  editor: LogseqRecipeHost["editor"] &
    RecipeAuthoringHost &
    PropertySchemaEditor;
}

export interface DraftRecipeRepositoryOptions {
  settings: DraftRecipeSettings;
  schemaCapabilities: RecipeSchemaCapabilities;
}

export function createDraftRecipeRepository(
  host: DraftRecipeHost,
  options: DraftRecipeRepositoryOptions,
): RecipeRepository {
  const readRepository = createLogseqRecipeRepository(host, {
    settings: options.settings,
  });

  // Copies the lines written under a block (an ingredient's "at room
  // temperature", a step's notes and photos) under another, nested as they
  // are: flattened, a note under a note would read back as a group.
  async function copyLinesUnder(fromId: string, toId: string): Promise<void> {
    const copy = async (
      lines: readonly RecipeBlockSnapshot[],
      parentId: string,
    ): Promise<void> => {
      for (const line of lines) {
        if (line.isPropertyValue || !line.title.trim()) continue;
        await copy(
          line.children,
          await readRepository.addStepChild(parentId, line.title),
        );
      }
    };
    const block = toRecipeBlockSnapshot(
      await host.editor.getBlock(fromId, { includeChildren: true }),
    );
    await copy(block?.children ?? [], toId);
  }

  return {
    ...readRepository,

    async createRecipe(input: NewRecipeInput): Promise<Recipe> {
      await ensureRecipeSchema(host.editor, options.schemaCapabilities);
      const existing = [
        ...(await readRepository.listRecipeSummaries()),
        ...(await readRepository.listArchivedRecipeSummaries()),
      ];
      if (existing.some((recipe) => sameTitle(recipe.title, input.title))) {
        throw titleTaken(input.title.trim());
      }
      const structure = await createRecipeInLogseq(host.editor, input);
      const recipe = await readRepository.getRecipe(structure.rootId);
      if (!recipe) {
        throw new Error(
          "Recipe was created but could not be read back from Logseq.",
        );
      }
      return recipe;
    },

    async markExistingRecipe(
      structure: ExistingRecipeStructure,
    ): Promise<void> {
      await ensureRecipeSchema(host.editor, options.schemaCapabilities);
      await markExistingRecipeInLogseq(host.editor, structure);
    },

    async duplicateRecipe(id: string): Promise<Recipe> {
      const source = await readRepository.getRecipe(id);
      if (!source) throw recipeNotFound(id);

      await ensureRecipeSchema(host.editor, options.schemaCapabilities);
      const existing = [
        ...(await readRepository.listRecipeSummaries()),
        ...(await readRepository.listArchivedRecipeSummaries()),
      ];
      const title = uniqueDuplicateTitle(
        existing.map((recipe) => recipe.title),
        source.title,
      );
      const structure = await createRecipeInLogseq(
        host.editor,
        {
          title,
          baseYield: source.baseYield,
          yieldUnit: source.yieldUnit,
          locale: source.parserLocale,
          sourceMeasurementSystem: source.sourceMeasurementSystem,
          measurementSystemOverride: source.measurementSystemOverride,
        },
        { deferMarker: true },
      );

      const context = defaultParseContext(
        source.parserLocale ?? "en",
        source.sourceMeasurementSystem,
      );

      // Group headings go in as lines too; arrangeIngredients then nests
      // each group's ingredients under its heading.
      const layout: IngredientLayoutEntry[] = [];
      const headingEntries = new Map<string, IngredientLayoutEntry>();
      for (const ingredient of source.ingredients) {
        const group = ingredient.group;
        if (group && !headingEntries.has(group.id)) {
          const entry = {
            id: await readRepository.addSectionItem(
              structure.rootId,
              "ingredients",
              group.title,
            ),
            items: [],
          };
          headingEntries.set(group.id, entry);
          layout.push(entry);
        }
        const blockId = await readRepository.addSectionItem(
          structure.rootId,
          "ingredients",
          ingredient.rawText,
        );
        const heading = group && headingEntries.get(group.id);
        if (heading) heading.items?.push(blockId);
        else layout.push({ id: blockId });
        if (ingredient.details) await copyLinesUnder(ingredient.id, blockId);
        // getRecipe() above already reconciled the source's ingredient_meta
        // (see parsedIngredientForBlock), so it holds the exact canonical
        // structure in use right now - including any manual correction the
        // parser alone could never reproduce. Copy it verbatim instead of
        // reparsing rawText, which would silently discard that correction.
        const storedRaw = unwrapBlockPropertyValue(
          await host.editor.getBlockProperty(
            ingredient.id,
            PROPERTY_KEYS.ingredientMeta,
          ),
        );
        const stored = decodeIngredientMeta(storedRaw);
        const canonical =
          stored && stored.parsed.rawText === ingredient.rawText
            ? stored.parsed
            : parseIngredient(ingredient.rawText, context);
        const canonicalContext = stored
          ? {
              locale: stored.locale,
              sourceMeasurementSystem: stored.sourceMeasurementSystem,
            }
          : context;
        await host.editor.upsertBlockProperty(
          blockId,
          PROPERTY_KEYS.ingredientMeta,
          encodeIngredientMeta(canonical, canonicalContext),
        );
        if (ingredient.scaleMode === "fixed") {
          await readRepository.setIngredientScaleMode(blockId, "fixed");
        }
      }
      if (headingEntries.size > 0) {
        await readRepository.arrangeIngredients(structure.rootId, layout);
      }
      for (const step of source.steps) {
        const stepId = await readRepository.addSectionItem(
          structure.rootId,
          "steps",
          step.rawText,
        );
        if (step.children) await copyLinesUnder(step.id, stepId);
      }
      for (const note of source.notes) {
        await readRepository.addSectionItem(
          structure.rootId,
          "notes",
          note.text,
        );
      }

      const meta: RecipeMeta = {
        categories: source.categories,
        tags: source.tags,
        ingredientConversionOverrides: source.ingredientConversionOverrides,
        ...(source.parserLocale ? { parserLocale: source.parserLocale } : {}),
        ...(source.sourceMeasurementSystem
          ? { sourceMeasurementSystem: source.sourceMeasurementSystem }
          : {}),
        ...(source.measurementSystemOverride
          ? { measurementSystemOverride: source.measurementSystemOverride }
          : {}),
      };
      await host.editor.upsertBlockProperty(
        structure.rootId,
        PROPERTY_KEYS.recipeMeta,
        encodeRecipeMeta(meta),
      );

      await writeOptionalRootFields(host.editor, structure.rootId, {
        prepMinutes: source.prepMinutes,
        chillMinutes: source.chillMinutes,
        cookMinutes: source.cookMinutes,
        sourceUrl: source.sourceUrl,
      });

      if (source.cover) {
        await setRecipeCover(host.editor, structure.rootId, source.cover, {
          coverReference: options.schemaCapabilities.coverReference,
        });
      }

      const created = await readRepository.getRecipe(structure.rootId);
      if (!created) {
        throw new Error(
          "Recipe was duplicated but could not be read back from Logseq.",
        );
      }
      await host.editor.upsertBlockProperty(
        structure.rootId,
        PROPERTY_KEYS.recipeMarker,
        true,
      );
      return created;
    },
  };
}

export function currentDraftRecipeHost(): DraftRecipeHost {
  const base = currentLogseqRecipeHost();
  return {
    ...base,
    editor: logseq.Editor as unknown as DraftRecipeHost["editor"],
  };
}
