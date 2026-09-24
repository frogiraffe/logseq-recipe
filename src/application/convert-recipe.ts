import type { RecipeLocale } from "../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import type { ParseContext } from "../parsing/context";
import {
  ingredientParseContext,
  stepParseContext,
} from "../parsing/detect-locale";
import {
  type ParseConfidence,
  type ParsedIngredient,
  parseIngredient,
} from "../parsing/ingredient";
import { getLocalePack, RECIPE_LOCALES } from "../parsing/locales";
import { foldLabel } from "../parsing/normalize";
import { parseStep, type RecipeStepAnnotations } from "../parsing/step";
import { parseRecipeMetadataLine } from "./recipe-metadata";
import type { RecipeRepository } from "./recipe-repository";
import {
  flattenUnsplitSource,
  looksUnsplit,
  nestLines,
  type OutlineNode,
  splitIndentedOutline,
} from "./split-outline";
import type { ExistingRecipeStructure, RecipeSectionRole } from "./types";

export interface ConversionSourceNode {
  id: string;
  title: string;
  children: ConversionSourceNode[];
}

export interface ConversionIssue {
  code: string;
  /** English fallback; the UI renders its own translation from code + detail. */
  message: string;
  /** The line, section title, or role the issue is about. */
  detail?: string;
  blockId?: string;
}

export interface ConversionSection {
  blockId: string;
  role: RecipeSectionRole;
  confidence: ParseConfidence;
}

export interface ConversionUnknownSection {
  blockId: string;
  title: string;
  children: ConversionSourceNode[];
}

export interface ConversionIngredient {
  blockId: string;
  parsed: ParsedIngredient;
}

export interface ConversionStep {
  blockId: string;
  rawText: string;
  annotations: RecipeStepAnnotations;
}

export interface ConversionMetadata {
  baseYield?: number;
  yieldUnit?: string;
  prepMinutes?: number;
  chillMinutes?: number;
  cookMinutes?: number;
  sourceUrl?: string;
}

export interface ConversionDraft {
  rootId: string;
  title: string;
  locale: RecipeLocale;
  sourceMeasurementSystem: MeasurementSystem;
  metadata: ConversionMetadata;
  sections: ConversionSection[];
  unknownSections: ConversionUnknownSection[];
  ingredients: ConversionIngredient[];
  steps: ConversionStep[];
  issues: ConversionIssue[];
}

const BLOCKING_CONVERSION_ISSUE_CODES = new Set([
  "missing-base-yield",
  "ingredient-amount-ambiguous",
  "no-ingredients-section",
  "no-steps-section",
  "duplicate-section-role",
]);

const STRUCTURAL_ISSUE_CODES = new Set([
  "unrecognized-section",
  "no-ingredients-section",
  "no-steps-section",
  "duplicate-section-role",
]);

function sectionRoleIn(
  title: string,
  locale: RecipeLocale,
): RecipeSectionRole | null {
  const { sectionAliases } = getLocalePack(locale);
  const folded = foldLabel(title);
  for (const role of ["ingredients", "steps", "notes"] as const) {
    if (sectionAliases[role].some((alias) => foldLabel(alias) === folded))
      return role;
  }
  return null;
}

// Headings in any supported language are accepted whatever the recipe
// language: a Turkish recipe is often pasted with "Ingredients"/"Steps"
// (copied from a recipe site, say). The recipe's own language wins a tie.
function sectionRole(
  title: string,
  context: ParseContext,
): RecipeSectionRole | null {
  for (const locale of [context.locale, ...RECIPE_LOCALES]) {
    const role = sectionRoleIn(title, locale);
    if (role) return role;
  }
  return null;
}

