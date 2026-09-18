# Changelog

All notable user-facing changes to Logseq Recipe are documented here. This
project uses [Semantic Versioning](https://semver.org/).

## 1.0.0

First public release, targeting Logseq DB graphs only.

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
- File graphs are not supported, by design.
