# Logseq Recipe Authoring Format

This document is the human- and machine-readable authoring contract for Logseq Recipe.

It describes the **visible Logseq content** that a person, importer, ChatGPT, or another external assistant should produce. It deliberately does **not** document internal plugin-owned property keys as an authoring surface.

## Core rule

Write a recipe as ordinary, readable Logseq blocks. Logseq Recipe attaches and maintains technical metadata itself.

Do not require a visible `#Recipe` tag. Do not manually invent hidden Logseq Recipe properties. Do not encode ingredient amounts in opaque JSON or a custom markup language.

A recipe should remain useful when Logseq Recipe is disabled.

## Recommended visible structure

```text
Chunky Chocolate Chip Cookie
  Porsiyon: 8
  Hazırlık: 15 dk
  Dinlenme: 30 dk
  Pişirme: 11 dk

  Malzemeler
    120 g tereyağı
    130 g esmer şeker
    1 yumurta
    180 g bitter çikolata (iri doğranmış)

  Yapılış
    Tereyağını erit ve ılımaya bırak.
    Şekerleri ekleyip karıştır.
    Yumurtayı ekle.
    180°C'de 10-12 dakika pişir.

  Notlar
    Fırından çıktığında ortası yumuşak kalabilir.
```

Equivalent localized section headings are supported by the parser. The plugin records section roles internally after Create Recipe or Convert to Recipe, so users may later rename visible headings without turning them into technical identifiers.

## Root metadata

Useful visible recipe metadata may include:

- yield / servings;
- preparation time;
- resting or chilling time;
- cooking time;
- source URL;
- ordinary prose description or notes.

External assistants should prefer concise human-readable metadata rather than internal Logseq Recipe fields.

## Ingredient line grammar

Logseq Recipe intentionally accepts normal recipe-style ingredient lines.

Preferred shape:

```text
<quantity> <unit> <ingredient> (optional note)
```

Examples:

```text
120 g tereyağı
1.5 tbsp cocoa
1,5 yemek kaşığı kakao
1/2 cup milk
½ tasse de lait
2-3 tbsp milk
2 eggs
1 tutam tuz
120 g dark chocolate (roughly chopped)
```

### Supported quantity concepts

The deterministic parser is designed around these concepts:

- exact: `10 g`;
- range: `10-12 g`;
- approximate: `about 10 g`, `yaklaşık 10 g`;
- minimum: `at least 10 g`, `en az 10 g`;
- maximum: `up to 10 g`, supported locale equivalents;
- common recipe fractions such as `1/2`, `1 1/2`, `½`, `¼`, `¾`;
- a small set of common recipe quantity words such as `half`, `yarım`, `demi`, `halb`, `media`.

Logseq Recipe is not a general natural-language-number parser. Prefer numeric quantities for uncommon or large written-out numbers.

### Qualitative ingredient amounts

Qualitative text is valid visible recipe content:

```text
aldığı kadar un
biraz süt
tuz, damak zevkine göre
```

When the parser cannot derive a reliable numeric amount, it keeps the original text instead of inventing a value.

External assistants must follow the same rule: if the source recipe does not provide a reliable quantity, preserve the source meaning rather than guessing.

## Ingredient names and notes

Logseq Recipe does not try to semantically decompose every adjective or preparation phrase.

For example:

```text
120 g ince doğranmış bitter çikolata
```

may keep `ince doğranmış bitter çikolata` as the ingredient text.

An explicit trailing parenthetical note is a clearer structure:

```text
120 g bitter çikolata (iri doğranmış)
```

External assistants may prefer that form when the source clearly distinguishes ingredient and preparation note, but must not rewrite meaning merely to satisfy the plugin.

## Measurement systems

Logseq Recipe distinguishes the recipe's **source measurement interpretation** from the user's **display measurement preference**.

Supported display systems:

- Metric — global default;
- US Customary;
- Imperial.

Changing the display system does not rewrite the visible canonical ingredient text.

The same visible source may therefore be displayed differently in Recipe Card without changing the underlying authored recipe.

### Same-family conversion

Mass-to-mass, volume-to-volume, time-to-time, and Celsius/Fahrenheit conversions are deterministic.

Examples:

```text
kg ↔ g
L ↔ ml
US tbsp ↔ US cup
°C ↔ °F
```

### Mass-to-volume conversion

A mass-to-volume conversion such as:

```text
120 g butter → tbsp
```

requires an ingredient-specific conversion rule.

Logseq Recipe ships a small local registry of sourced common-ingredient rules and supports explicit per-recipe user overrides. If no reliable rule exists, the plugin must report that the conversion is unavailable instead of guessing a density.

External assistants should not invent conversion rules unless the user explicitly supplies a reliable relation.

## Step annotations

Cooking steps remain ordinary sentences. Logseq Recipe derives useful annotations from explicit text while preserving the sentence itself.

