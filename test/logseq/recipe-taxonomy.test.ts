import { describe, expect, it } from "vitest";
import { decodeRecipeMeta } from "../../src/application/recipe-meta";
import type { RecipeMeta } from "../../src/domain/recipe";
import { PROPERTY_KEYS } from "../../src/logseq/property-keys";
import {
  moveRecipeTaxonomy,
  planRecipeTaxonomy,
  readTaxonomyProperties,
  resolveRecipeTaxonomy,
  syncRecipeTaxonomy,
  writeRecipeMeta,
} from "../../src/logseq/recipe-taxonomy";

const CATEGORIES = PROPERTY_KEYS.recipeCategories;
const TAGS = PROPERTY_KEYS.recipeTags;

interface FakePage {
  id: number;
  title: string;
  deleted?: boolean;
  ident?: string;
}

// Logseq as measured on a real DB graph: a list written to a many-valued
// page property is added to what is there, unless `reset` replaces it;
// page names match without regard to case.
function fakeGraph(pages: FakePage[] = []) {
  const byName = new Map(pages.map((page) => [page.title.toLowerCase(), page]));
  const properties = new Map<string, unknown>();
  const writes: Array<{ id: string; key: string; value: unknown }> = [];
  const created: Array<{ name: string; options: unknown }> = [];
  let nextId = 1000;
  let failOnWrite: number | null = null;
  const pageOf = (id: number) =>
    [...byName.values()].find((page) => page.id === id);

  const host = {
    getPage: async (name: string) => {
      const page = byName.get(name.toLowerCase());
      if (!page) return null;
      return page.deleted
        ? { ...page, ":logseq.property/deleted-at": 1 }
        : { ...page };
    },
    createPage: async (
      name: string,
      _properties?: Record<string, unknown>,
      options?: unknown,
    ) => {
      created.push({ name, options });
      const page = { id: nextId++, title: name };
      byName.set(name.toLowerCase(), page);
      return page;
    },
    restorePage: async (name: string) => {
      const page = byName.get(name.toLowerCase());
      if (page) page.deleted = false;
      return true;
    },
    getBlockProperty: async (id: string, key: string) => {
      const value = properties.get(`${id}:${key}`);
      return Array.isArray(value)
        ? value.map((pageId) => ({ ...pageOf(pageId as number) }))
        : value;
    },
    upsertBlockProperty: async (
      id: string,
      key: string,
      value: unknown,
      options?: { reset?: boolean },
    ) => {
      if (failOnWrite !== null && writes.length === failOnWrite) {
        throw new Error("Logseq went away");
      }
      writes.push({ id, key, value });
      const current = properties.get(`${id}:${key}`);
      properties.set(
        `${id}:${key}`,
        Array.isArray(value) && Array.isArray(current) && !options?.reset
          ? [...current, ...value]
          : value,
      );
    },
    removeBlockProperty: async (id: string, key: string) => {
      writes.push({ id, key, value: undefined });
      properties.delete(`${id}:${key}`);
    },
  };

  const json = (id: string) =>
    decodeRecipeMeta(properties.get(`${id}:${PROPERTY_KEYS.recipeMeta}`));
  // A recipe as Logseq Recipe 1.4 left it: categories and tags in the JSON.
  const legacy = (id: string, value: RecipeMeta) =>
    properties.set(`${id}:${PROPERTY_KEYS.recipeMeta}`, JSON.stringify(value));

  const titles = (id: string, key: string) =>
    ((properties.get(`${id}:${key}`) as number[] | undefined) ?? []).map(
      (pageId) => pageOf(pageId)?.title,
    );

  return {
    host,
    json,
    legacy,
    writes,
    created,
    titles,
    failAfter: (count: number | null) => {
      failOnWrite = count;
    },
  };
}

const meta = (
  categories: string[],
  tags: string[] = [],
  extra: Partial<RecipeMeta> = {},
): RecipeMeta => ({
  categories,
  tags,
  ingredientConversionOverrides: [],
  ...extra,
});

