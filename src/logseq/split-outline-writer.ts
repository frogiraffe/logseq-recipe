import type { OutlineNode } from "../application/split-outline";
import { createdBlockUuid } from "./block-reader";
import { ensureRecipeLibrary, type RecipeLibraryHost } from "./recipe-library";

// `written` hears of each block created, by its index among its siblings and
// the path of its parent below the root (".0.1").
async function insertChildren(
  parentUuid: string,
  children: OutlineNode[],
  written?: (index: number, uuid: string, parentPath: string) => void,
  parentPath = "",
): Promise<void> {
  // Each sibling is anchored off the previously-created one (not the
  // parent) so order is explicit and never depends on whatever Logseq's
  // own insertBlock does by default when called repeatedly against the
  // same parent.
  let previousUuid: string | null = null;
  for (const [index, child] of children.entries()) {
    const uuid = createdBlockUuid(
      await logseq.Editor.insertBlock(previousUuid ?? parentUuid, child.text, {
        sibling: previousUuid !== null,
      }),
    );
    written?.(index, uuid, parentPath);
    if (child.children.length > 0) {
      await insertChildren(
        uuid,
        child.children,
        written,
        `${parentPath}.${index}`,
      );
    }
    previousUuid = uuid;
  }
}

/**
 * Rewrites a block whose content Logseq never turned into a real nested
 * tree (the common paste failure: either the whole outline landed in one
 * block, or Logseq chunked it into a handful of flat sibling blocks
 * without nesting anything) into an actual Logseq block tree matching
 * that outline. The root block keeps its own uuid and gets just the
 * outline's title line; `staleChildIds` (the existing flat children, or
 * trailing section siblings - see loadTrailingSectionSiblings - whose text
 * is already folded into `outline` - see flattenUnsplitSource)
 * are removed once the fresh tree, which fully supersedes them, is in
 * place; every other outline line becomes a real nested child block.
 * Returns each block's id by its preview id (see writeImportedRecipe).
 */
export async function applyOutlineSplit(
  rootUuid: string,
  outline: OutlineNode,
  staleChildIds: string[] = [],
): Promise<Map<string, string>> {
  // Build the new tree before removing anything: if an insert fails midway
  // the user is left with some duplicated lines, never a lost recipe.
  const ids = new Map([[rootUuid, rootUuid]]);
  await insertChildren(rootUuid, outline.children, (index, uuid, path) => {
    ids.set(`${rootUuid}${path}.${index}`, uuid);
  });
  for (const id of staleChildIds) {
    await logseq.Editor.removeBlock(id);
  }
  await logseq.Editor.updateBlock(rootUuid, outline.text);
  await settleInsertedBlocks();
  return ids;
}

/**
 * Import from text: adds the outline as a new block at the end of the
 * recipe library (where Create Recipe puts recipes too), with every outline
 * line nested under it. Returns each written block's id by the outline
 * position `outlineToSource` gives it (`rootId`, `rootId.0`, `rootId.0.1`),
 * so a preview made before writing can be committed to the real blocks.
 */
export async function writeImportedRecipe(
  outline: OutlineNode,
  rootId: string,
): Promise<Map<string, string>> {
  const library = await ensureRecipeLibrary(
    logseq.Editor as unknown as RecipeLibraryHost,
  );
  const rootUuid = createdBlockUuid(
    await logseq.Editor.insertBlock(library.recipes, outline.text, {
      sibling: false,
      end: true,
    }),
  );
  const ids = new Map([[rootId, rootUuid]]);
  await insertChildren(rootUuid, outline.children, (index, uuid, path) => {
    ids.set(`${rootId}${path}.${index}`, uuid);
  });
  await settleInsertedBlocks();
  return ids;
}

async function settleInsertedBlocks(): Promise<void> {
  // insertBlock leaves the last block it creates in active editing mode,
  // the same as if a person had just typed it and not yet clicked away.
  // Every other block in this codebase that Convert operates on was
  // authored by a real person, whose normal typing already blurs/settles
  // through Logseq's own edit lifecycle long before Convert ever touches
  // it - these blocks never do. Without forcing that here, the section
  // role/ingredient metadata properties written moments later during
  // conversion commit land on blocks Logseq doesn't yet consider fully
  // saved, and silently fail to persist.
  await logseq.Editor.exitEditingMode();
}
