import type { IngredientConversionOverride } from "../domain/recipe";
import { LINEAR_UNIT_DEFINITIONS } from "./definitions";

export interface IngredientMassVolumeRule {
  key: string;
  aliases: readonly string[];
  gramsPerMilliliter: number;
  sourceNote: string;
}

export interface IngredientConversionProvider {
  find(ingredientText: string): IngredientMassVolumeRule | null;
}

const US_CUP_ML = 236.5882365;
const US_TBSP_ML = 14.78676478125;

export const BUILTIN_INGREDIENT_RULES: readonly IngredientMassVolumeRule[] = [
  {
    key: "all-purpose-flour",
    aliases: [
      "all-purpose flour",
      "all purpose flour",
      "plain flour",
      "flour",
      "un",
      "farine",
      "mehl",
      "harina",
    ],
    gramsPerMilliliter: 120 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup all-purpose flour = 120 g.",
  },
  {
    key: "butter",
    aliases: ["butter", "tereyağı", "tereyagi", "beurre", "mantequilla"],
    gramsPerMilliliter: 113 / (8 * US_TBSP_ML),
    sourceNote:
      "King Arthur Ingredient Weight Chart: 8 US tablespoons butter = 113 g.",
  },
  {
    key: "granulated-sugar",
    aliases: [
      "granulated sugar",
      "white sugar",
      "toz şeker",
      "toz seker",
      "sucre en poudre",
      "zucker",
      "azúcar",
      "azucar",
    ],
    gramsPerMilliliter: 198 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup granulated white sugar = 198 g.",
  },
  {
    key: "bread-flour",
    aliases: [
      "bread flour",
      "ekmeklik un",
      "farine de blé",
      "farine de ble",
      "farine à pain",
      "farine a pain",
      "brotmehl",
      "harina de fuerza",
      "harina de pan",
    ],
    gramsPerMilliliter: 120 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup bread flour = 120 g.",
  },
  {
    key: "whole-wheat-flour",
    aliases: [
      "whole wheat flour",
      "wholemeal flour",
      "tam buğday unu",
      "tam bugday unu",
      "farine complète",
      "farine complete",
      "vollkornmehl",
      "harina integral",
    ],
    gramsPerMilliliter: 113 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup whole wheat flour (Premium 100%) = 113 g.",
  },
  {
    key: "brown-sugar",
    aliases: [
      "brown sugar",
      "esmer şeker",
      "esmer seker",
      "sucre roux",
      "cassonade",
      "brauner zucker",
      "azúcar moreno",
      "azucar moreno",
      "azúcar morena",
      "azucar morena",
    ],
    gramsPerMilliliter: 213 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup brown sugar (packed) = 213 g.",
  },
  {
    key: "confectioners-sugar",
    aliases: [
      "powdered sugar",
      "confectioners sugar",
      "confectioners' sugar",
      "icing sugar",
      "pudra şeker",
      "pudra seker",
      "sucre glace",
      "puderzucker",
      "azúcar glas",
      "azucar glas",
      "azúcar impalpable",
      "azucar impalpable",
    ],
    gramsPerMilliliter: 113 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup confectioners' sugar (unsifted) = 113 g.",
  },
  {
    key: "cocoa-powder",
    aliases: [
      "cocoa powder",
      "unsweetened cocoa",
      "kakao",
      "cacao en poudre",
      "kakaopulver",
      "cacao en polvo",
    ],
    gramsPerMilliliter: 42 / (0.5 * US_CUP_ML),
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1/2 US cup unsweetened cocoa = 42 g.",
  },
  {
    key: "honey",
    aliases: ["honey", "bal", "miel", "honig"],
    gramsPerMilliliter: 21 / US_TBSP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US tablespoon honey = 21 g.",
  },
  {
    key: "vegetable-oil",
    aliases: [
      "vegetable oil",
      "sıvı yağ",
      "sivi yag",
      "huile végétale",
      "huile vegetale",
      "pflanzenöl",
      "pflanzenol",
      "aceite vegetal",
    ],
    gramsPerMilliliter: 198 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup vegetable oil = 198 g.",
  },
  {
    key: "milk",
    aliases: ["milk", "süt", "sut", "lait", "milch", "leche"],
    gramsPerMilliliter: 227 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup milk (fresh) = 227 g.",
  },
  {
    key: "rolled-oats",
    aliases: [
      "rolled oats",
      "oats",
      "yulaf",
      "yulaf ezmesi",
      "flocons d'avoine",
      "flocons d avoine",
      "haferflocken",
      "copos de avena",
    ],
    gramsPerMilliliter: 89 / US_CUP_ML,
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1 US cup oats (old-fashioned or quick-cooking) = 89 g.",
  },
  {
    key: "cornstarch",
    aliases: [
      "cornstarch",
      "corn starch",
      "mısır nişastası",
      "misir nisastasi",
      "maïzena",
      "maizena",
      "speisestärke",
      "speisestarke",
      "maicena",
    ],
    gramsPerMilliliter: 28 / (0.25 * US_CUP_ML),
    sourceNote:
      "King Arthur Ingredient Weight Chart: 1/4 US cup cornstarch = 28 g.",
  },
];

