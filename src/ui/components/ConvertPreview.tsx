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
  type IngredientCorrection,
  isConversionCommittable,
  isIngredientAmountIssue,
} from "../../application/convert-recipe";
import type { OutlineNode } from "../../application/split-outline";
import {
  RECIPE_SECTION_ROLES,
  type RecipeSectionRole,
} from "../../application/types";
import type { RecipeLocale } from "../../domain/recipe";
import type { CanonicalUnit, MeasurementSystem } from "../../domain/unit";
import { defaultParseContext } from "../../parsing/context";
import { RECIPE_LOCALES } from "../../parsing/locales";
import { COOKING_UNITS_BY_SYSTEM } from "../../units/definitions";
import { unitLabel } from "../../units/format";
import { useConfirmDiscard, useDirtyReport } from "../dirty-guard";
import type { UiMessages } from "../i18n";
import { RECIPE_LOCALE_NAMES } from "../i18n";
import {
  formatQuantity,
  ingredientUnitOptionLabel,
} from "../ingredient-display";

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
  "can",
  "package",
  "bunch",
  "jar",
  "sprig",
  "head",
  "stick",
];

// Shown in their own section above the warning list, so never listed twice.
const ISSUES_WITH_THEIR_OWN_SECTION = new Set([
  "ingredient-amount-unparsed",
  "ingredient-amount-ambiguous",
  "missing-base-yield",
  "unrecognized-section",
]);

interface IngredientCorrectionDraft {
  amount: string;
  unit: CanonicalUnit | "";
  ingredientText: string;
}

// A typed-in correction ready to apply, or null while it is incomplete.
function usableCorrection(
  correction: IngredientCorrectionDraft,
): IngredientCorrection | null {
  const amount = Number(correction.amount);
  if (
    correction.amount.trim() === "" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !correction.ingredientText.trim()
  ) {
    return null;
  }
  return {
    amount,
    ...(correction.unit ? { unit: correction.unit } : {}),
    ingredientText: correction.ingredientText,
  };
}

