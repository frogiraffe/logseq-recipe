# Sample recipe: Classic Banana Bread

A small, polished example for trying Logseq Recipe end to end.

**How to use this**: the outline is shown below inside a fenced code block
purely so it displays with correct spacing here on GitHub/in an editor - do
**not** copy the ` ```text `/` ``` ` fence lines themselves, and don't paste it
into a Logseq code block. Copy only the recipe lines, from `Classic Banana
Bread` down to the end of the `Notes` section, then paste that into a new
Logseq page. If Logseq doesn't turn the indentation into nested blocks
automatically, use Tab/Shift+Tab on each line to match the indentation shown
below, then run **Logseq Recipe: Convert to Recipe** on the root (`Classic
Banana Bread`) block. Convert reads the parent/child block structure; if the
whole outline lands in a single block, Convert offers to split it into nested
blocks for you before continuing.

It deliberately exercises the parser's main behaviors:

- an exact amount (`120 g butter`), a fraction (`1/2 tsp salt`), and a count
  unit (`2 eggs`);
- a parenthetical preparation note (`(mashed)`, `(melted)`);
- a vague amount the parser will **not** invent a number for
  (`a little ground cinnamon`) — it stays as ingredient text instead;
- a step duration range with a stop condition (`55-60 minutes, or until a
  toothpick comes out clean`);
- a numeric temperature with an explicit preheat step (`175°C`);
- `Yield` / `Prep` / `Cook` root metadata for serving scaling - unlike the
  step-level duration above, these must each be a single exact number
  (`Cook: 60 min`), not a range: that's a deliberate, documented
  restriction, not a parser limitation.

```text
Classic Banana Bread
  Yield: 10 slices
  Prep: 15 min
  Cook: 60 min

  Ingredients
    3 ripe bananas (mashed)
    120 g butter (melted)
    150 g brown sugar
    2 eggs
    1 tsp vanilla extract
    1 tsp baking soda
    1/2 tsp salt
    240 g all-purpose flour
    a little ground cinnamon

  Steps
    Preheat the oven to 175°C.
    In a large bowl, mash the bananas until mostly smooth.
    Stir in the melted butter, then the sugar, eggs, and vanilla.
    Sprinkle the baking soda and salt over the mixture and stir in.
    Fold in the flour just until no dry streaks remain.
    Pour the batter into a greased loaf pan and bake for 55-60 minutes, or until a toothpick comes out clean.
    Cool in the pan for 10 minutes, then turn out onto a rack to cool completely.

  Notes
    Very ripe, heavily speckled bananas give the best flavor.
    Store wrapped at room temperature for up to 3 days, or freeze for up to 3 months.
```

After conversion, try the **−**/**+** serving controls on the Recipe Card —
every ingredient except the qualitative cinnamon line should scale — and open
**Cooking Mode** to see the duration and temperature annotations on the
Preheat and Bake steps.
