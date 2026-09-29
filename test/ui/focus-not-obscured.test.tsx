import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftRecipeApp } from "../../src/ui/app";
import { enMessages } from "../../src/ui/i18n";
import type { DraftRecipeUiController } from "../../src/ui/state";

const controller = {
  listRecipes: async () => [],
  listArchivedRecipes: async () => [],
  close: () => undefined,
} as unknown as DraftRecipeUiController;

function at(el: Element, top: number, bottom: number) {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left: 0,
      right: 400,
      width: 400,
      height: bottom - top,
    }) as DOMRect;
}

afterEach(() => {
  for (const el of document.querySelectorAll("[data-test-cover]")) el.remove();
});

describe("keyboard focus under the Save bar or timer dock", () => {
  it("scrolls a covered field into view, and leaves an uncovered one", () => {
    render(
      <DraftRecipeApp
        controller={controller}
        messages={enMessages}
        config={{
          initialView: { kind: "create" },
          globalMeasurementSystem: "metric",
          defaultParserLocale: "en",
          defaultSourceMeasurementSystem: "metric",
        }}
      />,
    );
    const bar = document.createElement("div");
    bar.className = "draft-recipe-sticky-actions";
    bar.dataset.testCover = "";
    at(bar, 640, 700);
    const field = document.createElement("input");
    field.dataset.testCover = "";
    document.body.append(bar, field);
    const scroll = vi.fn();
    field.scrollIntoView = scroll;

    at(field, 650, 680);
    field.focus();
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });

    field.blur();
    scroll.mockClear();
    at(field, 100, 130);
    field.focus();
    expect(scroll).not.toHaveBeenCalled();
  });
});
