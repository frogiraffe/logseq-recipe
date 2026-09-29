# Getting started

## Requirements

Logseq Recipe works with **Logseq DB graphs** only. When it starts, it
checks the Logseq APIs it needs; on a file graph, or a Logseq build without
those APIs, it shows a warning and writes nothing.

## Install

- **Marketplace:** Plugins → Marketplace → search **Logseq Recipe** →
  Install.
- **By hand:** download the ZIP from the
  [latest release](https://github.com/frogiraffe/logseq-recipe/releases/latest),
  extract it, then Plugins → **Load unpacked plugin** and pick the extracted
  folder (the one containing `package.json`).

## Your first recipe

There are three ways in. All of them are in the command palette, and the
Recipes screen has **Create Recipe** with a ▾ for the others.

### Create a blank recipe

**Logseq Recipe: Create Recipe** asks for a title and servings, adds the
recipe to the `Recipe Library` page, and opens the editor so you can add
ingredients and steps.

### Import from text

**Logseq Recipe: Import Recipe from Text** takes a whole recipe pasted as
text. The first line is the title; headings such as "Ingredients", "Steps"
and "Notes" split it into sections; lines before the first heading
("Servings: 4", "Prep: 15 min") become the recipe's details. **Preview**
shows exactly how it was read, and nothing is written until you confirm.

### Convert an outline you already have

Select a block (or open a page) holding a recipe and run **Logseq Recipe:
Convert to Recipe**, or use the block's context menu. Convert previews every
change, shows how each ingredient was read, and asks you to settle anything
ambiguous before it writes. A recipe converted where it was written (a
journal, a project page) stays there; **More actions → Move to Recipe
Library** moves it later if you want.

If Logseq split a pasted recipe along the wrong lines, the preview offers to
rebuild the blocks as sections first and shows the new structure. Only the
text carries over in that case: links to the old blocks, and properties set
on them, are not kept, and the preview says so.

## The recipe outline

```text
Chocolate Chip Cookies
  Yield: 12 cookies
  Prep: 15 min
  Cook: 12 min
  Source: https://example.com/cookies
  Ingredients
    For the dough:
      120 g butter
      150 g brown sugar
      1 egg
    180 g dark chocolate (roughly chopped)
    salt to taste
  Steps
    Melt the butter and let it cool slightly.
      Stop before it browns.
      ![melted butter](../assets/melted-butter.jpg)
    Mix in the sugar and egg.
    Bake at 180°C for 10-12 minutes.
  Notes
    The centers still look soft when they come out.
```

- **Details** (`Yield`, `Prep`, `Chill`, `Cook`, `Source`) sit directly under
  the title. Each time is a single number; a range such as "10-12 minutes"
  belongs in a step, where Cooking Mode offers a timer for either end.
  "Serves 4", "Makes 12 cookies" and "4 kişilik" are read as the yield too.
- **Ingredients** are one per line. A line with ingredients nested under it
  ("For the dough:") is a group heading. Lines nested under an ingredient
  ("at room temperature") are shown with it.
- **Steps** are one per line. Blocks nested under a step are its notes; a
  block that is just an image or audio file from the graph's `assets`
  folder is shown as a photo or player.
- **Notes** are free text.

Headings and labels are recognized in any of the five supported languages,
with or without accents ("Malzemeler", "Yapilis", "Zutaten", "Porsiyon:").

[`examples/banana-bread.md`](../examples/banana-bread.md) is a complete
outline to paste into Logseq and convert.

## Next

- [Using Logseq Recipe](usage.md)
- [Properties and queries](properties-and-queries.md)
- Upgrading from 1.4 or earlier? Read [Upgrading to 1.5](migration.md).