describe("moving categories and tags from the JSON into properties", () => {
  it("plans without writing or creating anything", async () => {
    const graph = fakeGraph([{ id: 1, title: "Tatlı" }]);
    graph.legacy("cake", meta(["Tatlı", "Kek"], ["hızlı"]));
    graph.legacy("soup", meta([]));
    const plan = await planRecipeTaxonomy(graph.host, [
      { id: "cake" },
      { id: "soup" },
    ]);

    expect(plan).toEqual({
      recipeCount: 1,
      propertyNames: [CATEGORIES, TAGS],
      pagesToCreate: ["Kek", "hızlı"],
      pagesToReuse: ["Tatlı"],
      namesKeptInPlugin: [],
    });
    expect(graph.writes).toEqual([]);
    expect(graph.created).toEqual([]);
  });

  it("writes page references, then marks the JSON and keeps the rest of it", async () => {
    const graph = fakeGraph([{ id: 1, title: "Tatlı" }]);
    graph.legacy(
      "cake",
      meta(["tatlı", "Kek"], ["Hızlı"], { parserLocale: "tr" }),
    );

    expect(await moveRecipeTaxonomy(graph.host, [{ id: "cake" }])).toBe(1);
    expect(graph.titles("cake", CATEGORIES)).toEqual(["Tatlı", "Kek"]);
    expect(graph.titles("cake", TAGS)).toEqual(["Hızlı"]);
    expect(graph.created).toEqual([
      { name: "Kek", options: { redirect: false } },
      { name: "Hızlı", options: { redirect: false } },
    ]);
    expect(graph.writes.map((write) => write.key)).toEqual([
      CATEGORIES,
      TAGS,
      PROPERTY_KEYS.recipeMeta,
    ]);
    expect(graph.json("cake")).toEqual(
      meta(["tatlı", "Kek"], ["Hızlı"], {
        parserLocale: "tr",
        taxonomyInProperties: true,
      }),
    );
  });

  it("keeps what the properties already had alongside the JSON's", async () => {
    const graph = fakeGraph();
    await syncRecipeTaxonomy(graph.host, "cake", meta(["Pasta"]));
    graph.legacy("cake", meta(["Tatlı"]));

    await moveRecipeTaxonomy(graph.host, [{ id: "cake" }]);
    expect(graph.titles("cake", CATEGORIES).sort()).toEqual(["Pasta", "Tatlı"]);
    expect(graph.json("cake").categories).toEqual(["Tatlı", "Pasta"]);
  });

  it("changes nothing the second time", async () => {
    const graph = fakeGraph();
    graph.legacy("cake", meta(["Tatlı"], ["Kek"]));
    await moveRecipeTaxonomy(graph.host, [{ id: "cake" }]);
    const writes = graph.writes.length;

    expect(await moveRecipeTaxonomy(graph.host, [{ id: "cake" }])).toBe(0);
    expect(graph.writes).toHaveLength(writes);
    expect(graph.created.map((page) => page.name)).toEqual(["Tatlı", "Kek"]);
    expect(
      (await planRecipeTaxonomy(graph.host, [{ id: "cake" }])).recipeCount,
    ).toBe(0);
  });

  it("leaves recipes with nothing to move alone", async () => {
    const graph = fakeGraph();
    graph.legacy("soup", meta([]));
    graph.legacy("moved", meta(["Tatlı"], [], { taxonomyInProperties: true }));

    expect(
      await moveRecipeTaxonomy(graph.host, [{ id: "soup" }, { id: "moved" }]),
    ).toBe(0);
    expect(graph.writes).toEqual([]);
  });

  it("finishes an interrupted move on the next run, with nothing doubled", async () => {
    const graph = fakeGraph();
    graph.legacy("cake", meta(["Tatlı"], ["Kek"]));
    graph.legacy("pie", meta(["Tatlı"], ["Turta"]));
    const recipes = [{ id: "cake" }, { id: "pie" }];
    // cake: categories, tags, JSON; pie: categories, then Logseq goes away.
    graph.failAfter(4);
    await expect(moveRecipeTaxonomy(graph.host, recipes)).rejects.toThrow(
      "Logseq went away",
    );
    expect(graph.json("pie").taxonomyInProperties).toBeUndefined();
    expect((await planRecipeTaxonomy(graph.host, recipes)).recipeCount).toBe(1);

    graph.failAfter(null);
    expect(await moveRecipeTaxonomy(graph.host, recipes)).toBe(1);
    expect(graph.titles("cake", CATEGORIES)).toEqual(["Tatlı"]);
    expect(graph.titles("pie", CATEGORIES)).toEqual(["Tatlı"]);
    expect(graph.titles("pie", TAGS)).toEqual(["Turta"]);
    expect(graph.created.map((page) => page.name)).toEqual([
      "Tatlı",
      "Kek",
      "Turta",
    ]);
  });
});

