import { useEffect, useMemo, useState } from "react";
import type { FacetSuggestion } from "../../application/list-recipes";
import type {
  IngredientConversionOverride,
  Recipe,
  RecipeLocale,
  RecipeMeta,
  VolumeConversionUnit,
} from "../../domain/recipe";
import { coverImagePath } from "../../domain/step-media";
import type { MeasurementSystem } from "../../domain/unit";
import { COOKING_UNITS_BY_SYSTEM } from "../../units/definitions";
import { normalizeIngredientText } from "../../units/ingredient-registry";
import { confirmDiscardIfDirty, useDirtyReport } from "../dirty-guard";
import type { UiMessages } from "../i18n";
import { ingredientUnitOptionLabel } from "../ingredient-display";
import { ChipInput } from "./ChipInput";

function volumeUnitsForSystem(
  system: MeasurementSystem,
): readonly VolumeConversionUnit[] {
  const cooking = COOKING_UNITS_BY_SYSTEM[system];
  return [
    "ml",
    cooking.tsp,
    cooking.tbsp,
    cooking.cup,
  ] as readonly VolumeConversionUnit[];
}

function assetLabel(path: string): string {
  const basename = path.split("/").pop();
  return basename?.trim() ? basename : path;
}

export type CoverSelection = string | null | undefined;

export interface RecipeSettingsPanelProps {
  recipe: Recipe;
  assets: string[];
  messages: UiMessages;
  categorySuggestions?: FacetSuggestion[];
  tagSuggestions?: FacetSuggestion[];
  defaultSourceMeasurementSystem?: MeasurementSystem;
  pending?: boolean;
  onSave(meta: RecipeMeta, cover: CoverSelection): void;
  onCancel(): void;
  // Lets the app shell's global Close button apply the same discard
  // confirmation as this form's own Cancel button.
  onDirtyChange?(isDirty: boolean): void;
}

