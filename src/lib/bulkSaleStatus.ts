import type { PantItem, SaleStatus } from "../types";

export type BulkStatusScope = "visible" | "selected";

/** Pure preview+planning step. "Verkauft" is intentionally excluded from
 * mass edits: sale prices and dates must be handled in the sale dialog.
 * Sold records are also never silently changed to a different status.
 */
export function planBulkSaleStatusChange(
  pants: PantItem[],
  visibleIds: ReadonlySet<string>,
  selectedIds: ReadonlySet<string>,
  scope: BulkStatusScope,
  target: SaleStatus,
  at: number = Date.now(),
): { updates: PantItem[]; unchanged: number; skippedSold: number; inScope: number } {
  if (!["draft", "ready", "uploaded", "archived"].includes(target))
    throw new Error("Verkäufe können nicht gesammelt geändert werden. Bitte einzelne Verkäufe mit Preis und Datum erfassen.");
  const ids = scope === "visible" ? visibleIds : selectedIds;
  let unchanged = 0;
  let skippedSold = 0;
  let inScope = 0;
  const updates: PantItem[] = [];
  for (const pant of pants) {
    if (!ids.has(pant.id)) continue;
    inScope++;
    const previous = pant.saleStatus || "draft";
    if (previous === "sold") {
      skippedSold++;
      continue;
    }
    if (previous === target) {
      unchanged++;
      continue;
    }
    updates.push({
      ...pant,
      saleStatus: target,
      // Retain historic upload timestamp even if moved back to draft.
      uploadedAt: target === "uploaded" && !pant.uploadedAt ? at : pant.uploadedAt,
      updatedAt: at,
    });
  }
  return { updates, unchanged, skippedSold, inScope };
}
