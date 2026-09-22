# Logseq Recipe

Turn a Logseq DB graph into a local recipe manager without moving recipes out
of Logseq.

![Logseq Recipe demo](assets/logseq-recipe-demo.gif)

## What you get

- Normal, readable Logseq pages for every recipe.
- Create and Convert flows for new or existing outlines.
- English, Turkish, French, German, and Spanish recipe parsing.
- Serving scaling without rewriting the quantities you authored.
- Metric, US Customary, and Imperial display conversions.
- Search, filters, categories, tags, covers, recipe editing, and duplication.
- A focused Cooking Mode with scaled ingredients and step annotations.
- Local, deterministic operation: no account, cloud service, AI, or telemetry.

Unknown or ambiguous text stays unchanged. Logseq Recipe never invents a
quantity, density, duration, or temperature.

## Requirements

Logseq Recipe supports **Logseq DB graphs only**. It checks the required Logseq
APIs at runtime and shows a warning instead of writing when the current build
is incompatible.

## Install

In Logseq, open **Plugins → Marketplace**, search for **Logseq Recipe**, and
select **Install**.

For a manual install, download the ZIP from the
[latest GitHub release](https://github.com/frogiraffe/logseq-recipe/releases/latest),
extract it, choose **Plugins → Load unpacked plugin**, and select the extracted
folder containing `package.json`.

## Create or convert a recipe

Run **Logseq Recipe: Create Recipe** from the command palette for a blank
recipe, or select an existing outline and run **Logseq Recipe: Convert to
Recipe**. Convert previews every change and asks you to resolve ambiguous
sections or ingredients before it writes metadata.

A recipe remains a plain outline:

```text
Chocolate Chip Cookies
  Yield: 12 cookies
  Prep: 15 min
  Cook: 10-12 min
  Ingredients
    120 g butter
    150 g brown sugar
    1 egg
    180 g dark chocolate (roughly chopped)
  Steps
    Melt the butter and let it cool slightly.
    Mix in the sugar and egg.
    Bake at 180°C for 10-12 minutes.
  Notes
    The centers may still look soft when removed from the oven.
```

See [the banana bread example](examples/banana-bread.md) for a complete outline
you can paste into Logseq.

## Use your recipes

- Open **Logseq Recipe: Recipes** to search, filter, sort, open, duplicate, or
  delete recipes.
- Change servings on the Recipe Card; displayed quantities scale from the
  original parsed amount and your Logseq text is not rewritten.
- Choose a display system globally or per recipe. Ingredient-specific
  mass/volume conversions are used only when a known or custom rule exists.
- Edit categories, tags, parsing language, measurement systems, conversions,
  and the cover from Recipe Settings.
- Start Cooking Mode for step navigation, scaled ingredients, durations,
  temperatures, and heat cues.

Recipe edits made directly in Logseq refresh the open plugin view. Removing the
plugin leaves the visible recipe content intact.

## Covers

Covers reference images already stored in the graph; the plugin never uploads
or deletes the image file. Pick an image in Recipe Settings. If Logseq cannot
list graph images, choose **Cover asset path** and enter a safe graph-relative
path such as `assets/cookie.jpg`. Missing images fall back to a placeholder.

## Limits

- File graphs are not supported.
- Parsing is deterministic syntax recognition, not general natural-language
  understanding. Ambiguous lines stay as written until you correct them.
- Website scraping, nutrition, shopping lists, meal planning, cloud sync,
  timers, and multi-photo galleries are not included.

If commands are missing, confirm the plugin is enabled and the current graph is
a DB graph. For bugs, open an
[issue](https://github.com/frogiraffe/logseq-recipe/issues) with your Logseq
version, graph type, and relevant DevTools console error.

## Development

Requires Node.js 20.19+ and pnpm 10.33.0.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm package
pnpm run package:verify
```

`pnpm demo` opens the shipped React UI with local sample data for visual work.

## License

[MIT](LICENSE)
