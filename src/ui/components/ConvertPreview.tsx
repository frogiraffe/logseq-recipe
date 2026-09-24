import { useEffect, useMemo, useState } from "react";
import {
  acceptConversionIngredientAsRaw,
  analyzeRecipeConversion,
  type ConversionDraft,
  type ConversionIssue,
  type ConversionSourceNode,
  classifyConversionSection,
  correctConversionIngredient,
  correctConversionYield,
  isConversionCommittable,
  isIngredientAmountIssue,
} from "../../application/convert-recipe";
import type { RecipeSectionRole } from "../../application/types";
import type { RecipeLocale } from "../../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../domain/unit";
import { COOKING_UNITS_BY_SYSTEM } from "../../units/definitions";
import { confirmDiscardIfDirty, useDirtyReport } from "../dirty-guard";
import type { UiMessages } from "../i18n";
import { ingredientUnitOptionLabel } from "../ingredient-display";

const PARSER_LOCALES: readonly RecipeLocale[] = ["en", "tr", "fr", "de", "es"];

const FIXED_UNIT_OPTIONS: readonly CanonicalUnit[] = [
  "g",
  "kg",
  "mg",
  "oz_mass",
  "lb",
  "ml",
  "l",
  "piece",
  "egg",
  "clove",
  "slice",
  "pinch",
];

interface IngredientCorrectionDraft {
  amount: string;
  unit: CanonicalUnit | "";
  ingredientText: string;
}

export interface ConvertPreviewProps {
  source: ConversionSourceNode;
  draft: ConversionDraft;
  messages: UiMessages;
  pending?: boolean;
  onConfirm(draft: ConversionDraft): void;
  onCancel(): void;
  // Lets the app shell's global Close button apply the same discard
  // confirmation as this form's own Cancel button.
  onDirtyChange?(isDirty: boolean): void;
}

const ISSUE_MESSAGE_KEYS: Readonly<Record<string, keyof UiMessages>> = {
  "missing-base-yield": "issueMissingBaseYield",
  "no-ingredients-section": "issueNoIngredientsSection",
  "no-steps-section": "issueNoStepsSection",
  "duplicate-section-role": "issueDuplicateSectionRole",
  "unrecognized-section": "issueUnrecognizedSection",
  "unclassified-content": "issueUnclassifiedContent",
  "invalid-metadata-value": "issueInvalidMetadataValue",
  "ingredient-amount-unparsed": "issueIngredientAmountUnparsed",
  "ingredient-amount-ambiguous": "issueIngredientAmountAmbiguous",
};

function issueText(issue: ConversionIssue, messages: UiMessages): string {
  const key = ISSUE_MESSAGE_KEYS[issue.code];
  if (!key) return issue.message;
  const detail =
    issue.code === "duplicate-section-role"
      ? messages[issue.detail as RecipeSectionRole]
      : issue.detail;
  // A function replacement: the line itself may contain "$&" or "$'",
  // which a string replacement would expand.
  return String(messages[key]).replace("{detail}", () => detail ?? "");
}

