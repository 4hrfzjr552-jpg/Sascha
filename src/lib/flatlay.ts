import type { PantImage } from "../types";
import { compressDataUrl } from "./imageCompressor";
import { supabase } from "./supabase";

const REFERENCE_KEY = "sascha-flatlay-layout-reference-v1";

export function getFlatlayReference(): string | null {
  try {
    const saved = window.localStorage.getItem(REFERENCE_KEY);
    return saved && /^data:image\/(?:jpeg|png|webp);base64,/.test(saved) ? saved : null;
  } catch { return null; }
}

/** The reference never replaces the source jeans; it supplies layout only. */
export async function saveFlatlayReference(input: string): Promise<void> {
  const prepared = await compressDataUrl(input, 360, 0.68);
  if (!/^data:image\/jpeg;base64,/.test(prepared) || prepared.length > 250_000) {
    throw new Error("Layout-Vorlage ist ungültig oder zu groß.");
  }
  try { window.localStorage.setItem(REFERENCE_KEY, prepared); }
  catch { throw new Error("Layout-Vorlage konnte in diesem Browser nicht gespeichert werden."); }
}

export function clearFlatlayReference() {
  try { window.localStorage.removeItem(REFERENCE_KEY); } catch { /* private mode */ }
}

export async function generateJeansFlatlay(original: PantImage): Promise<PantImage> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error("Bitte anmelden, um Flatlays zu generieren.");

  const originalCompressed = await compressDataUrl(original.dataUrl, 1200, 0.76);
  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(originalCompressed)) {
    throw new Error("Originalbild konnte nicht geladen werden. Bitte neu öffnen.");
  }
  const layoutReference = getFlatlayReference() || undefined;
  let response: Response;
  try {
    response = await fetch("/api/optimize-flatlay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image: originalCompressed, ...(layoutReference ? { layoutReference } : {}) }),
    });
  } catch (error: any) {
    throw new Error("Verbindung zur Flatlay-KI fehlgeschlagen: " + (error?.message || "Netzwerkfehler"));
  }
  const text = await response.text();
  let data: { success?: boolean; image?: string; error?: string };
  try { data = JSON.parse(text); }
  catch {
    const code = response.headers.get("x-vercel-error") || "";
    const reqId = response.headers.get("x-vercel-id") || "";
    throw new Error(`Flatlay-Serverfehler (HTTP ${response.status}${code ? " – " + code : ""})${reqId ? " · Request-ID: " + reqId : ""}.`);
  }
  if (!response.ok || !data.success || !data.image?.startsWith("data:image/")) {
    throw new Error(data.error || `Flatlay-KI fehlgeschlagen (HTTP ${response.status}).`);
  }
  // Generate a portable JPEG for Supabase storage and the Vinted export.
  const jpeg = await compressDataUrl(data.image, 1650, 0.86);
  if (!/^data:image\/jpeg;base64,/.test(jpeg)) throw new Error("Flatlay-Ergebnis konnte nicht gespeichert werden.");
  return {
    id: `flatlay-${original.id}`,
    dataUrl: jpeg,
    name: "flatlay.jpg",
    size: Math.floor((jpeg.length - jpeg.indexOf(",") - 1) * 3 / 4),
  };
}
