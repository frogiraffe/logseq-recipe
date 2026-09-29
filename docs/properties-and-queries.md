# Properties and queries

Logseq Recipe stores a recipe as ordinary blocks plus a few properties. The
properties belong to the plugin (Logseq keeps them under
`:plugin.property.logseq-recipe/…`), so they never clash with properties of
your own or of other plugins, and they stay on your blocks if you remove
the plugin.

## On the recipe

Shown on the recipe block (or page) in Logseq:

| Property | Type | Holds |
| --- | --- | --- |
| `recipe_categories` | pages, many | The recipe's categories ("Dessert") |
| `recipe_tags` | pages, many | The recipe's tags ("Quick") |
| `base_yield` | number | The servings the recipe is written for |
| `yield_unit` | text | What a serving is ("cookies") |
| `prep_minutes`, `chill_minutes`, `cook_minutes` | number | Times, in minutes |
| `source_url` | text | Where the recipe came from |

Hidden, for the plugin's own bookkeeping:

| Property | On | Holds |
| --- | --- | --- |
| `recipe_marker` | recipe | Marks an active recipe |
| `recipe_archived`, `recipe_archived_at` | recipe | Marks an archived recipe, and when |
| `schema_version` | recipe | The layout version of the recipe's data |
| `recipe_meta` | recipe | Recipe language, measurement systems, custom conversions, and a copy of the categories and tags (JSON) |
| `cover_ref` | recipe | The cover image, as `assets/…` |
| `section_role` | section | Which block is Ingredients, Steps or Notes |
| `ingredient_meta` | ingredient | How the line was read, including a correction made in a Convert preview (JSON) |
| `scale_mode` | ingredient | `fixed` for an ingredient that doesn't scale |
| `recipe_library_section` | `Recipe Library` page | Its Recipes and Archived sections |

Why the older names don't start with `recipe_`: they predate 1.5, and
renaming them would break the queries people already wrote, and Logseq
Recipe 1.4 and earlier. New properties use the `recipe_` prefix.

## Categories and tags

Each category or tag is a Logseq page: saving a recipe with the category
"Dessert" links it to your `Dessert` page, creating the page if there isn't
one. So the recipe shows up in that page's linked references, and Logseq's
own queries find it.

You can change them in Recipe settings or directly in Logseq; both edit
the same properties. The plugin never deletes a page: removing a category
only removes the link.

Two details of how Logseq names pages:

- Page names ignore case: "dessert" and "Dessert" are the same category.
- Some names can't be a category page of their own: one with a `/`
  ("Sweet/Savory"), which Logseq reads as a namespace path, and one Logseq
  already uses for a property or one of its built-in tags ("Task", "Tags").
  Such a name stays in the plugin (it is kept in `recipe_meta`), is still
  shown and searchable in the plugin, but Logseq's queries don't see it.
  Tags you made yourself in Logseq are pages like any other and link
  normally.

## Queries

These run in any Logseq block; each was checked against a real Logseq DB
graph.

```text
{{query (property recipe_categories [[Dessert]])}}
{{query (and (property recipe_categories [[Dessert]]) (property recipe_tags [[Quick]]))}}
{{query (property recipe_tags)}}
{{query (property recipe_marker true)}}
{{query (property cook_minutes)}}
```

- `(property recipe_marker true)` lists every active recipe; archived ones
  don't carry the marker. Shown as a table, it makes a sortable overview of
  your recipes, with their properties as columns.
- A category or tag page (`[[Dessert]]`) lists its recipes under linked
  references with no query at all.
- Archived recipes keep their categories and tags, so a query on those also
  finds them. Add `(property recipe_marker true)` to leave them out:
  `{{query (and (property recipe_marker true) (property recipe_categories [[Dessert]]))}}`

A recipe's categories and tags are in these properties once the plugin has
written them. Recipes saved by Logseq Recipe 1.4 and earlier keep them only
in `recipe_meta` until you move them; see [Upgrading to 1.5](migration.md).
