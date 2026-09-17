# Draft Recipe

Draft Recipe turns a normal Logseq DB graph into a recipe manager. Recipes stay
readable, editable Logseq pages — the plugin adds deterministic ingredient
parsing, live serving scaling, measurement conversion, a recipe browser, cover
images, and a focused Cooking Mode on top, without ever becoming a second
source of truth.

## What it is

- **Logseq is the only recipe database.** No SQLite, no IndexedDB, no cloud
  account, no second recipe store.
- **Recipes are normal Logseq content.** A recipe is a page/block subtree you
  can read and edit like any other Logseq outline. If you disable or uninstall
  Draft Recipe, your recipes remain readable — titles, ingredients, steps,
  notes, and cover images are ordinary Logseq content and graph assets.
- **Technical metadata stays hidden.** Draft Recipe attaches its own
  namespaced, versioned properties for things like recipe identity, section
  roles, and parsed ingredient structure. It never clutters your outline with
  visible `amount`/`unit` properties or requires a visible `#Recipe` tag.
- **Nothing is invented.** If the parser can't confidently resolve a quantity,
  a conversion, or a duration, it keeps your original text instead of
  guessing.
- **No network required.** Parsing, scaling, and conversion are fully local
  and deterministic. Draft Recipe needs no AI service, API key, account, or
  telemetry to work.

## Key features

- Native, readable recipe format — no required tags, no visible clutter.
- **Create Recipe** and **Convert to Recipe** flows, including a compact
  correction step for ingredients the parser can't confidently parse.
- Deterministic multilingual ingredient parsing (English, Turkish, French,
  German, Spanish) — exact, range, approximate, minimum, maximum, and
  qualitative amounts.
- Live synchronization: editing a recipe directly in Logseq keeps scaling and
  conversion in sync, without rescanning the whole graph.
- Serving scaling that never rewrites your authored ingredient text.
- Metric / US Customary / Imperial display systems, independent from the
  recipe's source measurement system.
- Deterministic same-dimension unit conversion, plus a sourced built-in
  registry of ingredient-dependent mass↔volume conversions (with per-recipe
  overrides) — never a guessed density.
- Recipe Card, Recipes browser with search/filters, Recipe Settings
  (categories, tags, overrides, cover), and a focused Cooking Mode.
- Step annotations for durations, temperatures, oven/preheat mode, and
  qualitative heat — without inventing numbers for vague phrasing.
- English and Turkish UI.

## Requirements

- A **Logseq DB graph**. Draft Recipe targets DB graphs only; it does not
  support file graphs.
- Node `>=20.19.0` and pnpm `10.33.0` if you're building the plugin yourself.

See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) for the exact capability
gate the plugin depends on and the current qualification status.

## Installation

Draft Recipe is not yet published to the Logseq Marketplace. To use it, build
it locally and load it as an unpacked plugin:

```bash
git clone <this repository>
cd logseq-draft-recipe
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm build
```

Then, in Logseq: **Settings → Plugins → Load unpacked plugin** and select the
project's `dist` folder.

### Development

```bash
pnpm dev          # local dev server
pnpm test         # unit/component tests
pnpm typecheck    # TypeScript
pnpm lint         # Biome
pnpm check        # typecheck + lint + test + build
```

`pnpm check` is the full local verification gate and must pass with zero
failures.

## Creating a recipe

Run **`Draft Recipe: Create Recipe`** from the command palette. It creates a
clean, editable Logseq page skeleton — title, yield, Ingredients, Steps, and
Notes — and attaches the hidden recipe metadata itself. Creating a recipe with
a title that already exists as a page is rejected rather than silently
duplicated.

From there, just edit the page like any other Logseq content: add
ingredients, write steps, adjust the yield. Draft Recipe picks up the changes
automatically.

## Converting an existing recipe

If you already have structured or semi-structured recipe content in Logseq —
your own notes, or something pasted in — select the recipe root block and run
**`Draft Recipe: Convert to Recipe`** (also available in the block right-click
menu).

The conversion preview shows you what it recognized before anything is
written:

- recognized Ingredients / Steps / Notes sections;
- parsed ingredient count and any ambiguous ingredients;
- recognized yield/prep/cook/chill metadata.

If a section heading isn't recognized, you classify it yourself as
Ingredients, Steps, Notes, or Ignore. If an ingredient line can't be
confidently parsed (say, `biraz süt` / "a splash of milk"), you can either
**keep it as written** or supply the amount/unit/ingredient interpretation
yourself in a small inline form — the plugin never fabricates a value on its
own. Confirmation is disabled until every ambiguity is resolved.

