# Draft Recipe — Local Verification Checklist

This checklist is the verification gate for the v0.1 implementation branch. Do not merge to `main` or claim the build passes until the relevant steps have fresh evidence.

Use a disposable or backed-up Logseq DB graph for runtime checks.

## 1. Check out the implementation branch

```bash
git fetch origin
git switch codex/draft-recipe-v0-1-20260911
git pull --ff-only
```

Confirm:

```bash
git status --short
git branch --show-current
```

Expected branch:

```text
codex/draft-recipe-v0-1-20260911
```

## 2. Toolchain

Required:

```text
Node >= 20.19.0
pnpm 10.33.0
```

Recommended setup:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
node --version
pnpm --version
```

## 3. Install and create the lockfile

The branch intentionally does not claim a reproducible install until the first local install succeeds.

```bash
pnpm install
```

Confirm that `pnpm-lock.yaml` exists afterward.

Do not commit the lockfile yet if any verification command below fails; fix/reinstall first so the committed lock represents the working dependency graph.

## 4. Run code verification separately first

Run each command separately so the failing stage is obvious.

### TypeScript

```bash
pnpm typecheck
```

Expected: exit code `0`, no TypeScript errors.

### Biome

```bash
pnpm lint
```

Expected: exit code `0`, no lint/format errors.

If formatting-only problems are reported:

```bash
pnpm format
pnpm lint
```

Review the resulting diff before keeping it.

### Tests

```bash
pnpm test
```

Expected: exit code `0`, zero failed tests.

Important suites include:

- domain/scaling
- lexer/locales
- ingredient parser
- ingredient metadata codec and parser-context invalidation
- canonical ingredient metadata synchronization
- step duration/temperature/heat parsing
- conversion engine
- ingredient conversion registry/overrides
- recipe metadata codec
- convert analysis and unknown-section classification
- recipe filtering
- schema/repository/authoring contracts
- assets/events/migrations
- Recipe Card
- Recipes View
- Recipe Settings and category/tag suggestions
- ingredient unit selector
- Convert Preview
- Cooking Mode, cover, and keyboard navigation
- app lifecycle/view preservation
- EN/TR UI dictionary parity

### Production build

```bash
pnpm build
```

Expected: exit code `0` and a usable `dist/` output.

### Aggregate check

Only after the individual commands pass:

```bash
pnpm check
```

Expected: exit code `0`.

## 5. Commit the dependency lock only after code verification

Inspect:

```bash
git status --short
git diff -- pnpm-lock.yaml
```

Then commit the generated lockfile together with any necessary verification fixes.

After the lockfile is committed, change CI to:

```bash
pnpm install --frozen-lockfile
```

Until then the repository CI intentionally uses `--no-frozen-lockfile` and uploads the generated lockfile as a diagnostic artifact.

## 6. Load the plugin in Logseq

Use the built `dist`/plugin folder according to the current Logseq developer-plugin loading flow.

Open a disposable DB graph.

Confirm the command palette contains:

- `Draft Recipe: Recipes`
- `Draft Recipe: Create Recipe`
- `Draft Recipe: Convert to Recipe`
- `Draft Recipe: Phase 0 DB graph check`
- `Draft Recipe: Phase 0 capability probe`

Also right-click a block bullet and confirm the Draft Recipe convert command is present in the block context menu.

## 7. Run Phase 0 compatibility qualification

Run:

```text
Draft Recipe: Phase 0 capability probe
```

Open the developer console and copy the complete report.

Required gate:

- DB graph: pass
- hidden property read/write: pass
- number property: pass
- text/default property: pass
- DB change-listener APIs used by the runtime: pass
- stable main UI: pass
- plugin-namespaced property ident: pass
- cleanup: pass
- cover reference: not `unsupported`

JSON property may fail. That is acceptable: v0.1 runtime deliberately uses validated string-JSON metadata codecs.

After the probe, confirm its temporary page/properties were removed.

Record the exact Logseq version and result in `docs/COMPATIBILITY.md`.

## 8. Create Recipe flow

Run:

```text
Draft Recipe: Create Recipe
```

Create a small recipe, for example:

```text
Title: Local Test Cookie
Yield: 8
```

Expected native outline:

```text
Local Test Cookie
  Ingredients
  Steps
  Notes
