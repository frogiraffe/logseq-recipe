# Release validation

This is the release-time validation record for Logseq Recipe. It exists to
separate three distinct kinds of evidence, per the project's release policy:

- **Automated verified** — a command ran in this environment and its result
  is reported below.
- **Manually verified** — a person observed this directly inside a real
  Logseq DB graph and recorded the result.
- **MANUAL REQUIRED** — not yet verified. Do not treat unit tests, mocks, or
  code review as a substitute for this.

## Automated verified

Run from a clean `pnpm install --frozen-lockfile`, this session, at HEAD
(`v1.1.0`, after the identity/correctness/CI pass described in
`CHANGELOG.md`):

| Check | Result |
| --- | --- |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm test` | pass — 298 tests, 41 files |
| `pnpm build` (production) | pass |
| `pnpm package` (release ZIP) | pass — produces `logseq-recipe-v1.1.0.zip`, always via a fresh `pnpm build` first |
| `pnpm run package:verify` | pass — unpacks the ZIP and confirms `package.json` parses, `dist/index.html` exists, `logseq.main`/`logseq.icon` resolve, and `package.json.name`/`logseq.id`/`repository.url`/version/artifact filename all agree on the `logseq-recipe` identity |

These checks confirm the plugin **builds and packages correctly**. They do
**not** confirm it behaves correctly inside a real running Logseq app.

## A real Logseq install exists for this — use it

This development machine already has a real Logseq desktop build and a graph
set up specifically for this: `DraftRecipeQA20260914`. A prior session's
findings from qualifying against it are recorded in
[`COMPATIBILITY.md`](COMPATIBILITY.md) (Logseq
`2.0.1-alpha-nightly.20260826`, automated Phase 0 capability probe passed;
cover-persistence and create/convert/live-edit scenarios were not completed).

This session deliberately did not drive that Logseq instance further:
launching it (an accidental side effect of an unrelated version check) showed
it shares the desktop with the user's other live, unrelated applications and
personal graphs. Synthetic input automation against someone's live personal
session — rather than a disposable CI/VM instance — was judged out of scope
without explicit sign-off, so no further automated UI driving or screenshot
capture was attempted here. The Logseq process that was accidentally started
was closed again without interacting with it further.

**Action for whoever runs this checklist**: open Logseq, switch to the
`DraftRecipeQA20260914` graph (or a disposable graph of your own), load the
built `dist/` (or the packaged ZIP — see below) as an unpacked plugin, and
work through the items below. The sample recipe in
[`examples/banana-bread.md`](../examples/banana-bread.md) covers steps 3–7.

## MANUAL REQUIRED — real Logseq DB graph smoke test

Automated tests exercise every item below through mocked Logseq hosts; none
of this has been exercised against a real running Logseq yet. Do not report
any of these as passing without actually performing them.

1. [ ] Logseq loads the unpacked plugin without startup errors (check DevTools console).
2. [ ] Logseq Recipe's commands (`Recipes`, `Create Recipe`, `Convert to Recipe`) appear in the command palette / block context menu.
3. [ ] **Create Recipe**: creating a recipe with a title that already exists as a Logseq page is rejected with a clear error.
4. [ ] `examples/banana-bread.md`'s outline can be pasted in and converted via **Convert to Recipe**, including manually correcting an ingredient the parser can't confidently parse.
5. [ ] An unrecognized root-level line during Convert shows up as ignored/unclassified content in the preview instead of silently vanishing.
6. [ ] The Recipe Card renders the converted recipe correctly; ingredient amounts/units render correctly, with the qualitative line kept as raw text.
7. [ ] Serving scaling (`−`/`+` and direct yield input) changes quantities correctly, and scaling back to the original yield restores the exact original values.
8. [ ] A fixed ("doesn't scale") ingredient stays constant while others scale.
9. [ ] **Edit Recipe**: clearing an optional field (yield unit, prep/chill/cook time, source URL) actually removes it — reopening the recipe shows it gone, not reverted.
10. [ ] **Edit Recipe**: editing the visible Yield/Prep/Chill/Cook/Source line directly in the native Logseq outline (not through the plugin UI) is picked up as the new value the next time the recipe is opened.
11. [ ] **Edit Recipe**: adding a new ingredient, moving it to a different position, and marking it "doesn't scale" — all in the same save — persists exactly that state.
12. [ ] **Edit Recipe**: blanking an existing ingredient/step/note's text blocks Save with a visible message instead of silently discarding the edit.
13. [ ] **Edit Recipe**: changing base yield resets the Recipe Card's serving control to the new yield (1×), not the old yield/new yield ratio.
14. [ ] **Rename**: renaming a recipe to a title that's already a different Logseq page fails with a clear error.
15. [ ] **Duplicate**: the copy has a unique title and preserves yield, times, source, categories/tags, parser locale, measurement system, conversion overrides, cover, ingredient scale modes, item order, and any manually corrected ingredient exactly.
16. [ ] **Delete**: deleting a recipe (and confirming) removes it from the Recipes browser; the wording matches Logseq's actual recycle/restore behavior, not "permanent."
17. [ ] Deleting the page of an **open** recipe from elsewhere in Logseq (or via the plugin's own Delete) clears the Recipe Card and returns to the Recipes view instead of leaving stale content on screen.
18. [ ] **Recycled title reuse**: delete a recipe, then Create Recipe with the same title again — the new recipe does not inherit the old one's yield unit, times, source URL, or cover.
19. [ ] Rapid double-clicking Create / Convert / Save Edit / Save Settings / Duplicate / Delete does not create duplicate blocks/pages (buttons should visibly disable while pending).
20. [ ] Cooking Mode opens, shows the Preheat/Bake duration and temperature chips, and is navigable (buttons + arrow keys + Escape).
21. [ ] Start Cooking is disabled (or otherwise unavailable) for a recipe with zero steps.
22. [ ] Ingredient checklist in Cooking Mode: checking an item, then removing that ingredient via a native edit, doesn't leave a stale checked state if a new ingredient reuses the id.
23. [ ] Navigation/back/close between Recipe Card, Cooking Mode, and Recipes browser works without leaving stray UI state.
24. [ ] Data survives a plugin reload and a graph close/reopen (recipe content, ingredient metadata, cover reference, root metadata lines).
25. [ ] An incomplete/invalid recipe (e.g. missing Ingredients section) fails gracefully — no crash, a clear message.
26. [ ] No unexpected console errors appear during any of the above.
27. [ ] Confirm the plugin's commands/UI do not appear (or clearly warn) when opened against a **file graph**, per DB-only design.
28. [ ] Disabling and re-enabling the plugin does not corrupt or hide the graph's recipe content — the outline remains a normal, readable Logseq page with the plugin off.

## Screenshot checklist (blocks the README's Screenshots section and the Marketplace README requirement)

Capture these against a real running Logseq window during the smoke test
above, save as PNG under `docs/screenshots/`, and update the table in
`README.md` to reference them instead of the placeholder paths:

- [ ] `docs/screenshots/recipe-card.png` — Recipe Card for a converted recipe.
- [ ] `docs/screenshots/serving-scaling.png` — Recipe Card mid-scaling (a non-1x serving count).
- [ ] `docs/screenshots/cooking-mode.png` — Cooking Mode on a step with duration/temperature chips visible.
- [ ] (optional) `docs/screenshots/recipe-settings.png` — Recipe Settings panel.

This is the **only remaining manual blocker** for the release — see the
final report's "Remaining blockers" section.
