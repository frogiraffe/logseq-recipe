export type Quantity =
  | { kind: "exact"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "minimum"; value: number }
  | { kind: "maximum"; value: number }
  | { kind: "approximate"; value: number }
  | { kind: "inexact"; expression: string };

/** `value` as read after a modifier word ("about", "at least", "up to"). */
export function modifiedQuantity(
  modifier: string | undefined,
  value: number,
): Quantity {
  return modifier === "approximate" ||
    modifier === "minimum" ||
    modifier === "maximum"
    ? { kind: modifier, value }
    : { kind: "exact", value };
}

/** The same quantity with each of its numbers passed through `map`. */
export function mapQuantity(
  quantity: Quantity,
  map: (value: number) => number,
): Quantity {
  switch (quantity.kind) {
    case "range":
      return { kind: "range", min: map(quantity.min), max: map(quantity.max) };
    case "inexact":
      return quantity;
    default:
      return { ...quantity, value: map(quantity.value) };
  }
}