function applyMetadata(
  target: ConversionMetadata,
  parsed: ReturnType<typeof parseRecipeMetadataLine>,
): boolean {
  if (!parsed || parsed.value === null) return false;
  switch (parsed.field) {
    case "yield":
      target.baseYield = parsed.value.baseYield;
      if (parsed.value.yieldUnit) target.yieldUnit = parsed.value.yieldUnit;
      return true;
    case "prep":
      target.prepMinutes = parsed.value;
      return true;
    case "chill":
      target.chillMinutes = parsed.value;
      return true;
    case "cook":
      target.cookMinutes = parsed.value;
      return true;
    case "source":
      target.sourceUrl = parsed.value;
      return true;
  }
}

export function isIngredientAmountIssue(issue: ConversionIssue): boolean {
  return (
    issue.code === "ingredient-amount-unparsed" ||
    issue.code === "ingredient-amount-ambiguous"
  );
}

function parseIngredientNodes(
  nodes: readonly ConversionSourceNode[],
  context: ParseContext,
): { ingredients: ConversionIngredient[]; issues: ConversionIssue[] } {
  const ingredients: ConversionIngredient[] = [];
  const issues: ConversionIssue[] = [];

  for (const ingredient of nodes) {
    const parsed = parseIngredient(
      ingredient.title,
      ingredientParseContext(
        ingredient.title,
        context,
        context.sourceMeasurementSystem,
      ),
    );
    ingredients.push({ blockId: ingredient.id, parsed });
    if (parsed.amount) continue;
    // "Salt to taste" simply has no amount; a line with a number the parser
    // couldn't use ("1 kg flour + 200 g sugar", "1,2,3 g") must be resolved
    // before converting, or its amount would silently never scale.
    issues.push(
      parsed.ambiguous
        ? {
            code: "ingredient-amount-ambiguous",
            message: `The amount in ingredient "${ingredient.title}" is ambiguous.`,
            detail: ingredient.title,
            blockId: ingredient.id,
          }
        : {
            code: "ingredient-amount-unparsed",
            message: `No numeric amount was parsed from ingredient "${ingredient.title}".`,
            detail: ingredient.title,
            blockId: ingredient.id,
          },
    );
  }

  return { ingredients, issues };
}

function parseStepNodes(
  nodes: readonly ConversionSourceNode[],
  context: ParseContext,
): ConversionStep[] {
  return nodes.map((step) => ({
    blockId: step.id,
    rawText: step.title,
    annotations: parseStep(
      step.title,
      stepParseContext(step.title, context, context.sourceMeasurementSystem),
    ),
  }));
}

function structuralIssues(
  rootId: string,
  sections: readonly ConversionSection[],
  unknownSections: readonly ConversionUnknownSection[],
): ConversionIssue[] {
  const issues: ConversionIssue[] = unknownSections.map((section) => ({
    code: "unrecognized-section",
    message: `Could not determine the role of section "${section.title}".`,
    detail: section.title,
    blockId: section.blockId,
  }));

  for (const role of ["ingredients", "steps", "notes"] as const) {
    const matches = sections.filter((section) => section.role === role);
    if (matches.length > 1) {
      for (const duplicate of matches.slice(1)) {
        issues.push({
          code: "duplicate-section-role",
          message: `Multiple sections were recognized as ${role}.`,
          detail: role,
          blockId: duplicate.blockId,
        });
      }
    }
  }

  if (!sections.some((section) => section.role === "ingredients")) {
    issues.push({
      code: "no-ingredients-section",
      message: "No recognized ingredients section was found.",
      blockId: rootId,
    });
  }

  if (!sections.some((section) => section.role === "steps")) {
    issues.push({
      code: "no-steps-section",
      message: "No recognized steps section was found.",
      blockId: rootId,
    });
  }

  return issues;
}

function contextFromDraft(draft: ConversionDraft): ParseContext {
  return {
    locale: draft.locale,
    sourceMeasurementSystem: draft.sourceMeasurementSystem,
  };
}

