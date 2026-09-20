import { PantItem } from "../types";
import { normalizePantSaleStatus } from "./saleStatus";

/**
 * Cleanly escapes a string cell for CSV according to RFC 4180
 */
function escapeCsvCell(val: string | number | undefined | null): string {
  if (val === undefined || val === null) {
    return '""';
  }
  const str = String(val);
  // If it contains double quotes, commas, or line breaks, enclose in quotes and double up inner quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Exports all pants as CSV with the requested column sequence:
 * Nummer;Artikelnummer;Titel;Beschreibung;Marke;Modell;Größe;Farbe;Bundweite;Länge
 */
export function exportPantsAsCsv(pants: PantItem[]): void {
  const headers = [
    "Nummer",
    "Artikelnummer",
    "Titel",
    "Beschreibung",
    "Marke",
    "Modell",
    "Größe",
    "Farbe",
    "Bundweite",
    "Länge",
  ];

  const rows = pants.map((pant) => {
    const result = pant.result;
    const detected = result?.detected;

    return [
      escapeCsvCell(pant.number),
      escapeCsvCell(pant.artikelnummer || ""),
      escapeCsvCell(result?.title || ""),
      escapeCsvCell(result?.description || ""),
      escapeCsvCell(detected?.brand || ""),
      escapeCsvCell(detected?.model || ""),
      escapeCsvCell(detected?.size || ""),
      escapeCsvCell(detected?.color || ""),
      escapeCsvCell(pant.measurements?.waist ? `${pant.measurements.waist} cm` : ""),
      escapeCsvCell(pant.measurements?.totalLength ? `${pant.measurements.totalLength} cm` : ""),
    ].join(";"); // Semicolon is the standard European/German CSV delimiter for Excel
  });

  // UTF-8 BOM so Excel on German / Mac displays Umlauts properly
  const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `vinted_hosen_export_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports all text and metadata of pants as JSON
 */
export function exportPantsAsJson(pants: PantItem[]): void {
  const exportData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    totalPants: pants.length,
    pants: pants.map((p) => ({
      id: p.id,
      number: p.number,
      artikelnummer: p.artikelnummer || "",
      measurements: p.measurements,
      customNotes: p.customNotes,
      status: p.status,
      saleStatus: p.saleStatus,
      uploadedAt: p.uploadedAt,
      salePrice: p.salePrice,
      saleDate: p.saleDate,
      soldAt: p.soldAt,
      result: p.result,
      imageCount: p.images.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `vinted_ai_projekt_${timestamp}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validates and parses imported JSON project data
 */
export function parseImportedJson(jsonString: string): PantItem[] {
  const parsed = JSON.parse(jsonString);
  const rawList = Array.isArray(parsed) ? parsed : parsed.pants;

  if (!Array.isArray(rawList)) {
    throw new Error("Ungültiges Dateiformat: Keine Hosen-Liste gefunden.");
  }

  return rawList.map((item: any, index: number): PantItem => {
    const importedPant: PantItem = {
      id: item.id || `pant_${Date.now()}_${index}`,
      number: typeof item.number === "number" ? item.number : index + 1,
      artikelnummer: item.artikelnummer || "",
      images: Array.isArray(item.images) ? item.images : [],
      measurements: {
        waist: item.measurements?.waist || "",
        totalLength: item.measurements?.totalLength || "",
        inseam: item.measurements?.inseam || "",
        legOpening: item.measurements?.legOpening || "",
        thighWidth: item.measurements?.thighWidth || "",
      },
      customNotes: item.customNotes || "",
      status: item.status || (item.result ? "done" : "waiting"),
      saleStatus: item.saleStatus,
      uploadedAt: typeof item.uploadedAt === "number" ? item.uploadedAt : undefined,
      salePrice: typeof item.salePrice === "number" ? item.salePrice : undefined,
      saleDate: typeof item.saleDate === "string" ? item.saleDate : undefined,
      soldAt: typeof item.soldAt === "number" ? item.soldAt : undefined,
      errorMessage: item.errorMessage || undefined,
      result: item.result || undefined,
      isCollapsed: item.status === "done",
      isDetectedOpen: false,
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || Date.now(),
    };
    return normalizePantSaleStatus(importedPant);
  });
}
