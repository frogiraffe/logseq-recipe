import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportRecipeText } from "../../src/ui/components/ImportRecipeText";
import { enMessages } from "../../src/ui/i18n";

function renderImport() {
  const onImport = vi.fn();
  render(
    <ImportRecipeText
      messages={enMessages}
      fallbackLocale="en"
      onImport={onImport}
      onCancel={() => undefined}
    />,
  );
  const type = (text: string) =>
    fireEvent.change(screen.getByLabelText(enMessages.recipeText), {
      target: { value: text },
    });
  const importButton = () =>
    screen.getByRole("button", {
      name: enMessages.importRecipeAction,
    }) as HTMLButtonElement;
  return { onImport, type, importButton };
}

const summary = (label: string) =>
  screen.getByText(label).nextElementSibling?.textContent;

describe("ImportRecipeText", () => {
  it("previews the pasted recipe with its detected language and imports the parsed outline", () => {
    const { onImport, type, importButton } = renderImport();
    expect(importButton().disabled).toBe(true);

    type(
      "- Kurabiye\n  Porsiyon: 8 adet\n- Malzemeler\n    120 g un\n    1 yumurta\n- Yapılış\n    Karıştır.",
    );

    expect(summary(enMessages.title)).toBe("Kurabiye");
    expect(summary(enMessages.parserLanguage)).toBe("TR");
    expect(summary(enMessages.servings)).toBe("8");
    expect(summary(enMessages.ingredients)).toBe("2");
    expect(summary(enMessages.steps)).toBe("1");

    fireEvent.click(importButton());
    expect(onImport.mock.calls[0][0].text).toBe("Kurabiye");
    expect(onImport.mock.calls[0][0].children[1].children).toHaveLength(2);
  });

  it("explains a missing section heading and keeps Import disabled", () => {
    const { type, importButton } = renderImport();
    type("Kurabiye\n120 g un\nKarıştır.");

    expect(screen.getByText(enMessages.importNoSections)).toBeTruthy();
    expect(importButton().disabled).toBe(true);
  });
});