function normalizeIngredientText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[(),.;:]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function matchesAlias(text: string, alias: string): boolean {
  const normalizedAlias = normalizeIngredientText(alias);
  if (!normalizedAlias) return false;
  if (text === normalizedAlias) return true;

  if (normalizedAlias.length < 4) return false;
  return (
    text.startsWith(`${normalizedAlias} `) ||
    text.endsWith(` ${normalizedAlias}`) ||
    text.includes(` ${normalizedAlias} `)
  );
}

function providerFromRules(
  rules: readonly IngredientMassVolumeRule[],
): IngredientConversionProvider {
  return {
    find(ingredientText) {
      const normalized = normalizeIngredientText(ingredientText);
      for (const rule of rules) {
        if (rule.aliases.some((alias) => matchesAlias(normalized, alias))) {
          return rule;
        }
      }
      return null;
    },
  };
}

export const builtInIngredientConversionProvider = providerFromRules(
  BUILTIN_INGREDIENT_RULES,
);

export function composeIngredientConversionProviders(
  ...providers: readonly IngredientConversionProvider[]
): IngredientConversionProvider {
  return {
    find(ingredientText) {
      for (const provider of providers) {
        const match = provider.find(ingredientText);
        if (match) return match;
      }
      return null;
    },
  };
}

function ruleFromOverride(
  override: IngredientConversionOverride,
): IngredientMassVolumeRule | null {
  const ingredientKey = override.ingredientKey.trim();
  if (!ingredientKey) return null;
  if (
    !Number.isFinite(override.gramsPerVolumeUnit) ||
    override.gramsPerVolumeUnit <= 0
  ) {
    return null;
  }

  const volume = LINEAR_UNIT_DEFINITIONS[override.volumeUnit];
  if (volume?.family !== "volume" || volume.toBase <= 0) return null;

  return {
    key: ingredientKey,
    aliases: [ingredientKey],
    gramsPerMilliliter: override.gramsPerVolumeUnit / volume.toBase,
    sourceNote: `Recipe override: 1 ${override.volumeUnit} = ${override.gramsPerVolumeUnit} g.`,
  };
}

export function createIngredientConversionProvider(
  overrides: readonly IngredientConversionOverride[],
  builtIns: readonly IngredientMassVolumeRule[] = BUILTIN_INGREDIENT_RULES,
): IngredientConversionProvider {
  const overrideRules = overrides.flatMap((override) => {
    const rule = ruleFromOverride(override);
    return rule ? [rule] : [];
  });

  return composeIngredientConversionProviders(
    providerFromRules(overrideRules),
    providerFromRules(builtIns),
  );
}
