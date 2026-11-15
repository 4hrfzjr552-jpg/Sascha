import type { PantImage, PantItem } from "../types";
import { compressDataUrl } from "./imageCompressor";
import { FLUX_FITPIC_RESERVED_USD, getLocalFluxCap, reserveLocalFluxAmount, releaseLocalFluxAmount, type FluxProvider } from "./fluxBudget";
import { selectFitpicReferenceIndices, type TryonView, type TryonRole } from "./fitpicReferences";


export type FitpicGender = "men" | "women";

/**
 * Send all original pictures to the SERVER photo inspector, even if the
 * handwritten inventory bag was uploaded at position 1 instead of 5.
 * The inspector excludes inventory photos before image generation / QA.
 * No positioning assumption: a user's 5 existing photos are never altered.
 */
export function fitpicSourceImages(pant: Pick<PantItem, "images">): PantImage[] {
  return (pant.images || []).slice(0, 5).filter((img) => Boolean(img.dataUrl));
}

/** The model determines gender from structured analysis, never from a filename. */
export function detectFitpicGender(pant: PantItem): FitpicGender {
  const detected = pant.result?.detected;
  const value = [
    detected?.gender, pant.result?.title, detected?.model, detected?.brand,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/damen|frauen|female|women|woman|weiblich|miss sixty/.test(value)) return "women";
  if (/herren|männer|male|men|man|männlich/.test(value)) return "men";
  return "men";
}

export function fitpicVariationForPant(pant: PantItem): number {
  if (typeof pant.fitpicVariation === "number") return pant.fitpicVariation + 1;
  let hash = 0;
  for (const char of pant.id) hash = (Math.imul(31, hash) + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 8;
}

export interface FitpicGenerationOptions {
  provider?:FluxProvider;
  view?:TryonView;
  roles?:Record<string,TryonRole>;
}

/**
 * The fitpic generator now uses Black Forest Labs FLUX only.
 * No Gemini billing, no hidden background retries or extra QA models.
 * Every result remains UNAPPROVED until manually verified in PantCard.
 */
export async function generatePantFitpic(
  pant:PantItem,
  accessToken:string,
  options:FitpicGenerationOptions={},
):Promise<{fitpic:PantImage;variation:number}> {
  if(!accessToken)throw Error("Bitte erneut anmelden, um ein Fitpic zu erstellen.");
  const provider=options.provider||"flux-klein";
  if(provider!=="flux-klein"&&provider!=="flux-pro")throw Error("Unbekannter FLUX-Modus.");
  const view=options.view||"front";
  const selected=selectFitpicReferenceIndices(
    (pant.images||[]).map(i=>i.id),options.roles||{},view,
  );
  const originalReferences=selected.map(({index,role})=>({photo:pant.images[index],role}));
  const MAX_CHARS=3_200_000; // keep Vercel POST under ~4.5MB
  const levels=[
    {maxDimension:960,quality:0.73},
    {maxDimension:800,quality:0.67},
    {maxDimension:700,quality:0.60},
    {maxDimension:600,quality:0.53},
  ];
  let prepared:Array<{image:string;role:"front"|"back"|"detail"}>=[];
  for(const level of levels){
    prepared=await Promise.all(originalReferences.map(async ({photo,role})=>({
      image:await compressDataUrl(photo.dataUrl,level.maxDimension,level.quality),
      role,
    })));
    if(prepared.some(p=>!/^data:image\/(?:jpeg|png|webp);base64,/.test(p.image)))
      throw Error("Ein Originalfoto konnte nicht geladen werden.");
    if(prepared.reduce((acc,p)=>acc+p.image.length,0)<=MAX_CHARS)break;
  }
  if(prepared.reduce((acc,p)=>acc+p.image.length,0)>MAX_CHARS)
    throw Error("Originalbilder sind noch zu groß; bitte kleiner hochladen.");

  const reserveUsd=FLUX_FITPIC_RESERVED_USD[provider];
  const variation=fitpicVariationForPant(pant);
  reserveLocalFluxAmount(reserveUsd,getLocalFluxCap());
  let response:Response;
  try {
    response=await fetch("/api/flux-edit",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${accessToken}`},
      body:JSON.stringify({
        mode:"fitpic",provider,view,gender:detectFitpicGender(pant),
        variation,background:"original",maxCostUsd:reserveUsd,
        references:prepared,
      }),
    });
  } catch(e:any) {
    // An uncertain network error may occur after the paid provider accepted
    // the job; never automatically refund or resubmit on uncertainty.
    throw Error("Fitpic-Netzwerkfehler: "+String(e?.message||"Verbindung unterbrochen."));
  }
  const raw=await response.text();
  let data:{success?:boolean;image?:string;error?:string;chargeMayHaveOccurred?:boolean};
  try{data=JSON.parse(raw);}
  catch{
    throw Error(`Fitpic-Serverfehler (HTTP ${response.status}). Prüfe Vercel-Logs; kein automatischer Neuanlauf.`);
  }
  if(!response.ok||!data.success||!data.image?.startsWith("data:image/")){
    if(data.chargeMayHaveOccurred===false || [400,401,403,413,503].includes(response.status))
      releaseLocalFluxAmount(reserveUsd);
    throw Error(data.error||`Fitpic fehlgeschlagen (HTTP ${response.status}).`);
  }
  const mime=data.image.slice(5,data.image.indexOf(";"));
  if(!["image/png","image/jpeg","image/webp"].includes(mime))
    throw Error("Der Bildserver hat ein unzulässiges Format geliefert.");
  const extension=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";
  return {
    fitpic:{
      id:`fitpic-${pant.id}`,
      dataUrl:data.image,
      name:`fitpic.${extension}`,
      size:Math.floor((data.image.length-data.image.indexOf(",")-1)*0.75),
    },
    variation,
  };
}
