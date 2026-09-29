import type { RecipeLocale } from "../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../domain/unit";
import { defaultParseContext, type ParseContext } from "../parsing/context";
import {
  exclusiveUnitLocales,
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
import { ingredientLines, isIngredientGroupHeading } from "./ingredient-groups";
import {
  metadataField,
  parseRecipeMetadataLine,
  splitLabelValue,
} from "./recipe-metadata";
import type { RecipeRepository } from "./recipe-repository";
import {
  flattenUnsplitSource,
  indentOf,
  looksUnsplit,
  nestLines,
  type OutlineNode,
  splitIndentedOutline,
  stripCodeFence,
} from "./split-outline";
import {
  type ExistingRecipeStructure,
  RECIPE_SECTION_ROLES,
  type RecipeSectionRole,
} from "./types";

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

/**
 * A heading line without its decoration: "## Malzemeler", "**Ingredients:**",
 * "Nasıl yapılır?", and a trailing note such as "Malzemeler (8 adet için)"
 * all come down to the section name (plus any qualifier).
 */
function headingCore(title: string): string {
  let text = title.trim().replace(/^#{1,6}\s*/, "");
  text = text.replace(/[:?]$/, "").trim();
  const bold = text.match(/^(\*\*|__)(.+)\1$/);
  if (bold) text = bold[2].replace(/[:?]$/, "").trim();
  return text.replace(/\s*[([][^()[\]]*[)\]]$/, "").trim();
}

// A qualifier names a part of the dish ("the dough"), never a sentence:
// longer lines, or ones with a period or colon inside, are instructions.
const MAX_QUALIFIER_WORDS = 4;

function isShortQualifier(words: string): boolean {
  const count = words.split(" ").filter(Boolean).length;
  return count > 0 && count <= MAX_QUALIFIER_WORDS;
}

interface SectionMatch {
  role: RecipeSectionRole;
  // Just the section's name ("Malzemeler"), not a qualified one ("Kek için
  // malzemeler").
  plain: boolean;
  locale: RecipeLocale;
}

function sectionMatchIn(
  title: string,
  locale: RecipeLocale,
): SectionMatch | null {
  const { sectionAliases, sectionQualifiers } = getLocalePack(locale);
  const core = foldLabel(headingCore(title));
  const match = (role: RecipeSectionRole, plain = false) => ({
    role,
    plain,
    locale,
  });
  for (const role of RECIPE_SECTION_ROLES) {
    if (sectionAliases[role].some((alias) => foldLabel(alias) === core))
      return match(role, true);
  }
  if (/[.:;!]/.test(core)) return null;
  for (const role of RECIPE_SECTION_ROLES) {
    for (const alias of sectionAliases[role].map(foldLabel)) {
      // "Ingredients for the dough", "Préparation de la pâte"
      for (const word of sectionQualifiers.after.map(foldLabel)) {
        const lead = `${alias} ${word} `;
        if (core.startsWith(lead) && isShortQualifier(core.slice(lead.length)))
          return match(role);
      }
      // "Hamur için malzemeler"
      for (const word of sectionQualifiers.before.map(foldLabel)) {
        const tail = ` ${word} ${alias}`;
        if (
          core.endsWith(tail) &&
          isShortQualifier(core.slice(0, -tail.length))
        )
          return match(role);
      }
    }
  }
  // "Kekin yapılışı", "Hamurun malzemeleri", or the form alone
  for (const role of RECIPE_SECTION_ROLES) {
    for (const form of sectionQualifiers.suffixed[role].map(foldLabel)) {
      if (core === form) return match(role);
      if (
        core.endsWith(` ${form}`) &&
        isShortQualifier(core.slice(0, -form.length - 1))
      )
        return match(role);
    }
  }
  return null;
}

function sectionRoleIn(
  title: string,
  locale: RecipeLocale,
): RecipeSectionRole | null {
  return sectionMatchIn(title, locale)?.role ?? null;
}

// Headings in any supported language are accepted whatever the recipe
// language: a Turkish recipe is often pasted with "Ingredients"/"Steps"
// (copied from a recipe site, say). The recipe's own language wins a tie.
function sectionMatch(
  title: string,
  preferred: RecipeLocale,
): SectionMatch | null {
  for (const locale of [preferred, ...RECIPE_LOCALES]) {
    const match = sectionMatchIn(title, locale);
    if (match) return match;
  }
  return null;
}

function sectionRole(
  title: string,
  context: ParseContext,
): RecipeSectionRole | null {
  return sectionMatch(title, context.locale)?.role ?? null;
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

  for (const { line: ingredient } of ingredientLines(nodes, context)) {
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

  for (const role of RECIPE_SECTION_ROLES) {
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

  // No serving count: the recipe as written counts as one, and the preview
  // asks for the real number without holding up the conversion.
  if (
    metadata.baseYield === undefined ||
    !Number.isFinite(metadata.baseYield) ||
    metadata.baseYield <= 0
  ) {
    metadata.baseYield = 1;
    nonStructuralIssues.push({
      code: "missing-base-yield",
      message:
        "No serving count was found; the recipe counts as 1 serving until one is set.",
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

const asLine = (node: OutlineNode) => ({
  title: node.text,
  children: node.children.map((child) => ({ title: child.text })),
});

// "Hamur için:" with its ingredients listed after it at the same level: a
// group label, not an ingredient - it ends with a colon and has no amount.
function isIngredientLabel(line: OutlineNode, context: ParseContext): boolean {
  return (
    line.children.length === 0 &&
    /:\s*$/.test(line.text) &&
    !parseIngredient(line.text, ingredientParseContext(line.text, context))
      .amount
  );
}

// Nests the lines after each group label under it, up to the next label or
// nested group.
function nestIngredientLabels(
  lines: readonly OutlineNode[],
  context: ParseContext,
): OutlineNode[] {
  const result: OutlineNode[] = [];
  let label: OutlineNode | null = null;
  for (const line of lines) {
    if (isIngredientLabel(line, context)) {
      label = { text: line.text, children: [] };
      result.push(label);
    } else if (label && !isIngredientGroupHeading(asLine(line), context)) {
      label.children.push(line);
    } else {
      label = null;
      result.push(line);
    }
  }
  return result;
}

function capitalize(text: string, locale: RecipeLocale): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

// A section's lines as one ingredient group's items: a group nested inside
// it keeps its heading as a line, since groups go one level deep.
function flattenGroups(
  lines: readonly OutlineNode[],
  context: ParseContext,
): OutlineNode[] {
  return lines.flatMap((line) =>
    isIngredientGroupHeading(asLine(line), context)
      ? [{ text: line.text, children: [] }, ...line.children]
      : [line],
  );
}

/**
 * A recipe written as several parts ("Kek için malzemeler", "Krema için
 * malzemeler") has one section per part; a recipe has one of each. The
 * parts merge into the first: ingredient parts become groups, and a steps
 * or notes part keeps its heading as a line, so no text is lost.
 */
function mergeRepeatedSections(
  lines: readonly OutlineNode[],
  context: ParseContext,
): OutlineNode[] {
  const result: OutlineNode[] = [];
  const merged = new Map<
    RecipeSectionRole,
    { container: OutlineNode; first: OutlineNode; plain: boolean }
  >();
  const asPart = (role: RecipeSectionRole, section: OutlineNode) =>
    role === "ingredients"
      ? [
          {
            text: section.text,
            children: flattenGroups(section.children, context),
          },
        ]
      : [{ text: section.text, children: [] }, ...section.children];

  for (const line of lines) {
    const match = sectionMatch(line.text, context.locale);
    if (!match) {
      result.push(line);
      continue;
    }
    const existing = merged.get(match.role);
    if (!existing) {
      const container = { text: line.text, children: [...line.children] };
      merged.set(match.role, { container, first: line, plain: match.plain });
      result.push(container);
      continue;
    }
    const { container, first } = existing;
    if (!existing.plain) {
      // A qualified first part becomes a part too, under the section's
      // plain name in its language.
      const firstMatch = sectionMatch(first.text, context.locale);
      const locale = firstMatch?.locale ?? context.locale;
      container.text = capitalize(
        getLocalePack(locale).sectionAliases[match.role][0],
        locale,
      );
      container.children = asPart(match.role, first);
      existing.plain = true;
    }
    container.children.push(...asPart(match.role, line));
  }
  return result;
}

/**
 * The shape Convert expects, from any rebuilt outline: repeated sections
 * merged, and "Label:" lines in Ingredients turned into groups.
 */
export function tidyRecipeOutline(
  outline: OutlineNode,
  context: ParseContext,
): OutlineNode {
  return {
    text: outline.text,
    children: mergeRepeatedSections(outline.children, context).map((line) =>
      sectionRole(line.text, context) === "ingredients"
        ? { ...line, children: nestIngredientLabels(line.children, context) }
        : line,
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
  const regrouped = tidyRecipeOutline(
    { text: outline.text, children },
    context,
  );
  const draft = analyzeRecipeConversion(outlineToSource(regrouped), context);
  return draft.ingredients.length > 0 && draft.steps.length > 0
    ? regrouped
    : null;
}

// Whether the Ingredients section lists a "Label:" line with ingredients
// after it at the same level - a group Convert rebuilds as nested blocks.
function hasIngredientLabels(
  source: ConversionSourceNode,
  draft: ConversionDraft,
  context: ParseContext,
): boolean {
  const sectionId = draft.sections.find(
    (section) => section.role === "ingredients",
  )?.blockId;
  const section = source.children.find((child) => child.id === sectionId);
  if (!section) return false;
  const lines = section.children.map((child) => ({
    text: child.title,
    children: child.children.map((grandchild) => ({
      text: grandchild.title,
      children: [],
    })),
  }));
  return nestIngredientLabels(lines, context).length < lines.length;
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
    if (outline) {
      return { kind: "split", outline: tidyRecipeOutline(outline, context) };
    }
  }
  const draft = analyzeRecipeConversion(source, context);
  if (
    draft.ingredients.length === 0 ||
    draft.steps.length === 0 ||
    source.title.includes("\n") ||
    draft.issues.some((issue) => issue.code === "duplicate-section-role") ||
    hasIngredientLabels(source, draft, context)
  ) {
    const outline = regroupConversionSource(source, context);
    if (outline) return { kind: "split", outline };
  }
  return { kind: "convert", draft };
}

/** Whether `text`'s first line is a section heading in any supported language. */
export function isSectionHeadingInAnyLocale(text: string): boolean {
  const heading = text.split("\n")[0];
  return RECIPE_LOCALES.some((locale) => sectionRoleIn(heading, locale));
}

function linesBelow(node: ConversionSourceNode): string[] {
  return node.children.flatMap((child) => [child.title, ...linesBelow(child)]);
}

/**
 * The recipe's language, from exact alias hits only: each top-level line
 * that is a section heading ("Malzemeler") or a metadata label ("Porsiyon:
 * 8") in a language scores a point for it. Lines are read in any language
 * regardless; this picks what the recipe is stored as and its default
 * measurement system. A tie (en/fr share "Ingredients", "Préparation",
 * "Notes", ...) goes to the one tied language whose own unit words ("2 c. à
 * soupe") the recipe uses, when no other language's appear; else to
 * `preferred` if tied, else null. Null too when nothing matches.
 */
export function detectRecipeLocale(
  root: ConversionSourceNode,
  preferred: RecipeLocale,
): RecipeLocale | null {
  const scores = RECIPE_LOCALES.map(
    (locale) =>
      root.children.filter((child) => {
        const line = child.title.split("\n")[0];
        const label = splitLabelValue(line)?.label;
        return (
          sectionRoleIn(line, locale) !== null ||
          (label !== undefined && metadataField(label, locale) !== null)
        );
      }).length,
  );
  const best = Math.max(...scores);
  if (best === 0) return null;
  const winners = RECIPE_LOCALES.filter((_, index) => scores[index] === best);
  if (winners.length === 1) return winners[0];
  const units = new Set(linesBelow(root).flatMap(exclusiveUnitLocales));
  const [only] = units;
  if (units.size === 1 && winners.includes(only)) return only;
  return winners.includes(preferred) ? preferred : null;
}

/** Analyzes in the detected language (and its measurement system), else `fallbackLocale`'s. */
export function analyzeWithDetectedLocale(
  root: ConversionSourceNode,
  fallbackLocale: RecipeLocale,
): { draft: ConversionDraft; detectedLocale: RecipeLocale | null } {
  const detectedLocale = detectRecipeLocale(root, fallbackLocale);
  const draft = analyzeRecipeConversion(
    root,
    defaultParseContext(detectedLocale ?? fallbackLocale),
  );
  return { draft, detectedLocale };
}

const BULLET_MARKER = /^([ \t]*)[-*•+][ \t]+/;
const NUMBERED_LINE = /^(\d+)[.)]\s+(.+)$/;

/** "## Malzemeler", "**Malzemeler:**", "Malzemeler:" -> "Malzemeler". */
function stripHeadingMarkup(line: string): string {
  return line
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/:$/, "")
    .replace(/^(\*\*|__)(.+)\1$/, "$2")
    .replace(/:$/, "")
    .trim();
}

/**
 * Drops "1. ", "2. " prefixes only when the lines are numbered 1..n in
 * order - so a step that merely starts with a number ("18. dakikadan
 * itibaren ...") in an unnumbered list is left alone.
 */
function stripSequentialNumbering(nodes: OutlineNode[]): void {
  const matches = nodes.map((node) => node.text.match(NUMBERED_LINE));
  const sequential = matches.every(
    (match, index) => match && Number(match[1]) === index + 1,
  );
  if (!sequential) return;
  nodes.forEach((node, index) => {
    node.text = matches[index]?.[2] ?? node.text;
  });
}

/**
 * Import from text: turns a whole pasted recipe into the outline Convert
 * expects, independent of how Logseq would have split the paste. The first
 * line is the title; a line that is exactly a section heading in any
 * language starts a section and every following line belongs to it; lines
 * before the first heading (Yield/Prep/Source...) stay under the title.
 * Indentation only nests lines within those groups (a note under its step),
 * so ragged indentation can't move a line into another section. Bullets
 * ("- ", "* ") are dropped, their indentation kept. Null without any
 * section heading - no structure is guessed.
 */
export function parseRecipeText(
  rawText: string,
  context: ParseContext = defaultParseContext("en"),
): OutlineNode | null {
  const lines = stripCodeFence(rawText)
    .split("\n")
    .map((line) => line.replace(BULLET_MARKER, "$1").trimEnd())
    .filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;

  const root: OutlineNode = {
    text: stripHeadingMarkup(lines[0]),
    children: [],
  };
  let group = root;
  let body: string[] = [];
  let sawHeading = false;
  const flushBody = () => {
    group.children.push(...nestLines(body));
    if (group !== root) stripSequentialNumbering(group.children);
    body = [];
  };

  for (const line of lines.slice(1)) {
    const heading = stripHeadingMarkup(line);
    if (!isSectionHeadingInAnyLocale(heading)) {
      body.push(line);
      continue;
    }
    flushBody();
    group = { text: heading, children: [] };
    root.children.push(group);
    sawHeading = true;
  }
  flushBody();

  return root.text && sawHeading ? tidyRecipeOutline(root, context) : null;
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

/**
 * The same structure for blocks written after the preview: every block id
 * the preview used is swapped for the id of the block written in its place.
 */
export function withWrittenBlockIds(
  structure: ExistingRecipeStructure,
  ids: ReadonlyMap<string, string>,
): ExistingRecipeStructure {
  const idOf = (id: string) => {
    const written = ids.get(id);
    if (!written) throw new Error(`No block was written for ${id}.`);
    return written;
  };
  return {
    ...structure,
    rootId: idOf(structure.rootId),
    sectionRoles: structure.sectionRoles.map((entry) => ({
      ...entry,
      blockId: idOf(entry.blockId),
    })),
    ...(structure.ingredientMetadata
      ? {
          ingredientMetadata: structure.ingredientMetadata.map((entry) => ({
            ...entry,
            blockId: idOf(entry.blockId),
          })),
        }
      : {}),
  };
}

export async function commitRecipeConversion(
  repository: RecipeRepository,
  draft: ConversionDraft,
): Promise<void> {
  await repository.markExistingRecipe(conversionStructure(draft));
}