Examples:

```text
180°C'de 12 dakika pişir.
Bake for 10-12 minutes at 350°F.
5 dakika kavur, ardından 20 dakika pişir.
10 dakika veya kızarana kadar pişir.
Orta ateşte pişir.
Cook over medium-high heat.
```

### Durations

The parser distinguishes:

```text
10 minutes            exact
10-12 minutes         range
about 10 minutes      approximate
at least 10 minutes   minimum
up to 10 minutes      maximum
overnight             inexact symbolic duration
```

`overnight` and equivalent expressions are not silently converted into a fabricated number of hours.

A step may contain multiple independent durations.

### Stop conditions

```text
10 dakika veya kızarana kadar pişir
```

contains a numeric duration and a separate stop condition. `kızarana kadar` is not interpreted as another numeric duration.

### Numeric temperatures

Explicit values are structured:

```text
180°C
350°F
fan 160°C
```

Numeric temperatures can be converted for display without changing source text.

### Qualitative heat

Qualitative instructions remain useful structured non-numeric information:

```text
orta ateş
medium-high heat
feu moyen
mittlere Hitze
fuego medio
çok sıcak tava
```

Logseq Recipe must never fabricate a Celsius/Fahrenheit temperature for these expressions.

## Parser locales

Logseq Recipe v0.1 parser data supports:

- English (`en`);
- Turkish (`tr`);
- French (`fr`);
- German (`de`);
- Spanish (`es`).

Arabic is not part of the v0.1 parser scope.

Parser language and measurement system are independent. A German recipe can use US measurements; an English recipe can use Metric measurements.

The v0.1 plugin UI is planned in English and Turkish independently from parser locale support.

## Categories and tags

Recipe categories and Logseq Recipe tags are free-form organizational metadata. They are not restricted to a built-in vocabulary and are not required to become visible Logseq graph tags/pages.

Examples:

```text
Category: Dessert
Category: Ana Yemek
Tag: High Protein
Tag: Air Fryer
Tag: Quick
```

The UI may suggest values already used in the recipe collection, but suggestions are not restrictions.

External assistants should not invent a large taxonomy. Preserve categories supplied by the user/source, or add a small obvious classification only when the user requests it.

## Create Recipe vs Convert to Recipe

### Create Recipe

`Logseq Recipe: Create Recipe` creates a readable recipe skeleton and attaches internal recipe metadata itself.

### Convert to Recipe

`Logseq Recipe: Convert to Recipe` is designed for structured or semi-structured Logseq content such as:

```text
Cookie Tarifi
  Porsiyon: 8
  Malzemeler
    120 g tereyağı
    1 yumurta
  Yapılış
    Tereyağını erit.
    Yumurtayı ekle.
```

It is **not** a general prose-to-recipe NLP system. A narrative such as:

```text
Geçen gün kurabiye yaptım, biraz tereyağı koydum, sonra...
```

should first be manually structured or transformed by an external assistant into the visible format described here.

## Contract for ChatGPT and other external assistants

When a user asks you to convert a recipe into Logseq Recipe format:

1. Preserve the recipe's factual content. Do not guess missing quantities, temperatures, durations, or ingredient conversions.
2. Produce one readable recipe root/title.
3. Put useful visible metadata near the root when the source provides it.
4. Create an Ingredients section and write each ingredient as one child block.
5. Create a Steps/Method section and write each cooking instruction as one child block.
6. Create Notes only when useful.
7. Prefer explicit numeric quantities and units when the source already provides them.
8. Keep ranges as ranges.
9. Keep qualitative instructions such as `to taste`, `medium heat`, and `overnight` qualitative when the source does not quantify them.
10. Do not add `#Recipe` merely for Logseq Recipe.
11. Do not manually create Logseq Recipe hidden properties, schema versions, section-role properties, cover references, or parser state.
12. Tell the user to paste the readable blocks into Logseq and run `Logseq Recipe: Convert to Recipe` if the content was not created through the plugin.

### Example assistant output

```text
Chocolate Chip Cookies
  Yield: 12 cookies
  Prep: 15 min
  Chill: 30 min
  Cook: 10-12 min

  Ingredients
    120 g butter
    150 g brown sugar
    1 egg
    180 g dark chocolate (roughly chopped)

  Steps
    Melt the butter and let it cool slightly.
    Mix in the sugar.
    Add the egg.
    Fold in the chocolate.
    Chill for 30 minutes.
    Bake at 180°C for 10-12 minutes.

  Notes
    The centers may still look soft when removed from the oven.
```

## What external tools should never depend on

The following are implementation details, not authoring APIs:

- Logseq Recipe plugin property names;
- Logseq DB property idents;
- current schema version numbers;
- asset-reference representation;
- parser token format;
- internal React state;
- internal migration data.

Those may evolve without changing this visible authoring contract.
