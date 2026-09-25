/**
 * Utility for photorealistic microcement background replacement
 */

/**
 * Renders a photorealistic matte light-gray microcement/concrete background on HTMLCanvasElement.
 */
export function drawMicrocementBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  // Base light gray microcement floor color
  ctx.fillStyle = "#e5e5e3";
  ctx.fillRect(0, 0, width, height);

  // Subtle cloudy plaster structure (wolkige Spachtelstruktur)
  const numClouds = 12;
  for (let i = 0; i < numClouds; i++) {
    const rx = Math.random() * width;
    const ry = Math.random() * height;
    const radius = Math.max(width, height) * (0.3 + Math.random() * 0.4);

    const grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, radius);
    const shade = Math.random() > 0.5 ? "rgba(255,255,255,0.22)" : "rgba(215,215,212,0.25)";
    grad.addColorStop(0, shade);
    grad.addColorStop(1, "rgba(229,229,227,0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(rx, ry, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine matte plaster texture noise
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 6;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Pure Canvas-assisted photorealistic background replacement algorithm
 * Used as primary/fallback renderer ensuring immediate, clean, edge-preserved output.
 */
export async function processCanvasBackgroundReplacement(
  imageDataUrl: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        // Create main canvas
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          return reject(new Error("Canvas Context nicht verfügbar"));
        }

        // Draw original image on offscreen canvas to extract mask & garment
        const offCanvas = document.createElement("canvas");
        offCanvas.width = width;
        offCanvas.height = height;
        const offCtx = offCanvas.getContext("2d", { willReadFrequently: true })!;
        offCtx.drawImage(img, 0, 0, width, height);

        const imgData = offCtx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // Sample border corner pixels to detect original background color
        const corners = [
          [0, 0],
          [width - 1, 0],
          [0, height - 1],
          [width - 1, height - 1],
          [Math.floor(width / 2), 0],
          [Math.floor(width / 2), height - 1],
        ];

        let bgR = 0, bgG = 0, bgB = 0;
        corners.forEach(([x, y]) => {
          const idx = (y * width + x) * 4;
          bgR += data[idx];
          bgG += data[idx + 1];
          bgB += data[idx + 2];
        });
        bgR /= corners.length;
        bgG /= corners.length;
        bgB /= corners.length;

        // Generate clean alpha mask with soft edge anti-aliasing
        const alphaCanvas = document.createElement("canvas");
        alphaCanvas.width = width;
        alphaCanvas.height = height;
        const alphaCtx = alphaCanvas.getContext("2d")!;
        const alphaImgData = alphaCtx.createImageData(width, height);
        const aData = alphaImgData.data;

        const threshold = 38;
        const feather = 18;

        let minSubjectY = height, maxSubjectY = 0;
        let minSubjectX = width, maxSubjectX = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const diff = Math.sqrt(
            (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2
          );

          let alpha = 255;
          if (diff < threshold) {
            alpha = 0;
          } else if (diff < threshold + feather) {
            alpha = Math.floor(((diff - threshold) / feather) * 255);
          }

          aData[i] = r;
          aData[i + 1] = g;
          aData[i + 2] = b;
          aData[i + 3] = alpha;

          if (alpha > 50) {
            const pixelIdx = i / 4;
            const px = pixelIdx % width;
            const py = Math.floor(pixelIdx / width);
            if (px < minSubjectX) minSubjectX = px;
            if (px > maxSubjectX) maxSubjectX = px;
            if (py < minSubjectY) minSubjectY = py;
            if (py > maxSubjectY) maxSubjectY = py;
          }
        }
        alphaCtx.putImageData(alphaImgData, 0, 0);

        // 1. Draw fresh microcement background
        drawMicrocementBackground(ctx, width, height);

        // 2. Draw natural contact shadow (Kontakt-Schatten) under subject
        if (maxSubjectY > minSubjectY && maxSubjectX > minSubjectX) {
          const subjW = maxSubjectX - minSubjectX;
          const subjH = maxSubjectY - minSubjectY;
          const shadowX = minSubjectX + subjW / 2;
          const shadowY = minSubjectY + subjH * 0.96;
          const rx = subjW * 0.48;
          const ry = Math.max(12, subjH * 0.08);

          ctx.save();
          const shadowGrad = ctx.createRadialGradient(
            shadowX, shadowY, 0,
            shadowX, shadowY, rx
          );
          shadowGrad.addColorStop(0, "rgba(30, 28, 26, 0.45)");
          shadowGrad.addColorStop(0.4, "rgba(45, 42, 38, 0.22)");
          shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

          ctx.fillStyle = shadowGrad;
          ctx.beginPath();
          ctx.ellipse(shadowX, shadowY, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();

          // Soft ambient edge shadow
          ctx.filter = "blur(12px)";
          ctx.fillStyle = "rgba(40, 38, 35, 0.15)";
          ctx.beginPath();
          ctx.ellipse(shadowX, shadowY - ry * 0.3, rx * 0.9, ry * 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 3. Draw foreground clothing item with anti-aliased edge blending
        ctx.drawImage(alphaCanvas, 0, 0);

        const resultDataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve(resultDataUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Bild konnte nicht verarbeitet werden."));
    img.src = imageDataUrl;
  });
}

/**
 * Main entrance for background replacement (calls server API first, falls back to canvas).
 */
export async function replaceBackground(imageDataUrl: string): Promise<string> {
  try {
    const response = await fetch("/api/replace-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.image) {
        return data.image;
      }
    }
  } catch (err) {
    console.warn("Server AI background replacement note:", err);
  }

  // Fallback to photorealistic client-side microcement canvas rendering
  return await processCanvasBackgroundReplacement(imageDataUrl);
}
