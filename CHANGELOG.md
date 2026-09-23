# Changelog

Only user-visible changes are listed here.

## 1.2.0 — 2026-09-24

### Recipe Library and archive

- New recipes live under one **Recipe Library** page instead of one page
  each; existing recipe pages keep working unchanged.
- Delete is now **Archive**: archived recipes leave the list, stay
  recoverable indefinitely, and can be restored or permanently deleted from
  **Archived Recipes**.
- **Open in Logseq** jumps to a recipe's source block or page.

### Finding recipes

- The recipe list is a card grid with cover photos and total time, and opens
  much faster after the first time.
- Search covers titles, categories, tags, ingredients, steps, and notes;
  every word you type must appear somewhere in the recipe.

### Cooking Mode

- **Timers** start from any step duration (ranges let you pick either
  bound; "about 20 minutes" gets a ~20:00 timer) or at any length you type.
  Several can run at once, pause and resume, and keep ringing — with a sound
  and a Logseq notice — after you leave Cooking Mode or close the plugin.
  A small dock shows running timers on every other screen.
- **Exit for now** keeps your step, checked ingredients, and timers until you
  choose **Finish cooking**.
- Change servings while cooking; a large step number and a tappable step
  track show where you are; the screen stays awake.

### Editing

- Steps can carry their own **notes, images, and audio**, stored as ordinary
  child blocks; attachments come from the graph's assets folder only.
- Reorder ingredients, steps, and notes by **dragging**, with touch, or with
  the keyboard on the drag handle (Space, arrow keys, Escape).
- Every edit is validated before anything is written and removals are
  applied last; if Logseq rejects a write partway, the recipe is reloaded and
  the save is reported as incomplete.

### Languages

- The interface is available in **French, German, and Spanish** as well as
  English and Turkish, with unit labels, plurals, and decimal separators in
  the chosen language.
- Each recipe line is read in the language it is written in, so a Turkish
  step is understood even when Logseq or the recipe is set to English.

### Look and feel

- Redesigned recipe card, editor, and Cooking Mode, with quiet motion that
  turns off when your system asks for reduced motion.

## 1.1.1 — 2026-09-23

- Added direct recipe editing, duplication, deletion, item reordering, browser
  refresh, sorting, clearer filters, and better empty/loading states.
- Convert can split a pasted single-block outline, select parsing language and
  source measurements, and correct ambiguous ingredients before writing.
- Improved Turkish culinary parsing, everyday kilogram wording across all five
  parser languages, ingredient notes, unit labels, and metric display sizing.
- Preserved unsaved work with discard confirmations, sticky form actions,
  accessible focus handling, and guarded UI opening when the graph changes.
- Added manual graph-relative cover paths and a placeholder for missing cover
  files.
- Fixed native metadata synchronization, recycled-page cleanup, stale reloads,
  duplicate actions, future-schema writes, recipe title collisions, and
  ingredient conversion matching.
- Updated bundled dependencies with available security fixes.

## 1.0.0 — 2026-09-18

- First Marketplace release with Create/Convert, multilingual parsing, serving
  scaling, measurement conversion, recipe search and filters, graph covers,
  Recipe Settings, and Cooking Mode.
