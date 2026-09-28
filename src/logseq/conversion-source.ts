import {
  analyzeWithDetectedLocale,
  type ConversionSourceNode,
  isSectionHeadingInAnyLocale,
  outlineToSource,
} from "../application/convert-recipe";
import type { RecipeLocale } from "../domain/recipe";
import type { ConversionRebuild, DraftRecipeInitialView } from "../ui/state";
import {
  pageWithChildren,
  type RecipeBlockSnapshot,
  toRecipeBlockSnapshot,
  unwrapBlockPropertyValue,
} from "./block-reader";
import { isTruthyMarkerValue } from "./logseq-recipe-repository";
import { PROPERTY_KEYS } from "./property-keys";

/**
 * Shared between runtime-ui.tsx (plugin bootstrap: Convert to Recipe command
 * handlers) and ui-controller.ts (the React app's controller, which also
 * needs to re-read a block as a conversion source after applying an outline
 * split). Kept in its own module - not defined in either of those two files -
 * because runtime-ui.tsx already imports from ui-controller.ts, and the
 * reverse import would create a cycle.
 */

function toConversionSource(block: RecipeBlockSnapshot): ConversionSourceNode {
  return {
    id: block.uuid,
    title: block.title,
    // A ref-typed property's own hidden value-carrier child (e.g.
    // section_role="ingredients" creating a child literally titled
    // "ingredients") is never real authored content - see the repository's
    // own contentChildren filter, which this mirrors for Convert's input.
    children: block.children
      .filter((child) => !child.isPropertyValue)
      .map(toConversionSource),
  };
}

export async function loadConversionRoot(
  uuid?: string,
): Promise<ConversionSourceNode | null> {
  let entity: unknown = null;

  if (uuid) {
    entity = await logseq.Editor.getBlock(uuid, { includeChildren: true });
    if (!entity) {
      const page = await logseq.Editor.getPage(uuid);
      if (page) {
        const children = await logseq.Editor.getPageBlocksTree(uuid);
        entity = pageWithChildren(page, children);
      }
    }
  } else {
    // Command-palette invocation (no explicit block target): always convert
    // the current page as a whole, regardless of where the editing cursor
    // happens to be. Targeting the focused child block here would silently
    // convert the wrong subtree - that is what the block context menu (which
    // always passes an explicit uuid) is for.
    const currentPage = await logseq.Editor.getCurrentPage();
    if (currentPage?.uuid) {
      const page = await logseq.Editor.getPage(currentPage.uuid);
      const children = await logseq.Editor.getPageBlocksTree(currentPage.uuid);
      entity = pageWithChildren(page ?? currentPage, children);
    }
  }

  const snapshot = toRecipeBlockSnapshot(entity);
  return snapshot ? toConversionSource(snapshot) : null;
}

/**
 * A pasted recipe often lands as flat sibling blocks - a title block, then
 * "Ingredients"/"Steps"/"Notes" blocks holding their lines as multi-line
 * text - instead of sections nested under the title. Collects the
 * consecutive next siblings that are childless section headings (any
 * language) so the outline split can fold them under the title. Stops at
 * the first sibling that isn't one, so whatever follows the recipe (e.g.
 * the rest of a journal page) is never swallowed.
 */
export async function loadTrailingSectionSiblings(
  uuid: string,
): Promise<ConversionSourceNode[]> {
  const siblings: ConversionSourceNode[] = [];
  // A page, or a block Logseq can't place, has no siblings to fold in.
  const nextOf = (id: string) =>
    logseq.Editor.getNextSiblingBlock(id).catch(() => null);
  let next = await nextOf(uuid);
  while (next) {
    const snapshot = toRecipeBlockSnapshot(
      await logseq.Editor.getBlock(next.uuid, { includeChildren: true }),
    );
    if (!snapshot) break;
    const node = toConversionSource(snapshot);
    if (node.children.length > 0 || !isSectionHeadingInAnyLocale(node.title)) {
      break;
    }
    siblings.push(node);
    next = await nextOf(node.id);
  }
  return siblings;
}

export function conversionView(
  source: ConversionSourceNode,
  fallbackLocale: RecipeLocale,
  rebuild?: ConversionRebuild,
): DraftRecipeInitialView {
  const { draft, detectedLocale } = analyzeWithDetectedLocale(
    source,
    fallbackLocale,
  );
  return {
    kind: "convert",
    source,
    draft,
    ...(detectedLocale ? { detectedLocale } : {}),
    ...(rebuild ? { rebuild } : {}),
  };
}

/** Convert Preview of blocks to rebuild, before anything is written. */
export function rebuiltConversionView(
  rootId: string,
  rebuild: ConversionRebuild,
  fallbackLocale: RecipeLocale,
): DraftRecipeInitialView {
  return conversionView(
    outlineToSource(rebuild.outline, rootId),
    fallbackLocale,
    rebuild,
  );
}

/**
 * The recipe a block sits inside, if any - converting a line of an existing
 * recipe (its Ingredients block, say) would make a recipe within a recipe.
 * Walks up through parent blocks to the page, which may be a recipe too.
 */
export async function findEnclosingRecipe(
  uuid: string,
): Promise<{ id: string; title: string } | null> {
  const idOf = (value: unknown, key: "parent" | "page") =>
    (value as Record<string, { id?: number } | undefined> | null)?.[key]?.id;
  const recipeAt = async (entity: unknown) => {
    const snapshot = toRecipeBlockSnapshot(entity);
    return snapshot && (await isAlreadyDraftRecipe(snapshot.uuid))
      ? { id: snapshot.uuid, title: snapshot.title }
      : null;
  };
  let block: unknown = await logseq.Editor.getBlock(uuid);
  for (let depth = 0; block && depth < 100; depth += 1) {
    const parentId = idOf(block, "parent");
    const pageId = idOf(block, "page");
    if (parentId === undefined) return null;
    if (parentId === pageId) {
      return recipeAt(await logseq.Editor.getPage(parentId));
    }
    block = await logseq.Editor.getBlock(parentId);
    const recipe = await recipeAt(block);
    if (recipe) return recipe;
  }
  return null;
}

export async function isAlreadyDraftRecipe(rootId: string): Promise<boolean> {
  const active = unwrapBlockPropertyValue(
    await logseq.Editor.getBlockProperty(rootId, PROPERTY_KEYS.recipeMarker),
  );
  if (isTruthyMarkerValue(active)) return true;
  const archived = unwrapBlockPropertyValue(
    await logseq.Editor.getBlockProperty(rootId, PROPERTY_KEYS.archivedMarker),
  );
  return isTruthyMarkerValue(archived);
}
