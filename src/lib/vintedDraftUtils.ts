import { PantItem, VintedDraftData, VintedDraftPayload } from "../types";
import { getSetting, setSetting } from "./indexedDb";

const VINTED_DRAFTS_STORAGE_KEY = "vinted_drafts";

/**
 * Checks whether a PantItem is eligible for preparing a Vinted draft.
 * Requirements:
 * - Status is "done"
 * - `result` is present
 * - At least one image is present
 */
export function isPantEligibleForVintedDraft(pant: PantItem): boolean {
  return (
    pant.status === "done" &&
    Boolean(pant.result) &&
    Boolean(pant.images && pant.images.length > 0)
  );
}

/**
 * Creates a structured VintedDraftData object from a finished PantItem.
 * Uses pant.result, pricing.listingPrice (if available), pant.images, and pant.artikelnummer.
 */
export function createVintedDraftFromPant(
  pant: PantItem,
  existingDraftId?: string
): VintedDraftData | null {
  if (!isPantEligibleForVintedDraft(pant) || !pant.result) {
    return null;
  }

  const result = pant.result;
  const detected = result.detected || {
    brand: "",
    model: "",
    gender: "",
    size: "",
    color: "",
    fit: "",
    material: "",
  };

  const images = (pant.images || []).map((img) => ({
    id: img.id,
    dataUrl: img.dataUrl,
    name: img.name,
  }));

  const defaultPrice = result.pricing?.listingPrice !== undefined
    ? Number(result.pricing.listingPrice)
    : undefined;

  const now = Date.now();

  return {
    id: existingDraftId || `vinted_draft_${pant.id}_${now}`,
    pantId: pant.id,
    artikelnummer: pant.artikelnummer?.trim() || undefined,
    title: result.title || "",
    description: result.description || "",
    price: defaultPrice,
    brand: detected.brand || "",
    model: detected.model || "",
    size: detected.size || "",
    gender: detected.gender || "",
    color: detected.color || "",
    fit: detected.fit || "",
    material: detected.material || "",
    condition: "Sehr gut", // Standard default condition for Vinted
    category: "Jeans", // Standard default category
    imageIds: images.map((img) => img.id),
    images,
    status: "prepared",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Converts a VintedDraftData item to a JSON-compatible VintedDraftPayload for browser extensions.
 */
export function getVintedDraftPayload(
  draft: VintedDraftData
): VintedDraftPayload {
  return {
    id: draft.id,
    pantId: draft.pantId,
    artikelnummer: draft.artikelnummer,
    title: draft.title,
    description: draft.description,
    price: draft.price,
    brand: draft.brand,
    model: draft.model,
    size: draft.size,
    gender: draft.gender,
    color: draft.color,
    fit: draft.fit,
    material: draft.material,
    condition: draft.condition,
    category: draft.category,
    images: draft.images.map((img) => ({
      id: img.id,
      dataUrl: img.dataUrl,
      name: img.name,
    })),
  };
}

/**
 * Load saved Vinted drafts from persistence (IndexedDB with localStorage fallback).
 */
export async function loadVintedDraftsFromStorage(): Promise<VintedDraftData[]> {
  try {
    const saved = await getSetting<VintedDraftData[]>(
      VINTED_DRAFTS_STORAGE_KEY,
      []
    );
    return Array.isArray(saved) ? saved : [];
  } catch (err) {
    console.error("Failed to load Vinted drafts from storage:", err);
    return [];
  }
}

/**
 * Save Vinted drafts list to persistence.
 */
export async function saveVintedDraftsToStorage(
  drafts: VintedDraftData[]
): Promise<void> {
  try {
    await setSetting(VINTED_DRAFTS_STORAGE_KEY, drafts);
  } catch (err) {
    console.error("Failed to save Vinted drafts to storage:", err);
  }
}

/**
 * Global helper function for Chrome/Edge extensions to fetch payload by draftId or all drafts.
 */
if (typeof window !== "undefined") {
  (window as any).getVintedDraftPayload = async (draftId?: string) => {
    const drafts = await loadVintedDraftsFromStorage();
    if (!draftId) {
      return drafts.map(getVintedDraftPayload);
    }
    const draft = drafts.find((d) => d.id === draftId || d.pantId === draftId);
    return draft ? getVintedDraftPayload(draft) : null;
  };

  (window as any).exportVintedDraft = async (draftId: string) => {
    const drafts = await loadVintedDraftsFromStorage();
    const draft = drafts.find((d) => d.id === draftId || d.pantId === draftId);
    if (!draft) return null;
    return JSON.stringify(getVintedDraftPayload(draft), null, 2);
  };
}
