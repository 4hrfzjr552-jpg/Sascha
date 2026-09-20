/**
 * Utility functions for title formatting and keyword appending
 */

/**
 * Combines a base title with an optional Artikelnummer:
 * - If artikelnummer is present: appends " ARTIKELNUMMER" to the end (WITHOUT hashtag).
 * - Strips any leading '#' if typed into the Artikelnummer field.
 * - Total length is kept <= 100 characters by trimming preceding title terms,
 *   never cutting off the Artikelnummer.
 * - If no artikelnummer is present: leaves the clean title up to 100 chars, no trailing hash or number.
 */
export function formatTitleWithArticleNumber(
  rawTitle: string,
  artikelnummer?: string,
  previousArtikelnummer?: string
): string {
  if (!rawTitle) {
    const art = artikelnummer?.trim().replace(/^#+/, "");
    return art ? art.slice(0, 100) : "";
  }

  let cleanTitle = rawTitle.trim();

  // If there was a previously known artikelnummer, strip it from the end
  if (previousArtikelnummer && previousArtikelnummer.trim()) {
    const prevTrimmed = previousArtikelnummer.trim().replace(/^#+/, "");
    const escaped = prevTrimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleanTitle = cleanTitle.replace(new RegExp(`\\s*(?:#)?${escaped}$`, "i"), "").trim();
  }

  // Also remove any existing trailing "#..." or "# ..." tag so we remove old # tags
  cleanTitle = cleanTitle.replace(/\s*#[\w\-\.\/]+$/i, "").trim();

  const trimmedArtNr = artikelnummer?.trim().replace(/^#+/, "");
  if (!trimmedArtNr) {
    return cleanTitle.slice(0, 100).trim();
  }

  // Strip if already ending with trimmedArtNr to avoid accidental duplication
  const escapedArt = trimmedArtNr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  cleanTitle = cleanTitle.replace(new RegExp(`\\s+${escapedArt}$`, "i"), "").trim();

  const suffix = ` ${trimmedArtNr}`;
  const maxBaseLen = 100 - suffix.length;

  if (maxBaseLen <= 0) {
    // Edge case if article number itself is >= 100 chars
    return trimmedArtNr.slice(0, 100);
  }

  if (cleanTitle.length > maxBaseLen) {
    cleanTitle = cleanTitle.slice(0, maxBaseLen);
    const lastSpace = cleanTitle.lastIndexOf(" ");
    // Cut cleanly at last space if not cutting off too much
    if (lastSpace > 15) {
      cleanTitle = cleanTitle.slice(0, lastSpace);
    }
    cleanTitle = cleanTitle.trim();
  }

  return `${cleanTitle}${suffix}`;
}

/**
 * Appends keywords to description in the format:
 * Keywords:
 * keyword1, keyword2, keyword3, ...
 */
export function appendKeywordsToDescription(
  description: string,
  keywords: string[]
): string {
  if (!description) description = "";
  if (!keywords || keywords.length === 0) return description;

  // If description already has "Keywords:\n", return as is
  if (/Keywords:\s*/i.test(description)) {
    return description;
  }

  const keywordsBlock = `\n\nKeywords:\n${keywords.join(", ")}`;
  return `${description.trim()}${keywordsBlock}`;
}
