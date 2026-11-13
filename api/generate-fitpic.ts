import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

/**
 * Generates ONE synthetic try-on photo. Source photos remain untouched.
 * The endpoint requires an authenticated Supabase session to limit API abuse.
 */
const ROOMS = [
  "a modest bright bedroom with a plain white dresser, wood floor and full-length mirror",
  "a lived-in apartment bedroom with a white wardrobe and a bed partly visible",
  "a simple bedroom with a tall frameless mirror beside a window and oak-look flooring",
  "a small tidy room with white walls, a wardrobe, and natural daylight",
  "an ordinary apartment hallway with a full-length mirror, neutral walls and pale wood floor",
  "a minimal bedroom with an open wardrobe door and a simple rug",
  "a casual bedroom with a basic dresser, light wooden floor and soft afternoon light",
  "a regular bedroom with a white door, a standing mirror and slightly uneven window light",
];
const POSES = [
  "front-facing, weight resting on one leg, phone held at face height",
  "slightly angled to the mirror, one hand in the jeans pocket",
  "relaxed straight-on stance, both pant legs visible",
  "a casual three-quarter angle, free hand by the side",
  "standing naturally with feet slightly apart and phone covering the face",
  "slightly shifted hips, one leg a little forward",
  "full-length mirror selfie from a little higher angle",
  "ordinary mirror selfie with a mild diagonal phone angle",
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

    const prompt = `Create exactly ONE photorealistic vertical 3:4 mirror selfie that could plausibly be taken casually with a phone by a private adult selling used jeans. The attached photo shows the ACTUAL PAIR OF JEANS being sold. It is the garment reference, not a photo style reference.

HIGHEST PRIORITY: The synthetic person must wear THAT exact pair of jeans. Preserve its actual color, dye wash, fading, cut, rise, length, leg width, seams, distressing and visible pocket/brand details as closely as the input allows. Do not invent or modify logos, rips, branding or the fabric pattern. Do not beautify or change the shape of the jeans. When a detail is not visible, keep it unremarkable rather than inventing it. Garment information: ${meta || "jeans as shown in reference"}.

Person: ${persona} Keep body type, hairstyle and appearance consistent with this fixed fictional persona across generations, although the phone naturally hides most of the face.
Location: ${ROOMS[index]}.
Pose: ${POSES[index]}.

Make it an authentic home mirror selfie: ordinary natural window light, slight perspective imperfections, handheld phone in front of face, unposed expression/body language, subtle natural wrinkles in T-shirt, real-world apartment decor, normal mobile-phone exposure. Entire jeans from waist through hems and shoes must be visible. NO professional studio, NO fashion editorial, NO runway model, NO cinematic lights, NO stylization, NO text, NO watermark, NO collage, NO additional garments, NO exaggerated anatomy. Return ONLY the new photo.`;

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
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.data && part.inlineData?.mimeType?.startsWith("image/")) {
          return res.status(200).json({
            success: true,
            image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          });
        }
      }
    }
    return res.status(502).json({ success: false, error: "Die Bild-KI hat kein Foto geliefert." });
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
