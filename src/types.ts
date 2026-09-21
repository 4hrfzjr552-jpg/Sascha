export interface PantImage {
  id: string;
  dataUrl: string;
  name: string;
  size: number;
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

export interface PantResult {
  title: string;
  description: string;
  keywords: string[];
  detected: DetectedData;
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
