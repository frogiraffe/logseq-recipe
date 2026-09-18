# Changelog

All notable user-facing changes to Logseq Recipe are documented here. This
project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] — Unreleased

### Added

- Recipe duplication, with a unique copy title and every field (yield,
  times, source, categories/tags, parser locale, measurement system,
  conversion overrides, cover, ingredient fixed/linear scale modes, and
  manually corrected ingredient metadata) preserved exactly.
- Sorting and drag-free reordering for ingredients, steps, and notes in
  Recipe Edit, including adding and repositioning a new item in the same
  save.

### Fixed

- **Root metadata source of truth**: a visible metadata line (Yield/Prep/
  Chill/Cook/Source) is now authoritative on every load and self-heals the
  hidden property cache, instead of the hidden property silently winning
  over a native edit to the visible line.
- Clearing an optional field (yield unit, prep/chill/cook time, source URL)
  in Recipe Edit now actually removes it, instead of silently doing
  nothing or leaving a misleading empty value.
- Reusing a recycled page's title for a new recipe no longer inherits the
  previous recipe's yield unit, times, source URL, or cover from before it
  was deleted.
- Duplicating a recipe now preserves a manually corrected ingredient's
  canonical structure instead of silently reparsing its raw text and
  losing the correction.
- Ingredient density matching no longer lets a generic word (flour,
  butter, milk, sugar...) match a differently-named compound ingredient
  (bread flour, whole wheat flour, peanut butter, milk powder); those now
  correctly resolve to their own rule or report no conversion available.
- Renaming a recipe onto a title that's already a different Logseq page
  now fails with a clear error instead of relying on undefined behavior.
- Create/Convert now write the recipe-identifying marker only after every
  other structural write succeeds, so a failure partway through can't
  leave a half-built page discoverable as a complete recipe.
- Editing base yield now resets the Recipe Card's target-yield scaling
  instead of silently leaving it at the old yield/new yield ratio.
- The Recipe Card now clears itself and returns to the Recipes view if the
  open recipe is deleted or recycled from outside the plugin, instead of
  showing stale content.
- An older, slower recipe reload can no longer overwrite a newer one that
  already finished loading.
- Create, Convert, Save Edit, Save Settings, Duplicate, and Delete now
  guard against a double-click starting the same operation twice.

## [1.0.0]

First public release, targeting Logseq DB graphs only.

### Added

- **Create Recipe** and **Convert to Recipe** authoring flows, including a
  correction step for ingredients the parser can't confidently parse.
- Deterministic multilingual ingredient and step parsing (English, Turkish,
  French, German, Spanish): exact, range, approximate, minimum, maximum, and
  qualitative amounts.
- Live serving scaling that recalculates from the canonical parsed amount
  without ever rewriting authored ingredient text.
- Metric / US Customary / Imperial display systems, independent from the
  recipe's source measurement system, with same-dimension unit conversion and
  a sourced ingredient mass↔volume registry (plus per-recipe overrides).
- Recipe Card, Recipes browser (search, category/tag/ingredient/time
  filters), Recipe Settings, and a focused Cooking Mode.
- Step annotations for durations, temperatures, oven/preheat mode, and
  qualitative heat.
- Cover image support backed by graph assets, with graceful fallback when an
  asset is missing.
- English and Turkish UI.

### Known limitations

- Real-Logseq-runtime qualification is tracked separately in
  [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) and
  [`docs/RELEASE_VALIDATION.md`](docs/RELEASE_VALIDATION.md) — see those
  documents for exactly what has and has not been verified against a real
  Logseq build.
- File graphs are not supported by design.
