import { PantItem } from "../types";

/**
 * Normalizes an article number string for comparison.
 * Trims whitespace, removes leading '#', and converts pure integer strings
 * (e.g., "02" -> "2") so that "2" and "02" match.
 * Non-integer alphanumeric strings are lowercased.
 */
export function normalizeArticleNumber(art?: string): string {
  if (!art) return "";
  let trimmed = art.trim();
  if (trimmed.startsWith("#")) {
    trimmed = trimmed.substring(1).trim();
  }
  if (!trimmed) return "";

  // Check if string is a pure integer digit sequence
  if (/^\d+$/.test(trimmed)) {
    return String(parseInt(trimmed, 10));
  }

  return trimmed.toLowerCase();
}

/**
 * Checks if the current pant's article number is used by any other pant in allPants.
 * Returns an array of pant numbers (e.g., [17]) that share the same article number.
 */
export function getDuplicatePantNumbers(
  currentPant: PantItem,
  allPants: PantItem[]
): number[] {
  const currentNormalized = normalizeArticleNumber(currentPant.artikelnummer);
  if (!currentNormalized) return [];

  const duplicates: number[] = [];

  for (const p of allPants) {
    if (p.id === currentPant.id) continue;
    const otherNormalized = normalizeArticleNumber(p.artikelnummer);
    if (otherNormalized === currentNormalized) {
      duplicates.push(p.number);
    }
  }

  return duplicates.sort((a, b) => a - b);
}

/**
 * Sorts pants by artikelnummer in natural ascending numeric order (1, 2, 3, 4, 10, 11).
 * Pants without numeric artikelnummer or empty artikelnummer are placed at the end.
 */
export function sortPantsByArticleNumber(pants: PantItem[]): PantItem[] {
  return [...pants].sort((a, b) => {
    const normA = normalizeArticleNumber(a.artikelnummer);
    const normB = normalizeArticleNumber(b.artikelnummer);

    const isNumA = /^\d+$/.test(normA);
    const isNumB = /^\d+$/.test(normB);

    if (isNumA && isNumB) {
      return parseInt(normA, 10) - parseInt(normB, 10);
    }
    if (isNumA && !isNumB) return -1;
    if (!isNumA && isNumB) return 1;

    if (normA && normB) {
      return normA.localeCompare(normB, undefined, { numeric: true, sensitivity: "base" });
    }
    if (normA && !normB) return -1;
    if (!normA && normB) return 1;

    return a.number - b.number;
  });
}
