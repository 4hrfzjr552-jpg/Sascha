import type { PantImage, PantItem } from "../types";
import { compressDataUrl } from "./imageCompressor";
import { supabase } from "./supabase";
import { DEFAULT_FLATLAY_LAYOUT_REFERENCE } from "./flatlayReference";

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

export type BeautifyMode = "auto" | "flatlay" | "detail" | "background";
export type BeautifyBackground = "rug" | "white" | "light-gray" | "microcement" | "wood" | "original";
export const BACKGROUND_OPTIONS: { value: BeautifyBackground; label: string }[] = [
  {value:"rug",label:"Teppich wie Vorlage"},
  {value:"white",label:"Weiß"},
  {value:"light-gray",label:"Hellgrau"},
  {value:"microcement",label:"Mikrozement"},
  {value:"wood",label:"Helles Holz"},
  {value:"original",label:"Originalhintergrund"},
];

export interface BeautifyOptions {
  mode?: BeautifyMode;
  background?: BeautifyBackground;
}

export interface BeautifyResult {
  image: PantImage;
  operation: Exclude<BeautifyMode,"auto">;
  kind: "full_front" | "full_back" | "detail";
  background: BeautifyBackground;
}

/** The target photo is always sent FIRST and is the only garment authority.
 * Two extra original photos can reinforce garment identity, but never a photo
 * containing the handwritten inventory bag (#5 when there are five).
 */
export async function generateJeansFlatlay(
  original: PantImage,
  pant?: PantItem,
  options: BeautifyOptions = {},
): Promise<BeautifyResult> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error("Bitte anmelden, um Jeansfotos zu verschönern.");
  const compressed = await compressDataUrl(original.dataUrl, 1200, 0.74);
  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(compressed)) {
    throw new Error("Originalfoto konnte nicht geladen werden.");
  }
  // An unrelated view can unintentionally become the garment the image model
  // reproduces (e.g. a back-pocket view copied into a front-side photo).
  // The exact selected source image plus listing data are the only identity
  // inputs by default. Never mix another photo's pose into this edit.
  const mode = options.mode || "auto";
  const background = options.background || "rug";
  const layoutReference = mode === "auto" || mode === "flatlay"
    ? getFlatlayReference() || DEFAULT_FLATLAY_LAYOUT_REFERENCE : undefined;
  const descriptions = pant?.result?.detected;
  const measurements = pant?.measurements ? Object.entries(pant.measurements)
    .filter(([,v])=>Boolean(v)).map(([k,v])=>k+"="+v+" cm").join("; ") : "";

  const payload = {
    image: compressed,
    mode, background,
    ...(layoutReference ? {layoutReference} : {}),
    details: {
      title: pant?.result?.title,
      description: pant?.result?.description,
      brand: descriptions?.brand,
      model: descriptions?.model,
      fit: descriptions?.fit,
      size: descriptions?.size,
      color: descriptions?.color,
      measurements,
      notes: pant?.customNotes,
    },
  };
  if (JSON.stringify(payload).length > 3_650_000) {
    throw new Error("Bilddaten sind zu groß. Bitte kleinere Bilder verwenden.");
  }

  let response: Response;
  try {
    response = await fetch("/api/optimize-flatlay", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch (e:any) {
    throw new Error("Verbindung zur Foto-KI fehlgeschlagen: " + (e?.message || "Netzwerkfehler"));
  }
  const raw = await response.text();
  let data: {success?:boolean;image?:string;error?:string;kind?:string;operation?:string};
  try { data=JSON.parse(raw); }
  catch {
    const id=response.headers.get("x-vercel-id");
    const code=response.headers.get("x-vercel-error");
    throw new Error(`Foto-KI-Server (HTTP ${response.status}${code?" – "+code:""})${id?" · Request-ID: "+id:""}`);
  }
  if (!response.ok || !data.success || !data.image?.startsWith("data:image/")) {
    throw new Error(data.error || `Foto-KI fehlgeschlagen (HTTP ${response.status}).`);
  }
  const jpeg = await compressDataUrl(data.image, 1650, 0.84);
  if (!/^data:image\/jpeg;base64,/.test(jpeg))
    throw new Error("KI-Foto konnte nicht gespeichert werden.");
  return {
    image: {
      id:`flatlay-${original.id}`,
      dataUrl:jpeg,
      name:"optimiert.jpg",
      size:Math.floor((jpeg.length-jpeg.indexOf(",")-1)*3/4),
    },
    kind: ["full_front","full_back","detail"].includes(data.kind || "")
      ? data.kind as BeautifyResult["kind"] : "detail",
    operation: ["flatlay","detail","background"].includes(data.operation || "")
      ? data.operation as BeautifyResult["operation"] : "detail",
    background,
  };
}
