import { PantItem, VintedDraftData, VintedDraftPayload } from "../types";
import {
  getAllVintedDrafts,
  saveVintedDraft,
  saveMultipleVintedDrafts,
  deleteVintedDraft,
  clearVintedDrafts,
  getAllPants,
} from "./indexedDb";

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
 * Uses lightweight image references (imageRefs/imageIds) instead of copying full dataUrls.
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

  const imageRefs = (pant.images || []).map((img) => ({
    id: img.id,
    name: img.name,
  }));

  const defaultPrice =
    result.pricing?.listingPrice !== undefined
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
    imageIds: imageRefs.map((img) => img.id),
    imageRefs,
    status: "prepared",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Converts a VintedDraftData item to a JSON-compatible VintedDraftPayload for browser extensions,
 * dynamically fetching image dataUrls from the associated PantItem.
 */
export function getVintedDraftPayload(
  draft: VintedDraftData,
  pant?: PantItem
): VintedDraftPayload {
  const pantImagesMap = new Map<string, { dataUrl: string; name?: string }>();

  if (pant && pant.images) {
    pant.images.forEach((img) => {
      pantImagesMap.set(img.id, { dataUrl: img.dataUrl, name: img.name });
    });
  }

  const hydratedImages = (draft.imageIds || []).map((id, idx) => {
    const found = pantImagesMap.get(id);
    const ref = draft.imageRefs?.find((r) => r.id === id);
    return {
      id,
      dataUrl: found?.dataUrl || "",
      name: found?.name || ref?.name || `Image_${idx + 1}`,
    };
  });

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
    images: hydratedImages,
  };
}

/**
 * Load saved Vinted drafts from IndexedDB STORE_VINTED_DRAFTS.
 */
export async function loadVintedDraftsFromStorage(): Promise<VintedDraftData[]> {
  return await getAllVintedDrafts();
}

/**
 * Save a single Vinted draft to IndexedDB.
 */
export async function saveVintedDraftToStorage(
  draft: VintedDraftData
): Promise<void> {
  await saveVintedDraft(draft);
}

/**
 * Save multiple Vinted drafts to IndexedDB.
 */
export async function saveVintedDraftsToStorage(
  drafts: VintedDraftData[]
): Promise<void> {
  await saveMultipleVintedDrafts(drafts);
}

/**
 * Delete a Vinted draft from IndexedDB.
 */
export async function deleteVintedDraftFromStorage(
  draftId: string
): Promise<void> {
  await deleteVintedDraft(draftId);
}

/**
 * Clear all Vinted drafts from IndexedDB.
 */
export async function clearVintedDraftsFromStorage(): Promise<void> {
  await clearVintedDrafts();
}

/**
 * Setup Window postMessage Event Listener for Content Script Chrome/Edge Extensions.
 * Message protocol:
 * Incoming: { source: "sascha-ai-extension", type: "GET_VINTED_DRAFT", draftId?: string }
 * Outgoing: { source: "sascha-ai", type: "VINTED_DRAFT_DATA", draftId?: string, payload: ... }
 */
export function setupVintedExtensionBridge(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleMessage = async (event: MessageEvent) => {
    if (!event.data || typeof event.data !== "object") return;
    const { source, type, draftId } = event.data;

    if (source === "sascha-ai-extension" && type === "GET_VINTED_DRAFT") {
      try {
        const drafts = await getAllVintedDrafts();
        const allPants = await getAllPants();
        const pantsMap = new Map<string, PantItem>(
          allPants.map((p) => [p.id, p])
        );

        if (draftId) {
          const targetDraft = drafts.find(
            (d) => d.id === draftId || d.pantId === draftId
          );
          if (!targetDraft) {
            window.postMessage(
              {
                source: "sascha-ai",
                type: "VINTED_DRAFT_DATA",
                draftId,
                payload: null,
                error: "Draft nicht gefunden.",
              },
              "*"
            );
            return;
          }
          const pant = pantsMap.get(targetDraft.pantId);
          const payload = getVintedDraftPayload(targetDraft, pant);

          window.postMessage(
            {
              source: "sascha-ai",
              type: "VINTED_DRAFT_DATA",
              draftId,
              payload,
            },
            "*"
          );
        } else {
          const payloads = drafts.map((d) => {
            const pant = pantsMap.get(d.pantId);
            return getVintedDraftPayload(d, pant);
          });

          window.postMessage(
            {
              source: "sascha-ai",
              type: "VINTED_DRAFT_DATA",
              payload: payloads,
            },
            "*"
          );
        }
      } catch (err: any) {
        window.postMessage(
          {
            source: "sascha-ai",
            type: "VINTED_DRAFT_DATA",
            draftId,
            payload: null,
            error: err?.message || "Fehler beim Laden des Entwurfs.",
          },
          "*"
        );
      }
    }
  };

  window.addEventListener("message", handleMessage);

  // Maintain window helper functions
  (window as any).getVintedDraftPayload = async (draftId?: string) => {
    const drafts = await getAllVintedDrafts();
    const allPants = await getAllPants();
    const pantsMap = new Map(allPants.map((p) => [p.id, p]));

    if (!draftId) {
      return drafts.map((d) => getVintedDraftPayload(d, pantsMap.get(d.pantId)));
    }
    const draft = drafts.find((d) => d.id === draftId || d.pantId === draftId);
    if (!draft) return null;
    return getVintedDraftPayload(draft, pantsMap.get(draft.pantId));
  };

  (window as any).exportVintedDraft = async (draftId: string) => {
    const payload = await (window as any).getVintedDraftPayload(draftId);
    if (!payload) return null;
    return JSON.stringify(payload, null, 2);
  };

  return () => {
    window.removeEventListener("message", handleMessage);
  };
}

// Auto-initialize extension bridge in client environment
if (typeof window !== "undefined") {
  setupVintedExtensionBridge();
}