export function ConvertPreview({
  source,
  draft,
  messages,
  pending = false,
  onConfirm,
  onCancel,
  onDirtyChange,
}: ConvertPreviewProps) {
  const [resolvedDraft, setResolvedDraft] = useState(draft);
  const [corrections, setCorrections] = useState<
    Record<string, IngredientCorrectionDraft>
  >({});
  const [yieldDraft, setYieldDraft] = useState({ amount: "", unit: "" });

  useEffect(() => {
    setResolvedDraft(draft);
    setCorrections({});
    setYieldDraft({ amount: "", unit: "" });
  }, [draft]);

  // The Logseq UI's language isn't necessarily the recipe's language, and an
  // English recipe isn't necessarily US Customary - let the user correct
  // either before committing, with a full, deterministic re-analysis of the
  // original source (never the already-resolved/corrected draft, which
  // would compound stale corrections onto a different parse).
  function reanalyze(
    locale: RecipeLocale,
    sourceMeasurementSystem: MeasurementSystem,
  ) {
    setResolvedDraft(
      analyzeRecipeConversion(source, { locale, sourceMeasurementSystem }),
    );
    setCorrections({});
    setYieldDraft({ amount: "", unit: "" });
  }

  const usedRoles = useMemo(
    () => new Set(resolvedDraft.sections.map((section) => section.role)),
    [resolvedDraft.sections],
  );
  const canConfirm = isConversionCommittable(resolvedDraft);
  const isDirty =
    resolvedDraft !== draft ||
    Object.keys(corrections).length > 0 ||
    yieldDraft.amount.trim() !== "" ||
    yieldDraft.unit.trim() !== "";
  useDirtyReport(isDirty, onDirtyChange);
  const cookingUnits =
    COOKING_UNITS_BY_SYSTEM[resolvedDraft.sourceMeasurementSystem];
  const unitOptions: readonly CanonicalUnit[] = [
    ...FIXED_UNIT_OPTIONS,
    cookingUnits.tsp,
    cookingUnits.tbsp,
    cookingUnits.cup,
    ...(cookingUnits.flOz ? [cookingUnits.flOz] : []),
  ];
  const pendingIngredientIssues = resolvedDraft.issues.filter(
    isIngredientAmountIssue,
  );
  const missingYield = resolvedDraft.issues.some(
    (issue) => issue.code === "missing-base-yield",
  );
  const yieldAmountValue = Number(yieldDraft.amount);
  const canUseYield =
    yieldDraft.amount.trim() !== "" &&
    Number.isFinite(yieldAmountValue) &&
    yieldAmountValue > 0;

  function correctionFor(
    blockId: string,
    fallbackText: string,
  ): IngredientCorrectionDraft {
    return (
      corrections[blockId] ?? {
        amount: "",
        unit: "",
        ingredientText: fallbackText,
      }
    );
  }

  function updateCorrection(
    blockId: string,
    fallbackText: string,
    patch: Partial<IngredientCorrectionDraft>,
  ) {
    setCorrections((current) => ({
      ...current,
      [blockId]: { ...correctionFor(blockId, fallbackText), ...patch },
    }));
  }
  const roleLabels: Record<RecipeSectionRole, string> = {
    ingredients: messages.ingredients,
    steps: messages.steps,
    notes: messages.notes,
  };

  return (
    <section className="draft-recipe-convert-preview">
      <h1>{messages.convertToRecipe}</h1>
      <p className="draft-recipe-convert-source">
        {`${messages.converting}: `}
        <strong>{resolvedDraft.title}</strong>
      </p>
      <div className="draft-recipe-meta-row">
        <label>
          {messages.parserLanguage}
          <select
            value={resolvedDraft.locale}
            onChange={(event) =>
              reanalyze(
                event.currentTarget.value as RecipeLocale,
                resolvedDraft.sourceMeasurementSystem,
              )
            }
          >
            {PARSER_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {locale.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          {messages.sourceMeasurementSystem}
          <select
            value={resolvedDraft.sourceMeasurementSystem}
            onChange={(event) =>
              reanalyze(
                resolvedDraft.locale,
                event.currentTarget.value as MeasurementSystem,
              )
            }
          >
            <option value="metric">{messages.metric}</option>
            <option value="us">{messages.usCustomary}</option>
            <option value="imperial">{messages.imperial}</option>
          </select>
        </label>
      </div>
      <dl className="draft-recipe-convert-summary">
        <div>
          <dt>{messages.ingredients}</dt>
          <dd>{resolvedDraft.ingredients.length}</dd>
        </div>
        <div>
          <dt>{messages.steps}</dt>
          <dd>{resolvedDraft.steps.length}</dd>
        </div>
        {resolvedDraft.metadata.baseYield !== undefined && (
          <div>
            <dt>{messages.servings}</dt>
            <dd>{resolvedDraft.metadata.baseYield}</dd>
          </div>
        )}
      </dl>

      {resolvedDraft.unknownSections.length > 0 && (
        <section className="draft-recipe-conversion-classification">
          <h2>{messages.classifySection}</h2>
          {resolvedDraft.unknownSections.map((section) => (
            <div
              className="draft-recipe-conversion-classification-row"
              key={section.blockId}
            >
              <strong>{section.title}</strong>
              <div className="draft-recipe-actions">
                {(["ingredients", "steps", "notes"] as const)
                  .filter((role) => !usedRoles.has(role))
                  .map((role) => (
                    <button
                      type="button"
                      key={role}
                      onClick={() =>
                        setResolvedDraft((current) =>
                          classifyConversionSection(
                            current,
                            section.blockId,
                            role,
                          ),
                        )
                      }
                    >
                      {roleLabels[role]}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() =>
                    setResolvedDraft((current) =>
                      classifyConversionSection(
                        current,
                        section.blockId,
                        "ignore",
                      ),
                    )
                  }
                >
                  {messages.ignore}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {pendingIngredientIssues.length > 0 && (
        <section className="draft-recipe-conversion-classification">
          <h2>{messages.reviewIngredient}</h2>
          {pendingIngredientIssues.map((issue) => {
            const blockId = issue.blockId;
            if (!blockId) return null;
            const ingredient = resolvedDraft.ingredients.find(
              (candidate) => candidate.blockId === blockId,
            );
            if (!ingredient) return null;
            const correction = correctionFor(
              blockId,
              ingredient.parsed.ingredientText,
            );
            const amountValue = Number(correction.amount);
            const canUseAmount =
              correction.amount.trim() !== "" &&
              Number.isFinite(amountValue) &&
              amountValue > 0 &&
              correction.ingredientText.trim() !== "";

            return (
              <div className="draft-recipe-ingredient-review-row" key={blockId}>
                <strong>{ingredient.parsed.rawText}</strong>
                <div className="draft-recipe-ingredient-review-fields">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder={messages.amount}
                    aria-label={`${messages.amount}: ${ingredient.parsed.rawText}`}
                    value={correction.amount}
                    onChange={(event) =>
                      updateCorrection(
                        blockId,
                        ingredient.parsed.ingredientText,
                        { amount: event.target.value },
                      )
                    }
                  />
                  <select
                    aria-label={`${messages.unit}: ${ingredient.parsed.rawText}`}
                    value={correction.unit}
                    onChange={(event) =>
                      updateCorrection(
                        blockId,
                        ingredient.parsed.ingredientText,
                        { unit: event.target.value as CanonicalUnit | "" },
                      )
                    }
                  >
                    <option value="">{messages.noUnit}</option>
                    {unitOptions.map((unit) => (
                      <option key={unit} value={unit}>
                        {ingredientUnitOptionLabel(unit, messages.uiLocale)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    aria-label={`${messages.ingredientKey}: ${ingredient.parsed.rawText}`}
                    value={correction.ingredientText}
                    onChange={(event) =>
                      updateCorrection(
                        blockId,
                        ingredient.parsed.ingredientText,
                        { ingredientText: event.target.value },
                      )
                    }
                  />
                </div>
                <div className="draft-recipe-actions">
                  <button
                    type="button"
                    onClick={() =>
                      setResolvedDraft((current) =>
                        acceptConversionIngredientAsRaw(current, blockId),
                      )
                    }
                  >
                    {messages.keepAsWritten}
                  </button>
                  <button
                    type="button"
                    disabled={!canUseAmount}
                    onClick={() =>
                      setResolvedDraft((current) =>
                        correctConversionIngredient(current, blockId, {
                          amount: amountValue,
                          ...(correction.unit ? { unit: correction.unit } : {}),
                          ingredientText: correction.ingredientText,
                        }),
                      )
                    }
                  >
                    {messages.useStructuredAmount}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {missingYield && (
        <section className="draft-recipe-conversion-classification">
          <h2>{messages.servings}</h2>
          <p>{messages.missingYieldPrompt}</p>
          <div className="draft-recipe-ingredient-review-fields">
            <input
              type="number"
              step="any"
              min="0"
              placeholder={messages.servings}
              aria-label={messages.servings}
              value={yieldDraft.amount}
              onChange={(event) =>
                setYieldDraft((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
            />
            <input
              type="text"
              placeholder={messages.yieldUnit}
              aria-label={messages.yieldUnit}
              value={yieldDraft.unit}
              onChange={(event) =>
                setYieldDraft((current) => ({
                  ...current,
                  unit: event.target.value,
                }))
              }
            />
            <button
              type="button"
              disabled={!canUseYield}
              onClick={() =>
                setResolvedDraft((current) =>
                  correctConversionYield(
                    current,
                    yieldAmountValue,
                    yieldDraft.unit,
                  ),
                )
              }
            >
              {messages.useThisYield}
            </button>
          </div>
        </section>
      )}

      {resolvedDraft.issues.length > 0 && (
        <ul className="draft-recipe-warning-list">
          {resolvedDraft.issues.map((issue) => (
            <li key={`${issue.code}-${issue.blockId ?? issue.message}`}>
              {issueText(issue, messages)}
            </li>
          ))}
        </ul>
      )}

      <div className="draft-recipe-actions draft-recipe-sticky-actions">
        <button
          type="button"
          onClick={() =>
            confirmDiscardIfDirty(
              isDirty,
              messages.discardChangesConfirm,
              onCancel,
            )
          }
        >
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          onClick={() => onConfirm(resolvedDraft)}
          disabled={!canConfirm || pending}
        >
          {messages.confirm}
        </button>
      </div>
    </section>
  );
}
