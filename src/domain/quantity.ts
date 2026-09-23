export type Quantity =
  | { kind: "exact"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "minimum"; value: number }
  | { kind: "maximum"; value: number }
  | { kind: "approximate"; value: number }
  | { kind: "inexact"; expression: string };
