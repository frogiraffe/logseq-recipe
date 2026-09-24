# Changelog

Only user-visible changes are listed here.

## 1.3.0 — 2026-09-24

### Converting

- Convert rebuilds outlines that Logseq split along the wrong lines (a
  heading sharing a block with its items, steps landing next to their
  heading, metadata on the title line) instead of rejecting them. An
  indented line under a step becomes that step's note, the same way however
  the paste reached Logseq.
- Section headings and labels such as "Ingredients" or "Yield:" are
  recognized in any of the five languages, in any case and without accents
  ("Yapilis", "Etapes", "Preparacion").
- Convert Preview warnings appear in the interface language.
- Ingredients measured in su bardağı, çay bardağı, or tatlı kaşığı, and
  lines written in another language than the recipe, keep their Convert
  Preview corrections after the recipe is reloaded.

### Languages

- All five languages read the same kinds of lines: abbreviated units
  ("c. à s.", "cda", "Stk.", "tbs", "tane"), cl and dl, short times in steps
  ("20 min", "1 h", "1 Std."), and linking words ("1 cup of flour",
  "1 tasse de farine" → flour, farine).
- Turkish times with case endings are read ("10 dakikadan fazla", "1 saatte").
- Heat levels and "about" words are covered in every language ("bei
  mittlerer Hitze", "a fuego lento", "circa 10 Min.", "unos 10 minutos").
- Oven mode and preheat are found after the temperature too ("190°C
  alt-üst ayarda önceden ısıt", "180 °C Ober-/Unterhitze").
- Numbers written as words are read in every language ("two eggs", "iki
  yumurta", "deux œufs", "zwei Eier", "dos huevos", "twenty five minutes",
  "otuz beş dakika", "vingt-cinq", "treinta y cinco", "a dozen").
- "Between 10 and 15 minutes" ("entre 10 et 15", "zwischen 10 und 15",
  "entre 10 y 15", "10 ile 15") is a range, and French hours with minutes
  ("1 h 30", "1h30", "1 h 30 à 2 h") are read.
- More ways of writing a temperature: "350° F", "350 degrees F", "180C",
  "180 ºC", "160 Grad", "200 grados", "180 dereceye", "180 derecelik"; "Fırını
  180 dereceye ısıtın" and "im vorgeheizten Ofen" count as preheating.
- More ways of writing an amount: "1-1/2 cups", "1⁄2", "~200 g", "approx.",
  "1 tbsp.", "1 500 g" (French), "cuil. à soupe", "Msp.", "gestr. TL",
  "200 ml'lik", "3'er dakika", "1 taza y media", "une tasse et demie".
- "Toute une nuit", "toda la noche" and "bir gece" are overnight; "Pour:",
  "Für:", "Zubereitung:" and "Para:" are recipe details.
- Recipe text is read about a third faster.
- Search ignores accents and Turkish letters ("patlican" finds "patlıcan").

### Cooking Mode

- A duration in a step's note ("rest on the tray for 10-15 minutes") offers
  a timer too; a duration inside an instruction not to do something ("don't
  bake past 15 minutes", "15-16 dakikaya kadar pişirme", "ne pas cuire plus
  de 15 min", "nicht länger als 15 Min.", "no hornear más de 15 minutos")
  never does.
- **Exit for now** survives a Logseq restart: the step, ticked ingredients,
  and timers come back, running timers still ring on time without opening
  the plugin, and a timer that ended meanwhile rings once. A cook left
  untouched for a week is dropped.
- The per-ingredient unit picker shows the unit in use ("g", "cup") instead
  of "Use default", and doesn't list it twice.

### Amounts and times

- Thousands separators are read according to the recipe language ("1,000 g"
  in English, "1.000 g" in Turkish), and an implausible "1.250 kg" is never
  scaled as 1250 kg.
- A line with two amounts ("1 kg flour + 200 g sugar", "1 cup plus 2 tbsp
  flour") or an unreadable number asks for review before conversion instead
  of scaling one part. A number that only describes the ingredient doesn't:
  "2 eggs (about 100 g)", "cut into 8 wedges", "70% dark chocolate".
- A parenthetical right after the amount joins the note ("½ cup (1 stick)
  butter" → butter, 1 stick).
- Vague amounts ("a little olive oil", "un peu de sel", "ein paar Blätter",
  "bir miktar tuz") are no longer read as 1 and scaled.
- Halves are read in every language: "half a cup", "1 and a half cups",
  "bir buçuk su bardağı", "an hour and a half", "une heure et demie", "una
  hora y media", "anderthalb Stunden".
- Common spoon spellings and level/heaped qualifiers are recognized; the
  qualifier stays in the ingredient note rather than changing the measured
  volume. Alternative times ("10 min or 12 min") and reversed ranges no
  longer become a single misleading timer or cooking time; "45 min or until
  golden" is still 45 minutes.
- A time such as "1 h 5 min" is read as 65 minutes; a value with a part the
  parser can't read is flagged instead of silently shortened.
- Metric amounts show as decimals ("62.5 ml", not "62½ ml"); large or small
  amounts switch units (40 oz → 2½ lb, 12 fl oz → 1½ cups, 0.375 kg →
  375 g).
- A converted oven temperature is rounded like a dial setting (350°F →
  175°C).
- Built-in grams-per-volume data now covers water, salt, baking soda,
  baking powder, and plain "sugar" in all five languages.

### Fixes

- Editing a multi-line step or note keeps its line breaks, and the recipe
  card and Cooking Mode show them as separate lines, as Logseq does.
- In Cooking Mode the arrow keys keep moving between steps after you tick
  an ingredient.
- Archiving a recipe converted outside the Recipe Library (for example in a
  journal) keeps it where it is instead of moving it into the library.
- A cover path is checked the same way as step attachments when it is
  saved and when it is shown: only images inside the graph's assets folder
  load, and a listed absolute path is stored as `assets/...`.
- Creating a recipe opens the editor right away, since a new recipe starts
  empty.
- New plugin logo.

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
