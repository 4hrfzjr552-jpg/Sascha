import { compressDataUrl } from "./imageCompressor";

/**
 * Utility for Gemini AI background replacement
 */

/**
 * Main entrance for background replacement (calls server API /api/replace-background using Gemini).
 * Throws an explicit error if AI generation fails so the UI displays the real server error message.
 */
export async function replaceBackground(imageDataUrl: string): Promise<string> {
  // Compress input image prior to API call to prevent Vercel 4.5MB payload limit issues
  let preparedImage = imageDataUrl;
  try {
    preparedImage = await compressDataUrl(imageDataUrl, 1200, 0.7);
  } catch (compressErr) {
    console.warn("Client-side image compression prior to background edit failed, using original:", compressErr);
  }

  let response: Response;
  try {
    response = await fetch("/api/replace-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: preparedImage }),
    });
  } catch (err: any) {
    throw new Error(`Netzwerkverbindung fehlgeschlagen: ${err?.message || err}`);
  }

  const rawText = await response.text();
  let data: any = null;

  try {
    data = JSON.parse(rawText);
  } catch {
    // Response was NOT JSON (Requirement 4)
    throw new Error(
      `Server-Antwort ist kein gültiges JSON.\nHTTP-Status: ${response.status} ${response.statusText}\n\nAntwort-Text:\n${rawText || "(leer)"}`
    );
  }

  if (response.ok && data?.success && data?.image) {
    return data.image;
  }

  // Build real server error message with details (Requirements 1, 2, 3, 7)
  const httpStatus = data?.status || response.status;
  const modelName = data?.model || "gemini-3.1-flash-image";
  const errObj = typeof data?.error === "object" ? data.error : null;
  const errString = typeof data?.error === "string" ? data.error : null;

  const serverMessage = errObj?.message || errString || data?.message || "Hintergrund-Ersetzung fehlgeschlagen.";

  const detailsList: string[] = [];
  if (httpStatus) detailsList.push(`HTTP-Status: ${httpStatus}`);
  if (modelName) detailsList.push(`Modell: ${modelName}`);
  if (errObj?.name) detailsList.push(`Error.Name: ${errObj.name}`);
  if (errObj?.code) detailsList.push(`Error.Code: ${errObj.code}`);
  if (errObj?.status && errObj.status !== httpStatus) detailsList.push(`Error.Status: ${errObj.status}`);

  const detailsString = detailsList.length > 0 ? `\n\n[Details: ${detailsList.join(" | ")}]` : "";

  throw new Error(`${serverMessage}${detailsString}`);
}
