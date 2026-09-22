export interface OutlineNode {
  text: string;
  children: OutlineNode[];
}

interface UnsplitConversionSource {
  title: string;
  children: readonly { title: string; children: readonly unknown[] }[];
}

/**
 * True when a conversion source's direct children are all leaves - no
 * child has any children of its own. Covers two real Logseq paste
 * failures with one check: a single block holding the entire outline as
 * its own multi-line text (zero children), and Logseq chunking a paste
 * into a handful of flat sibling blocks without ever nesting anything
 * (each child present, but none of them have children either). A
 * genuinely well-formed recipe always has real nesting somewhere
 * (ingredient/step lines under their section heading), so this is a safe
 * signal either way.
 */
export function looksUnsplit(
  children: readonly { children: readonly unknown[] }[],
): boolean {
  return children.every((child) => child.children.length === 0);
}

/**
 * Reconstructs the full original multi-line outline text from a source
 * whose content Logseq chunked into flat sibling blocks (or didn't split
 * at all) rather than a real nested tree - concatenating the root's own
 * title with each direct child's title, in document order, is safe
 * exactly when `looksUnsplit` holds for those children (each child's own
 * title is then its full content, since it has no children to lose).
 */
export function flattenUnsplitSource(root: UnsplitConversionSource): string {
  return [root.title, ...root.children.map((child) => child.title)].join("\n");
}

const FENCED_CODE_BLOCK = /^```[^\n]*\n([\s\S]*?)\n```\s*$/;

function stripCodeFence(text: string): string {
  const match = text.trim().match(FENCED_CODE_BLOCK);
  return match ? match[1] : text;
}

function leadingWhitespaceLength(line: string): number {
  return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

/**
 * Splits a single block's raw multi-line text into a tree of outline nodes,
 * inferring nesting purely from each line's relative indentation - never
 * from recipe-specific keywords like "Ingredients"/"Steps", so it works for
 * any indented outline someone pasted as one block instead of real nested
 * Logseq blocks (the common failure mode: pasting a whole fenced example, or
 * plain multi-line text that Logseq didn't split into blocks).
 *
 * Returns null when the text doesn't look like an indented outline at all -
 * a single line, or every line at the same indentation as the first -
 * matching this codebase's "never guess" policy: with no genuine structural
 * signal, don't invent one.
 */
export function splitIndentedOutline(rawText: string): OutlineNode | null {
  const text = stripCodeFence(rawText);
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const rootIndent = leadingWhitespaceLength(lines[0]);
  const root: OutlineNode = { text: lines[0].trim(), children: [] };

  type StackEntry = { node: OutlineNode; indent: number };
  const stack: StackEntry[] = [{ node: root, indent: rootIndent }];
  let sawDeeperLine = false;

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const indent = leadingWhitespaceLength(line);
    if (indent > rootIndent) sawDeeperLine = true;

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const node: OutlineNode = { text: line.trim(), children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, indent });
  }

  return sawDeeperLine ? root : null;
}
