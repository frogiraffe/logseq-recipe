# Parser guarantees

Logseq Recipe reads recipe text with deterministic rules, not a language
model. The same text always reads the same way, on any machine, offline.

## What it never does

- **It never rewrites your text.** Scaling and unit conversion change what
  is shown; the ingredient and step lines stay as you wrote them.
- **It never invents a number.** No quantity, density, duration or
  temperature is guessed. "Salt to taste" and "a little olive oil" are kept
  as written and don't scale; "a pinch" is not turned into grams.
- **Anything it can't read with certainty stays plain text.** An unreadable
  line is shown exactly as written. It is never dropped.
- **It asks instead of choosing** when a line could mean two things. In the
  Convert and Import preview, a line with two amounts ("1 cup plus 2 tbsp
  flour"), a number that could be a thousands separator ("1.250 kg"), or a
  section it can't place is marked for you to settle before anything is
  written.

## Ingredients

An ingredient line is read as amount, unit, ingredient and note:

- Amounts: whole numbers, decimals with either separator the language uses
  (`0,3`), fractions (`1/2`, `½`, `1 1/2`), ranges (`2-3`), and "about",
  "at least" and "up to" in each language.
- Units: metric, US and imperial measures, and each language's kitchen
  units ("çay kaşığı", "EL", "c. à soupe"). A cup, spoon or pint is read in
  the recipe's source measurement system (US, metric or imperial), which
  you can change in the preview or in Recipe settings.
- The unit may follow the ingredient ("flour 200 g"), but only when it is a
  recognized unit, so a number inside an ingredient's name is never taken
  for an amount.
- A parenthetical after the amount ("(1 stick) butter") or at the end
  ("(sifted)") becomes the note.
- The Convert preview shows how every ingredient was read.

Mass and volume convert into each other only for ingredients with a
built-in density, or a custom conversion you add; otherwise the amount stays
in its own kind of unit.

## Steps

In a step, and in its notes, the parser marks:

- **Times**, for Cooking Mode's timer buttons: "12 minutes", ranges
  ("10-12 minutes" offers both ends), and approximate times ("about 20
  minutes" offers `~20:00`). A time inside an instruction not to do
  something ("don't bake past 15 minutes") offers no timer.
- **Temperatures** with their scale, oven mode and preheating ("preheat to
  180°C fan").
- **Heat levels** ("medium heat").

## Languages

English, Turkish, French, German and Spanish. A recipe has a language
(detected by Convert and Import from its headings and labels, or chosen in
Recipe settings). Each line is read in that language first, then in
whichever supported language understands it, so a Turkish step still reads
correctly inside an English recipe.

Section headings and labels ("Ingredients", "Malzemeler", "Zutaten",
"Yield:", "Porsiyon:") are recognized in all five languages, with or
without accents.

## Out of scope

Web page import, free-form language understanding, nutrition, and
languages other than the five above.
