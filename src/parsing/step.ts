import type {
  DurationAnnotation,
  HeatAnnotation,
  TemperatureAnnotation,
} from "../domain/annotations";
import type { StepChild } from "../domain/step-media";
import type { ParseContext } from "./context";
import { parseDurations } from "./duration";
import { parseHeat } from "./heat";
import { parseTemperatures } from "./temperature";

export interface RecipeStepAnnotations {
  durations: DurationAnnotation[];
  temperatures: TemperatureAnnotation[];
  heat: HeatAnnotation[];
}

export function parseStep(
  text: string,
  context: ParseContext,
): RecipeStepAnnotations {
  return {
    durations: parseDurations(text, context),
    temperatures: parseTemperatures(text, context),
    heat: parseHeat(text, context),
  };
}

/** A text note under a step, with the times it names for Cooking Mode. */
export function withNoteDurations(
  child: StepChild,
  context: ParseContext,
): StepChild {
  if (child.kind !== "note") return child;
  const durations = parseDurations(child.text, context);
  return durations.length > 0 ? { ...child, durations } : child;
}
