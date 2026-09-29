# Changelog

Only user-visible changes are listed here.

## 1.5.0 — 2026-09-30

### Categories and tags in Logseq

- A recipe's categories and tags are now the Logseq properties
  `recipe_categories` and `recipe_tags`, as links to pages ("Dessert"). Logseq's
  own queries find recipes by them
  (`{{query (property recipe_categories [[Dessert]])}}`), the pages list their
  recipes, and a change made to them in Logseq is the recipe's new list. The
  plugin never deletes a page.
- Recipes saved by 1.4 and earlier keep working as they are. The Recipes
  screen says how many still have categories or tags Logseq can't see, and
  **Review…** shows what would be written (properties, new and existing
  pages) before moving them. The move can be repeated or interrupted safely and deletes nothing.
- Logseq Recipe 1.4.1 still works on recipes 1.5 has saved. After a save in
  1.4.1, 1.5 shows both versions' categories and tags together, so nothing
  is lost either way.
- A name that can't be a page of its own stays in the plugin: one with a "/",
  or one Logseq uses for a property or a built-in tag ("Task").
  A typed leading "#" is no longer part of a new category or tag.
- Recipe settings say that categories and tags are Logseq properties. A
  change made to them in Logseq while the settings are open is kept.

### Easier to see, reach and read

- Icons are drawn in the text colour instead of symbol characters, so they
  look the same on every system and never turn into emoji.
- Small controls are easier to hit: the × on a category or tag, the timer's
  pause button, and the Filters, Advanced and Notes & media rows.
- Muted text and timer times are easier to read on light themes.
- Moving through a form with the keyboard never leaves the field you are on
  hidden under the Save bar or the timer dock, and the timer dock no longer
  covers the last fields of a page.
- Title, servings and times say what is wrong next to the field instead of
  only greying out Save.
- Buttons and fields use the plugin's own font and size with the rest of
  its text, and nothing scrolls sideways in a narrow window when text is
  enlarged.

### Other

- Create Recipe links to Import from Text.
- New documentation: getting started, usage, properties and queries,
  upgrading to 1.5, parser guarantees, data model and architecture.

## 1.4.1 — 2026-09-29

### Fixes

- Turkish times with "kadar" are read as written: "10 dakika kadar" is
  about 10 minutes, "10 dakikaya kadar" stays up to 10 minutes, and the
  "kadar" ending a condition ("köpük kıvamına gelene kadar 5 dakika") no
  longer turns the time after it into a maximum.