describe('names Logseq can\'t make a page of ("Sweet/Savory")', () => {
  it("stay in the JSON, unmarked, while the rest go into the properties", async () => {
    const graph = fakeGraph();
    await writeRecipeMeta(
      graph.host,
      "cake",
      meta(["Tatlı/Tuzlu", "Kek"]),
      true,
    );

    expect(graph.titles("cake", CATEGORIES)).toEqual(["Kek"]);
    expect(graph.created.map((page) => page.name)).toEqual(["Kek"]);
    expect(graph.json("cake")).toEqual(meta(["Tatlı/Tuzlu", "Kek"]));
    expect(
      resolveRecipeTaxonomy(
        graph.json("cake"),
        await readTaxonomyProperties(graph.host, "cake"),
      ).categories,
    ).toEqual(["Tatlı/Tuzlu", "Kek"]);
  });

  it("are shown in the plan, and never keep a recipe pending", async () => {
    const graph = fakeGraph();
    graph.legacy("cake", meta(["Tatlı/Tuzlu", "Kek"]));
    const plan = await planRecipeTaxonomy(graph.host, [{ id: "cake" }]);
    expect(plan).toMatchObject({
      recipeCount: 1,
      pagesToCreate: ["Kek"],
      namesKeptInPlugin: ["Tatlı/Tuzlu"],
    });

    expect(await moveRecipeTaxonomy(graph.host, [{ id: "cake" }])).toBe(1);
    expect(graph.titles("cake", CATEGORIES)).toEqual(["Kek"]);
    expect(
      (await planRecipeTaxonomy(graph.host, [{ id: "cake" }])).recipeCount,
    ).toBe(0);
    expect(await moveRecipeTaxonomy(graph.host, [{ id: "cake" }])).toBe(0);
  });
});

describe("names Logseq already uses for a property or a built-in tag", () => {
  const graph = () =>
    fakeGraph([
      { id: 1, title: "Task", ident: ":logseq.class/Task" },
      { id: 2, title: "Tags", ident: "tags" },
      { id: 3, title: "Status", ident: ":user.property/Status-x1" },
      { id: 4, title: "Kahvaltı", ident: ":user.class/Kahvalti-x2" },
      { id: 5, title: "Tatlı" },
    ]);

  it("stay in the JSON instead of linking the recipe to them", async () => {
    const fake = graph();
    await writeRecipeMeta(
      fake.host,
      "cake",
      meta(["Task", "Tatlı"], ["Tags", "Status", "Kahvaltı"]),
      true,
    );

    expect(fake.titles("cake", CATEGORIES)).toEqual(["Tatlı"]);
    // A tag someone made is a page like any other.
    expect(fake.titles("cake", TAGS)).toEqual(["Kahvaltı"]);
    expect(fake.created).toEqual([]);
    expect(fake.json("cake").taxonomyInProperties).toBeUndefined();
    expect(
      resolveRecipeTaxonomy(
        fake.json("cake"),
        await readTaxonomyProperties(fake.host, "cake"),
      ),
    ).toEqual({
      categories: ["Task", "Tatlı"],
      tags: ["Tags", "Status", "Kahvaltı"],
    });
  });

  it("are listed by the plan as kept in the plugin", async () => {
    const fake = graph();
    fake.legacy("cake", meta(["Task", "Tatlı"]));
    expect(await planRecipeTaxonomy(fake.host, [{ id: "cake" }])).toMatchObject(
      {
        recipeCount: 1,
        pagesToReuse: ["Tatlı"],
        namesKeptInPlugin: ["Task"],
      },
    );
  });
});

