# Architecture

Logseq Recipe is a TypeScript and React plugin with four runtime
dependencies: `@logseq/libs`, React, and dnd-kit for drag and drop. Data
flows one way: Logseq blocks and properties are read into a plain `Recipe`,
the UI renders it, and every change goes back through the repository as
explicit block and property writes.

## Layers

| Directory | Holds | Depends on |
| --- | --- | --- |
| `src/domain` | Recipe types, quantities, scaling, step media | nothing |
| `src/parsing` | The deterministic parser and its five language packs | `domain` |
| `src/units` | Units, conversion, densities, formatting | `domain` |
| `src/application` | Use cases: convert, import, edit, list and filter, validate, cooking sessions; the `RecipeRepository` interface | `domain`, `parsing`, `units` |
| `src/migrations` | Versioned, repeatable schema steps | `application` |
| `src/logseq` | Everything that talks to Logseq: the repository, schema, the category and tag properties, capabilities, events, settings | all of the above |
| `src/ui` | React screens and components, i18n | `application`, `domain` |

`src/index.ts` registers the commands and opens the UI. Only `src/logseq`
and `src/index.ts` call the Logseq API; the rest runs anywhere, which is
what lets the tests and the demo harness use it without Logseq.

## Reading a recipe

`src/logseq/logseq-recipe-repository.ts`:

1. Load the root's block tree (a block, or a page's blocks).
2. Find the Ingredients, Steps and Notes sections by `section_role`.
3. Read the root's properties and `recipe_meta`; resolve categories and tags
   (`recipe-taxonomy.ts`); pick the parse language.
4. Read each ingredient from `ingredient_meta` when it still matches the
   line, otherwise parse it; parse steps and their notes.
5. Read visible detail lines ("Serves 8") over the properties.

A full load also brings `ingredient_meta` and the detail properties up to
date with the visible text. Listing recipes skips those writes. A
per-graph read cache keeps list summaries and is dropped for a recipe as
soon as Logseq reports a change to any of its blocks, the same signal that
refreshes an open recipe.

## Writing

- Create, Convert and Import write the structure first and set
  `recipe_marker` last, so an interrupted write never leaves a half-built
  root that is listed as a recipe.
- Editing (`application/edit-recipe.ts`) diffs the editor's state against
  the loaded recipe and writes only the difference. A save interrupted part
  way is reported as incomplete and the recipe reloaded from Logseq.
- Categories and tags go to their properties first, then to `recipe_meta`
  (see [Data model](data-model.md)).
- Deleting a recipe is only possible for an archived one.

## Capabilities

At startup the plugin checks that the graph is a DB graph and that the
property, change-feed and UI APIs it needs exist. Without them it warns and
writes nothing. Optional features (covers, page-valued category and tag
properties) turn themselves off when their API is missing, instead of
blocking everything else.

## Tests

| Kind | Where | Runs |
| --- | --- | --- |
| Parser, units, domain, application | `test/parsing`, `test/units`, `test/domain`, `test/application` | `pnpm test` |
| Repository and Logseq adapters, against in-memory fakes that reproduce measured Logseq behavior | `test/logseq`, `test/migrations` | `pnpm test` |
| UI components and flows, in happy-dom with Testing Library | `test/ui` | `pnpm test` |
| The real repository and writers against a real Logseq graph | `test/live` | `pnpm test:live`, see [Contributing](contributing.md) |

Browser end-to-end tests (Playwright or similar) were considered and left
out: the UI flows are covered by component tests that drive the real app,
the Logseq integration by the live suite, and a browser suite would add
the only large development dependency for little extra coverage. The
`pnpm demo` harness runs the real UI over sample data for manual checks
and screen recordings.
