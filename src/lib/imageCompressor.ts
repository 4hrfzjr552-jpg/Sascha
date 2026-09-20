import { PantImage } from "../types";

const MAX_IMAGE_DIMENSION = 1100;
const JPEG_COMPRESSION_QUALITY = 0.65;

/**
 * Checks if a file is HEIC or HEIF format
 */
function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    type === "image/heic" ||
    type === "image/heif"
  );
}

/**
 * Converts HEIC/HEIF blob to standard JPEG blob using heic2any
 */
async function convertHeicToBlob(file: File): Promise<Blob> {
  try {
    const heic2any = (await import("heic2any")).default;
    const conversionResult = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.85,
    });
    return Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
  } catch (error) {
    console.warn("heic2any conversion fallback:", error);
    return file;
  }
}

/**
 * Compresses an image file using browser HTML5 canvas
 */
export async function compressImageFile(file: File): Promise<PantImage> {
  let sourceBlob: Blob = file;

  if (isHeicFile(file)) {
    sourceBlob = await convertHeicToBlob(file);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;

          // Scale down if exceeding max dimension
          if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
            if (width > height) {
              height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
              width = MAX_IMAGE_DIMENSION;
            } else {
              width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
              height = MAX_IMAGE_DIMENSION;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            // Fallback to original data URL if canvas context fails
            return resolve({
              id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              dataUrl: e.target?.result as string,
              name: file.name,
              size: file.size,
            });
          }

          // Render image
          ctx.drawImage(img, 0, 0, width, height);

          // Export compressed JPEG
          const compressedDataUrl = canvas.toDataURL(
            "image/jpeg",
            JPEG_COMPRESSION_QUALITY
          );

          // Calculate approximate byte size of base64
          const approxBytes = Math.round(
            (compressedDataUrl.length - compressedDataUrl.indexOf(",") - 1) * 0.75
          );

          resolve({
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            dataUrl: compressedDataUrl,
            name: file.name.replace(/\.(heic|heif)$/i, ".jpg"),
            size: approxBytes,
          });
        } catch (canvasErr) {
          console.warn("Canvas compression failed, using original:", canvasErr);
          resolve({
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            dataUrl: e.target?.result as string,
            name: file.name,
            size: file.size,
          });
        }
      };

      img.onerror = () => {
        reject(new Error(`Das Bild „${file.name}“ konnte nicht geladen werden.`));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error(`Fehler beim Lesen der Datei „${file.name}“.`));
    };

    reader.readAsDataURL(sourceBlob);
  });
}
