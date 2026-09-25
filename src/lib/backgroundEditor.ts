/**
 * Utility for Gemini AI background replacement
 */

/**
 * Main entrance for background replacement (calls server API /api/replace-background using Gemini).
 * Throws an explicit error if AI generation fails so the UI displays an error with retry option.
 */
export async function replaceBackground(imageDataUrl: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/replace-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageDataUrl }),
    });
  } catch (err: any) {
    throw new Error("Netzwerkverbindung fehlgeschlagen. Bitte erneut versuchen.");
  }

  const data = await response.json().catch(() => ({}));

  if (response.ok && data.success && data.image) {
    return data.image;
  }

  const errorMessage =
    data?.error ||
    "Hintergrund-Ersetzung durch KI fehlgeschlagen. Bitte versuche es erneut.";

  throw new Error(errorMessage);
}
