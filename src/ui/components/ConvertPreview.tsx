import { useEffect, useMemo, useState } from "react";
import {
  acceptConversionIngredientAsRaw,
  type ConversionDraft,
  classifyConversionSection,
  correctConversionIngredient,
  correctConversionYield,
  isConversionCommittable,
} from "../../application/convert-recipe";
import type { RecipeSectionRole } from "../../application/types";
import type { CanonicalUnit } from "../../domain/unit";
import { COOKING_UNITS_BY_SYSTEM } from "../../units/definitions";
import type { UiMessages } from "../i18n";
import { ingredientUnitOptionLabel } from "../ingredient-display";

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
  draft: ConversionDraft;
  messages: UiMessages;
  onConfirm(draft: ConversionDraft): void;
  onCancel(): void;
}

export function ConvertPreview({
  draft,
  messages,
  onConfirm,
  onCancel,
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

  const usedRoles = useMemo(
    () => new Set(resolvedDraft.sections.map((section) => section.role)),
    [resolvedDraft.sections],
  );
  const canConfirm = isConversionCommittable(resolvedDraft);
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
    (issue) => issue.code === "ingredient-amount-unparsed",
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
                        {ingredientUnitOptionLabel(unit)}
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
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="draft-recipe-actions">
        <button type="button" onClick={onCancel}>
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          onClick={() => onConfirm(resolvedDraft)}
          disabled={!canConfirm}
        >
          {messages.confirm}
        </button>
      </div>
    </section>
  );
}
