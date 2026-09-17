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
