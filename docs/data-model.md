# Data model

How a recipe is stored in a Logseq DB graph, which copy of each field is
the truth, and why it is laid out this way.

## A recipe

```text
Recipe Library                        (page)
  Recipes                             recipe_library_section: recipes
    Lemon Drizzle Cake                recipe_marker, schema_version, recipe_meta,
                                      base_yield, prep_minutes, cook_minutes,
                                      recipe_categories, recipe_tags, cover_ref …
      Serves 8                        (optional visible detail lines)
      Ingredients                     section_role: ingredients
        For the sponge:               (a group: ingredients nested under it)
          225 g butter, softened      ingredient_meta, scale_mode
      Steps                           section_role: steps
        Heat the oven to 180°C.
          Line the tin first.         (a step note, or an image/audio asset)
      Notes                           section_role: notes
        Keeps for 3 days in a tin.
  Archived                            recipe_library_section: archived
```

A recipe's root is a block (Create, Import, and Convert on a block) or a
page (Convert on a page, and recipes from early versions). Recipes
converted elsewhere, such as in a journal, stay where they are. Every
property is listed in [Properties and queries](properties-and-queries.md).

## Which copy is the truth

Each field has exactly one authority. Where a second copy exists, it is
derived from the authority and never read over it.

| Field | Authority | Other copies |
| --- | --- | --- |
| Title | The root block's text, or the page's title | — |
| Ingredients, groups, steps, step notes and media, notes | The blocks under the section blocks | `ingredient_meta` caches how a line was read |
| Servings, yield unit, times, source | A visible detail line ("Serves 8"), if the recipe has one; otherwise the property (`base_yield`, …) | The property is updated to match the line when the recipe is opened |
| Categories, tags | `recipe_categories`, `recipe_tags` | A copy in `recipe_meta`, for 1.4.1 |
| Recipe language, measurement systems, custom conversions | `recipe_meta` | — |
| Cover | `cover_ref` | — |
| Active, archived | `recipe_marker`, `recipe_archived` | — |

Details worth knowing:

- **`ingredient_meta`** stores the parse of an ingredient line together with
  the exact text and parse settings it came from. It is used only while
  both still match; otherwise the line is read again. This is also where a
  correction made in the Convert preview lives, so it survives as long as
  the line is unchanged.
- **Categories and tags** are read from the properties only when
  `recipe_meta` carries `"taxonomyInProperties": true`. The plugin sets that
  mark when it has written every name into the properties. Without it (a
  recipe from 1.4 or earlier, one that 1.4.1 saved since, or one with a name
  that can't be a page of its own: containing a "/", or already used by
  Logseq for a property or a built-in tag) the JSON's names and the
  properties' names are merged, so nothing written by either version, or
  directly in Logseq, is lost.
- Categories and tags are written as page ids, never as names: a name
  written to a page property becomes a loose value block instead of the
  page of that name.

## Schema version

`schema_version` on the recipe is the version of this layout that an older
plugin must understand to use it safely. A plugin refuses to open a recipe
with a newer version than its own (Logseq Recipe 1.4.1 knows version 1),
instead of misreading or overwriting it.

1.5 keeps version **1**: everything Logseq Recipe 1.4.1 reads is still
written the way it reads it. Rules for later changes:

- **Raise `schema_version` only when an older plugin would misread or damage
  the data.** Everything else is an additive change that older versions
  simply don't see.
- **An older plugin drops JSON fields it doesn't know** when it saves
  `recipe_meta`. A new field must treat its absence as "an older version
  wrote this", the way `taxonomyInProperties` does.
- **A migration step must be safe to repeat.** The runner
  (`src/migrations/runner.ts`) writes the new version only after a step
  completes, so an interrupted step runs again from the start on the next
  load.
- **Nothing is deleted to migrate.** Old copies stay until nothing that can
  still run needs them. Logseq's orphaned value entities are left alone.
- **Bulk changes are previewed**, and each recipe is marked done only after
  its own writes, so a run can stop anywhere and resume.

## Why not a Recipe class

Logseq DB graphs have classes (tags): recipes could be tagged `#Recipe`,
with the recipe fields as the class's properties. Three designs were
compared: A, JSON with properties mirrored from it (the 1.4 direction); B, a
`Recipe` class; C, a hybrid: native properties as the authority for what
people query and edit, JSON for plugin-only settings, blocks for the
content. The deciding evidence came from a real Logseq 2.0 alpha
(2026-09 nightly), driven through the plugin SDK:

| Question | Evidence | Weighs against |
| --- | --- | --- |
| Can a plugin class be evolved later? | `addTagProperty` on a plugin-created tag fails ("Not a valid tag"); class properties can only be given at `createTag` time | B |
| Does a plugin `Recipe` class collide with a user's `#Recipe`? | Both exist side by side with the same title; `getTagObjects("Recipe")` fails ("Not a tag") | B |
| Does tagging change the user's blocks? | Every recipe block gains a visible tag, and Logseq's class views take them over | B |
| Can a mirror respect edits made in Logseq? | Only by reading the property back, which makes it the authority | A |
| Do plugin page properties work with plain queries? | `(property recipe_categories [[Dessert]])`, `(property recipe_marker true)` and `[[Dessert]]` all find recipes | — |
| How do many-valued properties behave? | A list is added to the current values unless written with `reset`; names become loose value blocks, page ids become links | — |

**Chosen: C.** Categories and tags became native, authoritative page
properties, which is what makes recipes queryable and editable in Logseq.
Discovery stays on `recipe_marker`, which already works in queries. The
ingredients and steps stay blocks: they are the part people read and edit
in Logseq, and blocks carry notes, media and references naturally. A
`Recipe` class remains possible later without undoing any of this.