- When a recipe's headings fit both English and French ("Ingredients",
  "Préparation", "Notes"), Convert and Import pick the language from
  measuring words only one language uses ("c. à soupe", "EL", "yemek
  kaşığı"). Container words such as "pot" or "sachet" never decide it;
  without such words the choice is the same as before.
- Built-in ingredient conversions also apply when the ingredient ends with
  a preparation such as "flour, sifted" or "butter, softened". The
  ingredient text saved in the recipe is unchanged.

## 1.4.0 — 2026-09-29

### Import and Convert

- **Import from Text**: paste a whole recipe into the plugin (**Create
  Recipe ▾ → Import from Text** on the Recipes screen, or the command
  palette). **Preview** shows it like
  Convert, and it is added to the Recipe Library only when you confirm;
  cancelling writes nothing.
- Convert and Import pick the recipe's language from its headings and
  labels ("Malzemeler", "Porsiyon:") and use that language's measurement
  system. Changing the language in the preview changes the measurement
  system with it, until you choose one yourself.
- Converting a title block whose sections were pasted as the blocks after
  it, instead of under it, offers to move those sections under the title.
- More section headings are recognized: with a colon or markdown
  ("Malzemeler:", "## Ingredients"), with a note in brackets ("Malzemeler
  (8 adet için)"), or naming a part of the dish ("Hamur için malzemeler",
  "Ingredients for the dough", "Kekin yapılışı", "Nasıl yapılır?").
- A recipe written in parts ("Kek için malzemeler", "Krema için
  malzemeler") becomes one section of each kind instead of being refused.
- Servings written without a colon are read: "Serves 4", "Serves 4-6" (as
  4), "Makes 12 cookies", "Makes about 24", "6 servings", "4 kişilik",
  "6 kişi için", "Pour 4 personnes", "Für 4 Personen", "Para 4 personas";
  so are "Kaç kişilik: 2" and "Kişi sayısı: 4". Changing the servings in
  the editor keeps such a line's own words ("Serves 4-6" → "Serves 8").
- A recipe with no serving count no longer stops Convert or Import: it
  counts as 1 serving (the recipe as written), and the preview asks for the
  real number.

### Ingredient groups

- Ingredients can be grouped ("For the dough", "For the filling"): a line in
  Ingredients with no amount and ingredients nested under it is a group
  heading, shown on the recipe card and in Cooking Mode. The nested
  ingredients used to be left out of the recipe. A single unmeasured line
  under an unmeasured one ("Salt to taste" over "preferably flaky") stays
  that ingredient's note unless the heading ends with a colon; the editor
  adds the colon to a one-ingredient group.
- "For the dough:" followed by its ingredients at the same level becomes a
  group when importing or converting. Converting such a recipe writes its
  lines anew as nested blocks: the preview shows the new structure and says
  that links to the old blocks and their properties are not kept.
- The editor adds, renames, and removes groups; drag an ingredient below a
  group's heading to move it into that group.

### Recipe Library

- **Move to Recipe Library** (under More actions) moves a recipe converted
  somewhere else, such as a journal, into the Recipe Library. It asks
  first and confirms the move with a notice, and **Duplicate** says you are
  now viewing the copy.

### Editing and reading

- Lines written under an ingredient in Logseq ("at room temperature") show
  below it on the recipe card and in Cooking Mode, and are searchable, as
  are ingredient group titles.
- Dragging an ingredient group's heading in the editor moves its
  ingredients with it.
- Cans, packages, bunches, jars, sprigs, heads, and sticks are read as
  counted units in every language ("2 cans tomatoes", "1 paket vanilin",
  "1 bağ maydanoz", "1 Dose Tomaten", "1 cabeza de ajo"), also with their
  size in brackets before them ("1 (400 g) can tomatoes" → can, note
  "400 g"). "1 yemek kaşığı dolusu un" keeps "dolusu" as a note.
- Titles stay unique when renaming or importing, as when creating.

### Interface

- The interface language follows Logseq's by default (**Auto**).
- Messages and errors appear in the interface language, including the
  notices shown outside the plugin window.
- Cooking Mode keeps the step bar (Previous, the step track, Next) at the
  bottom of the screen and shows the cover as a small thumbnail. A step's
  timers sit right under its text, above its notes and photos, and a step
  photo is at most a third of the screen tall, so the timers stay in view.
  On the last step, Next becomes **Finish cooking**; finishing while a
  timer is still running asks first.
- Convert and Import previews list **how each ingredient was read**
  (amount, unit, name, note) under a disclosure, so a wrong reading can be
  spotted before anything is written.
- Convert Preview asks only about amounts it can't read; lines with no
  amount ("a little salt") are listed once, with **Enter an amount** if you
  want one, and no problem is listed twice.
- Recipe languages show their names ("Türkçe", "Español"), and Recipe
  Settings explain the two measurement systems.
- In the editor, a photo or audio attached to a step shows as the file (a
  thumbnail or player and its name) instead of its `![…](../assets/…)`
  markup; it can still be moved or removed.
- The editor's times say their unit (minutes), its "doesn't scale" switch is
  a short **Fixed**, and on narrow windows each line and its controls sit
  in one frame.
- The recipe card's **More actions** menu sits with the recipe's own
  actions, not beside the servings; a servings unit that repeats its label
  ("Servings 4 servings") is left out.
- French and Spanish keep the linking word the cook wrote after a unit
  ("2 tasses de farine", "1 c. à s. d'huile").
- The recipe card's cover is at most 320 px (or 40% of the window) tall, so
  the ingredients start on the first screen, and a wrapped time line never
  starts with a "·".
- On a wide window (1000 px and up), Cooking Mode shows the ingredients
  beside the step, ready to tick off, and a new cook starts with them open;
  **Ingredients** still hides them.
- The recipe list's header is tidier: **Create Recipe** has a **▾** for
  **Import from Text**, and **Archived Recipes** moved under **⋯**, so the
  header fits one line on narrow windows.
- After changing the servings, a **↺** button beside them goes back to the
  recipe's own number, on the recipe card and in Cooking Mode.
- Restoring a recipe keeps you in **Archived Recipes**, with a notice, so
  several can be restored in a row.
- **Escape** leaves the current screen the way its Back or Cancel would, and
  closes the plugin from the recipe list; an open menu, suggestion list,
  drag, question, or a search with text in it takes the Escape first.
- Every confirmation (discard changes, archive, delete permanently, move to
  the Recipe Library, finish cooking with a timer running) is one dialog in
  the plugin's own style instead of a mix of browser prompts and inline
  questions. It names the recipe it acts on, starts on the safe choice, and
  Escape cancels it.
- Smaller fixes: the timer dock sits above Save/Confirm bars, sticky bars fit
  narrow windows, **Delete permanently** is marked as destructive, the
  per-ingredient unit picker stays readable when idle, and the recipe count
  reads "2 / 2 recipes".

### Fixes

- Duplicate copies ingredient groups, the lines written under each
  ingredient, and each step's notes, photos, and audio too.
- Changing a time in the editor no longer turns its hours into minutes: a
  visible "Cook: 1 h" set to 90 minutes becomes "Cook: 1 h 30 min", not
  "90 h".
- Saving in the editor no longer removes lines added to the recipe in
  Logseq while the editor was open; it warns that the recipe changed and
  offers to load the current version.
- Convert no longer rebuilds blocks before you confirm: a paste Logseq split
  along the wrong lines opens its preview with the new block structure, and
  nothing changes until you confirm.
- Converting a block inside an existing recipe opens that recipe instead of
  making a recipe within it.
- Time filters: a 0-minute bound filters and offers **Clear filters**, and a
  range whose inputs were emptied no longer hides recipes without that time.
- Hours and minutes in a step ("1 saat 15 dakika", "1 hour 15 minutes", "1
  Stunde 15 Minuten") are one time with one 1:15:00 timer, not a 1:00:00
  and a 15:00 timer; "1 hour to 1 hour 10 minutes" is a 60–70 minute range.
- Changing a time written as "1 h 30" in the editor writes "1 h 40 min",
  not "100 h 30".
- Archiving or permanently deleting a recipe ends its unfinished cook: its
  timers stop ringing and leave the timer dock. A dock timer whose recipe
  was deleted in Logseq is dropped when you open it.
- "350°F (175°C)" is one temperature, not two: Cooking Mode no longer shows
  "350 °F" and "345 °F" side by side for it.
- English unit choices name their system in brackets like the other
  languages: "tsp (metric)", "cup (US)", not "tsp Metric".
- Sorting by title follows the interface language's alphabet: in Turkish,
  "Irmik" comes before "İçli" and "Sütlaç" before "Şakşuka".
- An empty recipe list mentions Import from Text along with Create and
  Convert.

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
- A Prep, Chill or Cook time such as "1 h 5 min" is read as 65 minutes; a
  value with a part the parser can't read is flagged instead of silently
  shortened.
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