Your original visible text is never rewritten by conversion.

## The visible recipe format

A recipe is just a Logseq outline:

```text
Chunky Chocolate Chip Cookie
  Porsiyon: 8
  Hazırlık: 15 dk
  Pişirme: 11 dk

  Malzemeler
    120 g tereyağı
    130 g esmer şeker
    1 yumurta
    180 g bitter çikolata (iri doğranmış)

  Yapılış
    Tereyağını erit ve ılıt.
    Şekerleri ekle.
    180°C'de 10-12 dakika pişir.

  Notlar
    Ortası fırından çıktığında yumuşak kalabilir.
```

Localized section headings are supported (Ingredients/Malzemeler,
Steps/Yapılış, Notes/Notlar, and the French/German/Spanish equivalents).
Ingredient lines follow `<amount> <unit> <ingredient> (optional note)` —
ranges (`2-3 tbsp`), fractions (`1/2`, `½`), and qualitative amounts
(`biraz`, `aldığı kadar`, `damak zevkine göre`) are all valid.

The complete authoring contract — including the exact grammar the parser
understands — is documented in
[`docs/RECIPE-FORMAT.md`](docs/RECIPE-FORMAT.md).

## Serving scaling

Servings are a **view calculation**, not a rewrite. Use the `−`/`+` controls
or type a target yield directly in the Recipe Card or Cooking Mode; every
recalculation starts from the canonical parsed amount, never from a previously
rounded display value. Ingredients marked non-scaling stay fixed, and
ingredients the parser couldn't structure fall back to their raw text
unchanged.

## Measurement systems and conversion

Draft Recipe keeps two settings separate:

- the recipe's **source measurement system** (how ambiguous units like `cup`
  in the authored text should be interpreted);
- your **display measurement system** (Metric, US Customary, or Imperial —
  set globally in Draft Recipe settings, with a per-recipe override).

Changing the display system only changes what's shown — it never rewrites the
authored ingredient line.

Same-dimension conversions (`g ↔ kg`, `ml ↔ L`, `tsp ↔ tbsp ↔ cup` within a
system, `°C ↔ °F`) are always available and exact. Mass↔volume conversion
(e.g. showing `120 g butter` as tablespoons) additionally requires an
ingredient-specific rule — Draft Recipe ships a small, sourced registry of
common baking ingredients (flours, sugars, cocoa, butter, honey, oil, milk,
oats, cornstarch) built from published King Arthur Baking weight-chart
figures, and lets you add a per-recipe override (e.g. `1 tbsp butter =
14.2 g`) for anything else. If no rule exists, the conversion is reported as
unavailable — never guessed.

## Cover images

Each recipe supports one cover image, selected from your graph's existing
assets in Recipe Settings. Replacing or removing a cover only changes the
stored reference — the underlying graph asset file is never deleted by Draft
Recipe. If the referenced asset is later removed from the graph, the Recipe
Card falls back to a placeholder instead of erroring.

## Recipes browser

**`Draft Recipe: Recipes`** lists every recipe in the graph with:

- title/text search;
- category and tag filters (existing values are suggested with usage counts,
  but categories/tags stay free-form);
- "contains ingredient" filtering against structured ingredient data, not
  arbitrary note text;
- prep-time, cook-time, and total-time range filters.

## Cooking Mode

