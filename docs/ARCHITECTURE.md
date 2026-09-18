# Architecture

## Goal

Logseq Recipe adds an interactive recipe layer on top of Logseq DB while keeping the recipe itself native, readable, and editable without the plugin.

Logseq remains the only persistent recipe database. The plugin must not introduce an external or parallel recipe store.

## Dependency direction

```text
Logseq SDK
   ↓
logseq adapters / schema / repository / assets
   ↓
application use-cases + validated metadata codecs
   ↓
domain + parsing + conversion
   ↑
React UI
```

Rules:

- `src/domain`, `src/parsing`, and `src/units` do not import `@logseq/libs`.
- React components do not call `logseq.Editor` or `logseq.DB` directly.
- Logseq runtime code converts SDK entities into narrow internal contracts before handing data inward.

## Ingredient source and canonical structure

Logseq Recipe deliberately keeps two synchronized representations with different responsibilities.

### Visible text: human source/edit surface

The native Logseq block remains readable and editable:

```text
120 g tereyağı
```

It is the user's explicit source text. Logseq Recipe never rewrites it merely because servings or display units change.

### Hidden structured metadata: calculation source

The deterministic parser can resolve the line into:

```ts
{
  amount: { kind: "exact", value: 120 },
  unit: "g",
  ingredientText: "tereyağı",
  confidence: "exact"
}
```

After establishment, this structured result is persisted in one hidden, versioned ingredient metadata payload together with the parser context that produced it:

```text
version
parser locale
source measurement system
parsed quantity/unit/name/note/confidence
original parsed raw text
```

Logseq Recipe does **not** create independent `amount`, `unit`, `duration`, or `temperature` properties for every line. One validated string-JSON payload avoids visible property clutter while still giving the calculation layer stable structured data.

### Synchronization rule

Stored ingredient metadata may be reused only when all of these match the current recipe state:

1. stored parsed `rawText` equals the current visible block text;
2. stored parser locale equals the current effective parser locale;
3. stored source measurement system equals the current effective source measurement system.

If any value differs, Logseq Recipe reparses the visible text with the same deterministic parser and replaces the hidden payload.

Example:

```text
120 g tereyağı
→ edit native block →
150 g tereyağı
```

The next synchronized load derives `150 g`, writes the new hidden structure once, and future calculations reuse it while text/context still match.

If a previously numeric line becomes ambiguous:

```text
120 g tereyağı
→
damak zevkine göre tereyağı
```

Logseq Recipe must not retain the stale `120 g`. The new unparsed/partial result replaces the old confident structured value.

### Parser-context invalidation

Raw text alone is not a sufficient cache key. For example:

```text
1 cup flour
```

may mean `cup_us`, `cup_metric`, or `cup_imperial`. Changing the recipe's source measurement interpretation invalidates the stored ingredient metadata even when the visible text is unchanged.

### Lazy backfill before schema freeze

Recipes created earlier in v0.1 development may not contain `ingredient_meta`. When such a recipe is explicitly opened or validated, the repository parses its ingredient blocks and lazily establishes the hidden payload.

The recipe browser does not bulk-write these payloads across every discovered recipe simply by listing summaries.

Because the v0.1 schema is still pre-release and explicitly not frozen, this addition does not create a public migration/version boundary. After the public schema is frozen, incompatible storage changes must use normal versioned migrations.

## Recipe root metadata

Root-level responsibilities include:

- hidden recipe marker;
- schema version;
- base yield;
- yield unit;
- prep / chill / cook minutes;
- source URL;
- hidden cover reference;
- low-frequency hidden recipe metadata blob.

The recipe metadata blob contains:

- categories;
- tags;
- parser locale override;
- source measurement-system override;
- display measurement-system override;
- per-recipe ingredient mass↔volume conversion overrides.

v0.1 uses the validated string-JSON codec for this metadata even if a Logseq build appears to expose native JSON property support. Native JSON support is still measured by the compatibility probe but is not a core runtime dependency.

## Recipe identity

Recipe identity is a hidden plugin-owned marker property. A visible `#Recipe` tag is not required.

This lets the plugin query recipe roots without adding visual tag clutter to the user's outline.

## Sections

Visible headings remain normal blocks. Hidden section roles identify their meaning:

```text
Ingredients / Malzemeler / Zutaten / ...
  section_role = ingredients

Steps / Yapılış / Zubereitung / ...
  section_role = steps

Notes / Notlar / ...
  section_role = notes
```

