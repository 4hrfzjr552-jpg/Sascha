import { createClient } from "@supabase/supabase-js";

export const config={maxDuration:300};
type Provider="flux-klein"|"flux-pro";
type Operation="flatlay"|"detail"|"background";
const paths: Record<Provider,string>={
  "flux-klein":"flux-2-klein-4b",
  "flux-pro":"flux-2-pro",
};
const reserved:Record<Provider,number>={
  "flux-klein":0.025,"flux-pro":0.060,
};
const surfaces:Record<string,string>={
  rug:"a realistic warm beige and pale gray, softly mottled carpet",
  white:"an even clean matte warm white surface",
  "light-gray":"a neutral light-gray floor with realistic soft shadows",
  microcement:"a light gray-beige microcement surface",
  wood:"a pale oak floor with subtle woodgrain",
  original:"the exact original floor/background, unchanged",
};

function imageDataUrl(value:unknown,maxBytes:number) {
  if(typeof value!=="string")return null;
  const matched=value.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if(!matched)return null;
  const data=Buffer.from(matched[1],"base64");
  if(!data.length||data.length>maxBytes)return null;
  return matched[1];
}
function safeText(value:unknown,max=500) {
  return typeof value==="string" ? value.replace(/[\x00-\x1f]/g," ").slice(0,max).trim() : "";
}
function makePrompt(body:any): string {
  const operation=body.mode as Operation;
  const details=body.details && typeof body.details==="object" ? body.details : {};
  const identity=`PRODUCT DATA (secondary to real source photo):
Title: ${safeText(details.title,180)}
Description: ${safeText(details.description,1000)}
Brand/model: ${safeText(details.brand,90)} / ${safeText(details.model,90)}
Fit: ${safeText(details.fit,90)}. Color: ${safeText(details.color,90)}.
Size: ${safeText(details.size,50)}. Measurements: ${safeText(details.measurements,220)}
Treat ALL textual details as fallible clues, not facts to invent into a picture.`;
  const immutable=`The supplied FIRST image is the exact real second-hand jeans (or close-up) for sale. Preserve EXACT visible garment identity: same front or back view, pockets, cut, wash/fading, wrinkles that represent authentic wear, sewn-in labels and their text/positions, buttons, stitching, hems, fraying, rips, stains and damage. DO NOT invent a new garment or alter any brand logos or numbers. Do not hide defects. NO person, caption, watermarks, newly invented labels, or other garment. Realistic product photograph. ${identity}`;
  const surface=surfaces[body.background]||surfaces.rug;
  if(operation==="background")return `BACKGROUND ONLY: Replace ONLY the visible surface surrounding this ORIGINAL clothing close-up or jeans picture with ${surface}. Keep the exact source garment pixels/shape, FRONT/BACK, crop, alignment, folds, colours, markings and size as far as possible. Preserve precise camera angle and material imperfections. Don't redraw or rearrange the jeans. ${immutable}`;
  if(operation==="detail")return `CLOSE-UP JEANS DETAIL: The ORIGINAL is a close-up of real denim (waistband, patch, stitching, pocket or hem). Keep EXACT same close-up framing and subject; do NOT produce complete trousers. Improve subtle light and background (${surface}) without modifying printed text, labels, wash, wear, tears or embroidery. ${immutable}`;
  const view=body.sourceView==="front"?"FRONT":"BACK";
  const pockets=body.sourceView==="front"
    ? "Show only the authentic FRONT, including existing front fly and curved pockets. NEVER add rear seat pockets, yoke, rear labels or copy the BACK from a layout example."
    : "Show only the authentic BACK with its existing rear pockets and yoke. NEVER invent a front fly, front pockets or copied layout garments.";
  return `EXPERIMENTAL FULL TROUSERS FLATLAY of the SAME EXACT real denim in reference photo one. It is a ${view} view and MUST remain ${view}. ${pockets}
Lay the jeans on ${surface} from overhead, full waistband at top, two complete legs down to full hems.
Arrange with exactly TWO visible soft directional BENDS in EACH leg, one near the knee and one near lower calf. At bottom, the inner edges of BOTH leg openings MUST JUST TOUCH without overlap/merger.
Preserve exact garment details and condition: if repositioning requires inventing seams, wear, cuffs, pockets or waistband labels, prioritize authenticity over the bends.
Use layout description only; do not substitute the garment with another pair. ${immutable}`;
}

