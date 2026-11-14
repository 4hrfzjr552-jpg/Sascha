import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 300 };
type EditMode = "auto" | "flatlay" | "detail" | "background";
type ImageKind = "full_front" | "full_back" | "detail" | "inventory" | "other";
type Background = "rug" | "white" | "light-gray" | "microcement" | "wood" | "original";

const backgrounds: Record<Background, string> = {
  rug: "A realistic warm beige / pale gray lightly mottled short-pile carpet, matching the layout example.",
  white: "A clean matte warm white photographic floor with soft real contact shadows; not a cut-out.",
  "light-gray": "A plain pale gray neutral matte floor with natural soft shadows.",
  microcement: "A very light gray-greige finely mottled matte microcement surface, no tile joints.",
  wood: "A pale neutral oak floor with subtle fine woodgrain and soft contact shadows.",
  original: "The SAME exact background from the input photo, cleaned only for lighting and framing.",
};

function parsePhoto(value: unknown, maxBytes: number) {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > maxBytes) return null;
  return { mimeType: match[1], data: match[2] };
}

function clean(value: unknown, limit = 900) {
  return typeof value === "string" ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g," ").trim().slice(0,limit) : "";
}

function parseJson(raw: string): any {
  const text = raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  try { return JSON.parse(text); }
  catch {
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Photo classification did not return JSON.");
    return JSON.parse(text.slice(start,end+1));
  }
}
function candidateModels(): string[] {
  return [...new Set([
    ...(process.env.FLATLAY_VISION_MODEL ? [process.env.FLATLAY_VISION_MODEL] : []),
    ...(process.env.GEMINI_MODELS || "gemini-3.8-flash,gemini-3.6-flash,gemini-3.1-flash-lite").split(","),
  ].map(s=>s.trim()).filter(Boolean))];
}

async function classifyImage(ai: GoogleGenAI, source: {mimeType:string;data:string}): Promise<ImageKind> {
  let error: unknown;
  for (const model of candidateModels()) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {text: `Classify this single seller-uploaded clothing photo. Return JSON {"kind":...,"confidence":...}.
"full_front": entire FRONT of a pair of pants from waistband to both hems.
"full_back": entire BACK of a pair of pants from waistband to both hems.
"detail": only part of clothing, e.g. waistband, patch, pocket, label, hem, close-up.
"inventory": packaging, grey bag, handwriting, article or stock number, even if denim partly visible.
"other": unrelated or too unclear. Do NOT confuse a close-up of a waistband with full pants.
Be conservative and say "other" when unsure. The bag can be anywhere in the photo order.`},
          {inlineData:source},
        ],
        config: {responseMimeType:"application/json",temperature:0,
          responseSchema:{type:Type.OBJECT,properties:{
            kind:{type:Type.STRING,enum:["full_front","full_back","detail","inventory","other"]},
            confidence:{type:Type.NUMBER},
          },required:["kind","confidence"]}},
      });
      const result = parseJson(response.text || "");
      const kind = result?.kind as ImageKind, confidence=Number(result?.confidence);
      if (!["full_front","full_back","detail","inventory","other"].includes(kind) ||
          !Number.isFinite(confidence) || confidence < 0.70) {
        throw new Error("Foto nicht eindeutig als Jeans oder Detailfoto erkannt.");
      }
      return kind;
    } catch(e) {
      error=e;
      console.warn("[flatlay] classifier fallback",model,String((e as any)?.message||e).slice(0,170));
    }
  }
  throw error || new Error("Bildtyp konnte nicht erkannt werden.");
}

/** Pure fail-closed decision. Bad/partial/untrusted model JSON is never approved. */
export function approvesProductEdit(review: unknown): boolean {
  if (!review || typeof review !== "object") return false;
  const r=review as Record<string,unknown>;
  const confidence=r.confidence;
  return r.approved === true &&
    typeof confidence === "number" &&
    Number.isFinite(confidence) && confidence >= 0.85 && confidence <= 1 &&
    r.sameGarment === true &&
    r.sameSide === true &&
    r.correctComposition === true &&
    Array.isArray(r.issues) && r.issues.length === 0;
}

