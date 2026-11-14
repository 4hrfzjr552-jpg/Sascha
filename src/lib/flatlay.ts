import type { PantImage, PantItem } from "../types";
import { compressDataUrl } from "./imageCompressor";
import { supabase } from "./supabase";
import { DEFAULT_FLATLAY_LAYOUT_REFERENCE } from "./flatlayReference";
import { enhanceOriginalPhoto } from "./photoEnhance";
import { createFlatlayPoseGuide } from "./flatlayPoseGuide";
import { FLUX_RESERVED_USD, getLocalFluxCap, reserveLocalFluxEstimate, releaseLocalFluxEstimate, type ImageProvider } from "./fluxBudget";

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
  provider?: ImageProvider;
  /** Select explicit source side, to avoid BACK reference turning FRONT. */
  sourceView?: "front" | "back";
  /** Experimental composition image. Disable for a one-reference test. */
  usePoseGuide?: boolean;
}

export interface BeautifyResult {
  image: PantImage;
  operation: Exclude<BeautifyMode,"auto"> | "natural";
  kind: "full_front" | "full_back" | "detail";
  background: BeautifyBackground;
  provider?: ImageProvider | "local";
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
  // For routine batch beautification, use deterministic pixels instead of
  // regenerating a different pair of jeans through a generative model.
  // Deliberate two-bend restyling remains available in explicit Flatlay mode.
  if (!options.mode || options.mode === "auto") {
    return {
      image: await enhanceOriginalPhoto(original),
      kind: "detail", // not used for local natural correction
      operation: "natural",
      background: "original",
      provider: "local",
    };
  }
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error("Bitte anmelden, um Jeansfotos zu verschönern.");
  const provider: ImageProvider = options.provider || "flux-klein";
  const compressed = await compressDataUrl(original.dataUrl, provider === "gemini" ? 1200 : 960, 0.74);
  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(compressed)) {
    throw new Error("Originalfoto konnte nicht geladen werden.");
  }
  // An unrelated view can unintentionally become the garment the image model
  // reproduces (e.g. a back-pocket view copied into a front-side photo).
  // The exact selected source image plus listing data are the only identity
  // inputs by default. Never mix another photo's pose into this edit.
  const mode = options.mode || "auto";
  if(mode === "flatlay" && provider !== "gemini" && !options.sourceView) {
    throw new Error("Bitte für FLUX zuerst Vorderseite oder Rückseite des echten Jeansfotos auswählen.");
  }
  const background = options.background || "rug";
  const layoutReference = mode === "flatlay"
    ? getFlatlayReference() || DEFAULT_FLATLAY_LAYOUT_REFERENCE : undefined;
  const descriptions = pant?.result?.detected;
  const measurements = pant?.measurements ? Object.entries(pant.measurements)
    .filter(([,v])=>Boolean(v)).map(([k,v])=>k+"="+v+" cm").join("; ") : "";

  const poseGuide = mode === "flatlay" && provider !== "gemini" && options.usePoseGuide !== false
    ? await createFlatlayPoseGuide() : undefined;
  const payload = {
    image: compressed,
    mode, background,
    provider,
    ...(poseGuide ? {poseGuide} : {}),
    ...(provider !== "gemini" ? {
      sourceView: options.sourceView,
      maxCostUsd: FLUX_RESERVED_USD[provider],
    } : {}),
    ...(provider === "gemini" && layoutReference ? {layoutReference} : {}),
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

  // Budget is a browser-only advisory meter. It cannot replace BFL credits
  // and is not synced across devices. Reserve before contacting paid API.
  let reservedLocal = false;
  if(provider !== "gemini") {
    reserveLocalFluxEstimate(provider,getLocalFluxCap());
    reservedLocal = true;
  }
  let response: Response;
  try {
    response = await fetch(provider === "gemini" ? "/api/optimize-flatlay" : "/api/flux-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch (e:any) {
    // On network uncertainty, keep the reservation: BFL might have accepted
    // and charged the job before the response was lost.
    throw new Error("Verbindung zur Foto-KI fehlgeschlagen: " + (e?.message || "Netzwerkfehler"));
  }
  const raw = await response.text();
  let data: {success?:boolean;image?:string;error?:string;kind?:string;operation?:string;chargeMayHaveOccurred?:boolean};
  try { data=JSON.parse(raw); }
  catch {
    const id=response.headers.get("x-vercel-id");
    const code=response.headers.get("x-vercel-error");
    throw new Error(`Foto-KI-Server (HTTP ${response.status}${code?" – "+code:""})${id?" · Request-ID: "+id:""}`);
  }
  if (!response.ok || !data.success || !data.image?.startsWith("data:image/")) {
    // Rejects before the provider accepted the job cannot consume BFL credits.
    if (reservedLocal && provider !== "gemini" &&
       (response.status === 401 || response.status === 400 || response.status === 503 ||
        (response.status === 402 && data.chargeMayHaveOccurred !== true) ||
        data.chargeMayHaveOccurred === false)) {
      releaseLocalFluxEstimate(provider);
    }
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
    provider,
  };
}