function validHost(value:string,allowed:string[]) {
  try{const url=new URL(value);return url.protocol==="https:"&&allowed.includes(url.hostname)&&!url.username&&!url.password;}catch{return false;}
}
export function acceptableBflPollUrl(value:string):boolean {
  try {
    const url=new URL(value);
    // BFL submits to api.bfl.ai but may return a task-polling endpoint
    // on a region-specific cluster, e.g. api.eu2.bfl.ai. Never synthesize
    // the result URL: honour the exact one returned by BFL.
    const validRegion=url.hostname==="api.bfl.ai" ||
      /^api\.(?:eu|us)\d*\.bfl\.ai$/.test(url.hostname);
    return url.protocol==="https:" && url.port==="" &&
      !url.username && !url.password && !url.hash &&
      validRegion && url.pathname==="/v1/get_result" &&
      Boolean(url.searchParams.get("id")) &&
      [...url.searchParams.keys()].every(key=>key==="id");
  }catch {return false;}
}
export function acceptableBflDownloadUrl(url:string):boolean {
  try{
    const host=new URL(url);
    return host.protocol==="https:" && !host.username&&!host.password &&
      (host.hostname==="bfldeliveryprod.blob.core.windows.net"||
       host.hostname.endsWith(".blob.core.windows.net")||
       host.hostname.endsWith(".bfl.ai"));
  }catch{return false;}
}
export function priceAllowed(provider:unknown,clientMax:unknown,serverMax:unknown):boolean {
  if(provider!=="flux-klein" && provider!=="flux-pro")return false;
  return typeof clientMax==="number" && Number.isFinite(clientMax) &&
    typeof serverMax==="number" && Number.isFinite(serverMax) &&
    clientMax>=reserved[provider] && serverMax>=reserved[provider];
}

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function bflJson(url:string,options:RequestInit) {
  const response=await fetch(url,{...options,redirect:"error",signal:AbortSignal.timeout(25_000)});
  const raw=await response.text();
  let result:any;
  try {result=JSON.parse(raw);}catch{throw new Error("BFL lieferte eine ungültige API-Antwort.");}
  if(!response.ok){
    const status=response.status;
    if(status===401)return Promise.reject(Object.assign(new Error("FLUX API-Schlüssel ungültig."),{status}));
    if(status===402)return Promise.reject(Object.assign(new Error("Keine FLUX-Credits vorhanden. Im BFL-Dashboard Guthaben prüfen."),{status}));
    if(status===429)return Promise.reject(Object.assign(new Error("FLUX-Anfragelimit erreicht. Bitte später versuchen."),{status}));
    throw Object.assign(new Error("FLUX-Anfrage nicht möglich (HTTP "+status+")."),{status});
  }
  return result;
}