export default async function handler(req:any,res:any) {
  if (req.method!=="POST") return res.status(405).json({success:false,error:"Methode nicht erlaubt."});
  const supabaseUrl=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey=process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const apiKey=process.env.GEMINI_API_KEY;
  if(!supabaseUrl||!supabaseKey||!apiKey) return res.status(503).json({success:false,error:"Flatlay-KI ist nicht konfiguriert."});
  const token=String(req.headers?.authorization||"").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return res.status(401).json({success:false,error:"Bitte anmelden."});
  try {
    const {data,error}=await createClient(supabaseUrl,supabaseKey).auth.getUser(token);
    if(error||!data.user)return res.status(401).json({success:false,error:"Sitzung abgelaufen. Bitte neu anmelden."});
  } catch(e) {
    console.error("[flatlay] auth",e);
    return res.status(503).json({success:false,error:"Anmeldung vorübergehend nicht verfügbar."});
  }
  let stage="Eingabebilder";
  try {
    let body=req.body;
    if(typeof body==="string"){try{body=JSON.parse(body);}catch{return res.status(400).json({success:false,error:"Ungültige JSON-Anfrage."});}}
    const main=parsePhoto(body?.image,2_500_000);
    const layout=body?.layoutReference ? parsePhoto(body.layoutReference,500_000) : null;
    if(!main) return res.status(413).json({success:false,error:"Jeansfoto ungültig oder zu groß (max. 2,5 MB)."});
    if(body?.layoutReference && !layout) return res.status(400).json({success:false,error:"Ungültige Flatlay-Layoutvorlage."});
    const support: Array<{mimeType:string;data:string}|null> = Array.isArray(body?.supportImages) ? body.supportImages.slice(0,2).map((s:unknown)=>parsePhoto(s,750_000)) : [];
    if(support.some(x=>!x)) return res.status(413).json({success:false,error:"Zusätzliche Produktfotos ungültig oder zu groß."});
    const mode: EditMode=["auto","flatlay","detail","background"].includes(body?.mode) ? body.mode : "auto";
    const background: Background = Object.hasOwn(backgrounds,body?.background) ? body.background : "rug";
    const d=body?.details&&typeof body.details==="object"?body.details:{};
    // Descriptions provide supplemental product identity ONLY; never use to
    // invent anything not actually visible in the uploaded original photo.
    const identity = `LISTING DATA (SECONDARY; SOURCE PHOTO ALWAYS OVERRIDES):
Title: ${clean(d.title,200)}
Description: ${clean(d.description,1600)}
Brand/model: ${clean(d.brand,90)} / ${clean(d.model,90)}
Cut/fit: ${clean(d.fit,100)} | Color/wash: ${clean(d.color,120)}
Size: ${clean(d.size,40)}
Measurements: ${clean(d.measurements,250)}
Seller notes/condition: ${clean(d.notes,450)}
These are garment-identity clues, NOT text to print on the picture. Ignore wrong, guessed or contradictory claims. Never copy article numbers, labels or logos from these words.`;
    const model=process.env.FLATLAY_MODEL||process.env.FITPIC_MODEL||"gemini-3.1-flash-image";
    const ai=new GoogleGenAI({apiKey,httpOptions:{timeout:100_000}});
    stage="Bildtyp-Erkennung";
    const kind=await classifyImage(ai,main);
    if(kind==="inventory"||kind==="other")
      return res.status(422).json({success:false,kind,error:"Artikelnummer-Tüte oder unpassendes Bild erkannt. Bitte echtes Jeans- oder Detailfoto wählen."});
    if(mode==="flatlay" && !["full_front","full_back"].includes(kind))
      return res.status(422).json({success:false,kind,error:"Für diese Flatlay-Anordnung muss die gesamte Jeans (Bund bis beide Säume) sichtbar sein. Für Bund-/Taschenfotos bitte „Verschönern“ wählen."});
    if(mode==="detail" && kind!=="detail")
      return res.status(422).json({success:false,kind,error:"Dies ist ein ganzes Hosenfoto. Für die gesamte Hose bitte Flatlay/Verschönern wählen."});

    const operation=mode==="auto" ? (kind==="detail"?"detail":"flatlay") : mode;
    const surface=backgrounds[background];
    const identityRules=`PRIORITY: The FIRST image is the exact physical garment / detail offered for sale. All other photos, if any, are supporting views of the SAME garment or a LAYOUT ONLY guide, never a replacement product. Keep the exact real color, authentic wear/fading/whiskering, stain marks, worn creases, stitching, waistband, hems, holes, fraying, labels, buttons, pocket edges, embroidery and branding. Never repair, whiten, iron out permanent wear marks or invent missing parts. No stock numbers, fake graphics, new labels, mannequins, people or unrelated garments.
No text overlay. Realistic reselling product photo.
${identity}`;
    const fullPrompt=`EDIT THIS PHOTO OF THE EXACT SAME JEANS, NOT A DIFFERENT OR GENERIC PAIR.
COMPOSITION: Photorealistic overhead 1:1 flatlay of the FULL SAME jeans.
A) Keep the BACK if source is back (${kind==="full_back"?"YES, THIS IS THE BACK":"the input determines orientation"}); keep FRONT if source is front. Preserve the same actual pocket design and placement.
B) Waistband horizontal at image TOP, both legs extend downward. A deliberate lightly folded / bent silhouette: EXACTLY TWO SOFT, NATURAL VISIBLE BENDS / KINKS IN EACH TROUSER LEG, one around upper knee and one at the lower calf. Count TWO PER LEG, not arbitrary wrinkles, but do not alter true leg length, width or flare.
C) At the BOTTOM, the two trouser leg openings / hems MUST JUST TOUCH at their INNER edges. Zero gap between the two inner bottom cuffs; do not overlap or merge them, and don't lose real frayed threads.
D) Lay the jeans orderly like a seller carefully arranged them, smooth incidental bunching and deep temporary rumples, not intentional wash marks or permanent wear. Preserve original wear and frayed hems!
E) Only use the separate template for the composition/background. Background: ${surface}
F) The jeans should stay the exact same garment; don't change the fit/model just to make the bends. FULL waistband and BOTH hems visible, natural shadows.
${identityRules}`;
    const detailPrompt=`STRICT DETAIL PHOTO RETOUCH, NOT A FULL FLATLAY.
This original shows ONLY a CLOSE-UP of the actual jeans (such as waistband, label, seam, embroidery, pocket, patch, cuff). Keep the SAME original close-up crop and subject, with the SAME field of view and proportions. NEVER draw an entire pair of trousers, a new leg, second cuff or new pockets.
Gently align the existing detail in frame, improve realistic exposure/white balance, smooth distracting temporary fabric bunches ONLY if safe, and use a clean realistic surface: ${surface}.
EVERY real garment feature and condition flaw must remain visibly unchanged. Do not alter, invent or rewrite label text or numbers, embroidery, defects, fading or seams.
${identityRules}`;
    const backgroundPrompt=`STRICT BACKGROUND-ONLY EDIT.
Keep all garment pixels/shape, original subject placement/crop, perspective, actual folds, colors, branding, stitching, wear and damage unchanged. Only swap the OUTSIDE surface surrounding the garment with: ${surface}. Keep realistic contact shadows; no artificial product reconstruction.
This can be a partial close-up or a full jeans image: do NOT zoom out, expand or straighten the actual garment.
${identityRules}`;

    stage="Bildgenerierung";
    const contents:any[]=[
      {text:"PRIMARY PRODUCT PHOTO: the actual jeans/pocket/waistband being sold, highest authority:"},
      {inlineData:main},
    ];
    for(const [i,photo] of support.entries()) {
      contents.push({text:`PRODUCT SUPPORT PHOTO ${i+1}: same real pair for cross-checking wash/brand details, not a new garment or view to render.`});
      contents.push({inlineData:photo!});
    }
    if(layout && operation==="flatlay") {
      contents.push({text:"COMPOSITION TEMPLATE ONLY: do not reproduce the different jeans from this example; only mimic its layout and carpet."});
      contents.push({inlineData:layout});
    }
    contents.push({text:operation==="flatlay"?fullPrompt:operation==="detail"?detailPrompt:backgroundPrompt});
    console.info("[flatlay] generating",{operation,kind,model,background,support:support.length});
    const generated=await ai.models.generateContent({
      model,contents,config:{responseModalities:["IMAGE"],imageConfig:{aspectRatio: operation==="detail"||operation==="background"?"1:1":"1:1"}},
    });
    let imageData: {mimeType:string;data:string}|undefined;
    for(const candidate of generated.candidates||[])for(const part of candidate.content?.parts||[]){
      if(part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data) {
        imageData={mimeType:part.inlineData.mimeType,data:part.inlineData.data};break;
      }
    }
    if(!imageData)return res.status(502).json({success:false,error:"Die Bild-KI hat kein Foto geliefert."});

    // A generation is NOT automatically accepted as faithful. Compare the real
    // source with the synthetic result independently. A vague rejection or a
    // crashed inspector must fail closed, not publish a different pair of jeans.
    stage="Unabhängige Originaltreue-Prüfung";
    let review: {
      approved?: boolean;
      confidence?: number;
      sameGarment?: boolean;
      sameSide?: boolean;
      correctComposition?: boolean;
      issues?: unknown;
    } | null=null;
    let reviewError: unknown;
    for(const checkModel of candidateModels()) {
      try {
        const checked=await ai.models.generateContent({
          model:checkModel,
          contents:[
            {text:`You are an INDEPENDENT strict visual reviewer for a second-hand jeans listing.
Picture ONE is the REAL unedited user photo. Picture TWO is an AI edited picture.
Operation: "${operation}". SOURCE classification: "${kind}".
Respond only with JSON: {"approved":boolean,"confidence":number,"sameGarment":boolean,"sameSide":boolean,"correctComposition":boolean,"issues":string[]}.
Reject if you cannot confidently recognize the SAME exact jeans/details in both, including side/front/back, pockets, seams, wash patterns, fading, patches, real text/embroidery, fraying, scratches and genuine flaws. Do not accept a generic similar-looking pair.
Reject if photo TWO shows a different visible trouser side than photo ONE.
In DETAIL mode, reject invented full trousers or substantially changed original close-up crop, logos/labels/text, stitching or damage.
In BACKGROUND mode, reject ANY substantial modification of the clothing itself, its position/shape/folds or zoom/crop. Only external ground may change. A realistic shadow is okay.
In FLATLAY mode, require entire pair from waistband to both hems, TWO clearly visible gentle directional bends in EACH leg (knee and calf), and INNER edges of BOTH bottom openings JUST TOUCH with no gap and no overlap or merging. The source garment identity, authentic wear, shape and hem width must remain true. Reject if the model merely copied the trousers/design from a layout reference.
If anything important is unclear, reject. Ignore minor harmless changes in natural illumination and loose temporary fabric ripples.
Set sameGarment, sameSide, correctComposition based on evidence. Approve only with confidence >= 0.85 and all three true with zero meaningful issues.`},
            {text:"REAL, ORIGINAL PRODUCT PHOTO:"},
            {inlineData:main},
            {text:"AI-EDITED CANDIDATE TO VERIFY:"},
            {inlineData:imageData},
          ],
          config:{
            responseMimeType:"application/json",
            temperature:0,
            responseSchema:{
              type:Type.OBJECT,
              properties:{
                approved:{type:Type.BOOLEAN},
                confidence:{type:Type.NUMBER},
                sameGarment:{type:Type.BOOLEAN},
                sameSide:{type:Type.BOOLEAN},
                correctComposition:{type:Type.BOOLEAN},
                issues:{type:Type.ARRAY,items:{type:Type.STRING}},
              },
              required:["approved","confidence","sameGarment","sameSide","correctComposition","issues"],
            },
          },
        });
        review=parseJson(checked.text||"");
        break;
      } catch(e) {
        reviewError=e;
        console.warn("[flatlay] independent QA fallback",checkModel,String((e as any)?.message||e).slice(0,140));
      }
    }
    if(!review) {
      console.error("[flatlay] independent QA unavailable",reviewError);
      return res.status(503).json({success:false,error:"KI-Originaltreue-Prüfung nicht erreichbar. Das bearbeitete Bild wurde sicherheitshalber verworfen. Original bleibt erhalten."});
    }
    const issues=Array.isArray(review.issues)
      ? review.issues.filter((issue:unknown):issue is string=>typeof issue==="string").slice(0,3)
      : [];
    const approved=approvesProductEdit(review);
    if(!approved) {
      console.warn("[flatlay] rejected AI candidate",{
        operation,kind,confidence:review.confidence,
        sameGarment:review.sameGarment,sameSide:review.sameSide,
        correctComposition:review.correctComposition,issues,
      });
      return res.status(422).json({
        success:false,
        error:"KI-Ergebnis weicht vom echten Foto oder von der gewünschten Anordnung ab und wurde verworfen."+
          (issues.length ? " Probleme: "+issues.map(v=>clean(v,110)).join("; ").slice(0,230) : "")+
          " Originalbild bleibt erhalten.",
      });
    }
    return res.status(200).json({
      success:true,
      image:`data:${imageData.mimeType};base64,${imageData.data}`,
      kind,operation,background,
      notice:"KI-Bild unbedingt mit den Originalfotos vergleichen. Originale bleiben erhalten.",
    });
  } catch(e:any) {
    const msg=String(e?.message||"").toLowerCase(),status=Number(e?.status||e?.statusCode||e?.error?.code||0);
    console.error("[flatlay] failed",{stage,status,message:msg.slice(0,450)});
    if(status===429||/quota|resource_exhausted/.test(msg))
      return res.status(429).json({success:false,error:"Gemini-Kontingent erreicht. Bilder sind unverändert."});
    if(status===404||/not found|not supported/.test(msg))
      return res.status(503).json({success:false,error:"Gemini-Modell nicht verfügbar. FLATLAY_MODEL / FLATLAY_VISION_MODEL prüfen."});
    if(stage==="Bildtyp-Erkennung")
      return res.status(503).json({success:false,error:"Bildtyp konnte gerade nicht sicher erkannt werden. Bitte erneut versuchen; es wurde nichts gespeichert."});
    return res.status(502).json({success:false,error:`KI-Bildoptimierung fehlgeschlagen (${stage}). Deine Originalfotos sind erhalten.`});
  }
}
