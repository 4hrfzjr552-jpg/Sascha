import { GoogleGenAI, Type } from "@google/genai";
import { getCandidateModels } from "./_listingRules";
import { fitpicCheckErrorMessage, parseFitpicJson, pickJeansReferences, validateFitpicReview } from "./_fitpicChecks";
import { createClient } from "@supabase/supabase-js";

/**
 * Generates ONE synthetic try-on photo. Source photos remain untouched.
 * The endpoint requires an authenticated Supabase session to limit API abuse.
 */
// Deliberately mundane backgrounds, not fashion/editorial settings.
const ROOMS = [
  "an ordinary bright bedroom with a white wardrobe, pale wooden floor and simple mirror",
  "a small clean bedroom with a white dresser and a partly visible bed",
  "a simple apartment room with a standing mirror and plain white wall",
  "a normal bedroom with light laminate floor and a narrow white wardrobe",
  "a modest bedroom with a closed door, white furniture and a tall mirror",
  "a regular apartment bedroom with a chest of drawers and a window out of frame",
  "a simple bright hallway with a normal full-length mirror and pale floor",
  "a plain bedroom with neutral walls, a closed wardrobe and a basic bed",
];
const POSES = [
  "feet naturally shoulder-width apart, relaxed shoulders, phone casually covering the whole face",
  "one foot a little ahead of the other, free arm hanging naturally, face hidden by the phone",
  "feet together, slight asymmetry, no fashion pose, phone fully covering the face",
  "slight body angle, relaxed posture, free hand at the side, face hidden by the phone",
  "straight-on casual full-length selfie, knees relaxed, phone fully over the face",
  "ordinary standing pose, little shift in weight, phone hiding the face",
  "subtle three-quarter stance like an everyday seller, phone obscuring the face",
  "simple standing mirror selfie with one arm resting at the side, face obscured",
];