Open a recipe and start **Cooking Mode** for a focused, distraction-free view:
current step, previous/next, a progress indicator, the same target servings
and scaled ingredient list as the Recipe Card, and duration/temperature/heat
annotations pulled straight from the step text. Navigate with the on-screen
buttons or `ArrowLeft`/`ArrowRight`/`Escape` (keyboard shortcuts are
suppressed while you're typing in a field). Cooking Mode's step position is
transient UI state — it is never written back into your recipe.

## Settings

Global Draft Recipe settings cover UI language, default parser locale, and
default measurement system. Every recipe can override the parser locale,
source measurement system, display measurement system, categories, tags, and
ingredient conversion rules individually from its own Recipe Settings panel.

## Languages

- **UI**: English, Turkish.
- **Ingredient/step parsing**: English, Turkish, French, German, Spanish —
  independent from the UI language and from each other, so a German recipe
  can use US measurements and an English-language UI.

## Converting a recipe from the web

Draft Recipe doesn't scrape websites — that's out of scope by design, so it
never needs network access. Instead, use any AI assistant (ChatGPT, Claude,
etc.) as a one-time conversion step:

1. Copy the recipe text from the web page.
2. Paste it, together with the prompt below, into your assistant of choice.
3. Paste the assistant's output into a Logseq page as a normal outline.
4. Run **`Draft Recipe: Convert to Recipe`** on it.

### Prompt to copy-paste

```text
Convert the recipe below into a Logseq outline for the Draft Recipe plugin.
Rules:
- Create one recipe root block/title. Preserve the recipe's title and, if
  given, its source.
- Include the yield/servings near the root if the source states it, and
  prep/cook/chill/rest times if given.
- Create an "Ingredients" section with one ingredient per child block, in
  the form "<amount> <unit> <ingredient>" when a numeric quantity exists
  (e.g. "120 g butter", "2 eggs"). Preserve ranges (e.g. "2-3 tbsp milk")
  exactly. If the source gives no reliable quantity, keep the ingredient as
  plain qualitative text (e.g. "salt to taste") instead of inventing a
  number.
- Create a "Steps" section with one meaningful cooking action per child
  block. Preserve explicit durations and temperatures exactly as given, and
  keep qualitative heat wording (e.g. "medium heat", "overnight") as text
  rather than converting it into a number.
- Put any other useful information under a "Notes" section.
- Do not add a "#Recipe" tag or any other Draft Recipe-specific property —
  just plain, readable Logseq blocks.

Recipe:
<paste the recipe text here>
```

### Example

Source recipe (from a web page):

> **Chocolate Chip Cookies** — Makes 12 cookies. Prep 15 min, chill 30 min,
> bake 10-12 min. You'll need 120g butter, 150g brown sugar, 1 egg, and 180g
> dark chocolate, roughly chopped. Melt the butter and let it cool slightly,
> mix in the sugar, then the egg, then fold in the chocolate. Chill for 30
> minutes, then bake at 180°C for 10-12 minutes. Centers may still look soft
> when you take them out — that's fine.

Assistant output, ready to paste into Logseq:

```text
Chocolate Chip Cookies
  Yield: 12 cookies
  Prep: 15 min
  Chill: 30 min
  Cook: 10-12 min

  Ingredients
    120 g butter
    150 g brown sugar
    1 egg
    180 g dark chocolate (roughly chopped)

  Steps
    Melt the butter and let it cool slightly.
    Mix in the sugar.
    Add the egg.
    Fold in the chocolate.
    Chill for 30 minutes.
    Bake at 180°C for 10-12 minutes.

  Notes
    The centers may still look soft when removed from the oven.
```

Paste that outline into Logseq, select the root block, and run
**`Draft Recipe: Convert to Recipe`**.

See [`docs/RECIPE-FORMAT.md`](docs/RECIPE-FORMAT.md) for the full authoring
contract external assistants should follow.

## Privacy and local-first behavior

Draft Recipe's core functionality needs no cloud backend, user account, API
key, AI service, telemetry, or external server. Everything — parsing,
scaling, conversion, search — runs locally against your Logseq graph.

## Limitations and non-goals

Draft Recipe deliberately does **not** include:

- website scraping or automatic URL import (see the external-assistant
  workflow above instead);
- an embedded AI service, OCR, or general natural-language understanding —
  ingredient and step parsing is deterministic and syntax-based, not an NLP
  system;
- nutrition/calorie calculation, meal planning, inventory management, or
  shopping lists;
- cloud sync or accounts;
- cooking timers (duration parsing is structured so timers could be added
  later, but they aren't part of this release);
- multi-photo galleries — one cover image per recipe.

## Architecture

```text
Logseq SDK
  ↓
Logseq adapter / repository / schema / assets
  ↓
Application use-cases + metadata codecs
  ↓
Pure domain + parser + conversion engines
  ↑
React UI
```

The domain, parser, scaling, and conversion layers do not import Logseq APIs;
React components receive domain objects and callbacks rather than calling
`logseq.Editor`/`logseq.DB` directly. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for details.

## Compatibility

Draft Recipe targets Logseq DB graphs. See
[`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) for the required capability
gate, the JSON-property and cover-reference policies, and the exact builds
that have been qualified against a real Logseq app so far. Local code
verification (`pnpm check`: typecheck, lint, the full test suite, and the
production build) is green; broader real-app scenario coverage — plugin
reload, graph reopen, and cover persistence across sessions — should still be
re-checked against your specific Logseq build before you rely on it for
irreplaceable data, as with any early-stage plugin.