describe("syncing the category and tag properties", () => {
  it("replaces a changed list instead of adding to it", async () => {
    const graph = fakeGraph();
    await syncRecipeTaxonomy(graph.host, "cake", meta(["Tatlı", "Kek"]));
    await syncRecipeTaxonomy(graph.host, "cake", meta(["Tatlı"]));

    expect(graph.titles("cake", CATEGORIES)).toEqual(["Tatlı"]);
  });

  it("removes a property whose list became empty, and leaves an empty one alone", async () => {
    const graph = fakeGraph();
    await syncRecipeTaxonomy(graph.host, "cake", meta(["Tatlı"]));
    await syncRecipeTaxonomy(graph.host, "cake", meta([]));

    expect(graph.titles("cake", CATEGORIES)).toEqual([]);
    expect(graph.writes.at(-1)).toEqual({
      id: "cake",
      key: CATEGORIES,
      value: undefined,
    });
    const writes = graph.writes.length;
    expect(await syncRecipeTaxonomy(graph.host, "cake", meta([]))).toBe(false);
    expect(graph.writes).toHaveLength(writes);
  });

  it("names one page once, whatever its spacing or case", async () => {
    const graph = fakeGraph();
    await syncRecipeTaxonomy(graph.host, "cake", meta(["Tatlı", " tatlı "]));

    expect(graph.titles("cake", CATEGORIES)).toEqual(["Tatlı"]);
    expect(graph.created.map((page) => page.name)).toEqual(["Tatlı"]);
  });

  it("brings a category page back from the recycle bin instead of creating another", async () => {
    const graph = fakeGraph([{ id: 7, title: "Tatlı", deleted: true }]);
    graph.legacy("cake", meta(["Tatlı"]));
    const plan = await planRecipeTaxonomy(graph.host, [{ id: "cake" }]);
    expect(plan.pagesToCreate).toEqual(["Tatlı"]);

    await syncRecipeTaxonomy(graph.host, "cake", meta(["Tatlı"]));
    expect(graph.created).toEqual([]);
    expect(graph.titles("cake", CATEGORIES)).toEqual(["Tatlı"]);
  });

  it("writes page ids, never names", async () => {
    const graph = fakeGraph();
    await syncRecipeTaxonomy(graph.host, "cake", meta(["Tatlı"], ["Kek"]));
    for (const write of graph.writes) {
      expect(write.value).toEqual([expect.any(Number)]);
    }
  });
});

describe("saving a recipe's meta", () => {
  it("writes the properties first, then the JSON with its copy and mark", async () => {
    const graph = fakeGraph();
    await writeRecipeMeta(graph.host, "cake", meta(["Tatlı", "tatlı"]), true);

    expect(graph.writes.map((write) => write.key)).toEqual([
      CATEGORIES,
      PROPERTY_KEYS.recipeMeta,
    ]);
    expect(graph.titles("cake", CATEGORIES)).toEqual(["Tatlı"]);
    expect(graph.json("cake")).toEqual(
      meta(["Tatlı"], [], { taxonomyInProperties: true }),
    );
  });

  it("writes only the JSON, unmarked, when the graph has no such properties", async () => {
    const graph = fakeGraph();
    await writeRecipeMeta(
      graph.host,
      "cake",
      meta(["Tatlı"], [], { taxonomyInProperties: true }),
      false,
    );

    expect(graph.writes.map((write) => write.key)).toEqual([
      PROPERTY_KEYS.recipeMeta,
    ]);
    expect(graph.json("cake")).toEqual(meta(["Tatlı"]));
  });

  it("leaves the JSON as it was when the properties can't be written", async () => {
    const graph = fakeGraph();
    graph.legacy("cake", meta(["Kek"]));
    graph.failAfter(0);
    await expect(
      writeRecipeMeta(graph.host, "cake", meta(["Tatlı"]), true),
    ).rejects.toThrow("Logseq went away");
    expect(graph.json("cake")).toEqual(meta(["Kek"]));
  });
});

describe("reading a recipe's categories and tags", () => {
  it("reads page names however Logseq returns them", async () => {
    const read = (value: unknown) =>
      readTaxonomyProperties(
        {
          getBlockProperty: async (_id, key) =>
            key === CATEGORIES ? value : null,
        },
        "cake",
      );
    expect(
      await read([
        { id: 1, title: "Tatlı" },
        { id: 2, title: "Kek" },
      ]),
    ).toEqual({ categories: ["Tatlı", "Kek"], tags: [] });
    expect(await read({ id: 1, title: "Tatlı" })).toEqual({
      categories: ["Tatlı"],
      tags: [],
    });
    expect(await read(null)).toEqual({ categories: [], tags: [] });
  });

  it("takes a marked recipe's lists from its properties alone", () => {
    const json = meta(["Tatlı", "Kek"], ["hızlı"], {
      taxonomyInProperties: true,
    });
    // Kek removed and Pasta added in Logseq; hızlı removed.
    expect(
      resolveRecipeTaxonomy(json, {
        categories: ["Pasta", "Tatlı"],
        tags: [],
      }),
    ).toEqual({ categories: ["Tatlı", "Pasta"], tags: [] });
  });

  it("merges an unmarked recipe's JSON with its properties", () => {
    // Moved by 1.5, then saved by 1.4 with "Kurabiye" added: 1.4 dropped
    // the mark and never touched the properties.
    expect(
      resolveRecipeTaxonomy(meta(["Tatlı", "Kurabiye"]), {
        categories: ["tatlı", "Pasta"],
        tags: ["Kek"],
      }),
    ).toEqual({ categories: ["Tatlı", "Kurabiye", "Pasta"], tags: ["Kek"] });
  });
});
