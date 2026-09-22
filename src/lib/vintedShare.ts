import { PantItem } from "../types";

export interface ShareVintedPhotosResult {
  success: boolean;
  sharedViaNative?: boolean;
  downloadedFallback?: boolean;
  error?: string;
}

/**
 * Generates a clean, standardized filename for a pant photo export.
 * Example with article number: "123_1.jpg", "123_2.jpg"
 * Example without article number: "hose_17_1.jpg", "hose_17_2.jpg"
 */
export function getVintedPhotoFileName(
  pant: PantItem,
  index: number,
  mimeType: string = "image/jpeg"
): string {
  let ext = "jpg";
  if (mimeType.includes("png")) {
    ext = "png";
  } else if (mimeType.includes("webp")) {
    ext = "webp";
  } else if (mimeType.includes("heic")) {
    ext = "heic";
  }

  const rawArtNr = pant.artikelnummer?.trim();
  if (rawArtNr) {
    const cleanArtNr = rawArtNr.replace(/[/\\?%*:|"<>]/g, "_").trim();
    if (cleanArtNr) {
      return `${cleanArtNr}_${index + 1}.${ext}`;
    }
  }

  return `hose_${pant.number}_${index + 1}.${ext}`;
}

/**
 * Converts dataUrls or HTTP(S) image URLs into File objects and triggers
 * native iOS/browser sharing sheet or download fallback.
 */
export async function shareVintedPhotos(
  pant: PantItem
): Promise<ShareVintedPhotosResult> {
  if (!pant.images || pant.images.length === 0) {
    return {
      success: false,
      error: "Keine Fotos für diese Hose vorhanden.",
    };
  }

  try {
    const files: File[] = [];

    for (let i = 0; i < pant.images.length; i++) {
      const img = pant.images[i];
      const response = await fetch(img.dataUrl);
      if (!response.ok) {
        throw new Error(
          `Foto #${i + 1} konnte nicht geladen werden (${response.statusText || response.status}).`
        );
      }
      const blob = await response.blob();
      const mimeType = blob.type || "image/jpeg";
      const fileName = getVintedPhotoFileName(pant, i, mimeType);
      const file = new File([blob], fileName, { type: mimeType });
      files.push(file);
    }

    // Check if navigator.canShare({ files }) is supported
    const canShareFiles =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files });

    if (canShareFiles) {
      await navigator.share({
        files,
      });
      return { success: true, sharedViaNative: true };
    } else {
      // Fallback: Trigger download for each image file individually
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (i < files.length - 1) {
          await new Promise((res) => setTimeout(res, 200));
        }
      }
      return { success: true, downloadedFallback: true };
    }
  } catch (err: any) {
    // If the user manually cancelled or dismissed the native share sheet, ignore error
    if (
      err?.name === "AbortError" ||
      err?.name === "NotAllowedError" ||
      String(err).includes("canceled") ||
      String(err).includes("cancelled")
    ) {
      return { success: true };
    }

    return {
      success: false,
      error:
        err?.message ||
        "Beim Vorbereiten der Fotos ist ein Fehler aufgetreten.",
    };
  }
}
