import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 300 };

/**
 * A single-user, explicitly triggered photo edit. Never replaces the original
 * garment photo and never publishes externally. No extensionless local imports:
 * Vercel's Node ESM runtime previously failed to load them.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Methode nicht erlaubt." });
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!supabaseUrl || !supabaseKey || !geminiKey) {
    return res.status(503).json({ success: false, error: "Flatlay ist nicht konfiguriert: Supabase- und Gemini-Schlüssel prüfen." });
  }
  const token = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ success: false, error: "Bitte anmelden, um Flatlays zu erstellen." });

  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth?.user) {
      return res.status(401).json({ success: false, error: "Anmeldung abgelaufen. Bitte erneut einloggen." });
    }
  } catch (e) {
    console.error("[flatlay] authentication failed", e);
    return res.status(503).json({ success: false, error: "Anmeldedienst nicht erreichbar." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); }
      catch { return res.status(400).json({ success: false, error: "Ungültige Anfrage." }); }
    }
    const input = body?.image;
    const reference = body?.layoutReference;
    if (typeof input !== "string") {
      return res.status(400).json({ success: false, error: "Bitte ein vollständiges Originalfoto der Hose auswählen." });
    }
    function parseImage(source: unknown, maxBytes: number) {
      if (typeof source !== "string") return null;
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(source);
      if (!match) return null;
      const data = Buffer.from(match[2], "base64");
      if (data.length === 0 || data.length > maxBytes) return null;
      return { mimeType: match[1], data: match[2] };
    }
    const source = parseImage(input, 2_800_000);
    if (!source) return res.status(413).json({ success: false, error: "Originalbild ungültig oder größer als 2,8 MB. Bitte JPEG/PNG/WebP verwenden." });
    const layout = reference === undefined ? null : parseImage(reference, 850_000);
    if (reference !== undefined && !layout) return res.status(400).json({ success: false, error: "Layout-Vorlage muss ein gültiges JPEG/PNG/WebP (max. 850 KB) sein." });

    const model = process.env.FLATLAY_MODEL || process.env.FITPIC_MODEL || "gemini-3.1-flash-image";
    const prompt = `You are precisely editing an authentic second-hand jeans listing photo. Your job is to RE-LAY and lightly STEAM-SMOOTH the IDENTICAL physical pair of trousers, NOT design a new pair.

COMPOSITION TEMPLATE (reference is only a layout reference, never a garment reference):
- Photorealistic TOP-DOWN square flatlay, like a casual seller taking a photo from directly overhead.
- The same pale warm beige / light gray mottled soft short-pile rug visible in the supplied example, with diffuse indoor daylight and a quiet texture.
- Waistband positioned horizontally near the upper edge. Two separate full trouser legs extend downward to their hems near the bottom edge, with a natural small gap between them and generous but not excessive space around the pair.
- Lying NATURALLY flat and neatly aligned; smooth away only bulky accordion folds, bunching at knees, twisting and deep temporary shadows. Subtle fabric ripples are fine. Do not make the fabric artificially airbrushed.
- If the source shows the BACK, keep the BACK; if it shows the FRONT, keep the FRONT. Match the photographed orientation and orientation of every pocket.

STRICT SAME-GARMENT REQUIREMENTS:
- Keep the exact existing jeans, not an approximate style. Preserve authentic size proportions, waistband shape, rise, leg width/flare, inseams, genuine length and asymmetric features.
- Preserve the exact color, wash gradients, vertical and diagonal fading/whiskers, original scratches, permanent worn-in creases, distressed areas, stains, holes, intentional rips, frayed hems and loose threads. These are IMPORTANT visible CONDITION EVIDENCE and must NOT be ironed out, hidden, cloned away, cleaned, repaired or invented.
- Preserve the exact logo patches, labels, stitching, buttons, rivets and pocket geometry from the ORIGINAL jeans. Never invent new branded symbols, tags, graphics, text or pockets.
- NO person, no mannequin, no hangers, no props, no watermarks, no other garments, no duplicate jeans.
- Keep the entire pants visible, from full waistband to both authentic cuffs. Do NOT crop the hems or invent unseen backside details.

SOURCE PHOTO is the ONLY authority for garment identity and flaws. Any separate template is authority for LAYOUT/BACKGROUND ONLY. Where a specific detail cannot be verified, preserve it visually rather than hallucinate it.
Return one realistic listing image, 1:1 square.`;

    const contents: any[] = [
      { text: "SOURCE: ACTUAL JEANS TO RETAIN. This is the product being sold:" },
      { inlineData: source },
    ];
    if (layout) {
      contents.push({ text: "LAYOUT REFERENCE ONLY. Do not copy the jeans/model/color/markings shown in this layout photo:" });
      contents.push({ inlineData: layout });
    }
    contents.push({ text: prompt });

    const ai = new GoogleGenAI({ apiKey: geminiKey, httpOptions: { timeout: 95_000 } });
    console.info("[flatlay] generating", { model, reference: Boolean(layout) });
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
    });
    let generated: {mimeType: string; data: string} | null = null;
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data) {
          generated = { mimeType: part.inlineData.mimeType, data: part.inlineData.data };
          break;
        }
      }
      if (generated) break;
    }
    if (!generated) {
      return res.status(502).json({
        success: false, error: "Die Bild-KI hat kein Flatlay erzeugt. Bitte Foto oder Modell prüfen und erneut versuchen.",
      });
    }
    return res.status(200).json({
      success: true,
      image: `data:${generated.mimeType};base64,${generated.data}`,
      notice: "KI-Bearbeitung: Echte Waschung, Flecken, Schäden und Nähte mit Originalfoto vergleichen.",
    });
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    const code = Number(error?.status || error?.statusCode || error?.error?.code);
    console.error("[flatlay] generation failed", { code, message: String(error?.message||error).slice(0,600) });
    if (code === 429 || /quota|resource_exhausted|429/.test(message)) {
      return res.status(429).json({ success: false, error: "Gemini-Limit erreicht. Bitte später erneut versuchen." });
    }
    if (code === 404 || /not found|not supported/.test(message)) {
      return res.status(503).json({ success: false, error: "Flatlay-Bildmodell nicht verfügbar. Bitte FLATLAY_MODEL in Vercel prüfen." });
    }
    return res.status(502).json({ success: false, error: "Flatlay-Generierung fehlgeschlagen. Originalfoto bleibt erhalten; bitte erneut versuchen." });
  }
}