```

(or localized headings according to the parser locale used by the create flow).

Verify:

- the recipe appears in `Draft Recipe: Recipes`;
- no visible `#Recipe` tag was added;
- the sections are ordinary readable Logseq blocks;
- the Recipe Card opens;
- base yield is correct.

Then run Create Recipe again using exactly the same title.

Expected:

- creation is rejected with an explicit existing-page error;
- no duplicate Ingredients/Steps/Notes blocks are added to the existing page;
- no existing content is silently converted. Use `Convert to Recipe` for existing content instead.

## 9. Add natural recipe text and establish canonical ingredient metadata

Populate native blocks directly in Logseq:

```text
Ingredients
  120 g butter
  130 g brown sugar
  1 egg
  3 pieces tomato
  180 g dark chocolate

Steps
  Melt the butter.
  Mix in the sugars.
  Bake at 180°C for 10-12 minutes.

Notes
  The center may still look soft when removed from the oven.
```

Open the Recipe Card again.

Verify parsed ingredient values and step annotations appear without adding visible amount/unit child properties.

For an ingredient such as `120 g butter`, verify Draft Recipe establishes one hidden versioned ingredient metadata payload rather than separate visible/hidden `amount` and `unit` properties. If you inspect plugin-owned properties in developer tooling, the payload should represent the same raw text, parser locale, source measurement system, structured amount/unit/name/note, and confidence shown by the recipe.

Close and reopen the same recipe without changing the ingredient text or parser context. Expected: the matching payload is reused; it is not rewritten merely because the recipe was opened again.

Also verify count-style ingredients stay natural after scaling; do not accept duplicated semantic labels such as `egg egg` or `piece tomato` when the visible ingredient text already supplies that meaning.

## 10. Serving scaling

With base yield `8`:

- set target yield to `4`;
- set target yield to `16`;
- use `−` and `+`;
- enter a target directly.

Verify displayed quantities change proportionally.

Then return to the Logseq outline and confirm the authored ingredient lines and base structured quantities are unchanged.

## 11. Live native edit and canonical metadata synchronization

Keep the Recipe Card open.

Edit:

```text
120 g butter
```

to:

```text
150 g butter
```

Expected after the debounce window:

- the open recipe refreshes;
- it resolves `150 g`;
- the old hidden canonical payload is replaced with one matching `150 g butter`;
- the metadata write settles instead of causing a continuing refresh/write loop;
- editing remains responsive.

Then replace the same line with an intentionally qualitative/unparseable amount such as:

```text
butter to taste
```

Expected:

- the original visible wording remains untouched;
- the old confident `150 g` amount is not retained;
- the hidden ingredient payload records the current unparsed/partial state rather than stale structured data;
- the card falls back to readable raw ingredient text.

Also test:

- rename an ingredient;
- delete an ingredient;
- add an ingredient under the known Ingredients section;
- edit a step duration;
- edit a step temperature.

Adding a new ingredient must refresh the open recipe even though the new block UUID was not known before the edit; parent/subtree detection should make it visible after the debounce window.

## 12. Duration, temperature, oven-mode, and heat cases

Test step lines such as:

```text
Cook for 10 minutes.
Cook for 10-12 minutes.
Cook for about 10 minutes.
Cook for at least 10 minutes.
Cook for up to 10 minutes.
Cook for 5 minutes, then bake for 20 minutes.
Cook over medium heat for 5 minutes.
Bake at 180°C for 12 minutes.
Preheat the fan oven to 160°C and bake for 20 minutes.
```

Turkish examples:

```text
10 dakika pişir.
10-12 dakika pişir.
yaklaşık 10 dakika pişir.
en az 10 dakika dinlendir.
10 dakikaya kadar pişir.
5 dakika kavur, ardından 20 dakika pişir.
orta ateşte 5 dakika pişir.
180°C'de 12 dakika pişir.
Fanlı fırını önceden 160°C'ye ısıt ve 20 dakika pişir.
```

Verify:

- qualitative heat never receives an invented degree value;
- duration relationships/conditions remain readable;
- oven mode is preserved when recognized;
- preheat state is preserved when recognized;
- Cooking Mode displays oven mode/preheat alongside the converted temperature rather than discarding them.

