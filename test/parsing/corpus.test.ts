import { describe, expect, it } from "vitest";
import { parseRecipeMetadataLine } from "../../src/application/recipe-metadata";
import type { Quantity } from "../../src/domain/quantity";
import type { RecipeLocale } from "../../src/domain/recipe";
import { defaultParseContext } from "../../src/parsing/context";
import {
  ingredientParseContext,
  stepParseContext,
} from "../../src/parsing/detect-locale";
import { parseIngredient } from "../../src/parsing/ingredient";
import { lexRecipeText } from "../../src/parsing/lexer";
import { parseStep } from "../../src/parsing/step";
import { CORPUS } from "./fixtures/corpus";

function amount(quantity: Quantity): string {
  switch (quantity.kind) {
    case "exact":
      return String(quantity.value);
    case "range":
      return `${quantity.min}-${quantity.max}`;
    case "approximate":
      return `~${quantity.value}`;
    case "minimum":
      return `>=${quantity.value}`;
    case "maximum":
      return `<=${quantity.value}`;
    case "inexact":
      return quantity.expression;
  }
}

function readIngredient(text: string, locale: RecipeLocale): string {
  const parsed = parseIngredient(
    text,
    ingredientParseContext(text, defaultParseContext(locale)),
  );
  if (!parsed.amount) return parsed.ambiguous ? "review" : "none";
  return [
    `${amount(parsed.amount)} ${parsed.unit ?? "-"}`,
    parsed.ingredientText,
    ...(parsed.note ? [parsed.note] : []),
  ].join(" | ");
}

function readStep(text: string, locale: RecipeLocale): string {
  const step = parseStep(
    text,
    stepParseContext(text, defaultParseContext(locale)),
  );
  const parts = [
    [
      "D",
      step.durations.map((duration) =>
        [
          amount(duration.value),
          duration.unit,
          duration.negated ? "not" : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      ),
    ],
    [
      "T",
      step.temperatures.map((temperature) =>
        [
          `${temperature.value}${temperature.unit === "celsius" ? "C" : "F"}`,
          temperature.preheat ? "preheat" : undefined,
          temperature.ovenMode,
        ]
          .filter(Boolean)
          .join(" "),
      ),
    ],
    ["H", step.heat.map((heat) => heat.level ?? heat.surfaceState)],
  ] as const;
  const described = parts
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => `${label}: ${items.join(", ")}`)
    .join("; ");
  return described || "-";
}

function readMetadata(text: string, locale: RecipeLocale): string {
  const parsed = parseRecipeMetadataLine(text, defaultParseContext(locale));
  if (!parsed) return "none";
  if (parsed.value === null) return `${parsed.field} null`;
  if (parsed.field === "yield") {
    return [parsed.field, parsed.value.baseYield, parsed.value.yieldUnit]
      .filter((part) => part !== undefined)
      .join(" ");
  }
  return `${parsed.field} ${parsed.value}`;
}

describe.each(Object.entries(CORPUS))("%s recipe lines", (locale, corpus) => {
  const recipeLocale = locale as RecipeLocale;

  it.each(corpus.ingredients)("ingredient %s -> %s", (text, expected) => {
    expect(readIngredient(text, recipeLocale)).toBe(expected);
  });

  it.each(corpus.steps)("step %s -> %s", (text, expected) => {
    expect(readStep(text, recipeLocale)).toBe(expected);
  });

  it.each(corpus.metadata)("metadata %s -> %s", (text, expected) => {
    expect(readMetadata(text, recipeLocale)).toBe(expected);
  });

  it("keeps every token's source span", () => {
    for (const [text] of [
      ...corpus.ingredients,
      ...corpus.steps,
      ...corpus.metadata,
    ]) {
      for (const token of lexRecipeText(text, recipeLocale)) {
        expect(text.slice(token.startOffset, token.endOffset)).toBe(token.raw);
      }
    }
  });
});