export function analyzeRecipeConversion(
  root: ConversionSourceNode,
  context: ParseContext,
): ConversionDraft {
  const metadata: ConversionMetadata = {};
  const sections: ConversionSection[] = [];
  const unknownSections: ConversionUnknownSection[] = [];
  const ingredients: ConversionIngredient[] = [];
  const steps: ConversionStep[] = [];
  const nonStructuralIssues: ConversionIssue[] = [];

  for (const child of root.children) {
    const parsedMetadata = parseRecipeMetadataLine(child.title, context);
    if (parsedMetadata) {
      if (!applyMetadata(metadata, parsedMetadata)) {
        nonStructuralIssues.push({
          code: "invalid-metadata-value",
          message: `Could not safely normalize metadata line "${child.title}".`,
          detail: child.title,
          blockId: child.id,
        });
      }
      continue;
    }

    const role = sectionRole(child.title, context);
    if (!role) {
      if (child.children.length > 0) {
        unknownSections.push({
          blockId: child.id,
          title: child.title,
          children: child.children,
        });
      } else {
        // A leaf line isn't a section the user can classify into
        // ingredients/steps/notes, but it must not just vanish - surface it
        // as ignored/unclassified content instead of silently dropping it.
        nonStructuralIssues.push({
          code: "unclassified-content",
          message: `Line "${child.title}" was not recognized as a section, metadata field, ingredient, step, or note, and will be ignored.`,
          detail: child.title,
          blockId: child.id,
        });
      }
      continue;
    }

    sections.push({ blockId: child.id, role, confidence: "exact" });

    if (role === "ingredients") {
      const parsed = parseIngredientNodes(child.children, context);
      ingredients.push(...parsed.ingredients);
      nonStructuralIssues.push(...parsed.issues);
    }

    if (role === "steps") {
      steps.push(...parseStepNodes(child.children, context));
    }
  }

  if (
    metadata.baseYield === undefined ||
    !Number.isFinite(metadata.baseYield) ||
    metadata.baseYield <= 0
  ) {
    nonStructuralIssues.push({
      code: "missing-base-yield",
      message:
        "A positive base yield/serving count is required before this subtree can be converted.",
      blockId: root.id,
    });
  }

  return {
    rootId: root.id,
    title: root.title,
    locale: context.locale,
    sourceMeasurementSystem: context.sourceMeasurementSystem,
    metadata,
    sections,
    unknownSections,
    ingredients,
    steps,
    issues: [
      ...nonStructuralIssues,
      ...structuralIssues(root.id, sections, unknownSections),
    ],
  };
}

