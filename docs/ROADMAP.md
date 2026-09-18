# Roadmap

This roadmap separates **implemented code** from **verified runtime behavior**. A checked implementation item means the code exists on the v0.1 branch; it does not imply that local typecheck/tests/build or real-Logseq runtime qualification have passed.

## Phase 0 — Compatibility qualification

Exit condition: required stable capabilities are demonstrated inside a real Logseq DB graph and recorded in `COMPATIBILITY.md`.

Implementation:

- [x] DB graph detection
- [x] reversible number/text/hidden-property probe
- [x] plugin-owned property namespace check
- [x] optional JSON-property probe
- [x] block-scoped and global DB change-listener capability gate
- [x] stable main-UI probe
- [x] public graph-asset API detection
- [x] cleanup reporting
- [x] formatted developer-console report
- [x] full probe gate includes namespacing, cleanup, and zero-error checks
- [x] cleanup only removes probe data actually created/written

Runtime qualification still required:

- [ ] run the probe in a released Logseq DB build
- [ ] verify all required read/write behaviors
- [ ] verify DB listener behavior used by live recipe refresh
- [ ] verify probe cleanup
- [ ] verify cover reference after plugin reload
- [ ] verify cover reference after graph reopen
- [ ] record the exact Logseq version/result in `COMPATIBILITY.md`

Native JSON-property support is optional; v0.1 core metadata uses validated string-JSON fallbacks regardless.

## Phase 1 — Domain, parser, and schema

Implemented:

- [x] `Recipe`, `Ingredient`, quantity, unit, and annotation domain types
- [x] canonical serving-scaling engine
- [x] fraction-friendly number formatter
- [x] Metric / US Customary / Imperial unit families
- [x] EN/TR/FR/DE/ES locale packs
- [x] deterministic lexer/tokenizer
- [x] ingredient recognizer
- [x] duration annotations: exact/range/minimum/maximum/approximate/inexact
- [x] multiple durations per step
- [x] numeric temperature annotations
- [x] oven mode / preheat annotations
- [x] natural Turkish preheat recognition when the temperature splits a multi-word cue
- [x] qualitative heat annotations
- [x] recipe metadata-line parser
- [x] plugin property keys/schema bootstrap
- [x] hidden recipe marker instead of visible `#Recipe`
- [x] hidden section-role convention
- [x] hidden versioned `ingredient_meta` property
- [x] schema version property
- [x] validation result model
- [x] EN/TR/FR/DE/ES step integration fixtures for duration + temperature
- [x] formatter → parser round-trip tests for the supported exact/range ingredient subset

Verification pending:

- [ ] fresh local parser/domain/codec test run
- [ ] real DB schema bootstrap run

## Phase 2 — Unit and ingredient conversion

Implemented:

- [x] exact same-dimension conversion engine
- [x] source measurement system separated from display measurement system
- [x] system-specific `cup` / `tbsp` / `tsp` canonical units
- [x] sourced built-in ingredient mass↔volume rules
- [x] explicit per-recipe conversion overrides
- [x] recipe override → built-in → unavailable precedence
- [x] no guessed density fallback
- [x] non-destructive per-ingredient display-unit selection
- [x] human-readable count-unit rendering without duplicate `egg/piece` labels

Verification pending:

- [ ] local conversion tests
- [ ] manual UI conversion checks

## Phase 3 — Logseq repository, authoring, and canonical ingredient sync

Implemented:

- [x] `RecipeRepository` interface
- [x] Logseq read repository
- [x] marker-based recipe discovery query
- [x] page-root recipe loading through `getPageBlocksTree`
- [x] page-name fallback when PageEntity title is absent
- [x] root property mapping
- [x] section-role loading
- [x] ingredient parsing from native block text
- [x] one hidden versioned ingredient metadata payload instead of separate amount/unit properties
- [x] stored ingredient metadata reused when raw text + locale + source measurement system still match
- [x] native ingredient edit invalidates stale metadata and reparses with the same deterministic parser
- [x] ambiguous edit replaces old confident amount instead of preserving stale structured data
- [x] source measurement-system change invalidates context-sensitive units such as `cup`
- [x] pre-existing development recipes lazily establish ingredient metadata when opened/validated
- [x] Recipes browser does not bulk-write ingredient metadata while merely listing summaries
- [x] future unsupported schemas remain read-only and do not receive ingredient metadata backfills
- [x] step parsing from native block text
- [x] notes mapping
- [x] recipe validation
- [x] Create Recipe authoring adapter using page append API
- [x] duplicate-page protection in Create Recipe
- [x] Convert to Recipe analysis/preview
- [x] Convert to Recipe writes already-reviewed ingredient parse results into hidden canonical metadata
- [x] positive base-yield guard before conversion commit
- [x] unknown-section classification: Ingredients / Steps / Notes / Ignore
- [x] unresolved section ambiguity blocks conversion
- [x] reconversion preserves existing user metadata and custom conversion rules
- [x] natural source text preserved during conversion
- [x] storage-independent recipe-meta codec
- [x] validated ingredient-meta codec
- [x] per-recipe metadata writer

