import { GoogleGenAI } from "@google/genai";
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
  try {
    const authClient = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ success: false, error: "Anmeldung abgelaufen. Bitte erneut anmelden." });
    }

    const { image, images, gender, variation, details } = req.body || {};
    const inputImages = Array.isArray(images) ? images : (typeof image === "string" ? [image] : []);
    if (inputImages.length < 2 || inputImages.length > 4) {
      return res.status(400).json({
        success:false,
        error:"Bitte 2 bis 4 Originalfotos der Jeans verwenden (ganze Vorderseite, Rückseite und Details)."
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

    // Give the model every valid garment reference, not just a waistband close-up.
    // The text between images tells it to infer the full front and back.
    const sourceContents: any[] = [];
    sources.forEach((source, i) => {
      sourceContents.push({text: `Original reference ${i + 1} of ${sources.length}: same real pair of jeans; use full-length front to establish cut and wash, all others to establish exact details.`});
      sourceContents.push({inlineData:{mimeType:source.mimeType,data:source.data}});
    });

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = process.env.FITPIC_MODEL || "gemini-3.1-flash-image";
    const response = await ai.models.generateContent({
      model,
      contents: [...sourceContents, { text: prompt }],
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

    // Second, independent visual check: reject the exact class of errors
    // reported by users (invented article numbers on pant legs and modified jeans).
    // This check is not infallible: the customer must still approve the preview.
    let review: any;
    try {
      const qa = await ai.models.generateContent({
        model: process.env.FITPIC_QA_MODEL || "gemini-2.5-flash",
        contents: [
          {text: `You are a STRICT secondhand clothing authenticity inspector. The first ${sources.length} images show the ORIGINAL real jeans from multiple angles. The FINAL IMAGE is an AI-generated try-on. Compare all original photos against the final image.
Return JSON only: {"approved": boolean, "confidence": number, "issues": string[]}.
Reject immediately if:
1. ANY added handwriting, digits, inventory/stock number or fake logo on the legs (especially large numbers like 109).
2. WRONG jeans: different wash, lightness/darkness, color, fade patches, missing details, back-pocket stitching or visibly changed leg width, bootcut/flare vs straight/slim.
3. Incorrectly changed rise/hem proportions or dramatically different pockets, branding or distressing.
4. Face uncovered, unnatural legs, fake-looking skin, professional fashion pose, or missing waistband/hems.
5. Cannot verify full pair of jeans from reference photos.
Use evidence from ALL original photos; strong color or fit mismatches are NEVER acceptable. Set approved=true only if faithfully reproduced, with confidence >=0.85; otherwise false. If unsure, reject. Response is JSON, no markdown.`},
          ...sourceContents,
          {text:"Final image to verify (generated try-on photo):"},
          {inlineData:{mimeType:generated.mimeType,data:generated.data}},
        ],
        config: { responseMimeType: "application/json" },
      });
      review = JSON.parse((qa.text || "").trim());
    } catch (checkError) {
      console.error("[generate-fitpic] automated quality check unavailable:", checkError);
      return res.status(503).json({
        success: false,
        error: "Fitpic-Prüfung fehlgeschlagen. Es wurde kein unkontrolliertes KI-Bild übernommen.",
      });
    }

    if (review?.approved !== true || typeof review.confidence !== "number" || review.confidence < 0.85) {
      console.warn("[generate-fitpic] rejected by review:", review?.issues);
      const detectedIssues = Array.isArray(review?.issues)
        ? review.issues.filter((item: unknown) => typeof item === "string").slice(0, 2)
        : [];
      return res.status(422).json({
        success: false,
        error: "KI-Fitpic wegen Qualitätsfehler abgelehnt" +
          (detectedIssues.length ? ": " + detectedIssues.join("; ").slice(0, 180) : ".") +
          " Bitte neu erstellen.",
      });
    }

    return res.status(200).json({
      success: true,
      image: `data:${generated.mimeType};base64,${generated.data}`,
    });
  } catch (error: any) {
    const rawStatus = Number(error?.status || error?.statusCode || 500);
    const status = [429, 503].includes(rawStatus) ? rawStatus : 500;
    console.error("[generate-fitpic]", error);
    return res.status(status).json({
      success: false,
      error: status === 429
        ? "KI-Bildlimit erreicht. Später erneut probieren."
        : "Fitpic konnte nicht erstellt werden. Originalbilder und Anzeige bleiben erhalten.",
    });
  }
}
