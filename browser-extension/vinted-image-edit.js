/* Sascha AI → Vinted image preparation.
   Recreate an approximate Apple Photos adjustment stack from the user's
   Brillanz/Glanzlichter/Schatten/Kontrast/Schwarzpunkt/Helligkeit/Wärme screenshots. Do not detect or erase blue writing; the
   user's blue number was only a visual label to compare two photos.
   Keep the crop, perspective, background and condition of the jeans intact.
   Produce new JPEGs, with no guarantee of marketplace acceptance.
   Everything is processed locally in the browser. */
((root) => {
  "use strict";

  const MAX_EDGE = 2048;
  const JPEG_QUALITY = 0.94;

  // Approximate, not exact, reconstruction of the user's Apple Photos
  // slider screenshots. The screenshots identify slider positions but do
  // NOT show numerical amounts; these can be tuned after a real visual test.
  // Value range: -100..+100. No mark detection / background removal.
  const IPHONE_LOOK = Object.freeze({
    id: "iphone-photo-adjustments-v1",
    brilliance: 35,    // Brillanz: clear positive shift in screenshot
    highlights: -14,   // Glanzlichter: slight reduction
    shadows: 12,       // Schatten: slight lift
    contrast: 14,      // Kontrast: modest increase
    blackPoint: 32,    // Schwarzpunkt: noticeably stronger dark anchor
    brightness: -12,   // Helligkeit: small negative movement
    warmth: 3          // Wärme: nearly neutral, faintly warmer
  });

  function clampUnit(v) {
    return Math.max(0, Math.min(1, v));
  }
  function clampAdjust(v) {
    return Math.max(-1, Math.min(1, (Number(v) || 0) / 100));
  }
  function smooth(t) {
    const x=clampUnit(t);
    return x*x*(3-2*x);
  }

  // These are seven independent, smooth tonal adjustments approximating
  // the respective Apple Photos controls. We modify overall luminance first
  // so denim blue, visible wear, stitching and the carpet texture survive.
  // There is no crop, segmentation, retouching, artificial defect removal,
  // or per-photo randomness.
  function applyIphoneAdjustments(imageData, look=IPHONE_LOOK) {
    const src=imageData?.data;
    if (!src) return { pixels: 0, look: look.id || IPHONE_LOOK.id };

    const brilliance=clampAdjust(look.brilliance);
    const highlights=clampAdjust(look.highlights);
    const shadows=clampAdjust(look.shadows);
    const contrast=clampAdjust(look.contrast);
    const blackPoint=clampAdjust(look.blackPoint);
    const brightness=clampAdjust(look.brightness);
    const warmth=clampAdjust(look.warmth);

    let changed=0;
    for(let i=0;i<src.length;i+=4){
      const r=src[i]/255, g=src[i+1]/255, b=src[i+2]/255;
      const lum=0.2126*r+0.7152*g+0.0722*b;
      // Brillanz favors midtones without blowing out near-white patches.
      let target=lum+brilliance*0.15*(4*lum*(1-lum));
      // Highlights and shadows affect different regions of the histogram.
      target+=highlights*0.19*smooth((lum-0.43)/0.57);
      target+=shadows*0.20*(1-smooth(lum/0.60));
      // Contrast separates light and dark regions around neutral midpoint.
      target=0.5+(target-0.5)*(1+contrast*0.55);
      // Black point adds depth mostly to the lowest tones.
      target-=blackPoint*0.12*(1-smooth(lum/0.55));
      target+=brightness*0.09;
      target=clampUnit(target);

      // Preserve colors and garment texture by applying a single luminance
      // shift, not separately remapping channel levels.
      const delta=target-lum;
      const chroma=1+Math.max(0,brilliance)*0.08;
      const rr=clampUnit(lum+(r-lum)*chroma+delta+warmth*0.025);
      const gg=clampUnit(lum+(g-lum)*chroma+delta);
      const bb=clampUnit(lum+(b-lum)*chroma+delta-warmth*0.025);
      const nr=Math.round(rr*255), ng=Math.round(gg*255), nb=Math.round(bb*255);
      if(nr!==src[i]||ng!==src[i+1]||nb!==src[i+2])changed++;
      src[i]=nr;src[i+1]=ng;src[i+2]=nb;
      // Source alpha is deliberately preserved.
    }
    return {pixels:changed,look:look.id||IPHONE_LOOK.id};
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
      const grade = applyIphoneAdjustments(pixels);
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

  const api = Object.freeze({ IPHONE_LOOK, applyIphoneAdjustments, processImage });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SaschaVintedImageEdit = api;
})(typeof window !== "undefined" ? window : globalThis);