Verification pending:

- [ ] local repository/authoring/ingredient-meta tests
- [ ] real Logseq create flow
- [ ] real Logseq conversion flow
- [ ] real unknown-section classification flow
- [ ] real native ingredient edit → hidden metadata synchronization
- [ ] verify one metadata write settles without a refresh/write loop
- [ ] verify converted visible blocks remain unchanged

## Phase 4 — Recipe browser and card UI

Implemented:

- [x] React main-UI root
- [x] Recipes browser
- [x] title search
- [x] category filter
- [x] tag filter
- [x] ingredient-contains filter
- [x] prep/cook/total-time filters
- [x] category/tag usage-count suggestions
- [x] suggestions available in Recipe Settings while free-form values remain allowed
- [x] Recipe Card
- [x] cover rendering + fallback placeholder
- [x] serving `− / +` controls
- [x] direct target-yield input
- [x] scaled ingredient display
- [x] unparseable ingredient raw-text fallback
- [x] recipe settings panel
- [x] category/tag editing
- [x] parser/source/display measurement overrides
- [x] custom ingredient conversion editing
- [x] native asset-path cover selection
- [x] EN/TR typed UI dictionaries
- [x] Logseq CSS-variable based light/dark compatibility
- [x] responsive layout
- [x] React/Biome hardening for effect dependencies, autofocus, and stable list keys

Verification pending:

- [ ] local UI tests
- [ ] manual light theme check
- [ ] manual dark theme check
- [ ] mobile/narrow main-UI check

## Phase 5 — Cooking Mode

Implemented:

- [x] Start Cooking action
- [x] focused main UI
- [x] optional recipe cover
- [x] current step
- [x] previous / next navigation
- [x] keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`)
- [x] keyboard shortcut suppression while typing/selecting
- [x] progress indicator
- [x] scaled ingredient drawer/list
- [x] duration chips
- [x] temperature chips
- [x] oven mode / preheat display
- [x] qualitative heat chips
- [x] clean exit back to Recipe Card
- [x] cooking state remains transient

Still pending:

- [ ] local Cooking Mode tests
- [ ] real cooking-flow manual check

Timers are intentionally not part of v0.1 runtime yet. Duration annotations were designed so timers can be added later without reparsing architecture changes.

## Phase 6 — Assets, reactivity, and lifecycle

Implemented:

- [x] public `Assets.listFilesOfCurrentGraph` integration
- [x] public `Assets.makeUrl` resolution
- [x] missing-cover graceful fallback
- [x] cover change does not delete old graph asset
- [x] recipe-subtree change filtering by UUID/DB id
- [x] parent-aware refresh so newly added recipe children are detected
- [x] transaction-datom fallback for deletions/moves where changed block snapshots are absent
- [x] transaction-datom parent/page targeting for newly attached recipe children
- [x] debounced refresh
- [x] matching hidden ingredient metadata prevents repeated parser/property writes
- [x] live recipe refresh preserves the active Cooking/Settings view
- [x] listener/command disposer ownership
- [x] React unmount when Logseq Recipe UI closes
- [x] fresh React root/state for each command opening
- [x] React unmount on plugin teardown
- [x] graph-switch UI close + runtime capability reset

Runtime verification pending:

- [ ] ingredient edit live-refresh check
- [ ] ingredient add/delete/move check
- [ ] hidden ingredient metadata no-loop check
- [ ] source measurement-system change reparse check
- [ ] edit-during-Cooking-Mode view-preservation check
- [ ] cover swap check
- [ ] cover delete check
- [ ] plugin reload check
- [ ] graph reopen check
- [ ] graph switch check

## Phase 7 — Migrations and compatibility

Implemented:

- [x] migration runner
- [x] schema-v1 migration
- [x] idempotency test contract
- [x] unsupported-future-schema rejection
- [x] future-schema repository validation avoids metadata writes
- [x] metadata-only migration boundary
- [x] `COMPATIBILITY.md`
- [x] pre-public-schema lazy ingredient metadata backfill policy documented

Pending:

- [ ] local migration test run
- [ ] minimum supported Logseq version chosen from actual compatibility evidence
- [ ] freeze public schema only after real Logseq qualification

## Phase 8 — Toolchain and release readiness

Implemented/configured:

- [x] TypeScript 5.9
- [x] Vite
- [x] React
- [x] Vitest with `happy-dom` and globals for Testing Library cleanup
- [x] Testing Library React + explicit DOM peer dependency
- [x] Biome
- [x] pnpm package-manager pin
- [x] Node version pin
- [x] transitional CI workflow definition
- [x] `RECIPE-FORMAT.md`
- [x] local runtime testing checklist

Current CI caveat:

- GitHub Actions runs observed on this branch terminate before any workflow step, log, or artifact is produced. They are not code-verification evidence. Local verification remains required.

Still required before merge/public beta:

- [x] run `pnpm install` locally
- [x] generate and commit `pnpm-lock.yaml`
- [x] switch CI install to `--frozen-lockfile` after the lockfile is committed
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes
- [x] `pnpm build` passes
- [x] full `pnpm check` passes
- [x] license file present (`LICENSE`, MIT)
- [x] release ZIP/package workflow (`.github/workflows/publish.yml`, triggers on `v*` tag push; packaging done by `scripts/package.sh` + `scripts/verify-package.sh`, run both locally and in CI)
- [x] marketplace manifest drafted and corrected (`docs/marketplace-manifest.json` — repo/icon fields now match the actual repo)
- [x] icon (`logo.svg`, referenced from `package.json` and the marketplace manifest)
- [x] sample recipe (`examples/banana-bread.md`, verified against the real parser)
- [x] beta feedback issue template (`.github/ISSUE_TEMPLATE/bug_report.md`)
- [x] `CHANGELOG.md` with a 1.1.0 entry (the public repo already has a `v1.0.0` release; this branch's next tag must be a version greater than that, never a re-published `0.x`/`1.0.0`)
- [ ] real Logseq compatibility qualification (see `COMPATIBILITY.md` and `docs/RELEASE_VALIDATION.md` — needs a real DB graph run; **the only remaining release blocker**)
- [ ] screenshots of the plugin running inside real Logseq (required by the marketplace README; see `docs/RELEASE_VALIDATION.md`'s screenshot checklist — blocked on the same real-Logseq session as the item above)
- [ ] push a `v1.1.0` tag once the two items above are done, confirm the Publish workflow attaches the zip to `frogiraffe/logseq-recipe`
- [ ] fork `logseq/marketplace`, add `packages/logseq-recipe/manifest.json` (see `docs/marketplace-manifest.json`), open the submission PR — staging described in the final release report

## Later ideas — not v0.1

- timers attached to step duration annotations
- multi-photo gallery
- grouped ingredients (dough / filling / topping)
- printable view
- optional global ingredient conversion presets
- structured JSON-LD import
- direct website scraping
- shopping-list generation
- combining multiple recipes into a shopping list
- nutrition integration
- meal planning
- inventory integration
- optional enhanced/inline native renderer if Logseq exposes a sufficiently stable API

## v0.1 definition of done

v0.1 is done only when all of the following are true:

1. local `pnpm check` completes with zero failures;
2. a supported real Logseq DB build passes the required capability gate;
3. the user can create or convert a normal readable recipe subtree;
4. conversion ambiguity is either deterministically recognized or explicitly classified by the user;
5. Recipe Card scales servings from synchronized structured ingredient data without mutating authored source text;
6. native ingredient edits replace stale hidden structure, including numeric → qualitative edits and source measurement-system changes;
7. recipe search/filter/settings/cover flows work in Logseq;
8. Cooking Mode navigates the recipe, uses the same target servings, and optionally shows the recipe cover;
9. native Logseq edits refresh the open recipe without graph-wide reparsing, endless property-write loops, or changing the active Logseq Recipe view;
10. reload, graph reopen, graph switch, and cover persistence scenarios pass;
11. disabling Logseq Recipe still leaves the complete recipe understandable in the native Logseq outline.
