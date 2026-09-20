import { SaleStatus } from "../types";

export const DEFAULT_SALE_STATUS: SaleStatus = "draft";

// Reihenfolge der Verkaufsstatus (auch für Tabs verwendet)
export const SALE_STATUS_ORDER: SaleStatus[] = [
  "draft",
  "ready",
  "uploaded",
  "sold",
  "archived",
];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  draft: "Entwurf",
  ready: "Fertig",
  uploaded: "Hochgeladen",
  sold: "Verkauft",
  archived: "Archiviert",
};

// Badge-Farben pro Verkaufsstatus (Hell- und Dunkelmodus)
export const SALE_STATUS_BADGE: Record<SaleStatus, string> = {
  draft:
    "bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300",
  ready:
    "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300",
  uploaded:
    "bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300",
  sold:
    "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300",
  archived:
    "bg-stone-100 dark:bg-stone-800/60 text-stone-500 dark:text-stone-500",
};

export function getSaleStatusLabel(status: SaleStatus): string {
  return SALE_STATUS_LABELS[status] ?? SALE_STATUS_LABELS[DEFAULT_SALE_STATUS];
}

/** Formatiert einen Zeitstempel für die deutsche Anzeige (Datum + Uhrzeit). */
export function formatSaleDate(ts?: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formatiert einen Preis als Euro-Betrag. */
export function formatPriceEUR(value?: number): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}
