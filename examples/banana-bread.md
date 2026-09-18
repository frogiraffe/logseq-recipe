# Sample recipe: Classic Banana Bread

A small, polished example for trying Logseq Recipe end to end — paste the
outline below into a Logseq page (as sibling/child blocks, matching the
indentation) and run **Logseq Recipe: Convert to Recipe** on the root block.

It deliberately exercises the parser's main behaviors:

- an exact amount (`120 g butter`), a fraction (`1/2 tsp salt`), and a count
  unit (`2 eggs`);
- a parenthetical preparation note (`(mashed)`, `(melted)`);
- a qualitative amount the parser will **not** invent a number for
  (`a pinch of ground cinnamon`) — it stays as ingredient text instead;
- a step duration range with a stop condition (`55-60 minutes, or until a
  toothpick comes out clean`);
- a numeric temperature with an explicit preheat step (`175°C`);
- `Yield` / `Prep` / `Cook` root metadata for serving scaling.

```text
Classic Banana Bread
  Yield: 10 slices
  Prep: 15 min
  Cook: 55-60 min

  Ingredients
    3 ripe bananas (mashed)
    120 g butter (melted)
    150 g brown sugar
    2 eggs
    1 tsp vanilla extract
    1 tsp baking soda
    1/2 tsp salt
    240 g all-purpose flour
    a pinch of ground cinnamon

  Steps
    Preheat the oven to 175°C.
    In a large bowl, mash the bananas until mostly smooth.
    Stir in the melted butter, then the sugar, egg, and vanilla.
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