export interface ConvertPreviewProps {
  source: ConversionSourceNode;
  draft: ConversionDraft;
  // Set when the recipe's language was picked from its own headings/labels.
  detectedLocale?: RecipeLocale;
  // What confirming will write, when it is more than marking these blocks:
  // a notice, and the outline the blocks become.
  notice?: string;
  outline?: OutlineNode;
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

function OutlineTree({ nodes }: { nodes: readonly OutlineNode[] }) {
  return (
    <ul>
      {nodes.map((node, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a static outline - lines never move, and two lines may read the same.
        <li key={index}>
          {node.text}
          {node.children.length > 0 && <OutlineTree nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

export function ConvertPreview({
  source,
  draft,
  detectedLocale,
  notice,
  outline,
  messages,
  pending = false,
  onConfirm,
  onCancel,
  onDirtyChange,
}: ConvertPreviewProps) {
  const confirmDiscard = useConfirmDiscard(messages);
  const [resolvedDraft, setResolvedDraft] = useState(draft);
  const [corrections, setCorrections] = useState<
    Record<string, IngredientCorrectionDraft>
  >({});
  const [yieldDraft, setYieldDraft] = useState({ amount: "", unit: "" });
  const [openNoAmount, setOpenNoAmount] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Until the user picks a measurement system themselves, it follows the
  // recipe language's default (TR -> metric) when the language changes.
  const [sourceSystemChosen, setSourceSystemChosen] = useState(false);

  useEffect(() => {
    setResolvedDraft(draft);
    setCorrections({});
    setYieldDraft({ amount: "", unit: "" });
    setSourceSystemChosen(false);
    setOpenNoAmount(new Set());
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
  // An unreadable amount must be settled; a line with no amount at all
  // ("a little salt") is fine as written - listed once, correctable on demand.
  const ambiguousIssues = pendingIngredientIssues.filter(
    (issue) => issue.code === "ingredient-amount-ambiguous",
  );
  const noAmountIssues = pendingIngredientIssues.filter(
    (issue) => issue.code === "ingredient-amount-unparsed",
  );
  const listedIssues = resolvedDraft.issues.filter(
    (issue) => !ISSUES_WITH_THEIR_OWN_SECTION.has(issue.code),
  );
  const missingYield = resolvedDraft.issues.some(
    (issue) => issue.code === "missing-base-yield",
  );
  const yieldAmountValue = Number(yieldDraft.amount);
  const canUseYield =
    yieldDraft.amount.trim() !== "" &&
    Number.isFinite(yieldAmountValue) &&
    yieldAmountValue > 0;

  // What Confirm commits: a serving count or amount typed in but not yet
  // applied with its own button counts too, never silently dropped.
  let committed =
    missingYield && canUseYield
      ? correctConversionYield(resolvedDraft, yieldAmountValue, yieldDraft.unit)
      : resolvedDraft;
  for (const { blockId } of pendingIngredientIssues) {
    const correction = blockId ? corrections[blockId] : undefined;
    const usable = correction && usableCorrection(correction);
    if (blockId && usable) {
      committed = correctConversionIngredient(committed, blockId, usable);
    }
  }
  const canConfirm = isConversionCommittable(committed);

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
  function reviewCard(issue: ConversionIssue) {
    const blockId = issue.blockId;
    if (!blockId) return null;
    const ingredient = resolvedDraft.ingredients.find(
      (candidate) => candidate.blockId === blockId,
    );
    if (!ingredient) return null;
    const correction = correctionFor(blockId, ingredient.parsed.ingredientText);
    const usable = usableCorrection(correction);

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
              updateCorrection(blockId, ingredient.parsed.ingredientText, {
                amount: event.target.value,
              })
            }
          />
          <select
            aria-label={`${messages.unit}: ${ingredient.parsed.rawText}`}
            value={correction.unit}
            onChange={(event) =>
              updateCorrection(blockId, ingredient.parsed.ingredientText, {
                unit: event.target.value as CanonicalUnit | "",
              })
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
              updateCorrection(blockId, ingredient.parsed.ingredientText, {
                ingredientText: event.target.value,
              })
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
            disabled={!usable}
            onClick={() =>
              usable &&
              setResolvedDraft((current) =>
                correctConversionIngredient(current, blockId, usable),
              )
            }
          >
            {messages.useStructuredAmount}
          </button>
        </div>
      </div>
    );
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
      {notice && (
        <div className="draft-recipe-banner" role="note">
          <p>{notice}</p>
        </div>
      )}
      <div className="draft-recipe-meta-row">
        <label>
          {messages.parserLanguage}
          <select
            value={resolvedDraft.locale}
            onChange={(event) => {
              const locale = event.currentTarget.value as RecipeLocale;
              reanalyze(
                locale,
                sourceSystemChosen
                  ? resolvedDraft.sourceMeasurementSystem
                  : defaultParseContext(locale).sourceMeasurementSystem,
              );
            }}
          >
            {RECIPE_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {RECIPE_LOCALE_NAMES[locale]}
              </option>
            ))}
          </select>
        </label>
        {detectedLocale === resolvedDraft.locale && (
          <small>{messages.localeAutoDetected}</small>
        )}
        <label title={messages.sourceMeasurementHelp}>
          {messages.sourceMeasurementSystem}
          <select
            value={resolvedDraft.sourceMeasurementSystem}
            onChange={(event) => {
              setSourceSystemChosen(true);
              reanalyze(
                resolvedDraft.locale,
                event.currentTarget.value as MeasurementSystem,
              );
            }}
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
      {resolvedDraft.ingredients.length > 0 && (
        <details className="draft-recipe-read-lines">
          <summary>{messages.ingredientsAsRead}</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">{messages.amount}</th>
                <th scope="col">{messages.unit}</th>
                <th scope="col">{messages.ingredientKey}</th>
              </tr>
            </thead>
            <tbody>
              {resolvedDraft.ingredients.map(({ blockId, parsed }) => (
                <tr key={blockId}>
                  <td>
                    {parsed.amount
                      ? formatQuantity(
                          parsed.amount,
                          messages.uiLocale,
                          parsed.unit,
                        )
                      : "—"}
                  </td>
                  <td>
                    {parsed.unit
                      ? unitLabel(parsed.unit, messages.uiLocale)
                      : "—"}
                  </td>
                  <td>
                    {parsed.ingredientText}
                    {parsed.note && <small>{` (${parsed.note})`}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {outline && (
        <details className="draft-recipe-outline-preview">
          <summary>{messages.newStructure}</summary>
          <div className="draft-recipe-outline-scroll">
            <OutlineTree nodes={[outline]} />
          </div>
        </details>
      )}

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
                {RECIPE_SECTION_ROLES.filter(
                  (role) => !usedRoles.has(role),
                ).map((role) => (
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

      {ambiguousIssues.length > 0 && (
        <section className="draft-recipe-conversion-classification">
          <h2>{messages.reviewIngredient}</h2>
          {ambiguousIssues.map(reviewCard)}
        </section>
      )}

      {noAmountIssues.length > 0 && (
        <section className="draft-recipe-conversion-classification">
          <p>{messages.noAmountLinesNote}</p>
          <ul className="draft-recipe-no-amount-lines">
            {noAmountIssues.map((issue) =>
              issue.blockId && openNoAmount.has(issue.blockId) ? (
                <li key={issue.blockId}>{reviewCard(issue)}</li>
              ) : (
                <li key={issue.blockId ?? issue.message}>
                  <span>{issue.detail}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenNoAmount(
                        (current) => new Set([...current, issue.blockId ?? ""]),
                      )
                    }
                  >
                    {messages.enterAmount}
                  </button>
                </li>
              ),
            )}
          </ul>
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

      {listedIssues.length > 0 && (
        <ul className="draft-recipe-warning-list">
          {listedIssues.map((issue) => (
            <li key={`${issue.code}-${issue.blockId ?? issue.message}`}>
              {issueText(issue, messages)}
            </li>
          ))}
        </ul>
      )}

      <div className="draft-recipe-actions draft-recipe-sticky-actions">
        <button type="button" onClick={() => confirmDiscard(isDirty, onCancel)}>
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          onClick={() => onConfirm(committed)}
          disabled={!canConfirm || pending}
        >
          {messages.confirm}
        </button>
      </div>
    </section>
  );
}
