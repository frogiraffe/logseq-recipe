export interface RecipeBlockSnapshot {
  id: number | string;
  uuid: string;
  title: string;
  // True when this block only exists to carry a ref-typed property's value
  // (Logseq DB graphs store those as a hidden child block of whichever
  // entity owns the property, e.g. section_role="ingredients" on the
  // "Ingredients" section block becomes its own child block titled
  // "ingredients"). Never real authored content.
  isPropertyValue: boolean;
  children: RecipeBlockSnapshot[];
}

const CREATED_FROM_PROPERTY_KEYS = [
  "created-from-property",
  "createdFromProperty",
  ":logseq.property/created-from-property",
] as const;

function childArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isPropertyValueBlock(block: Record<string, unknown>): boolean {
  return CREATED_FROM_PROPERTY_KEYS.some((key) => block[key] != null);
}

export function toRecipeBlockSnapshot(
  value: unknown,
): RecipeBlockSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const block = value as Record<string, unknown>;
  const uuid = typeof block.uuid === "string" ? block.uuid : null;
  const id =
    typeof block.id === "number" || typeof block.id === "string"
      ? block.id
      : null;
  const title =
    typeof block.title === "string"
      ? block.title
      : typeof block.name === "string"
        ? block.name
        : "";

  if (!uuid || id === null) return null;

  return {
    id,
    uuid,
    title,
    isPropertyValue: isPropertyValueBlock(block),
    children: childArray(block.children)
      .map(toRecipeBlockSnapshot)
      .filter((child): child is RecipeBlockSnapshot => child !== null),
  };
}

export function flattenRecipeTree(
  root: RecipeBlockSnapshot,
): RecipeBlockSnapshot[] {
  const result: RecipeBlockSnapshot[] = [];
  const visit = (block: RecipeBlockSnapshot) => {
    result.push(block);
    for (const child of block.children) visit(child);
  };
  visit(root);
  return result;
}

export function unwrapBlockPropertyValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if ("value" in record) return record.value;
  if (":logseq.property/value" in record) {
    return record[":logseq.property/value"];
  }
  return value;
}

export function propertyString(value: unknown): string | undefined {
  const unwrapped = unwrapBlockPropertyValue(value);
  return typeof unwrapped === "string" && unwrapped.trim().length > 0
    ? unwrapped
    : undefined;
}

export function propertyNumber(value: unknown): number | undefined {
  const unwrapped = unwrapBlockPropertyValue(value);
  if (typeof unwrapped === "number" && Number.isFinite(unwrapped)) {
    return unwrapped;
  }
  if (typeof unwrapped === "string" && unwrapped.trim()) {
    const parsed = Number(unwrapped);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
