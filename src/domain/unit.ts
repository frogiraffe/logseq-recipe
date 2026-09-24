export type MeasurementSystem = "metric" | "us" | "imperial";

export type CanonicalUnit =
  | "mg"
  | "g"
  | "kg"
  | "oz_mass"
  | "lb"
  | "ml"
  | "cl"
  | "dl"
  | "l"
  | "tsp_metric"
  | "tbsp_metric"
  | "cup_metric"
  | "tsp_us"
  | "tbsp_us"
  | "cup_us"
  | "fl_oz_us"
  | "tsp_imperial"
  | "tbsp_imperial"
  | "cup_imperial"
  | "fl_oz_imperial"
  | "su_bardagi"
  | "cay_bardagi"
  | "tatli_kasigi"
  | "piece"
  | "egg"
  | "clove"
  | "slice"
  | "pinch"
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "celsius"
  | "fahrenheit";

export type TimeUnit = Extract<
  CanonicalUnit,
  "second" | "minute" | "hour" | "day"
>;
export type TemperatureUnit = Extract<CanonicalUnit, "celsius" | "fahrenheit">;
