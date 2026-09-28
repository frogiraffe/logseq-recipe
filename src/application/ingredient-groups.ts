import type { ParseContext } from "../parsing/context";
import { ingredientParseContext } from "../parsing/detect-locale";
import { parseIngredient } from "../parsing/ingredient";

interface OutlineLine<T> {
  title: string;
  children: readonly T[];
}

function hasAmount(title: string, context: ParseContext): boolean {
  return (
    parseIngredient(title, ingredientParseContext(title, context)).amount !==
    undefined
  );
}

/**
 * Whether an Ingredients line is a group heading ("For the dough") rather
 * than an ingredient: it has lines nested under it, no amount of its own,
 * and reads as a heading - it ends with a colon, holds more than one line,
 * or holds a measured one. "200 g butter" with a note nested under it stays
 * an ingredient, and so does "Salt to taste" with one note under it.
 */
export function isIngredientGroupHeading<T extends { title: string }>(
  line: OutlineLine<T>,
  context: ParseContext,
): boolean {
  if (line.children.length === 0 || hasAmount(line.title, context)) {
    return false;
  }
  return (
    /:\s*$/.test(line.title) ||
    line.children.length > 1 ||
    line.children.some((child) => hasAmount(child.title, context))
  );
}

/**
 * The ingredient lines of an Ingredients section, in order, each with the
 * group heading it sits under (one level: deeper lines stay with their
 * ingredient).
 */
export function ingredientLines<T extends OutlineLine<T>>(
  lines: readonly T[],
  context: ParseContext,
): Array<{ line: T; group?: T }> {
  return lines.flatMap((line) =>
    isIngredientGroupHeading(line, context)
      ? line.children.map((child) => ({ line: child, group: line }))
      : [{ line }],
  );
}
