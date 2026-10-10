/* Sascha AI → Vinted image preparation.
   Apply a subtle, consistent brightness/contrast/color correction based on
   the user's before/after example. Do not detect or erase blue writing; the
   user's blue number was only a visual label to compare two photos.
   Keep the crop, perspective, background and condition of the jeans intact.
   Produce new JPEGs, with no guarantee of marketplace acceptance.
   Everything is processed locally in the browser. */
((root) => {
  "use strict";

  const MAX_EDGE = 2048;
  const JPEG_QUALITY = 0.94;

  const REFERENCE_LOOK = Object.freeze({
    id: "soft-reference-look-v2",
    brightness: 1.035,
    contrast: 0.965,
    saturation: 0.97,
    gamma: 0.985,
    redMul: 1.01,
    greenMul: 1.01,
    blueMul: 0.985,
    redAdd: 2,
    greenAdd: 2,
    blueAdd: 1
  });

  function clamp(v) {
    return Math.max(0, Math.min(255, v));
  }

  function applyReferenceLook(imageData) {
    const src = imageData?.data;
    if (!src) return { pixels: 0, look: REFERENCE_LOOK.id };
    let changed = 0;
    for (let i = 0; i < src.length; i += 4) {
      const oldR = src[i], oldG = src[i + 1], oldB = src[i + 2];
      let r = oldR * REFERENCE_LOOK.brightness;
      let g = oldG * REFERENCE_LOOK.brightness;
      let b = oldB * REFERENCE_LOOK.brightness;

      r = 255 * Math.pow(clamp(r) / 255, REFERENCE_LOOK.gamma);
      g = 255 * Math.pow(clamp(g) / 255, REFERENCE_LOOK.gamma);
      b = 255 * Math.pow(clamp(b) / 255, REFERENCE_LOOK.gamma);

      r = (r - 128) * REFERENCE_LOOK.contrast + 128;
      g = (g - 128) * REFERENCE_LOOK.contrast + 128;
      b = (b - 128) * REFERENCE_LOOK.contrast + 128;

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * REFERENCE_LOOK.saturation;
      g = gray + (g - gray) * REFERENCE_LOOK.saturation;
      b = gray + (b - gray) * REFERENCE_LOOK.saturation;

      const nr = Math.round(clamp(r * REFERENCE_LOOK.redMul + REFERENCE_LOOK.redAdd));
      const ng = Math.round(clamp(g * REFERENCE_LOOK.greenMul + REFERENCE_LOOK.greenAdd));
      const nb = Math.round(clamp(b * REFERENCE_LOOK.blueMul + REFERENCE_LOOK.blueAdd));

      if (nr !== oldR || ng !== oldG || nb !== oldB) changed++;
      src[i] = nr;
      src[i + 1] = ng;
      src[i + 2] = nb;
      // Alpha is deliberately unchanged.
    }
    return { pixels: changed, look: REFERENCE_LOOK.id };
  }

  async function toJpegBlob(canvas) {
    if (typeof canvas.toBlob !== "function")
      throw Error("JPEG-Export im Browser nicht verfügbar");
    return new Promise((resolve, reject) =>
      canvas.toBlob(blob => blob?.size ?
        resolve(blob) : reject(Error("Bild konnte nicht als JPG gespeichert werden")),
      "image/jpeg", JPEG_QUALITY)
    );
  }

  async function processImage(file, index) {
    if (!(file instanceof File)) throw Error("Ungültige Bilddatei");
    if (typeof createImageBitmap !== "function")
      throw Error("Bildbearbeitung im Browser nicht verfügbar");
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw Error("Canvas-Bildbearbeitung nicht verfügbar");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      const grade = applyReferenceLook(pixels);
      ctx.putImageData(pixels, 0, 0);
      const blob = await toJpegBlob(canvas);
      return {
        file: new File([blob],
          "sascha_vinted_" + String(index + 1).padStart(2, "0") + "_edited.jpg",
          { type: "image/jpeg" }),
        originalName: file.name,
        colorLook: grade.look,
        gradedPixels: grade.pixels,
        width, height
      };
    } finally {
      bitmap.close?.();
    }
  }

  const api = Object.freeze({ REFERENCE_LOOK, applyReferenceLook, processImage });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SaschaVintedImageEdit = api;
})(typeof window !== "undefined" ? window : globalThis);