After conversion, the user can rename the visible heading without breaking the recipe because the role property is authoritative.

## Ingredient exceptions

`scale_mode = fixed` is an optional hidden per-ingredient override independent from the canonical parse payload. Default ingredients scale linearly.

## Parser architecture

```text
raw text
  ↓
lexer/tokenizer
  ↓
locale normalization
  ↓
small deterministic recognizers
  ↓
validated structured result + source spans
```

The parser is intentionally not NLP.

### Locale packs

Parser packs:

- EN
- TR
- FR
- DE
- ES

Locale packs provide data such as:

- quantity words;
- unit aliases;
- temporal modifiers;
- range words;
- section aliases;
- heat aliases;
- sequence/relation connectors;
- inexact duration phrases;
- oven-mode/preheat aliases;
- recipe metadata labels.

The core parser should not contain a growing set of `if (locale === ...)` branches.

### Quantities

The domain distinguishes:

```ts
exact
range
minimum
maximum
approximate
inexact
```

Examples:

```text
10
10-12
yaklaşık 10
en az 10
10'a kadar
birkaç / overnight-style symbolic values
```

### Step annotations

Steps preserve their full original text while deriving independent annotations for:

- durations;
- numeric temperatures;
- qualitative heat;
- oven mode / preheat where recognized;
- optional duration relation/condition text.

A single step may contain multiple duration annotations.

`10-12 dakika` is one range annotation, while `5 dakika kavur, sonra 20 dakika pişir` contains two duration annotations.

Qualitative heat is never assigned an invented numeric temperature.

Step annotations are currently derived at load time rather than persisted as per-step metadata. This keeps v0.1 storage focused on ingredient structure, which is required for repeated scaling/conversion calculations.

## Measurement architecture

Parser language and measurement system are independent.

Supported display systems:

- Metric;
- US Customary;
- Imperial.

### Canonical units

Ambiguous cooking units are system-specific in the domain:

```text
cup_metric
cup_us
cup_imperial

tbsp_metric
tbsp_us
tbsp_imperial
```

This prevents the meaning of a parsed source unit from changing merely because the user changes the display preference later.

### Conversion order

```text
matching stored structured quantity
  → serving scaling
  → requested display conversion
  → display formatting
```

If stored structure is stale relative to text/parser context, synchronization occurs before this calculation path.

Every calculation starts from the current base structured quantity. Serving/display changes never feed rounded values back into storage, preventing cumulative rounding drift.

### Cross-dimension conversion

Mass↔volume conversion is unavailable unless an ingredient conversion provider returns a valid rule.

Lookup order:

```text
recipe-specific override
  → built-in sourced rule
  → unavailable
```

No density is guessed.

## Application layer

Application modules contain storage-independent use-cases and contracts, including:

- `RecipeRepository`;
- recipe validation;
- conversion analysis;
- root metadata parsing;
- recipe search/filter logic;
- recipe metadata codec;
- ingredient metadata codec.

`Convert to Recipe` is intentionally two-stage:

```text
Logseq subtree
  → pure analysis / warnings / preview
  → explicit commit of root/section/ingredient metadata
```

Analysis never mutates the source subtree. When conversion is confirmed, the already-reviewed parsed ingredient results are written as hidden canonical ingredient payloads; visible text is unchanged.

## Logseq adapter

The Logseq layer owns:

- capability probing;
- plugin property bootstrap;
- block/page reading;
- recipe repository implementation;
- ingredient metadata synchronization;
- authoring operations;
- asset references;
- settings;
- lifecycle/event cleanup;
- UI controller composition.

### Capability strategy

Required functionality uses stable SDK surfaces and feature detection rather than version-string branching.

A reversible Phase 0 probe tests actual read/write behavior in a disposable page and cleans up afterward. The automated probe succeeds only when required capabilities, plugin property namespacing, cleanup, and error checks all pass. Manual cover reload/reopen qualification is still separate.

Core runtime does not use `logseq.Experiments`.

### Assets

Images remain normal graph assets.

v0.1 prefers the public asset-path APIs:

```text
Assets.listFilesOfCurrentGraph
Assets.makeUrl
```

The recipe stores only a reference. Changing/removing a recipe cover never automatically deletes the old asset file.

If the referenced asset is missing, cover resolution returns a graceful placeholder state.