export default async function handler(req:any,res:any) {
  if(req.method!=="POST")return res.status(405).json({success:false,error:"Nur POST erlaubt."});
  const key=process.env.BFL_API_KEY;
  if(!key)return res.status(503).json({success:false,error:"FLUX ist noch nicht eingerichtet. Bitte BFL_API_KEY in Vercel hinterlegen."});
  const supabaseUrl=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const supabaseKey=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
  if(!supabaseUrl||!supabaseKey)return res.status(503).json({success:false,error:"Anmeldung ist nicht konfiguriert."});
  const bearer=String(req.headers?.authorization||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!bearer)return res.status(401).json({success:false,error:"Bitte in Sascha AI anmelden."});
  try{
    const {data,error}=await createClient(supabaseUrl,supabaseKey).auth.getUser(bearer);
    if(error||!data.user)return res.status(401).json({success:false,error:"Sitzung abgelaufen; bitte neu anmelden."});
  }catch{
    return res.status(503).json({success:false,error:"Anmeldedienst nicht erreichbar."});
  }
  let body:any=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body);}catch{return res.status(400).json({success:false,error:"Ungültige Anfrage."});}}
  if(!body||typeof body!=="object")return res.status(400).json({success:false,error:"Bilddaten fehlen."});
  const provider:Provider=body.provider;
  const mode:Operation=body.mode;
  const source=imageDataUrl(body.image,2_000_000);
  if(!source)return res.status(413).json({success:false,error:"Originalfoto ungültig oder zu groß."});
  if(!["flatlay","detail","background"].includes(mode))return res.status(400).json({success:false,error:"Ungültiger Bearbeitungsmodus."});
  if(mode==="flatlay" && !["front","back"].includes(body.sourceView))
    return res.status(400).json({success:false,error:"Bitte vor dem Flatlay Vorderseite oder Rückseite des Originalfotos auswählen."});
  if(!Object.hasOwn(surfaces,body.background))return res.status(400).json({success:false,error:"Ungültiger Hintergrund."});
  const serverMax=Number(process.env.BFL_MAX_REQUEST_USD||0.06);
  if(!priceAllowed(provider,body.maxCostUsd,serverMax))
    return res.status(402).json({success:false,error:"Der gewählte FLUX-Modus überschreitet das Preislimit pro Foto."});

  // For <=1MP original, ~1MP output; optional layout reference deliberately
  // omitted so a reference BACK image cannot turn FRONT jeans into BACK.
  // There are NO expensive retries or Gemini QA in this provider.
  const url="https://api.bfl.ai/v1/"+paths[provider];
  let submitted=false;
  try {
    const created=await bflJson(url,{
      method:"POST",
      headers:{"Content-Type":"application/json","accept":"application/json","x-key":key},
      body:JSON.stringify({
        prompt:makePrompt(body),
        input_image:source,
        width:992,height:992,output_format:"jpeg",
        safety_tolerance:2,
      }),
    });
    submitted=true;
    const pollingUrl=String(created?.polling_url||"");
    if(!acceptableBflPollUrl(pollingUrl)) {
      // Log only a safe hostname, never the URL, generation ID or API key.
      let host="invalid";
      try{host=new URL(pollingUrl).hostname.slice(0,100);}catch{/* malformed */}
      console.warn("[flux-edit] rejected polling origin",{provider,host});
      throw new Error("Ungültige FLUX-Polling-Adresse. Bild wurde nicht übernommen.");
    }
    const start=Date.now();
    while(Date.now()-start<95_000){
      const polled=await bflJson(pollingUrl,{method:"GET",headers:{"accept":"application/json","x-key":key}});
      if(polled.status==="Ready"){
        const downloadUrl=String(polled.result?.sample||"");
        if(!acceptableBflDownloadUrl(downloadUrl))
          throw new Error("Unerwartete FLUX-Bildadresse. Aus Sicherheitsgründen nicht geladen.");
        const image=await fetch(downloadUrl,{redirect:"error",signal:AbortSignal.timeout(30_000)});
        if(!image.ok)throw new Error("FLUX-Bild konnte nicht geladen werden.");
        const type=String(image.headers.get("content-type")||"").split(";")[0];
        if(!["image/jpeg","image/png","image/webp"].includes(type))
          throw new Error("FLUX lieferte kein gültiges Bild.");
        const buffer=Buffer.from(await image.arrayBuffer());
        if(buffer.length===0||buffer.length>9_000_000)
          throw new Error("FLUX-Ausgabebild ist leer oder zu groß.");
        return res.status(200).json({
          success:true,image:`data:${type};base64,${buffer.toString("base64")}`,
          provider,operation:mode,background:body.background,
          kind:mode==="detail"?"detail":body.sourceView==="front"?"full_front":"full_back",
          notice:"FLUX ist generative KI. Vor dem Vinted-Export Original und Markenmerkmale genau prüfen.",
        });
      }
      if(["Error","Failed","Request Moderated","Content Moderated"].includes(polled.status))
        throw new Error("FLUX konnte das Foto nicht erzeugen ("+polled.status+").");
      await delay(1300);
    }
    throw new Error("FLUX bearbeitet das Bild zu lange. Bitte Guthaben/Verlauf im BFL-Dashboard prüfen; keine automatische Wiederholung.");
  }catch(e:any){
    const status=Number(e?.status||0);
    console.error("[flux-edit] request error",{provider,mode,submitted,status,message:String(e?.message||e).slice(0,210)});
    return res.status(status===402?402:status===429?429:status===401?502:502).json({
      success:false,
      error:String(e?.message||"FLUX-Bildgenerierung fehlgeschlagen.").slice(0,300),
      chargeMayHaveOccurred:submitted,
    });
  }
}
