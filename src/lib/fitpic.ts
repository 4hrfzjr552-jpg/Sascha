import type { PantImage, PantItem } from "../types";
import { compressDataUrl } from "./imageCompressor";

export type FitpicGender = "men" | "women";

/**
 * A written stock number on the fifth bag photo must never reach the image
 * generator. Preserve the 5 originals for analysis, but use only garment photos
 * (up to four) when producing a synthetic illustration.
 */
export function fitpicSourceImages(pant: Pick<PantItem, "images">): PantImage[] {
  const images = pant.images || [];
  return images.slice(0, 4).filter((img) => Boolean(img.dataUrl));
}

/** The model determines gender from structured analysis, never from a filename. */
export function detectFitpicGender(pant: PantItem): FitpicGender {
  const detected = pant.result?.detected;
  const value = [
    detected?.gender, pant.result?.title, detected?.model, detected?.brand,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/damen|frauen|female|women|woman|weiblich|miss sixty/.test(value)) return "women";
  if (/herren|männer|male|men|man|männlich/.test(value)) return "men";
  return "men";
}

export function fitpicVariationForPant(pant: PantItem): number {
  if (typeof pant.fitpicVariation === "number") return pant.fitpicVariation + 1;
  let hash = 0;
  for (const char of pant.id) hash = (Math.imul(31, hash) + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 8;
}

export async function generatePantFitpic(
  pant: PantItem,
  accessToken: string,
): Promise<{ fitpic: PantImage; variation: number }> {
  const sources = fitpicSourceImages(pant);
  if (sources.length < 2) {
    throw new Error("Für ein möglichst originalgetreues Fitpic bitte mindestens zwei Jeans-Fotos (ganze Vorderseite und Rückseite) hochladen.");
  }
  if (!accessToken) throw new Error("Bitte erneut anmelden, um ein Fitpic zu erstellen.");

  // Vercel's request limit is smaller than the server's per-image limits.
  // Four separately compressed references can still exceed the HTTP body cap.
  // Recompress all photos at progressively smaller dimensions until the full
  // front/back/detail evidence fits, rather than silently dropping a view.
  const MAX_REFERENCES_JSON_CHARS = 3_600_000;
  const compressionLevels = [
    { maxDimension: 1200, quality: 0.76 },
    { maxDimension: 1000, quality: 0.68 },
    { maxDimension: 820, quality: 0.58 },
  ];
  let images: string[] = [];
  for (const level of compressionLevels) {
    images = await Promise.all(
      sources.map((source) =>
        compressDataUrl(source.dataUrl, level.maxDimension, level.quality)
      )
    );
    if (images.some((prepared) => !/^data:image\/(?:jpeg|png|webp);base64,/.test(prepared))) {
      throw new Error("Ein Originalfoto konnte nicht geladen werden. Bitte die Seite neu laden und erneut versuchen.");
    }
    // JSON adds only a small amount of overhead beyond these data URLs.
    if (images.reduce((sum, prepared) => sum + prepared.length, 0) <= MAX_REFERENCES_JSON_CHARS) {
      break;
    }
  }
  if (images.reduce((sum, prepared) => sum + prepared.length, 0) > MAX_REFERENCES_JSON_CHARS) {
    throw new Error("Die Originalfotos sind zusammen zu groß. Bitte kleinere Fotos hochladen.");
  }

  const variation = fitpicVariationForPant(pant);
  const response = await fetch("/api/generate-fitpic", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      images,
      gender: detectFitpicGender(pant),
      variation,
      details: {
        brand: pant.result?.detected.brand,
        model: pant.result?.detected.model,
        size: pant.result?.detected.size,
        color: pant.result?.detected.color,
        fit: pant.result?.detected.fit,
      },
    }),
  });

  let data: { success?: boolean; image?: string; error?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error(`Fitpic-Server antwortet nicht mit JSON (HTTP ${response.status}).`);
  }

  if (!response.ok || !data.success || !data.image?.startsWith("data:image/")) {
    throw new Error(data.error || `Fitpic fehlgeschlagen (HTTP ${response.status}).`);
  }
  const comma = data.image.indexOf(",");
  const mime = data.image.slice(5, comma).split(";")[0];
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const size = Math.floor((data.image.length - comma - 1) * 3 / 4);
  return {
    fitpic: {
      id: `fitpic-${pant.id}`,
      dataUrl: data.image,
      name: `fitpic.${extension}`,
      size,
    },
    variation,
  };
}
