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

    const { image, gender, variation, details } = req.body || {};
    if (typeof image !== "string") {
      return res.status(400).json({ success: false, error: "Ein Originalfoto der Jeans fehlt." });
    }
    const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      return res.status(400).json({ success: false, error: "Bitte ein gültiges JPEG-, PNG- oder WebP-Bild verwenden." });
    }
    const binary = Buffer.from(match[2], "base64");
    if (!binary.length || binary.length > 2_500_000) {
      return res.status(413).json({ success: false, error: "Originalfoto ist zu groß (maximal 2,5 MB)." });
    }

    const female = gender === "women";
    const index = Math.abs(Math.trunc(Number(variation) || 0)) % ROOMS.length;
    const persona = female
      ? "The SAME recurring fictional adult woman, about 25, medium-length dark brown hair, medium build, natural proportions, wearing a plain white fitted T-shirt and simple white sneakers."
      : "The SAME recurring fictional adult man, about 25, short tousled medium-brown hair, medium build, natural proportions, wearing a plain white cotton T-shirt and plain white sneakers.";
    const meta = [
      clean(details?.brand),
      clean(details?.model),
      clean(details?.color),
      clean(details?.fit),
    ].filter(Boolean).join(", ");

    const prompt = `You are doing an accurate virtual try-on of an EXISTING second-hand pair of jeans from the reference photo. Produce exactly ONE vertical 3:4 ordinary mirror selfie. The jeans MUST match the attached source, which is a PRODUCT REFERENCE PHOTO, not a styling reference.

NON-NEGOTIABLE ITEM FIDELITY:
- Keep denim color, wash, faded patches, leg width, fit, rise, length, hems, pockets, stitching, wrinkles, rips and signs of wear as close as possible to the reference. Do not redesign the jeans, make them slimmer, recolor them or give them a new fit.
- ABSOLUTELY NO NEW WRITING, LETTERS, NUMBERS, HANDWRITTEN INVENTORY LABELS, LARGE LOGOS OR MARKS ANYWHERE ON THE JEANS. If a number or handwritten writing exists in the reference photo outside the garment, it is ONLY an inventory note and MUST NOT appear on the jeans. Never paint an article number such as 109 on any thigh or pant leg. Existing small authentic brand labels may stay only if visibly present in source.
- No drawings, no overlay text, no price tags, no advertisement, no fake decorations.
- If a garment detail cannot be seen, render a plain realistic continuation rather than inventing embellishments.
- Do not change the photographed pants to another design. Reference item: ${meta || "jeans in attached product photo"}.

SCENE: A non-professional private seller's casual phone snapshot, not modeling. ${ROOMS[index]}. Ordinary daylight and slightly imperfect mobile phone exposure. No staged pose, no studio, no flashy lighting, no symmetrical editorial look, no idealized skin or body proportions, no unnatural pose or AI-looking texture.

PERSON: ${persona}
POSE: ${POSES[index]}.
PHONE: Must obscure the ENTIRE FACE, including eyes, nose and mouth; no visible face to recognize. The phone must be in one hand reflected in the mirror, normal smartphone size. Keep the full jeans from waistband to both cuffs and the footwear in frame. Plain shirt, simple white sneakers, realistic casual body anatomy.

The subject must look like an everyday person taking a quick authentic mirror photo in their bedroom. RETURN ONLY THE PHOTO. NO text, captions, labels, numbering or watermarks.`;

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = process.env.FITPIC_MODEL || "gemini-3.1-flash-image";
    const response = await ai.models.generateContent({
      model,
      contents: [
        { inlineData: { mimeType: match[1], data: match[2] } },
        { text: prompt },
      ],
      config: { responseModalities: ["IMAGE"] },
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
          { text: `Compare IMAGE ONE (actual denim product) with IMAGE TWO (generated try-on image).
Respond with JSON only: {"approved": boolean, "issues": string[]}.
Set approved=false when you see ANY:
1. Added handwriting, digit(s), inventory/stock number, conspicuous text, fictional logo or writing PRINTED ON the jeans (e.g. "109" on the thigh), which was not actually on the product.
2. Jeans that visibly differ from the original in wash/color, pattern, rise, cut, leg width, pockets or rips.
3. Mirror selfie with visibly uncovered face, staged fashion pose, unrealistic anatomy, or a blurry/deformed garment.
4. Full waistband/legs/hem not visible.
Ignore legitimate tiny brand tags and normal indoor furniture. Reject obvious errors, not minor lighting or wrinkle differences.
Return compact JSON with the exact key names approved and issues. No markdown.` },
          { inlineData: { mimeType: match[1], data: match[2] } },
          { inlineData: { mimeType: generated.mimeType, data: generated.data } },
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

    if (review?.approved !== true) {
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
