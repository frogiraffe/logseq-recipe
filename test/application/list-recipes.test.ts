import { describe, expect, it } from "vitest";
import {
  collectFacetSuggestions,
  filterRecipeSummaries,
  sortRecipeSummaries,
} from "../../src/application/list-recipes";
import type { RecipeSummary } from "../../src/application/types";

const recipes: RecipeSummary[] = [
  {
    id: "eggplant-pasta",
    title: "Patlıcanlı Makarna",
    categories: ["Tuzlu", "Ana Yemek"],
    tags: ["Quick"],
    prepMinutes: 20,
    cookMinutes: 25,
    ingredientTexts: ["patlıcan", "makarna", "domates"],
  },
  {
    id: "cookie",
    title: "Chunky Chocolate Chip Cookie",
    categories: ["Tatlı"],
    tags: ["Chocolate", "Quick"],
    prepMinutes: 15,
    chillMinutes: 30,
    cookMinutes: 11,
    ingredientTexts: ["tereyağı", "esmer şeker", "çikolata"],
  },
  {
    id: "eggplant-bake",
    title: "Fırında Patlıcan",
    categories: ["Tuzlu"],
    tags: ["Vegetarian"],
    prepMinutes: 15,
    cookMinutes: 40,
    ingredientTexts: ["patlıcan", "zeytinyağı"],
  },
];

describe("filterRecipeSummaries", () => {
  it("filters title queries case-insensitively", () => {
    expect(
      filterRecipeSummaries(recipes, { query: "cookie" }).map((r) => r.id),
    ).toEqual(["cookie"]);
  });

  it("filters by free-form categories and tags without a fixed vocabulary", () => {
    expect(
      filterRecipeSummaries(recipes, {
        categories: ["tuzlu"],
        tags: ["quick"],
      }).map((r) => r.id),
    ).toEqual(["eggplant-pasta"]);
  });

  it("matches ingredient text instead of arbitrary notes", () => {
    expect(
      filterRecipeSummaries(recipes, { ingredient: "PATLICAN" }).map(
        (r) => r.id,
      ),
    ).toEqual(["eggplant-pasta", "eggplant-bake"]);
  });

  it("supports inclusive prep, cook and total-time ranges", () => {
    expect(
      filterRecipeSummaries(recipes, { prepMinutes: { max: 15 } }).map(
        (r) => r.id,
      ),
    ).toEqual(["cookie", "eggplant-bake"]);

    expect(
      filterRecipeSummaries(recipes, { cookMinutes: { min: 30 } }).map(
        (r) => r.id,
      ),
    ).toEqual(["eggplant-bake"]);

    expect(
      filterRecipeSummaries(recipes, {
        totalMinutes: { min: 50, max: 60 },
      }).map((r) => r.id),
    ).toEqual(["cookie", "eggplant-bake"]);
  });
});

describe("sortRecipeSummaries", () => {
  it("sorts by title A-Z by default", () => {
    expect(sortRecipeSummaries(recipes, "title").map((r) => r.id)).toEqual([
      "cookie",
      "eggplant-bake",
      "eggplant-pasta",
    ]);
  });

  it("sorts by total time, shortest first, with unknown totals last", () => {
    const withUnknownTotal: typeof recipes = [
      ...recipes,
      {
        id: "mystery",
        title: "Mystery Dish",
        categories: [],
        tags: [],
        ingredientTexts: [],
      },
    ];
    expect(
      sortRecipeSummaries(withUnknownTotal, "totalTime").map((r) => r.id),
    ).toEqual(["eggplant-pasta", "eggplant-bake", "cookie", "mystery"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...recipes];
    sortRecipeSummaries(recipes, "title");
    expect(recipes).toEqual(copy);
  });
});

describe("collectFacetSuggestions", () => {
  it("returns existing free-form values with counts", () => {
    expect(collectFacetSuggestions(recipes, "categories")).toEqual([
      { value: "Tuzlu", count: 2 },
      { value: "Ana Yemek", count: 1 },
      { value: "Tatlı", count: 1 },
    ]);
    expect(collectFacetSuggestions(recipes, "tags")).toEqual([
      { value: "Quick", count: 2 },
      { value: "Chocolate", count: 1 },
      { value: "Vegetarian", count: 1 },
    ]);
  });
});
