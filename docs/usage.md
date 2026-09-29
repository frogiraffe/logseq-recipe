# Using Logseq Recipe

## Browse

**Logseq Recipe: Recipes** shows every recipe as a card with its cover,
time, categories and tags.

- **Search** matches titles, categories, tags, ingredients, steps and notes;
  every word you type must appear somewhere in the recipe.
- **Filters** narrow by an ingredient, categories, tags, and ranges of prep,
  cook and total time. **Sort by** orders by title or total time.
- **More actions (⋯)** holds **Archived Recipes**.
- **Create Recipe ▾** also offers **Import from Text**.

Edits made directly in Logseq refresh whatever the plugin has open.

## A recipe

**Start cooking** and **Edit recipe** are up front. **More actions (⋯)**
holds Duplicate, Recipe settings, Open in Logseq, Archive, and **Move to
Recipe Library** for a recipe converted somewhere else.

### Servings and units

- Change **Servings** with − and +, or type a number. The ingredient amounts
  follow; **Original servings** returns to the recipe's own number.
- Amounts show in your measurement system (plugin setting, or per recipe in
  Recipe settings). Each ingredient that can be shown in another unit has a
  unit menu beside it; the choice lasts while the plugin is open.
- Mass and volume convert into each other only for ingredients with known
  densities, or with a conversion you add under Recipe settings → Advanced.
- An ingredient marked **Fixed** in the editor ("1 bay leaf") doesn't scale.
  A line with no amount ("salt to taste") never scales.
- Scaling and conversion only change what is shown. The recipe text is
  never rewritten.

## Edit

**Edit recipe** edits the title, servings, times, source, ingredients
(with groups), steps with their notes and media, and notes.

- Drag the handle to reorder, with a mouse, touch or the keyboard: focus the
  handle, press Space, move with the arrow keys, Space to drop, Escape to
  cancel.
- Nothing is written until **Save**. A save that Logseq interrupts is
  reported as incomplete, and the recipe is reloaded from Logseq, rather
  than left silently half-done.

## Recipe settings

Categories, tags, recipe language, measurement systems, custom conversions
and the cover image.

Categories and tags are also the Logseq properties `recipe_categories` and
`recipe_tags`: change them here or in Logseq, whichever you like. See
[Properties and queries](properties-and-queries.md).

## Archive and delete

**Archive** hides a recipe from the list but keeps it. **Archived Recipes**
restores it, or deletes it permanently after a confirmation. Deleting is
only possible from the archive.

## Cooking Mode

- One step at a time. **Previous** / **Next**, the step track, or the ← and
  → keys move between steps. The ingredient panel ticks items off and
  changes servings.
- **Timers:** a time in a step or its notes offers a timer button (a range
  offers both ends; "about 20 minutes" offers `~20:00`), except inside an
  instruction not to do something ("don't bake past 15 minutes"). **+ Timer**
  starts one of any length. Timers run side by side, can be paused, keep
  running when you leave Cooking Mode, close the plugin or restart Logseq,
  and ring with a sound and a Logseq notice. A small dock shows them on every
  other screen.
- **Exit for now** keeps your step, ticked ingredients and timers, across a
  Logseq restart too. A cook left untouched for a week is dropped.
  **Finish cooking** clears them.
- The screen stays awake while Cooking Mode is open, where the system allows
  it.

## Covers and step media

Covers and step media are files already in the graph's `assets` folder. The
plugin never uploads, moves or deletes files. A cover is stored as a path
relative to the graph (`assets/pie.jpg`); web links and paths outside
`assets` are refused, and a missing file shows a placeholder.

## Keyboard

- **Escape** does what the screen's Back or Cancel does, and closes the
  plugin from the Recipes screen. A form with unsaved changes asks first.
- In Cooking Mode, **←** and **→** change steps.

## Languages

The interface follows Logseq's language unless you choose one in the plugin
settings. A recipe is read in its own language (Recipe settings), and each
line falls back to whichever supported language understands it: a Turkish
step is still read when Logseq runs in English.

## Plugin settings

| Setting | Meaning |
| --- | --- |
| UI language | The interface language, or Logseq's |
| Default recipe language | The language tried first when reading recipe text |
| Measurement system | How amounts are shown, unless a recipe overrides it |
