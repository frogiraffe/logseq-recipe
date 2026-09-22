import type { ConversionSourceNode } from "../application/convert-recipe";
import {
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

export function toConversionSource(
  block: RecipeBlockSnapshot,
): ConversionSourceNode {
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

export function pageWithChildren(page: unknown, children: unknown): unknown {
  if (!page || typeof page !== "object") return null;
  return {
    ...(page as Record<string, unknown>),
    children: Array.isArray(children) ? children : [],
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

export async function isAlreadyDraftRecipe(rootId: string): Promise<boolean> {
  const markerValue = unwrapBlockPropertyValue(
    await logseq.Editor.getBlockProperty(rootId, PROPERTY_KEYS.recipeMarker),
  );
  return isTruthyMarkerValue(markerValue);
}