## 13. Measurement display and parser-context invalidation

Open Recipe Settings.

Test display system:

- Metric
- US Customary
- Imperial

Verify display changes do not rewrite authored ingredient text or the source structured quantity.

Test same-family unit display conversion.

For mass↔volume:

- test a built-in ingredient such as butter/flour/sugar;
- test an unknown ingredient and confirm no value is fabricated;
- add an explicit recipe conversion override;
- confirm the requested display conversion becomes available;
- remove the override and confirm fallback/unavailable behavior returns.

Separately test **source measurement system**, because it changes how ambiguous source units are interpreted. Use a line such as:

```text
1 cup flour
```

With the source system set to US Customary, verify the hidden canonical unit resolves as `cup_us`. Change only the recipe source system to Metric and save. Expected:

- the visible line remains exactly `1 cup flour`;
- the old ingredient metadata is considered stale because parser context changed;
- it is rebuilt as `cup_metric`;
- display-system changes alone do not trigger this source reinterpretation.

Repeat with Imperial if practical and expect `cup_imperial`.

## 14. Recipe Settings

Edit and save:

- category
- tags
- parser locale override
- source measurement system
- display measurement system
- conversion override

Verify:

- category/tag filters see the saved values;
- existing category/tag values appear as suggestions with usage counts;
- clicking a suggestion adds it without preventing free-form new values;
- the native recipe outline does not gain visible metadata clutter;
- settings survive closing/reopening the Draft Recipe UI.

Keep Settings open, make a native recipe edit in Logseq, and verify live refresh does not unexpectedly navigate the Draft Recipe UI back to Recipe Card.

## 15. Cover asset

Add at least one PNG/JPG/JPEG/WebP image to the graph normally.

In Recipe Settings:

1. select it as cover;
2. save;
3. close/reopen Recipe Card;
4. confirm the image renders;
5. enter Cooking Mode and confirm the optional cover renders without displacing the current-step layout;
6. change to another cover if available;
7. confirm the old graph asset file was not deleted;
8. remove the recipe cover;
9. confirm placeholder/no-cover rendering remains error-free.

Then assign the cover again for persistence testing.

## 16. Convert to Recipe — deterministic structure and initial canonical metadata

Create a separate normal Logseq subtree such as:

```text
Cookie Tarifi
  Porsiyon: 8
  Hazırlık: 15 dk
  Malzemeler
    120 g tereyağı
    130 g esmer şeker
    1 yumurta
  Yapılış
    Tereyağını erit.
    180°C'de 10-12 dakika pişir.
  Notlar
    İçi yumuşak kalabilir.
```

Use `Draft Recipe: Convert to Recipe` on the root.

Verify preview:

- recognized sections are correct;
- ingredient count is correct;
- step count is correct;
- metadata is recognized;
- ambiguous/unparseable ingredients generate warnings rather than fabricated data.

Confirm conversion.

Verify:

- the visible subtree text is unchanged;
- the reviewed ingredient parse results are committed into hidden versioned ingredient metadata at conversion time;
- opening the converted recipe uses matching stored structured data rather than needing a different parser result;
- there are no separate hidden `amount`/`unit` properties per ingredient.

Open it through Recipes and verify it loads as a recipe.

## 17. Convert to Recipe — safety and ambiguity

### Missing yield

Repeat with a subtree that has Ingredients and Steps but no positive Yield/Porsiyon metadata.

Expected:

- preview reports the missing base yield;
- Confirm is disabled;
- no recipe marker/schema/ingredient metadata is committed.

### Unknown section heading

Use a subtree containing an unknown structured heading such as:

```text
Recipe
  Yield: 4
  What you need
    100 g flour
  Steps
    Mix.
```

Expected:

- `What you need` appears as unresolved ambiguity;
- conversion cannot be confirmed while it is unresolved;
- classify it as Ingredients and verify the child line is parsed by the normal ingredient parser;
- repeat with an irrelevant structured section and choose Ignore;
- verify the source heading/text itself is not rewritten.

### Re-convert an existing recipe

Give an already-converted recipe categories, tags, display override, and a custom ingredient conversion. Run Convert to Recipe again.

Expected:

- existing user metadata is preserved;
- parser/source fields may be refreshed from the conversion context;
- category/tag/custom conversion data is not reset to empty defaults;
- ingredient canonical metadata is refreshed to the reviewed conversion result for the current raw text/context.

