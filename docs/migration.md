# Upgrading to 1.5

## What changes

In 1.5 a recipe's categories and tags live in the Logseq properties
`recipe_categories` and `recipe_tags`, as links to pages. Logseq's own
queries and page references find recipes by them, and an edit made to them
in Logseq is the recipe's new list.

Logseq Recipe 1.4 and earlier kept categories and tags only inside the hidden
`recipe_meta` JSON, where Logseq can't see them. Everything else (the
outline, servings, times, covers, archive state) is stored as before.

## What you need to do

Nothing is required: every recipe opens, shows its categories and tags, and
saves normally straight after the upgrade.

Recipes whose categories or tags are still only in the JSON are listed at
the top of the Recipes screen ("3 recipes have categories or tags that
Logseq's own queries can't find yet"). **Review…** shows exactly what would
be written first:

- how many recipes, and which properties;
- the pages that would be created, and the existing pages that would be
  linked;
- names that stay in the plugin only because Logseq can't use them as a
  page of their own ("Sweet/Savory", or "Task", a built-in Logseq tag).

Nothing is written until you choose **Add**. **Not now** hides the notice
until the plugin is next opened; the same offer stays under **More actions
(⋯)**. Saving a recipe's settings also moves that one recipe.

## What the move does, and doesn't

- It writes each recipe's categories and tags into the two properties,
  creating a page for a name that has none, or bringing a page back from
  Logseq's recycle bin.
- Anything already in those properties is kept alongside the JSON's names.
- It deletes nothing: no page, no block, no JSON. `recipe_meta` keeps a copy
  of the lists (for 1.4.1) and gains a mark saying the properties are now the
  source.
- It includes archived recipes.
- It is safe to repeat and to interrupt. A recipe is marked only after its
  properties are written, so a move cut short (Logseq closed, an error)
  leaves the rest to the next run, and running it again changes nothing
  already done.

## Going back to 1.4.1

Logseq Recipe 1.4.1 still works on recipes 1.5 has saved; nothing is lost
in either direction.

- 1.4.1 reads categories and tags from the JSON copy, which 1.5 updates every
  time it saves them. A change made directly in Logseq after the last save
  from the plugin isn't in that copy, so 1.4.1 doesn't show it.
- 1.4.1 never touches `recipe_categories` or `recipe_tags`.
- When 1.4.1 saves a recipe's settings, it drops the 1.5 mark. Back on 1.5,
  that recipe's categories and tags are then the JSON's and the properties'
  names together, and the notice offers to move it again. A name removed in
  one place but still present in the other therefore comes back; nothing
  added in either place is lost.

## Removing the plugin

Your recipes stay ordinary blocks and pages, with their properties. The
category and tag pages stay too.

## Recipes from before 1.0

A recipe without a `schema_version` is brought up to date the first time
it is opened: its `recipe_meta` is rewritten in the current form, keeping
every field it understands.
