/**
 * Vinted photo payload helpers. Sascha AI fetches Supabase photos in its
 * own tab; the extension receives portable data:image URLs instead of stale
 * signed links that may be inaccessible from vinted.de.
 */

export async function freshVintedImageSource(
  cachedUrl: string,
  storagePath: string | undefined,
  sign: (storagePath: string) => Promise<string | null>,
): Promise<string> {
  if (!storagePath) return cachedUrl;
  // Never trust a cached https URL when storagePath is known. Signed links
  // expire after one hour, and an old URL still starts with "https://".
  return (await sign(storagePath)) || "";
}

export async function prepareVintedImageDataUrl(
  source: string,
  fetcher: typeof fetch = fetch,
  Reader: typeof FileReader = FileReader,
): Promise<string> {
  if (source.startsWith("data:image/")) return source;
  if (!/^https?:\/\//i.test(source)) {
    throw new Error("Ungültige oder fehlende Bildquelle.");
  }
  const response = await fetcher(source, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Bildserver antwortet mit HTTP " + response.status);
  }
  const blob = await response.blob();
  if (!blob.size || (blob.type && !blob.type.startsWith("image/"))) {
    throw new Error("Bildserver hat keine gültige Bilddatei geliefert.");
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new Reader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data === "string" && data.startsWith("data:image/")) {
        resolve(data);
      } else {
        reject(new Error("Bilddaten konnten nicht gelesen werden."));
      }
    };
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(blob);
  });
}
