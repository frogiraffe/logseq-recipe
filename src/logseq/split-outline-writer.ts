import type { OutlineNode } from "../application/split-outline";

async function insertOneBlock(
  anchorUuid: string,
  content: string,
  sibling: boolean,
): Promise<string> {
  const created: unknown = await logseq.Editor.insertBlock(
    anchorUuid,
    content,
    { sibling },
  );
  const uuid = (created as { uuid?: string } | null)?.uuid;
  if (!uuid) {
    throw new Error("Logseq did not return the newly created block.");
  }
  return uuid;
}

async function insertChildren(
  parentUuid: string,
  children: OutlineNode[],
): Promise<void> {
  // Each sibling is anchored off the previously-created one (not the
  // parent) so order is explicit and never depends on whatever Logseq's
  // own insertBlock does by default when called repeatedly against the
  // same parent.
  let previousUuid: string | null = null;
  for (const child of children) {
    let uuid: string;
    if (previousUuid) {
      uuid = await insertOneBlock(previousUuid, child.text, true);
    } else {
      uuid = await insertOneBlock(parentUuid, child.text, false);
    }
    if (child.children.length > 0) {
      await insertChildren(uuid, child.children);
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
 * outline's title line; `staleChildIds` (the existing flat children,
 * whose text is already folded into `outline` - see flattenUnsplitSource)
 * are removed once the fresh tree, which fully supersedes them, is in
 * place; every other outline line becomes a real nested child block.
 */
export async function applyOutlineSplit(
  rootUuid: string,
  outline: OutlineNode,
  staleChildIds: string[] = [],
): Promise<void> {
  // Build the new tree before removing anything: if an insert fails midway
  // the user is left with some duplicated lines, never a lost recipe.
  await insertChildren(rootUuid, outline.children);
  for (const id of staleChildIds) {
    await logseq.Editor.removeBlock(id);
  }
  await logseq.Editor.updateBlock(rootUuid, outline.text);
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