### DB querying

Recipe discovery queries only the plugin-owned recipe marker. It does not scan the entire graph looking for recipe-like text.

After recipe IDs are discovered, the repository loads only those recipe subtrees. Recipe summaries may parse visible ingredient text when needed for filters, but summary browsing does not backfill hidden ingredient metadata.

### Reactivity

The repository tracks both UUIDs and DB entity IDs for the currently loaded recipe subtree. A DB change refreshes the recipe when the changed entity itself or its parent belongs to the known subtree, so newly inserted ingredient blocks are not missed.

Changes are debounced before UI refresh.

For a native ingredient edit, synchronization is finite:

```text
visible edit
  → DB change
  → debounced recipe reload
  → text/context mismatch
  → one hidden ingredient_meta write
  → possible DB change
  → debounced reload sees matching metadata
  → no second metadata write
```

Rules:

- no graph-wide reparsing on every keystroke;
- no hidden property write when stored canonical metadata already matches;
- no stale confident quantity after an ambiguous visible edit;
- listeners have explicit disposers;
- closing Logseq Recipe unmounts React/watchers;
- graph changes close the open Logseq Recipe UI and reset cached runtime capability state;
- plugin unload disposes registered commands/listeners and unmounts React.

## UI architecture

One React root is mounted in the stable Logseq main UI surface. Each command opening gets a fresh root/state; closing the UI unmounts it.

Primary views:

```text
Recipes
Recipe Card
Create Recipe
Convert Preview
Recipe Settings
Cooking Mode
```

React receives a `DraftRecipeUiController` interface for actions such as:

- list/load/create recipe;
- commit conversion;
- watch recipe;
- list/resolve covers;
- update recipe metadata;
- close UI.

This keeps SDK calls outside React components.

### UI state vs persistent state

Transient state includes:

- target servings;
- selected ingredient display unit;
- current cooking step;
- cooking ingredient drawer state;
- browser filters.

These values are not persisted to Logseq in v0.1.

Persistent user decisions include recipe metadata, cover reference, category/tag values, parser/source/display measurement overrides, explicit conversion overrides, and optional fixed ingredient scaling.

Parser-derived canonical ingredient structure is persistent technical state synchronized from the native ingredient block; it is not a separate user-editable UI field.

## Search/filtering

Recipe summaries support:

- title search;
- categories;
- tags;
- ingredient contains;
- prep-time range;
- cook-time range;
- total-time range.

Category/tag values remain free-form. Existing values are surfaced as usage-count suggestions in filtering/settings, but they are not enums.

## Migrations

Every recipe stores a schema version.

Migration requirements:

- versioned;
- idempotent;
- metadata-only unless a future migration explicitly requires otherwise;
- non-destructive on unsupported future schemas;
- safe to retry.

The current runner refuses to downgrade or overwrite a recipe whose schema version is newer than the plugin understands.

The current branch is still pre-public-schema-freeze. `ingredient_meta` is therefore lazily established without incrementing the public schema generation. This exception must not be used once a released schema compatibility floor exists.

## Failure behavior

Expected non-crashing states include:

- non-DB graph;
- invalid or absent base yield;
- malformed/stale ingredient metadata;
- unparseable ingredient;
- missing amount/unit;
- unsupported requested conversion;
- missing cover asset;
- missing section;
- future schema version;
- unsupported stable capability.

Malformed or stale hidden ingredient metadata falls back to deterministic reparsing. Unparseable ingredients render their original text and overwrite obsolete confident metadata when synchronization is enabled.

## Privacy and network behavior

Logseq Recipe itself requires no:

- AI/LLM;
- API key;
- cloud account;
- analytics/telemetry;
- OCR;
- external database;
- network request for normal recipe operation.

A user may independently use an external assistant to produce text matching `docs/RECIPE-FORMAT.md`; that is outside the plugin runtime.

## Verification boundary

The code architecture is implemented on the v0.1 branch, but correctness is not asserted until:

1. local `pnpm check` succeeds;
2. a real Logseq DB build passes the Phase 0 probe;
3. create/convert/live-edit/reload/graph-reopen/asset scenarios pass the manual runtime checklist.

Current GitHub Actions runs on the branch are not usable as code-verification evidence because the observed jobs terminate before any workflow step/log/artifact is produced.

See `docs/LOCAL-TESTING.md` and `docs/COMPATIBILITY.md`.
