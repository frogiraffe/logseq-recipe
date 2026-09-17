import type {
  DurationAnnotation,
  HeatAnnotation,
  TemperatureAnnotation,
} from "../domain/annotations";
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
