import type { Quantity } from "./quantity";
import type { TemperatureUnit, TimeUnit } from "./unit";

export interface SourceSpan {
  rawText: string;
  startOffset: number;
  endOffset: number;
}

export interface DurationAnnotation extends SourceSpan {
  kind: "duration";
  value: Quantity;
  unit?: TimeUnit;
  qualifier?: "per-side" | "interval";
  relation?: "and" | "or" | "then";
  conditionText?: string;
}

export interface TemperatureAnnotation extends SourceSpan {
  kind: "temperature";
  value: number;
  unit: TemperatureUnit;
  ovenMode?: "fan" | "conventional";
  preheat?: boolean;
}

export type HeatLevel =
  | "low"
  | "medium_low"
  | "medium"
  | "medium_high"
  | "high";

export type CookingSurface = "pan" | "oven" | "grill" | "other";
export type SurfaceState = "hot" | "very_hot";

export interface HeatAnnotation extends SourceSpan {
  kind: "heat";
  level?: HeatLevel;
  surface?: CookingSurface;
  surfaceState?: SurfaceState;
}
