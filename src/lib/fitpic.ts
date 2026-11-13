import { PantImage, PantItem } from "../types";
import { compressDataUrl } from "./imageCompressor";

export type FitpicGender = "men" | "women";

/** Prefer Gemini's detected category, then title/brand. */
export function detectFitpicGender(pant: PantItem): FitpicGender {
  const detected = pant.result?.detected;
  const input = [detected?.gender, pant.result?.title, detected?.model, detected?.brand]
    .filter(Boolean).join(" ").toLowerCase();
  if (/damen|frauen|female|women|woman|weiblich|mädchen|girl|miss sixty/.test(input)) return "women";
  if (/herren|männer|male|men|man|männlich|jungen|boy/.test(input)) return "men";
  return "men";
}

export function fitpicVariationForPant(pant: PantItem): number {
  if (typeof pant.fitpicVariation === "number") return pant.fitpicVariation + 1;
  let hash = 0;
  for (const letter of pant.id) hash = (Math.imul(31, hash) + letter.charCodeAt(0)) | 0;
  return Math.abs(hash) % 8;
}

export async function generatePantFitpic(
  pant: PantItem,
  accessToken: string,
): Promise<{ fitpic: PantImage; variation: number }> {
  if (!pant.images.length) throw new Error("Bitte zuerst Originalfotos der Jeans hochladen.");
  if (!accessToken) throw new Error("Bitte erneut anmelden, um ein Fitpic zu erstellen.");

  // Use only the original first photo, never the article-number bag photo.
  const source = pant.images[0].dataUrl;
  const prepared = await compressDataUrl(source, 1000, 0.67);
  const variation = fitpicVariationForPant(pant);
  const response = await fetch("/api/generate-fitpic", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      image: prepared,
      gender: detectFitpicGender(pant),
      variation,
      details: {
        brand: pant.result?.detected.brand,
        model: pant.result?.detected.model,
        color: pant.result?.detected.color,
        fit: pant.result?.detected.fit,
      },
    }),
  });

  let data: { success?: boolean; image?: string; error?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error(`Bildserver antwortet nicht korrekt (HTTP ${response.status}).`);
  }
  if (!response.ok || !data.success || !data.image?.startsWith("data:image/")) {
    throw new Error(data.error || `Fitpic fehlgeschlagen (HTTP ${response.status}).`);
  }
  const commaIndex = data.image.indexOf(",");
  const mime = data.image.slice(5, commaIndex).split(";")[0];
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const size = Math.floor((data.image.length - commaIndex - 1) * 3 / 4);
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
