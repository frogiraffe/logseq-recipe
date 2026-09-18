# Release validation

This is the release-time validation record for Draft Recipe. It exists to
separate three distinct kinds of evidence, per the project's release policy:

- **Automated verified** — a command ran in this environment and its result
  is reported below.
- **Manually verified** — a person observed this directly inside a real
  Logseq DB graph and recorded the result.
- **MANUAL REQUIRED** — not yet verified. Do not treat unit tests, mocks, or
  code review as a substitute for this.

## Automated verified

Run from a clean `pnpm install --frozen-lockfile`, this session:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm test` | pass — 242 tests, 40 files |
| `pnpm build` (production) | pass |
| `pnpm package` (release ZIP) | pass — produces `logseq-draft-recipe-v<version>.zip` |
| `pnpm run package:verify` | pass — unpacks the ZIP and confirms `package.json` parses, `dist/index.html` exists, and the `logseq.main`/`logseq.icon` paths resolve inside the extracted package |

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

1. [ ] Logseq loads the unpacked plugin without startup errors (check DevTools console).
2. [ ] Draft Recipe's commands (`Recipes`, `Create Recipe`, `Convert to Recipe`) appear in the command palette / block context menu.
3. [ ] `examples/banana-bread.md`'s outline can be pasted in and converted via **Convert to Recipe**.
4. [ ] The Recipe Card renders the converted recipe correctly.
5. [ ] Ingredient values render correctly (amounts, units, the qualitative cinnamon line as raw text).
6. [ ] Serving scaling (`−`/`+` and direct yield input) changes quantities correctly.
7. [ ] Scaling back to the original yield restores the exact original values.
8. [ ] Cooking Mode opens, shows the Preheat/Bake duration and temperature chips, and is navigable (buttons + arrow keys + Escape).
9. [ ] Navigation/back/close between Recipe Card, Cooking Mode, and Recipes browser works without leaving stray UI state.
10. [ ] Data survives a plugin reload and a graph close/reopen (recipe content, ingredient metadata, cover reference).
11. [ ] An incomplete/invalid recipe (e.g. missing Ingredients section) fails gracefully — no crash, a clear message.
12. [ ] No unexpected console errors appear during steps 2–11.
13. [ ] Confirm the plugin's commands/UI do not appear (or clearly warn) when opened against a **file graph**, per DB-only design.
14. [ ] Disabling and re-enabling the plugin does not corrupt or hide the graph's recipe content — the outline remains a normal, readable Logseq page with the plugin off.

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
