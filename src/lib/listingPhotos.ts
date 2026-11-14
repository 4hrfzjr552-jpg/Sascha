import type { PantImage, PantItem } from "../types";

/** Photos for export to Vinted, never the inventory bag (photo five).
 * AI edits are only included when the seller has explicitly approved them.
 * Always retain a real original in the 4-photo gallery as condition evidence.
 */
export function vintedListingPhotos(pant: Pick<PantItem, "images" | "fitpic" | "fitpicApproved" | "flatlays">): PantImage[] {
  const originals = (pant.images || []).slice(0, pant.images.length === 5 ? 4 : 5);
  const allowed = new Set(originals.map(img => img.id));
  const approved = new Map(
    (pant.flatlays || [])
      .filter(f => f.approved && allowed.has(f.sourceImageId) && Boolean(f.image?.dataUrl))
      .map(f => [f.sourceImageId, f.image])
  );
  const preferred = originals.map(img => approved.get(img.id) || img);
  const fit = pant.fitpicApproved && pant.fitpic ? [pant.fitpic] : [];
  const max = 4;
  const available = max - fit.length;
  if (!approved.size) return [...fit, ...originals].slice(0, max);

  const proofSource = originals.find(img => approved.has(img.id));
  if (!proofSource) return [...fit, ...preferred].slice(0, max);

  const primary = preferred.slice(0, Math.max(0, available - 1));
  // Don't duplicate an already selected unaltered source. Ensure that the
  // original of an edited image is visible to a potential Vinted buyer.
  return [...fit, ...primary, proofSource].slice(0, max);
}
