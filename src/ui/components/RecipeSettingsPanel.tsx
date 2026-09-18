import { useEffect, useMemo, useState } from "react";
import type { FacetSuggestion } from "../../application/list-recipes";
import type {
  IngredientConversionOverride,
  Recipe,
  RecipeLocale,
  RecipeMeta,
  VolumeConversionUnit,
} from "../../domain/recipe";
import type { MeasurementSystem } from "../../domain/unit";
import { COOKING_UNITS_BY_SYSTEM } from "../../units/definitions";
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
  onSave(meta: RecipeMeta, cover: CoverSelection): void;
  onCancel(): void;
}

export function RecipeSettingsPanel({
  recipe,
  assets,
  messages,
  categorySuggestions = [],
  tagSuggestions = [],
  defaultSourceMeasurementSystem = "metric",
  onSave,
  onCancel,
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
  useEffect(() => {
    if (!volumeUnitOptions.includes(volumeUnit)) {
      setVolumeUnit(volumeUnitOptions[1] ?? volumeUnitOptions[0]);
    }
  }, [volumeUnitOptions, volumeUnit]);

  const addConversion = () => {
    const grams = Number(gramsPerUnit);
    const ingredient = ingredientKey.trim();
    if (!ingredient || !Number.isFinite(grams) || grams <= 0) return;
    setOverrides((current) => [
      ...current.filter(
        (rule) =>
          !(
            rule.ingredientKey.toLocaleLowerCase() ===
              ingredient.toLocaleLowerCase() && rule.volumeUnit === volumeUnit
          ),
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
    const meta: RecipeMeta = {
      categories,
      tags,
      ...(parserLocale ? { parserLocale } : {}),
      sourceMeasurementSystem: sourceSystem,
      ...(displaySystem ? { measurementSystemOverride: displaySystem } : {}),
      ingredientConversionOverrides: overrides,
    };
    const coverSelection: CoverSelection =
      cover === "__keep__" ? undefined : cover === "" ? null : cover;
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
          {assets.map((asset) => (
            <option key={asset} value={asset} title={asset}>
              {assetLabel(asset)}
            </option>
          ))}
        </select>
      </label>

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
                  {ingredientUnitOptionLabel(unit)}
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
                  <span>{`${rule.ingredientKey}: 1 ${ingredientUnitOptionLabel(rule.volumeUnit)} = ${rule.gramsPerVolumeUnit} g`}</span>
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

      <div className="draft-recipe-actions">
        <button type="button" onClick={onCancel}>
          {messages.cancel}
        </button>
        <button
          type="button"
          className="draft-recipe-primary-action"
          onClick={save}
        >
          {messages.save}
        </button>
      </div>
    </section>
  );
}
