// Shared by api/analyze-pant.ts (Vercel) and server.ts (local/Replit).
// The underscore prevents a public Vercel API route for this helper.
import { Type } from "@google/genai";

export const LISTING_RULES = `TITEL-REGELN (haben Vorrang vor alten benutzerdefinierten Prompts):
- Reihenfolge: Marke + Modell + Jeans/Kleidungsart + Herren/Damen + Größe + Schnitt + Farbe/Waschung.
- Beispiel: "Diesel Larkee Jeans Herren W32 L32 Straight Fit Blau Denim".
- Wichtigste Suchbegriffe zuerst. Ziel 60–95 Zeichen, maximal 100, aber NICHT mit erfundenen Worten auffüllen.
- Kleidungsart immer ausschreiben. Größe exakt wie auf dem echten Etikett, keine vermuteten Maße.
- Nur nachweisbare Marke, Modell, Farbe, Waschung und Fit aus den Fotos.
- Keine falschen Marken, Superlative, Emojis, Keyword-Stapel oder Verkaufspseudotexte.

BESCHREIBUNG:
- Erster Satz enthält nachweisbare Marke, Jeans/Kleidungsart, Damen/Herren, Größe und Farbe.
- Sichtbare Schäden ehrlich angeben. Keine erfundenen Eigenschaften.
- Keywords nur passend zum Kleidungsstück und keinen fremden Marken zuordnen.
- Keine Keyword-Spam-Wiederholungen und kein unpassender Y2K-/Vintage-Stil.

STRUKTURIERTE FELDER:
- gender: Herren oder Damen nur bei sicherer Erkennung; ansonsten Unbekannt.
- fit: sichtbaren Beinverlauf berücksichtigen, nicht das Keyword-Feld. Bei Unsicherheit Unbekannt.
- bagArticleNumber: ausschließlich die handgeschriebene Zahl auf Foto 5 (graue Tüte), nur Ziffern, sonst leerer String.
- Niemals Artikelnummern oder Texte als Design der Jeans interpretieren.`;

export const GENDER_VALUES = ["Herren","Damen","Unisex","Kinder","Unbekannt"];
export const FIT_VALUES = [
  "Straight","Regular","Slim","Skinny","Bootcut","Wide Leg","Baggy","Loose",
  "Tapered","Boyfriend","Mom","Cropped","High Waist","Ripped","Unbekannt"
];

export const detectedSchema = {
  type: Type.OBJECT,
  properties: {
    brand:{ type:Type.STRING },
    model:{ type:Type.STRING },
    gender:{ type:Type.STRING, enum:GENDER_VALUES },
    size:{ type:Type.STRING },
    color:{ type:Type.STRING },
    fit:{ type:Type.STRING, enum:FIT_VALUES },
    material:{ type:Type.STRING },
  },
  required:["brand","model","gender","size","color","fit","material"],
};

export function getCandidateModels(): string[] {
  const configured = (process.env.GEMINI_MODELS || "")
    .split(",").map(s=>s.trim()).filter(Boolean);
  // Stronger text/vision model first, lightweight fallback last.
  return configured.length ? configured : ["gemini-3.8-flash","gemini-3.6-flash","gemini-3.1-flash-lite"];
}
const errorText = (e:any) => String(e?.message||e?.error?.message||"");
const errorStatus = (e:any) => e?.status||e?.statusCode||e?.error?.code;
export function isRateLimit(e:any):boolean {
  const m=errorText(e).toLowerCase();
  return errorStatus(e)===429||m.includes("429")||m.includes("resource_exhausted")||m.includes("quota");
}
export async function generateWithFallback(
  ai:any, request:{ contents:any[]; config:any }
):Promise<any> {
  const models=getCandidateModels();
  let last:any,rate:any;
  for(let i=0;i<models.length;i++){
    try {
      const answer=await ai.models.generateContent({model:models[i],...request});
      if(answer?.text) return answer;
      last=new Error("Das KI-Modell lieferte keinen Text.");
    }catch(e:any){
      last=e;if(isRateLimit(e)) rate=e;
      console.warn("[Listing AI]", models[i], errorText(e).slice(0,100));
    }
    if(i<models.length-1) await new Promise(r=>setTimeout(r,400));
  }
  throw rate||last||new Error("Keine Antwort von Gemini.");
}
export function cleanBagNumber(raw:unknown):string {
  const s=String(raw??"").replace(/[#\s]/g,"");
  return /^\d{1,8}$/.test(s)?s:"";
}