## 18. Search and filters

Create/convert multiple recipes and test:

- title search
- category
- tag
- ingredient contains
- prep time min/max
- cook time min/max
- total time min/max

Verify category/tag suggestions show usage counts and do not prevent entering a new free-form value.

For a development recipe that does not yet have `ingredient_meta`, opening only the Recipes browser/list should not bulk-write canonical ingredient metadata across the graph; write-back is established when the recipe is opened/validated or explicitly converted.

## 19. Cooking Mode

Open a recipe with multiple steps and a cover if available.

Verify:

- target servings carry over from Recipe Card;
- optional cover remains proportionate and does not consume the step area;
- ingredient drawer uses the same scaled target;
- Previous is disabled on first step;
- Next is disabled on last step;
- progress changes correctly;
- duration/temperature/heat chips match the source step;
- fan/conventional and preheat annotations appear when parsed;
- `ArrowRight` advances a step;
- `ArrowLeft` goes back;
- `Escape` exits Cooking Mode;
- keyboard navigation does not fire while focus is inside an input, textarea, select, or editable control;
- exit returns to the recipe;
- current step is not persisted into Logseq.

While Cooking Mode is open, edit an ingredient or step in native Logseq.

Expected:

- recipe data and canonical ingredient metadata refresh after debounce;
- Cooking Mode remains the active view rather than being replaced by Recipe Card.

## 20. UI close/reopen lifecycle

Open Draft Recipe, move into a non-default state such as Cooking Mode, then close the main UI.

Verify:

- no further hidden UI updates/watch activity is observable after closing;
- reopening Draft Recipe from another command starts from that command's requested initial view rather than leaking the previous React state.

## 21. Theme and layout

Verify in:

- light theme
- dark theme
- narrow main-UI/window width

Check readability, overflow, controls, cover sizing, Recipe Settings, category/tag suggestion controls, Convert Preview/classification controls, and Cooking Mode.

## 22. Reload and graph lifecycle

### Plugin reload

With a recipe and cover configured:

1. reload Draft Recipe;
2. reopen Recipes;
3. reopen the recipe;
4. confirm recipe metadata, ingredient canonical metadata, and cover survive.

### Graph reopen

1. close/reopen the same DB graph;
2. reopen Draft Recipe;
3. confirm recipe discovery, ingredient metadata reuse, and cover resolution.

### Graph switch

With Draft Recipe UI open:

1. switch to another graph;
2. confirm Draft Recipe main UI closes/resets;
3. confirm actions in the new graph do not write into the previous graph.

## 23. Missing/deleted cover

After assigning a cover, delete/remove the underlying asset through Logseq or the filesystem as appropriate.

Expected: Draft Recipe renders a placeholder/error-free missing-cover state rather than crashing.

## 24. Future schema safety

In a disposable test recipe only, simulate a schema version newer than the plugin supports.

Expected:

- loading is rejected with an explicit future-schema error;
- the plugin does not downgrade or overwrite the recipe metadata.

Also remove or corrupt `base_yield` on a disposable marked recipe.

Expected:

- loading surfaces an explicit invalid-base-yield error;
- Recipe Card/Cooking Mode are not allowed to proceed into scaling with `NaN` or a non-positive base yield.

Corrupt an ingredient's hidden metadata string while leaving its visible line intact. Expected:

- the invalid hidden payload is not trusted;
- the visible ingredient remains readable;
- opening/validating the recipe reparses the line and replaces the malformed payload with validated metadata.

## 25. Final evidence to record

Before merge, save:

- `node --version`
- `pnpm --version`
- full `pnpm check` output
- test count / zero failures
- build success output
- exact Logseq version
- Phase 0 report
- native ingredient edit → canonical metadata synchronization result
- source-system context invalidation result
- no-refresh/write-loop result
- reload result
- graph reopen result
- cover persistence result

Then update:

- `docs/COMPATIBILITY.md`
- `docs/ROADMAP.md`
- README verification status
- `.github/workflows/ci.yml` to use `pnpm install --frozen-lockfile` after committing `pnpm-lock.yaml`

Only after fresh evidence supports those statements should the branch be described as passing/verified.