function indentOf(line: string): number {
  return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

function sourceToOutline(
  block: ConversionSourceNode,
  context: ParseContext,
  isRoot: boolean,
): OutlineNode {
  const [first = "", ...rest] = block.title
    .split("\n")
    .filter((line) => line.trim() !== "");
  // The root (title + metadata lines) and a section heading ("Ingredients\n
  // 60 g butter...") own all their extra lines as items. Any other block
  // keeps unindented extra lines as part of its own text (a wrapped step),
  // while indented ones become nested blocks - the same nesting the
  // single-block split gives them (see nestLines).
  const ownsAllLines = isRoot || sectionRole(first, context) !== null;
  const splitAt = ownsAllLines
    ? 0
    : rest.findIndex((line) => indentOf(line) > 0);
  const textLines = splitAt < 0 ? rest : rest.slice(0, splitAt);
  const childLines = splitAt < 0 ? [] : rest.slice(splitAt);
  return {
    text:
      childLines.length === 0
        ? block.title
        : [first, ...textLines].map((line) => line.trim()).join("\n"),
    children: [
      ...nestLines(childLines),
      ...block.children.map((child) => sourceToOutline(child, context, false)),
    ],
  };
}

export function outlineToSource(
  node: OutlineNode,
  id = "0",
): ConversionSourceNode {
  return {
    id,
    title: node.text,
    children: node.children.map((child, i) =>
      outlineToSource(child, `${id}.${i}`),
    ),
  };
}

/**
 * Rebuilds a paste Logseq split into blocks along the wrong lines: headings
 * sharing a block with their items, metadata on the title block, and items
 * landing as siblings of their heading instead of its children. Items after
 * a recognized section heading are moved under it. Returns null unless the
 * rebuilt outline actually yields ingredients and steps - no guessing when
 * the regroup doesn't produce a convertible recipe.
 */
export function regroupConversionSource(
  root: ConversionSourceNode,
  context: ParseContext,
): OutlineNode | null {
  const outline = sourceToOutline(root, context, true);
  const children: OutlineNode[] = [];
  let section: OutlineNode | null = null;
  for (const node of outline.children) {
    if (sectionRole(node.text, context)) {
      section = node;
      children.push(node);
    } else if (section && !parseRecipeMetadataLine(node.text, context)) {
      section.children.push(node);
    } else {
      children.push(node);
    }
  }
  const regrouped = { text: outline.text, children };
  const draft = analyzeRecipeConversion(outlineToSource(regrouped), context);
  return draft.ingredients.length > 0 && draft.steps.length > 0
    ? regrouped
    : null;
}

export type ConversionPlan =
  | { kind: "split"; outline: OutlineNode }
  | { kind: "convert"; draft: ConversionDraft };

/**
 * Whether a conversion source can be converted as it stands or must first
 * be rebuilt as real nested blocks: a paste Logseq left in one block or
 * flat chunks, one split along the wrong lines, or a title block carrying
 * metadata lines ("Cookies\nYield: 4").
 */
export function planRecipeConversion(
  source: ConversionSourceNode,
  context: ParseContext,
): ConversionPlan {
  if (looksUnsplit(source.children)) {
    const outline = splitIndentedOutline(flattenUnsplitSource(source));
    if (outline) return { kind: "split", outline };
  }
  const draft = analyzeRecipeConversion(source, context);
  if (
    draft.ingredients.length === 0 ||
    draft.steps.length === 0 ||
    source.title.includes("\n")
  ) {
    const outline = regroupConversionSource(source, context);
    if (outline) return { kind: "split", outline };
  }
  return { kind: "convert", draft };
}

export function classifyConversionSection(
  draft: ConversionDraft,
  blockId: string,
  role: RecipeSectionRole | "ignore",
): ConversionDraft {
  const unknown = draft.unknownSections.find(
    (section) => section.blockId === blockId,
  );
  if (!unknown) return draft;

  if (
    role !== "ignore" &&
    draft.sections.some((section) => section.role === role)
  ) {
    return draft;
  }

  const context = contextFromDraft(draft);
  const sections =
    role === "ignore"
      ? [...draft.sections]
      : [...draft.sections, { blockId, role, confidence: "exact" as const }];
  const unknownSections = draft.unknownSections.filter(
    (section) => section.blockId !== blockId,
  );
  const ingredients = [...draft.ingredients];
  const steps = [...draft.steps];
  const nonStructuralIssues = draft.issues.filter(
    (issue) => !STRUCTURAL_ISSUE_CODES.has(issue.code),
  );

  if (role === "ingredients") {
    const parsed = parseIngredientNodes(unknown.children, context);
    ingredients.push(...parsed.ingredients);
    nonStructuralIssues.push(...parsed.issues);
  }
  if (role === "steps") {
    steps.push(...parseStepNodes(unknown.children, context));
  }

  return {
    ...draft,
    sections,
    unknownSections,
    ingredients,
    steps,
    issues: [
      ...nonStructuralIssues,
      ...structuralIssues(draft.rootId, sections, unknownSections),
    ],
  };
}

/**
 * Convert Preview otherwise dead-ends when no base yield/serving count could
 * be found in the source outline: the blocking issue has no way for the user
 * to resolve it. This lets the user supply a positive yield (and optionally a
 * unit) directly, without fabricating a value on its own.
 */
export function correctConversionYield(
  draft: ConversionDraft,
  baseYield: number,
  yieldUnit?: string,
): ConversionDraft {
  if (!Number.isFinite(baseYield) || baseYield <= 0) return draft;

  const trimmedUnit = yieldUnit?.trim();
  return {
    ...draft,
    metadata: {
      ...draft.metadata,
      baseYield,
      ...(trimmedUnit ? { yieldUnit: trimmedUnit } : {}),
    },
    issues: draft.issues.filter((issue) => issue.code !== "missing-base-yield"),
  };
}

export interface IngredientCorrection {
  amount: number;
  unit?: CanonicalUnit;
  ingredientText?: string;
}

function withoutIngredientIssue(
  issues: readonly ConversionIssue[],
  blockId: string,
): ConversionIssue[] {
  return issues.filter(
    (issue) => !(isIngredientAmountIssue(issue) && issue.blockId === blockId),
  );
}

/**
 * Compact per-ingredient correction for the Convert to Recipe preview: lets the
 * user supply the amount/unit/ingredient interpretation the parser could not
 * confidently resolve, without fabricating a value on its own.
 */
export function correctConversionIngredient(
  draft: ConversionDraft,
  blockId: string,
  correction: IngredientCorrection,
): ConversionDraft {
  const index = draft.ingredients.findIndex(
    (ingredient) => ingredient.blockId === blockId,
  );
  if (index === -1) return draft;
  if (!Number.isFinite(correction.amount) || correction.amount <= 0) {
    return draft;
  }

  const existing = draft.ingredients[index].parsed;
  const ingredientText = (
    correction.ingredientText ?? existing.ingredientText
  ).trim();
  if (!ingredientText) return draft;

  const parsed: ParsedIngredient = {
    rawText: existing.rawText,
    amount: { kind: "exact", value: correction.amount },
    ...(correction.unit ? { unit: correction.unit } : {}),
    ingredientText,
    ...(existing.note ? { note: existing.note } : {}),
    confidence: "exact",
  };

  const ingredients = [...draft.ingredients];
  ingredients[index] = { blockId, parsed };

  return {
    ...draft,
    ingredients,
    issues: withoutIngredientIssue(draft.issues, blockId),
  };
}

/**
 * User explicitly keeps an ambiguous ingredient as raw text (e.g. "a pinch of
 * salt"). No data is invented; this only clears the review prompt.
 */
export function acceptConversionIngredientAsRaw(
  draft: ConversionDraft,
  blockId: string,
): ConversionDraft {
  if (!draft.ingredients.some((ingredient) => ingredient.blockId === blockId)) {
    return draft;
  }
  return {
    ...draft,
    issues: withoutIngredientIssue(draft.issues, blockId),
  };
}

export function isConversionCommittable(draft: ConversionDraft): boolean {
  const yieldIsValid =
    draft.metadata.baseYield !== undefined &&
    Number.isFinite(draft.metadata.baseYield) &&
    draft.metadata.baseYield > 0;

  return (
    yieldIsValid &&
    draft.unknownSections.length === 0 &&
    !draft.issues.some((issue) =>
      BLOCKING_CONVERSION_ISSUE_CODES.has(issue.code),
    )
  );
}

export function conversionStructure(
  draft: ConversionDraft,
): ExistingRecipeStructure {
  if (!isConversionCommittable(draft)) {
    throw new RangeError(
      "Recipe conversion cannot be committed until required structure and base yield are valid.",
    );
  }

  return {
    rootId: draft.rootId,
    locale: draft.locale,
    sourceMeasurementSystem: draft.sourceMeasurementSystem,
    ...draft.metadata,
    sectionRoles: draft.sections.map((section) => ({
      blockId: section.blockId,
      role: section.role,
    })),
    ingredientMetadata: draft.ingredients.map((ingredient) => ({
      blockId: ingredient.blockId,
      parsed: ingredient.parsed,
    })),
  };
}

export async function commitRecipeConversion(
  repository: RecipeRepository,
  draft: ConversionDraft,
): Promise<void> {
  await repository.markExistingRecipe(conversionStructure(draft));
}
