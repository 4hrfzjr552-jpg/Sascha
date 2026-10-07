export interface PantImage {
  id: string;
  dataUrl: string;
  name: string;
  size: number;
  storagePath?: string;
}

export interface PantMeasurements {
  waist: string; // Bundweite in cm
  totalLength: string; // Gesamtlänge in cm
  inseam: string; // Innenbeinlänge in cm
  legOpening: string; // Beinöffnung in cm
  thighWidth: string; // Oberschenkelbreite in cm
}

export interface DetectedData {
  brand: string;
  model: string;
  gender: string;
  size: string;
  color: string;
  fit: string;
  material: string;
}

export interface PantPricing {
  listingPrice: number;
  realisticPrice: number;
  quickSalePrice: number;
  minimumPrice: number;
  reasoning: string;
}

export interface PantResult {
  title: string;
  description: string;
  keywords: string[];
  detected: DetectedData;
  pricing?: PantPricing;
}

export type PantStatus = "waiting" | "analyzing" | "done" | "error";
export type SaleStatus = "draft" | "ready" | "uploaded" | "sold" | "archived";

export interface PantItem {
  id: string;
  number: number;
  artikelnummer?: string;
  images: PantImage[];
  measurements: PantMeasurements;
  customNotes: string;
  status: PantStatus;
  saleStatus: SaleStatus;
  uploadedAt?: number;
  purchasePrice?: number;
  purchaseDate?: string;
  salePrice?: number;
  saleDate?: string;
  soldAt?: number;
  errorMessage?: string;
  result?: PantResult;
  isCollapsed?: boolean;
  isDetectedOpen?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type FilterType = "all" | SaleStatus;
export type AnalysisFilterType = "all" | "waiting" | "done" | "error";
export type GenerationFilterType = "all" | "generated" | "not_generated";
export type ArticleNumberFilterType =
  | "all"
  | "missing"
  | "digit_1"
  | "digit_2"
  | "digit_3_plus";

export type MeasurementsFilterType = "all" | "missing";

export type ExpenseCategory =
  | "Einkauf"
  | "Versandmaterial"
  | "Verpackung"
  | "Fahrtkosten"
  | "Gebühren"
  | "Sonstiges";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Einkauf",
  "Versandmaterial",
  "Verpackung",
  "Fahrtkosten",
  "Gebühren",
  "Sonstiges",
];

export interface ExpenseItem {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  notes?: string;
  createdAt: number;
}

export type VintedDraftStatus = "prepared" | "opened" | "saved" | "error";

export interface VintedDraftImageRef {
  id: string;
  name?: string;
}

export interface VintedDraftData {
  id: string;
  pantId: string;
  artikelnummer?: string;
  title: string;
  description: string;
  price?: number;
  brand?: string;
  model?: string;
  size?: string;
  gender?: string;
  color?: string;
  fit?: string;
  material?: string;
  condition?: string;
  category?: string;
  imageIds: string[];
  imageRefs?: VintedDraftImageRef[];
  status: VintedDraftStatus;
  createdAt: number;
  updatedAt: number;
}

export interface VintedDraftPayload {
  id: string;
  pantId: string;
  artikelnummer?: string;
  title: string;
  description: string;
  price?: number;
  brand?: string;
  model?: string;
  size?: string;
  gender?: string;
  color?: string;
  fit?: string;
  material?: string;
  condition?: string;
  category?: string;
  images: { id: string; dataUrl: string; name?: string }[];
}

export interface VintedDraftListItem {
  id: string;
  pantId: string;
  artikelnummer?: string;
  title: string;
  price?: number;
  brand?: string;
  size?: string;
  color?: string;
  condition?: string;
  category?: string;
  imageCount: number;
}
