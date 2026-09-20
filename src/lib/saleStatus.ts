import type { PantItem, SaleStatus } from "../types";

export const DEFAULT_SALE_STATUS: SaleStatus = "draft";

export const SALE_STATUS_OPTIONS: Array<{
  id: SaleStatus;
  label: string;
}> = [
  { id: "draft", label: "Entwurf" },
  { id: "ready", label: "Fertig" },
  { id: "uploaded", label: "Hochgeladen" },
  { id: "sold", label: "Verkauft" },
  { id: "archived", label: "Archiviert" },
];

const SALE_STATUS_IDS = new Set<SaleStatus>(
  SALE_STATUS_OPTIONS.map((option) => option.id)
);

export function isSaleStatus(value: unknown): value is SaleStatus {
  return typeof value === "string" && SALE_STATUS_IDS.has(value as SaleStatus);
}

export function getSaleStatusLabel(status: SaleStatus): string {
  return SALE_STATUS_OPTIONS.find((option) => option.id === status)?.label ?? "Entwurf";
}

/**
 * Legacy pants never had a sale status. Generated listings are ready to sell;
 * all other existing records remain drafts without changing their AI status.
 */
export function getDefaultSaleStatus(pant: Pick<PantItem, "status" | "result">): SaleStatus {
  return pant.result || pant.status === "done" ? "ready" : DEFAULT_SALE_STATUS;
}

export function normalizePantSaleStatus(pant: PantItem): PantItem {
  if (isSaleStatus(pant.saleStatus)) {
    return pant;
  }

  return {
    ...pant,
    saleStatus: getDefaultSaleStatus(pant),
  };
}
