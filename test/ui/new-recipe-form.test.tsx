import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewRecipeForm } from "../../src/ui/components/NewRecipeForm";
import { enMessages } from "../../src/ui/i18n";

function renderForm(onSubmit = vi.fn()) {
  render(
    <NewRecipeForm
      messages={enMessages}
      locale="en"
      sourceMeasurementSystem="metric"
      onSubmit={onSubmit}
      onCancel={() => undefined}
    />,
  );
  return onSubmit;
}

describe("NewRecipeForm", () => {
  it("says why it can't save next to the field, not in its name", () => {
    renderForm();
    const title = screen.getByLabelText("Title");
    expect(title.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(title, { target: { value: "x" } });
    fireEvent.change(title, { target: { value: " " } });
    const titleError = screen.getByText(enMessages.errorTitleRequired);
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(title.getAttribute("aria-describedby")).toBe(titleError.id);

    const servings = screen.getByLabelText("Servings");
    fireEvent.change(servings, { target: { value: "0" } });
    expect(servings.getAttribute("aria-describedby")).toBe(
      screen.getByText(enMessages.errorBaseYieldInvalid).id,
    );
    fireEvent.change(servings, { target: { value: "6" } });
    expect(screen.queryByText(enMessages.errorBaseYieldInvalid)).toBeNull();
  });

  it("offers Import from Text only when there is somewhere to go", () => {
    renderForm();
    expect(
      screen.queryByRole("button", { name: enMessages.importInstead }),
    ).toBeNull();

    const onImport = vi.fn();
    render(
      <NewRecipeForm
        messages={enMessages}
        locale="en"
        sourceMeasurementSystem="metric"
        onSubmit={() => undefined}
        onCancel={() => undefined}
        onImport={onImport}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.importInstead }),
    );
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("allows clearing servings and typing a replacement without a 0/08 flash", () => {
    renderForm();
    const input = screen.getByLabelText("Servings") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "8" } });
    expect(input.value).toBe("8");
  });

  it("disables Save while servings is empty, zero, or negative", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Cookies" },
    });
    const save = screen.getByRole("button", {
      name: enMessages.save,
    }) as HTMLButtonElement;
    const servings = screen.getByLabelText("Servings") as HTMLInputElement;

    fireEvent.change(servings, { target: { value: "" } });
    expect(save.disabled).toBe(true);

    fireEvent.change(servings, { target: { value: "0" } });
    expect(save.disabled).toBe(true);

    fireEvent.change(servings, { target: { value: "-2" } });
    expect(save.disabled).toBe(true);
  });

  it("submits a valid positive value", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Cookies" },
    });
    fireEvent.change(screen.getByLabelText("Servings"), {
      target: { value: "12" },
    });

    fireEvent.click(screen.getByRole("button", { name: enMessages.save }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Cookies", baseYield: 12 }),
    );
  });
});
