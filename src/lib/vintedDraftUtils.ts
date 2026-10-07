import { PantItem, VintedDraftData, VintedDraftPayload, VintedDraftListItem } from "../types";
import {
  getAllVintedDrafts,
  saveVintedDraft,
  saveMultipleVintedDrafts,
  deleteVintedDraft,
  clearVintedDrafts,
  getAllPants,
  getBulkImagesByIds,
} from "./indexedDb";
import { getSignedImageUrl } from "./supabase";

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
export async function getVintedDraftPayload(
  draft: VintedDraftData,
  pant?: PantItem
): Promise<VintedDraftPayload> {
  const pantImagesMap = new Map<
    string,
    { dataUrl: string; name?: string; storagePath?: string }
  >();

  let activePant = pant;
  if (!activePant && draft.pantId) {
    try {
      const allPants = await getAllPants();
      activePant = allPants.find((p) => p.id === draft.pantId);
    } catch (err) {
      console.warn("[VintedDraftPayload] Fehler beim Laden der Pant aus IndexedDB:", err);
    }
  }

  if (activePant && activePant.images) {
    activePant.images.forEach((img) => {
      if (img.id) {
        pantImagesMap.set(img.id, {
          dataUrl: img.dataUrl || "",
          name: img.name,
          storagePath: img.storagePath,
        });
      }
    });
  }

  // Determine list of image IDs to hydrate
  let targetImageIds = draft.imageIds || [];

  // Fallback 1: If draft.imageIds is empty or unmapped, fall back to draft.imageRefs
  if (targetImageIds.length === 0 && draft.imageRefs && draft.imageRefs.length > 0) {
    targetImageIds = draft.imageRefs.map((r) => r.id);
  }

  // Fallback 2: If draft has no image references but pant has images, fall back to all pant image IDs
  if (targetImageIds.length === 0 && activePant && activePant.images && activePant.images.length > 0) {
    targetImageIds = activePant.images.map((img) => img.id);
  }

  // Fetch staged bulk images from IndexedDB if needed
  let bulkImagesMap = new Map<string, string>();
  if (targetImageIds.length > 0) {
    try {
      const bulkRecords = await getBulkImagesByIds(targetImageIds);
      bulkRecords.forEach((rec) => {
        if (rec.id && rec.dataUrl) {
          bulkImagesMap.set(rec.id, rec.dataUrl);
        }
      });
    } catch (err) {
      // Ignore bulk image error if not found
    }
  }

  const hydratedImages = await Promise.all(
    targetImageIds.map(async (id, idx) => {
      let found = pantImagesMap.get(id);

      // Fallback 3: Positional matching with activePant.images
      if ((!found || (!found.dataUrl && !found.storagePath)) && activePant && activePant.images && activePant.images[idx]) {
        const fallbackImg = activePant.images[idx];
        found = {
          dataUrl: fallbackImg.dataUrl || "",
          name: fallbackImg.name,
          storagePath: fallbackImg.storagePath,
        };
      }

      const ref = draft.imageRefs?.find((r) => r.id === id);
      let dataUrl = found?.dataUrl || "";
      const name = found?.name || ref?.name || `Image_${idx + 1}`;

      // Resolve signed URL if storagePath exists and dataUrl is missing/expired
      if ((!dataUrl || !dataUrl.startsWith("data:") && !dataUrl.startsWith("http")) && found?.storagePath) {
        try {
          const signedUrl = await getSignedImageUrl(found.storagePath);
          if (signedUrl) {
            dataUrl = signedUrl;
          }
        } catch (err) {
          console.warn(`[VintedDraftPayload] Fehler beim Erstellen der Signed-URL für ${found.storagePath}:`, err);
        }
      }

      // Fallback 4: Bulk image store dataUrl
      if ((!dataUrl || !dataUrl.startsWith("data:") && !dataUrl.startsWith("http")) && bulkImagesMap.has(id)) {
        dataUrl = bulkImagesMap.get(id) || "";
      }

      return {
        id,
        dataUrl,
        name,
      };
    })
  );

  const totalImageCount = hydratedImages.length;
  const validDataUrlCount = hydratedImages.filter(
    (img) => img.dataUrl && (img.dataUrl.startsWith("data:image/") || img.dataUrl.startsWith("http"))
  ).length;

  console.log(
    `[VintedDraftPayload] ${totalImageCount} Bilder, ${validDataUrlCount} gültige Bildquellen (Draft ID: ${draft.id})`
  );

  if (draft.price === undefined || draft.price === null) {
    console.log(
      `[VintedDraftPayload] kein listingPrice in result.pricing vorhanden (Draft ID: ${draft.id})`
    );
  }

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
 * Converts VintedDraftData list to lightweight VintedDraftListItem array without base64 images.
 */
export function getVintedDraftListSummary(
  drafts: VintedDraftData[]
): VintedDraftListItem[] {
  return drafts.map((d) => ({
    id: d.id,
    pantId: d.pantId,
    artikelnummer: d.artikelnummer,
    title: d.title,
    price: d.price,
    brand: d.brand,
    size: d.size,
    color: d.color,
    condition: d.condition,
    category: d.category,
    imageCount: d.imageIds?.length || d.imageRefs?.length || 0,
  }));
}

/**
 * Setup Window postMessage Event Listener for Content Script Chrome/Edge Extensions.
 * Message protocol:
 * Incoming 1: { source: "sascha-ai-extension", type: "LIST_VINTED_DRAFTS" }
 * Outgoing 1: { source: "sascha-ai", type: "VINTED_DRAFT_LIST", payload: VintedDraftListItem[] }
 *
 * Incoming 2: { source: "sascha-ai-extension", type: "GET_VINTED_DRAFT", draftId?: string }
 * Outgoing 2: { source: "sascha-ai", type: "VINTED_DRAFT_DATA", draftId?: string, payload: VintedDraftPayload }
 */
export function setupVintedExtensionBridge(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleMessage = async (event: MessageEvent) => {
    if (!event.data || typeof event.data !== "object") return;
    const { source, type, draftId } = event.data;

    if (source === "sascha-ai-extension") {
      if (type === "LIST_VINTED_DRAFTS") {
        try {
          const drafts = await getAllVintedDrafts();
          const summaryList = getVintedDraftListSummary(drafts);

          window.postMessage(
            {
              source: "sascha-ai",
              type: "VINTED_DRAFT_LIST",
              payload: summaryList,
            },
            "*"
          );
        } catch (err: any) {
          window.postMessage(
            {
              source: "sascha-ai",
              type: "VINTED_DRAFT_LIST",
              payload: [],
              error: err?.message || "Fehler beim Laden der Entwurfsliste.",
            },
            "*"
          );
        }
      } else if (type === "GET_VINTED_DRAFT") {
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
            const payload = await getVintedDraftPayload(targetDraft, pant);

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
            const payloads = await Promise.all(
              drafts.map((d) => {
                const pant = pantsMap.get(d.pantId);
                return getVintedDraftPayload(d, pant);
              })
            );

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
    }
  };

  window.addEventListener("message", handleMessage);

  // Maintain window helper functions
  (window as any).getVintedDraftPayload = async (draftId?: string) => {
    const drafts = await getAllVintedDrafts();
    const allPants = await getAllPants();
    const pantsMap = new Map(allPants.map((p) => [p.id, p]));

    if (!draftId) {
      return Promise.all(
        drafts.map((d) => getVintedDraftPayload(d, pantsMap.get(d.pantId)))
      );
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
