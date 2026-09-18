import type { RecipeLocale } from "../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import type { ParseContext } from "../parsing/context";
import {
  type ParseConfidence,
  type ParsedIngredient,
  parseIngredient,
} from "../parsing/ingredient";
import { getLocalePack } from "../parsing/locales";
import { normalizeLookup } from "../parsing/normalize";
import { parseStep, type RecipeStepAnnotations } from "../parsing/step";
import { parseRecipeMetadataLine } from "./recipe-metadata";
import type { RecipeRepository } from "./recipe-repository";
import type { ExistingRecipeStructure, RecipeSectionRole } from "./types";

export interface ConversionSourceNode {
  id: string;
  title: string;
  children: ConversionSourceNode[];
}

export interface ConversionIssue {
  code: string;
  message: string;
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

function normalizedAliasSet(
  values: readonly string[],
  locale: RecipeLocale,
): Set<string> {
  return new Set(values.map((value) => normalizeLookup(value, locale)));
}

function sectionRole(
  title: string,
  context: ParseContext,
): RecipeSectionRole | null {
  const pack = getLocalePack(context.locale);
  const normalized = normalizeLookup(title, context.locale);
  const ingredients = normalizedAliasSet(
    pack.sectionAliases.ingredients,
    context.locale,
  );
  const steps = normalizedAliasSet(pack.sectionAliases.steps, context.locale);
  const notes = normalizedAliasSet(pack.sectionAliases.notes, context.locale);

  if (ingredients.has(normalized)) return "ingredients";
  if (steps.has(normalized)) return "steps";
  if (notes.has(normalized)) return "notes";
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

function parseIngredientNodes(
  nodes: readonly ConversionSourceNode[],
  context: ParseContext,
): { ingredients: ConversionIngredient[]; issues: ConversionIssue[] } {
  const ingredients: ConversionIngredient[] = [];
  const issues: ConversionIssue[] = [];

  for (const ingredient of nodes) {
    const parsed = parseIngredient(ingredient.title, context);
    ingredients.push({ blockId: ingredient.id, parsed });
    if (!parsed.amount) {
      issues.push({
        code: "ingredient-amount-unparsed",
        message: `No numeric amount was parsed from ingredient "${ingredient.title}".`,
        blockId: ingredient.id,
      });
    }
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
    annotations: parseStep(step.title, context),
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
    blockId: section.blockId,
  }));

  for (const role of ["ingredients", "steps", "notes"] as const) {
    const matches = sections.filter((section) => section.role === role);
    if (matches.length > 1) {
      for (const duplicate of matches.slice(1)) {
        issues.push({
          code: "duplicate-section-role",
          message: `Multiple sections were recognized as ${role}.`,
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
    (issue) =>
      !(
        issue.code === "ingredient-amount-unparsed" && issue.blockId === blockId
      ),
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
