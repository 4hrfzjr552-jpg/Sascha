import { PantItem, PantMeasurements } from "../types";

const RELEVANT_MEASUREMENT_FIELDS: (keyof PantMeasurements)[] = [
  "waist",
  "totalLength",
  "inseam",
  "legOpening",
  "thighWidth",
];

/**
  * Returns true if all of the relevant measurement fields
  * (waist, totalLength, inseam, legOpening, thighWidth) are missing or empty/whitespace.
  */
export function isPantMissingMeasurements(pant: PantItem): boolean {
  const m = pant.measurements;
  if (!m) return true;
  return RELEVANT_MEASUREMENT_FIELDS.every(
    (field) => !m[field] || m[field].trim() === ""
  );
}
