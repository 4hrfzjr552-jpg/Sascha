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
import { freshVintedImageSource, prepareVintedImageDataUrl } from "./vintedImageTransfer";

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
      let source = "none";

      if (dataUrl && (dataUrl.startsWith("data:") || dataUrl.startsWith("http"))) {
        source = found?.storagePath ? "pant-storagePath" : "pant-dataUrl";
      }

      // CRITICAL: even syntactically valid https:// Supabase signed URLs may
      // have expired (getSignedImageUrl TTL is only one hour). Refresh them
      // unconditionally whenever we have the original storage path.
      if (found?.storagePath) {
        try {
          dataUrl = await freshVintedImageSource(
            dataUrl, found.storagePath, getSignedImageUrl
          );
          source = dataUrl ? "refreshed-storage-signed-url" : "signed-url-unavailable";
        } catch (err) {
          dataUrl = "";
          console.warn("[VintedDraftPayload] Signed-URL konnte nicht erneuert werden:", err);
        }
      }

      // Fallback 4: Bulk image store dataUrl (last fallback only)
      if ((!dataUrl || (!dataUrl.startsWith("data:") && !dataUrl.startsWith("http"))) && bulkImagesMap.has(id)) {
        dataUrl = bulkImagesMap.get(id) || "";
        if (dataUrl) {
          source = "bulk-staging-fallback";
        }
      }

      console.log(`[VintedDraftPayload] Image ${idx + 1}/${targetImageIds.length}: source=${source}`);

      return {
        id,
        dataUrl,
        name,
      };
    })
  );

  // Only the first FOUR photos are used by Vinted. Resolve them to
  // portable data URLs in Sascha AI *before* messaging the other tab;
  // Vinted need not fetch external Supabase URLs itself.
  // If any photo fails to load, report the precise photo number early,
  // rather than filling eight fields and then stopping at image 1.
  const portableImages = await Promise.all(
    hydratedImages.map(async (img, index) => {
      if (index >= 4) return img; // fifth image isn't transferred to Vinted
      if (!img.dataUrl) {
        throw new Error(
          `Foto ${index + 1} fehlt im Speicher. Bitte das Foto in Sascha AI prüfen.`
        );
      }
      try {
        return {
          ...img,
          dataUrl: await prepareVintedImageDataUrl(img.dataUrl),
        };
      } catch (err: any) {
        console.warn(
          `[VintedDraftPayload] Foto ${index + 1} kann nicht vorbereitet werden:`,
          err?.message || err
        );
        throw new Error(
          `Foto ${index + 1} konnte in Sascha AI nicht geladen werden (${err?.message || "unbekannter Fehler"}). Bitte Sascha AI neu laden und erneut versuchen.`
        );
      }
    })
  );

  const totalImageCount = portableImages.length;
  const validDataUrlCount = portableImages.slice(0, 4).filter(
    (img) => img.dataUrl?.startsWith("data:image/")
  ).length;

  console.log(
    `[VintedDraftPayload] ${totalImageCount} Bilder, ${validDataUrlCount} gültige Bildquellen (Draft ID: ${draft.id})`
  );

  let resolvedPrice = draft.price;
  if (resolvedPrice === undefined || resolvedPrice === null) {
    if (activePant?.result?.pricing?.listingPrice !== undefined) {
      resolvedPrice = Number(activePant.result.pricing.listingPrice);
    }
  }

  console.log(
    `[VintedDraftPayload] Price debug (Draft ID: ${draft.id}): draft.price=${draft.price}, activePant.result.pricing?.listingPrice=${activePant?.result?.pricing?.listingPrice}, resolvedPrice=${resolvedPrice}`
  );

  if (resolvedPrice === undefined || resolvedPrice === null) {
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
    price: resolvedPrice,
    brand: draft.brand,
    model: draft.model,
    size: draft.size,
    // Original flat measurements travel with the draft; NEVER replace a
    // real size label with an approximation.
    measurements: activePant?.measurements
      ? { ...activePant.measurements }
      : undefined,
    gender: draft.gender,
    color: draft.color,
    fit: draft.fit,
    material: draft.material,
    condition: draft.condition,
    category: draft.category,
    images: portableImages,
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
 * Give the extension a complete, explicit queue for a draft-only batch.
 * The previous bridge listed ONLY individually prepared VintedDraftData,
 * causing "0/1" even when plenty of finished pants were available.
 *
 * Never include uploaded, sold, or archived pants, nor Vinted drafts already
 * marked saved in Sascha AI. Missing or nonnumeric article numbers are also
 * excluded. Virtual IDs are stable across reloads, and generated on demand:
 * creating this list does NOT upload, publish, or mutate any garment.
 */
export function getVintedBatchListSummary(
  drafts: VintedDraftData[],
  pants: PantItem[]
): VintedDraftListItem[] {
  const current = new Map(drafts.map((d) => [d.pantId, d]));
  const eligible = pants
    .filter((pant) =>
      isPantEligibleForVintedDraft(pant) &&
      !["uploaded", "sold", "archived"].includes(pant.saleStatus) &&
      /^\\d+$/.test(String(pant.artikelnummer || "").trim()) &&
      Number(pant.artikelnummer) > 0 &&
      current.get(pant.id)?.status !== "saved"
    )
    .map((pant) =>
      current.get(pant.id) ||
      createVintedDraftFromPant(pant, `vinted_auto_${pant.id}`)
    )
    .filter((d): d is VintedDraftData => d !== null)
    .sort((a, b) => Number(a.artikelnummer) - Number(b.artikelnummer));
  return getVintedDraftListSummary(eligible).slice(0, 100);
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
          const summaryList = event.data.includeEligiblePants === true
            ? getVintedBatchListSummary(drafts, await getAllPants())
            : getVintedDraftListSummary(drafts);

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
            const saved = drafts.find(
              (d) => d.id === draftId || d.pantId === draftId
            );
            const candidate = draftId.startsWith("vinted_auto_")
              ? pantsMap.get(draftId.slice("vinted_auto_".length))
              : undefined;
            const targetDraft = saved || (
              candidate &&
              isPantEligibleForVintedDraft(candidate) &&
              !["uploaded", "sold", "archived"].includes(candidate.saleStatus) &&
              /^\\d+$/.test(String(candidate.artikelnummer || "").trim())
                ? createVintedDraftFromPant(candidate, draftId)
                : null
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
