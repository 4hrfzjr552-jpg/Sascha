import type { PantImage } from "../types";
import { ensureDataUrl } from "./imageCompressor";
import { neutralPhotoCorrection, adjustPhotoChannel } from "./photoTone";

/**
 * Modest, deterministic exposure/contrast correction for authentic Vinted
 * source photos. NEVER recreates, bends, warps, cuts out or invents any garment
 * pixel. This is intentionally NOT generative AI.
 *
 * Every run always starts from the real original, not a previous edit.
 */
/** High-quality JPEG conversion with a subtle neutral tone correction. */
export async function enhanceOriginalPhoto(original: PantImage): Promise<PantImage> {
  const dataUrl = await ensureDataUrl(original.dataUrl);
  if (!dataUrl || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(dataUrl)) {
    throw new Error("Originalfoto konnte nicht geladen werden.");
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Bild konnte nicht angezeigt werden."));
    img.src = dataUrl;
  });
  const maxSide = 1600;
  const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * ratio));
  const height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Bildverarbeitung auf diesem Gerät nicht verfügbar.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);
  const pixels = frame.data;
  // Sample only existing pixels; not a generated image or segment mask.
  let total = 0, sampled = 0;
  for (let k = 0; k < pixels.length; k += 64) {
    const luma = 0.2126 * pixels[k] + 0.7152 * pixels[k+1] + 0.0722 * pixels[k+2];
    total += luma; sampled++;
  }
  const correction = neutralPhotoCorrection(sampled ? total / sampled : 128);
  for (let k=0; k < pixels.length; k+=4) {
    pixels[k] = adjustPhotoChannel(pixels[k], correction.gain, correction.contrast);
    pixels[k+1] = adjustPhotoChannel(pixels[k+1], correction.gain, correction.contrast);
    pixels[k+2] = adjustPhotoChannel(pixels[k+2], correction.gain, correction.contrast);
  }
  ctx.putImageData(frame, 0, 0);
  let output: string;
  try { output = canvas.toDataURL("image/jpeg", 0.92); }
  catch { throw new Error("Bild konnte auf diesem Gerät nicht gespeichert werden."); }
  return {
    id: `flatlay-${original.id}`, // stable ID for existing draft handling
    dataUrl: output,
    name: "original-sanft-optimiert.jpg",
    size: Math.floor((output.length - output.indexOf(",") - 1) * 0.75),
  };
}