export function RecipeSettingsPanel({
  recipe,
  assets,
  messages,
  categorySuggestions = [],
  tagSuggestions = [],
  defaultSourceMeasurementSystem = "metric",
  pending = false,
  onSave,
  onCancel,
  onDirtyChange,
}: RecipeSettingsPanelProps) {
  const [categories, setCategories] = useState<string[]>(recipe.categories);
  const [tags, setTags] = useState<string[]>(recipe.tags);
  const [parserLocale, setParserLocale] = useState<RecipeLocale | "">(
    recipe.parserLocale ?? "",
  );
  const [sourceSystem, setSourceSystem] = useState<MeasurementSystem>(
    recipe.sourceMeasurementSystem ?? defaultSourceMeasurementSystem,
  );
  const [displaySystem, setDisplaySystem] = useState<MeasurementSystem | "">(
    recipe.measurementSystemOverride ?? "",
  );
  const [cover, setCover] = useState("__keep__");
  const [coverPath, setCoverPath] = useState("");
  const path = coverPath.trim();
  const validCoverPath = coverImagePath(path) !== null;
  const [overrides, setOverrides] = useState<IngredientConversionOverride[]>(
    recipe.ingredientConversionOverrides,
  );
  const [ingredientKey, setIngredientKey] = useState("");
  const [volumeUnit, setVolumeUnit] = useState<VolumeConversionUnit>("tbsp_us");
  const [gramsPerUnit, setGramsPerUnit] = useState("");

  const volumeUnitOptions = useMemo(
    () => volumeUnitsForSystem(sourceSystem),
    [sourceSystem],
  );

  function arraysDiffer(a: readonly string[], b: readonly string[]): boolean {
    return (
      a.length !== b.length || a.some((value, index) => value !== b[index])
    );
  }
  const isDirty =
    arraysDiffer(categories, recipe.categories) ||
    arraysDiffer(tags, recipe.tags) ||
    parserLocale !== (recipe.parserLocale ?? "") ||
    sourceSystem !==
      (recipe.sourceMeasurementSystem ?? defaultSourceMeasurementSystem) ||
    displaySystem !== (recipe.measurementSystemOverride ?? "") ||
    cover !== "__keep__" ||
    JSON.stringify(overrides) !==
      JSON.stringify(recipe.ingredientConversionOverrides) ||
    ingredientKey.trim() !== "" ||
    gramsPerUnit.trim() !== "";
  useDirtyReport(isDirty, onDirtyChange);
  useEffect(() => {
    if (!volumeUnitOptions.includes(volumeUnit)) {
      setVolumeUnit(volumeUnitOptions[1] ?? volumeUnitOptions[0]);
    }
  }, [volumeUnitOptions, volumeUnit]);

  const addConversion = () => {
    const grams = Number(gramsPerUnit);
    const ingredient = ingredientKey.trim();
    if (!ingredient || !Number.isFinite(grams) || grams <= 0) return;
    // Exactly one density rule per normalized ingredient key: adding a new
    // one for an ingredient that already has a rule replaces it outright
    // (regardless of which volume unit the old rule used), rather than
    // letting two rules for what the matcher treats as the same ingredient
    // coexist and leaving it ambiguous which one "wins".
    const normalizedKey = normalizeIngredientText(ingredient);
    setOverrides((current) => [
      ...current.filter(
        (rule) => normalizeIngredientText(rule.ingredientKey) !== normalizedKey,
      ),
      {
        ingredientKey: ingredient,
        massUnit: "g",
        volumeUnit,
        gramsPerVolumeUnit: grams,
      },
    ]);
    setIngredientKey("");
    setGramsPerUnit("");
  };

  const save = () => {
    if (cover === "__custom__" && !validCoverPath) return;
    const meta: RecipeMeta = {
      categories,
      tags,
      ...(parserLocale ? { parserLocale } : {}),
      sourceMeasurementSystem: sourceSystem,
      ...(displaySystem ? { measurementSystemOverride: displaySystem } : {}),
      ingredientConversionOverrides: overrides,
    };
    const coverSelection: CoverSelection =
      cover === "__keep__"
        ? undefined
        : cover === ""
          ? null
          : cover === "__custom__"
            ? path
            : cover;
    onSave(meta, coverSelection);
  };

  const currentCoverLabel =
    recipe.cover?.kind === "asset-path"
      ? assetLabel(recipe.cover.value)
      : recipe.cover
        ? `${messages.cover} (${messages.inheritDefault})`
        : messages.noCover;

  return (
    <section className="draft-recipe-settings-panel">
      <h1>{messages.recipeSettings}</h1>

      <div className="draft-recipe-field">
        <label htmlFor="draft-recipe-categories-input">
          {messages.category}
        </label>
        <ChipInput
          id="draft-recipe-categories-input"
          values={categories}
          variant="category"
          ariaLabel={messages.category}
          removeLabel={messages.remove}
          suggestions={categorySuggestions}
          onChange={setCategories}
        />
      </div>

      <div className="draft-recipe-field">
        <label htmlFor="draft-recipe-tags-input">{messages.tags}</label>
        <ChipInput
          id="draft-recipe-tags-input"
          values={tags}
          variant="tag"
          ariaLabel={messages.tags}
          removeLabel={messages.remove}
          suggestions={tagSuggestions}
          onChange={setTags}
        />
      </div>

      <label>
        {messages.parserLanguage}
        <select
          value={parserLocale}
          onChange={(event) =>
            setParserLocale(event.currentTarget.value as RecipeLocale | "")
          }
        >
          <option value="">{messages.inheritDefault}</option>
          {(["en", "tr", "fr", "de", "es"] as const).map((locale) => (
            <option key={locale} value={locale}>
              {locale.toUpperCase()}
            </option>
          ))}
        </select>
      </label>

      <label>
        {messages.sourceMeasurementSystem}
        <select
          value={sourceSystem}
          onChange={(event) =>
            setSourceSystem(event.currentTarget.value as MeasurementSystem)
          }
        >
          <option value="metric">{messages.metric}</option>
          <option value="us">{messages.usCustomary}</option>
          <option value="imperial">{messages.imperial}</option>
        </select>
      </label>

      <label>
        {messages.measurementSystem}
        <select
          value={displaySystem}
          onChange={(event) =>
            setDisplaySystem(
              event.currentTarget.value as MeasurementSystem | "",
            )
          }
        >
          <option value="">{messages.inheritDefault}</option>
          <option value="metric">{messages.metric}</option>
          <option value="us">{messages.usCustomary}</option>
          <option value="imperial">{messages.imperial}</option>
        </select>
      </label>

      <label>
        {messages.cover}
        <select
          value={cover}
          onChange={(event) => setCover(event.currentTarget.value)}
        >
          <option value="__keep__">{currentCoverLabel}</option>
          {recipe.cover && <option value="">{messages.noCover}</option>}
          <option value="__custom__">{messages.coverPath}</option>
          {assets.map((asset) => (
            <option key={asset} value={asset} title={asset}>
              {assetLabel(asset)}
            </option>
          ))}
        </select>
      </label>

      {cover === "__custom__" && (
        <label>
          {messages.coverPath}
          <input
            aria-label={messages.coverPath}
            aria-describedby="cover-path-hint"
            value={coverPath}
            placeholder="assets/photo.png"
            aria-invalid={path.length > 0 && !validCoverPath}
            onChange={(event) => setCoverPath(event.currentTarget.value)}
          />
          <small id="cover-path-hint">{messages.coverPathHint}</small>
        </label>
      )}

      <details className="draft-recipe-advanced-disclosure">
        <summary>{messages.advanced}</summary>
        <fieldset className="draft-recipe-conversion-editor">
          <legend>{messages.conversionRulesTitle}</legend>
          <p className="draft-recipe-conversion-editor-help">
            {messages.conversionRulesHelp}
          </p>
          <label>
            {messages.ingredientKey}
            <input
              aria-label={messages.ingredientKey}
              value={ingredientKey}
              onChange={(event) => setIngredientKey(event.currentTarget.value)}
            />
          </label>
          <label>
            {messages.volumeUnit}
            <select
              aria-label={messages.volumeUnit}
              value={volumeUnit}
              onChange={(event) =>
                setVolumeUnit(event.currentTarget.value as VolumeConversionUnit)
              }
            >
              {volumeUnitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {ingredientUnitOptionLabel(unit, messages.uiLocale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {messages.gramsPerUnit}
            <input
              aria-label={messages.gramsPerUnit}
              type="number"
              min="0.000001"
              step="any"
              value={gramsPerUnit}
              onChange={(event) => setGramsPerUnit(event.currentTarget.value)}
            />
          </label>
          <button type="button" onClick={addConversion}>
            {messages.addConversion}
          </button>

          {overrides.length > 0 && (
            <ul>
              {overrides.map((rule) => (
                <li key={`${rule.ingredientKey}-${rule.volumeUnit}`}>
                  <span>{`${rule.ingredientKey}: 1 ${ingredientUnitOptionLabel(rule.volumeUnit, messages.uiLocale)} = ${rule.gramsPerVolumeUnit} g`}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setOverrides((current) =>
                        current.filter(
                          (candidate) =>
                            !(
                              candidate.ingredientKey === rule.ingredientKey &&
                              candidate.volumeUnit === rule.volumeUnit
                            ),
                        ),
                      )
                    }
                  >
                    {messages.remove}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </details>

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
          onClick={save}
          disabled={pending || (cover === "__custom__" && !validCoverPath)}
        >
          {messages.save}
        </button>
      </div>
    </section>
  );
}
