import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ServingControl } from "../../src/ui/components/ServingControl";
import { enMessages } from "../../src/ui/i18n";

function Harness({ initial = 2 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <ServingControl
      value={value}
      messages={enMessages}
      yieldUnit="cookies"
      onChange={setValue}
    />
  );
}

describe("ServingControl", () => {
  it("allows clearing the field and typing a replacement without a 0/08 flash", () => {
    render(<Harness initial={2} />);
    const input = screen.getByLabelText("Servings") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "8" } });
    expect(input.value).toBe("8");
  });

  it("does not corrupt the target yield while the field is empty, and restores the last valid value on blur", () => {
    render(<Harness initial={5} />);
    const input = screen.getByLabelText("Servings") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(input.value).toBe("5");
  });

  it("rejects a non-positive typed value without corrupting the yield", () => {
    render(<Harness initial={3} />);
    const input = screen.getByLabelText("Servings") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "-1" } });
    fireEvent.blur(input);

    expect(input.value).toBe("3");
  });

  it("commits a valid typed value live", () => {
    render(<Harness initial={2} />);
    const input = screen.getByLabelText("Servings") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "6" } });

    expect(input.value).toBe("6");
    fireEvent.blur(input);
    expect(input.value).toBe("6");
  });

  it("still supports plus/minus controls", () => {
    render(<Harness initial={2} />);
    const input = screen.getByLabelText("Servings") as HTMLInputElement;

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.moreServings }),
    );
    expect(input.value).toBe("3");

    fireEvent.click(
      screen.getByRole("button", { name: enMessages.fewerServings }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: enMessages.fewerServings }),
    );
    expect(input.value).toBe("1");
  });
});