function clean(value: unknown, max = 90): string {
  return typeof value === "string" ? value.replace(/[\r\n<>]/g, " ").slice(0, max).trim() : "";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Methode nicht erlaubt." });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !supabaseKey || !geminiKey) {
    return res.status(503).json({
      success: false,
      error: "Fitpics sind nicht konfiguriert: Supabase- und Gemini-Umgebungsvariablen prüfen.",
    });
  }

  const token = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ success: false, error: "Bitte erneut anmelden." });
  }
  let stage = "Authentifizierung";
  const invocationStart = Date.now();
  try {
    const authClient = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ success: false, error: "Anmeldung abgelaufen. Bitte erneut anmelden." });
    }

    stage = "Referenzbilder vorbereiten";
    const { image, images, gender, variation, details } = req.body || {};
    const inputImages = Array.isArray(images) ? images : (typeof image === "string" ? [image] : []);
    if (inputImages.length < 2 || inputImages.length > 5) {
      return res.status(400).json({
        success:false,
        error:"Bitte 2 bis 5 Fotos hochladen. Das Tütenbild wird automatisch herausgefiltert."
      });
    }
    const sources: Array<{mimeType:string; data:string}> = [];
    let totalBytes = 0;
    for (const input of inputImages) {
      if (typeof input !== "string") {
        return res.status(400).json({success:false,error:"Ungültiges Originalfoto."});
      }
      const parsed = input.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!parsed) {
        return res.status(400).json({
          success:false,error:"Alle Fotos müssen JPEG-, PNG- oder WebP-Bilddaten sein."
        });
      }
      const length = Buffer.from(parsed[2], "base64").length;
      if (!length || length > 2_500_000) {
        return res.status(413).json({success:false,error:"Mindestens ein Foto ist zu groß (über 2,5 MB)."});
      }
      totalBytes += length;
      sources.push({mimeType:parsed[1],data:parsed[2]});
    }
    console.info("[generate-fitpic] source images", { count: sources.length, totalBytes });
    if (totalBytes > 6_000_000) {
      return res.status(413).json({success:false,error:"Originalfotos insgesamt zu groß. Bitte komprimieren."});
    }

    const female = gender === "women";
    const index = Math.abs(Math.trunc(Number(variation) || 0)) % ROOMS.length;
    const persona = female
      ? "The SAME recurring fictional adult woman, about 25, medium-length dark brown hair, medium build, natural proportions, wearing a plain white fitted T-shirt and simple white sneakers."
      : "The SAME recurring fictional adult man, about 25, short tousled medium-brown hair, medium build, natural proportions, wearing a plain white cotton T-shirt and plain white sneakers.";
    const meta = [
      clean(details?.brand),
      clean(details?.model),
      clean(details?.size),
      clean(details?.color),
      clean(details?.fit),
    ].filter(Boolean).join(", ");

    const prompt = `Create EXACTLY ONE photorealistic vertical 3:4 mirror selfie, with the SAME PHYSICAL JEANS shown in the attached original reference photos. This is a virtual try-on for a secondhand item, NOT a request to design similar trousers.

The reference photos are of ONE PAIR and have DIFFERENT PURPOSES. Identify which original photo shows the complete FRONT from waist to bottom hems; use that as the primary silhouette and color reference even if it is not the first attachment. Identify the BACK view and close-up shots as additional physical evidence for pocket design, stitching, brand patch, fade placement and waistband. NEVER use any photo of an inventory bag. All submitted attachments depict the real jeans.

NON-NEGOTIABLE FIDELITY:
- Transfer precisely the original lightness/darkness, denim color, faded areas, waist/rise, inseam proportions, leg opening and width, pocket placement, stitches, distressing, hems and bootcut/straight/slim silhouette.
- If the source shows light pale-blue flared jeans, NEVER output ordinary medium-blue straight jeans. Do not make legs narrower or alter the silhouette to make the person look fashionable.
- Keep the original brand and visible labels only if present on the pants, but never invent readable labels or logos.
- ABSOLUTELY NO extra writing, digits, handwritten inventory numbers, pen marks, annotations, text overlays, stickers or made-up branding on the clothing. Numbers on the bag/notes are NOT part of the denim.
- Do not borrow denim designs from your learned generic fashion patterns. If a detail is unclear, use a realistic plain continuation, never a conspicuous invented feature.
- If accurate reproduction is impossible, do not intentionally substitute different pants.

PERSON: ${persona}. An adult everyday person, no fashion modeling. Keep face fully obscured by smartphone.
POSE: ${POSES[index]}.
ROOM: ${ROOMS[index]}.

CASUAL PHOTO LOOK: ordinary private bedroom mirror selfie, simple white shirt and everyday white sneakers, uneven natural window light, natural creases, relaxed posture and imperfect handheld smartphone framing. Entire waistband, full legs and both hems and shoes visible. Not cinematic, not studio, not professional, no fashion editorial, no stylization, no glossy skin, no additional garments or artificial objects.

The final image must depict one person wearing the EXACT JEANS from the photos as closely as possible. RETURN ONLY THE IMAGE.`;

    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: { timeout: 65_000 },
    });
    const model = process.env.FITPIC_MODEL || "gemini-3.1-flash-image";
    const candidateModels = Array.from(new Set([
      ...(process.env.FITPIC_QA_MODEL ? [process.env.FITPIC_QA_MODEL.trim()] : []),
      ...getCandidateModels(),
    ].filter(Boolean)));

    // Vinted listing recognition also uses these text/vision Gemini models.
    // Fall back if one is retired, has no JSON output, or has a temporary error.
    async function inspectJson(contents: any[], schema: any, stage: string): Promise<any> {
      let lastError: any;
      for (const inspectionModel of candidateModels) {
        try {
          const answer = await ai.models.generateContent({
            model: inspectionModel,
            contents,
            config: {
              responseMimeType: "application/json",
              responseSchema: schema,
              temperature: 0,
            },
          });
          const raw = (answer.text || "").trim();
          if (!raw) throw new Error("KI hat keine Prüfdaten zurückgegeben.");
          return parseFitpicJson(raw);
        } catch (error: any) {
          lastError = error;
          console.warn("[generate-fitpic] " + stage + " with " + inspectionModel + " failed:", String(error?.message || error).slice(0, 250));
        }
      }
      throw lastError || new Error("Kein KI-Prüfmodell verfügbar.");
    }

    // Content-based inspection: unlike the previous fixed first-four-photo
    // slice, this reliably supports a stock-number bag at ANY photo position.
    // Even a handwritten inventory note with jeans underneath is classified
    // as inventory; we do not send it to the image generation model.
    const scanContents: any[] = [{
      text: `You are sorting ${sources.length} user-uploaded photos of ONE actual used pair of jeans.
For EVERY input photo, assign exactly one kind:
- "inventory": gray/white shipping or storage BAG, handwritten digits, stock-number note, tag card or packaging as the main subject, including if garment is partially visible.
- "full_front": complete jeans FRONT visible from waistband to BOTH hems.
- "full_back": complete jeans BACK visible from waistband to BOTH hems.
- "detail": real denim photo showing only part of the jeans (pocket, waist, seam, patch, leg, close-up).
- "other": unrelated photo or too unclear to classify.
Use ONE-BASED index matching the photo number, every photo exactly once.
Confidence is 0..1 for the assigned kind. If unsure, express uncertainty instead of guessing.
Do NOT assume the bag is the last photo. It can be FIRST.
Return JSON {"photos":[{"index":1,"kind":"inventory","confidence":0.99},...]} with ALL indices.`,
    }];
    sources.forEach((source, i) => {
      scanContents.push({ text: "INPUT PHOTO " + (i + 1) + " OF " + sources.length + ":" });
      scanContents.push({ inlineData: { mimeType: source.mimeType, data: source.data } });
    });
    let selectedIndices: number[];
    stage = "Jeans-Fotos auswählen";
    try {
      const classification = await inspectJson(scanContents, {
        type: Type.OBJECT,
        properties: {
          photos: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                index: { type: Type.INTEGER },
                kind: { type: Type.STRING, enum: ["inventory", "full_front", "full_back", "detail", "other"] },
                confidence: { type: Type.NUMBER },
              },
              required: ["index", "kind", "confidence"],
            },
          },
        },
        required: ["photos"],
      }, "photo sorting");
      selectedIndices = pickJeansReferences(classification, sources.length);
    } catch (sortError: any) {
      console.error("[generate-fitpic] photo selection failed:", sortError);
      const message = String(sortError?.message || "");
      const inputProblem = /Foto|Original|Jeans|Vorderseite|uneindeutig/i.test(message);
      return res.status(inputProblem ? 422 : 503).json({
        success: false,
        error: inputProblem ? message : fitpicCheckErrorMessage(sortError, "Jeans-Fotoerkennung"),
      });
    }

    console.info("[generate-fitpic] photo sorting complete", { includedIndices: selectedIndices.map(i => i + 1), elapsedMs: Date.now() - invocationStart });
    const referenceContents: any[] = [];
    selectedIndices.forEach((sourceIndex, i) => {
      const source = sources[sourceIndex];
      referenceContents.push({ text: `GARMENT REFERENCE ${i + 1}: authentic jeans photo ${sourceIndex + 1}, NOT an inventory bag. The first reference should show full front.` });
      referenceContents.push({ inlineData: { mimeType: source.mimeType, data: source.data } });
    });
    stage = "Jeans-Fitpic generieren";
    console.info("[generate-fitpic] generating fitpic", { model, references: selectedIndices.length, elapsedMs: Date.now() - invocationStart });
    const response = await ai.models.generateContent({
      model,
      contents: [...referenceContents, { text: prompt + "\\nFollow the attached garment reference images ONLY. Inventory bag photos were excluded by an earlier inspection. Metadata (secondary, only if it matches the photos): " + (meta || "none") }],
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4" } },
    });
    let generated: { data: string; mimeType: string } | null = null;
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data && part.inlineData?.mimeType?.startsWith("image/")) {
          generated = { data: part.inlineData.data, mimeType: part.inlineData.mimeType };
          break;
        }
      }
      if (generated) break;
    }
    if (!generated) {
      return res.status(502).json({ success: false, error: "Die Bild-KI hat kein Foto geliefert." });
    }

    // Independent quality check compares ALL selected real garment references.
    // A broken reviewer never causes an unverified photo to be accepted.
    stage = "Fitpic-Qualitätsprüfung";
    console.info("[generate-fitpic] starting quality review", { elapsedMs: Date.now() - invocationStart });
    let review: { approved: boolean; confidence: number; issues: string[] };
    try {
      const rawReview = await inspectJson([
        { text: `You are a strict quality inspector of a virtual try-on for a second-hand garment.
The FIRST ${selectedIndices.length} attachments are different views of the SAME REAL JEANS.
The FINAL attachment is a synthetic mirror selfie. Return JSON with approved:boolean, confidence:number between 0 and 1, issues:string[].
APPROVE ONLY if the actual trousers are reproduced faithfully: matching wash, color, fit, leg width, flare/bootcut vs straight, rise, pockets, seams, length, hems, branding, tears and visible signs of wear.
REJECT if any prominent printed/handwritten numbers, inventory marks, fake labels or details have appeared on jeans.
REJECT if original wash or leg shape changed; the face is visible, anatomy unnatural, garment blurry or cropped.
Always reject if you cannot verify the item identity or full silhouette from references.
Do NOT require hidden back pockets to be visible from a frontal mirror selfie. Ignore minor natural lighting differences.
APPROVE only if confident >=0.85 and there are ZERO meaningful issues; otherwise reject.
No invented approval. Always return the full structured response.` },
        ...referenceContents,
        { text: "FINAL GENERATED PHOTO TO INSPECT AGAINST ABOVE REAL JEANS:" },
        { inlineData: { mimeType: generated.mimeType, data: generated.data } },
      ], {
        type: Type.OBJECT,
        properties: {
          approved: { type: Type.BOOLEAN },
          confidence: { type: Type.NUMBER },
          issues: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["approved", "confidence", "issues"],
      }, "image quality check");
      review = validateFitpicReview(rawReview);
    } catch (checkError: any) {
      console.error("[generate-fitpic] quality inspection failed:", checkError);
      return res.status(503).json({
        success: false,
        error: fitpicCheckErrorMessage(checkError, "Fitpic-Prüfung"),
      });
    }

    console.info("[generate-fitpic] review complete", { approved: review.approved, confidence: review.confidence, elapsedMs: Date.now() - invocationStart });
    if (!review.approved) {
      console.warn("[generate-fitpic] image quality rejected:", review.issues, "confidence", review.confidence);
      return res.status(422).json({
        success: false,
        error: "KI-Fitpic wegen Abweichung von der echten Jeans abgelehnt" +
          (review.issues.length ? ": " + review.issues.map(issue => clean(issue, 80)).join("; ").slice(0, 180) : ".") +
          " Bitte Originalfotos prüfen oder Fitpic erneut erstellen.",
      });
    }

    return res.status(200).json({
      success: true,
      image: `data:${generated.mimeType};base64,${generated.data}`,
    });
  } catch (error: any) {
    const rawStatus = Number(error?.status || error?.statusCode || 500);
    const status = [429, 503].includes(rawStatus) ? rawStatus : 500;
    console.error("[generate-fitpic] failed", { stage, elapsedMs: Date.now() - invocationStart }, error);
    return res.status(status).json({
      success: false,
      error: status === 429
        ? "KI-Bildlimit erreicht. Später erneut probieren."
        : `Fitpic fehlgeschlagen bei: ${stage}. Details stehen in den Vercel-Logs; Originalbilder und Anzeige bleiben erhalten.`,
    });
  }
}
