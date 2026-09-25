import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Set payload limit to handle up to 5 compressed base64 images per pant
app.use(express.json({ limit: "35mb" }));
app.use(express.urlencoded({ extended: true, limit: "35mb" }));

// Lazy get or check Gemini client
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Primary pant analysis endpoint
app.post("/api/analyze-pant", async (req, res) => {
  try {
    const {
      number,
      artikelnummer,
      images,
      measurements,
      customNotes,
      customPrompt,
    } = req.body;

    // Validate images
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: "Bitte mindestens ein Foto hinzufügen.",
      });
    }

    if (images.length > 5) {
      return res.status(400).json({
        error: "Maximal 5 Fotos je Hose erlaubt.",
      });
    }

    // Prepare image inline parts
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];

    const imageParts = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      let rawUrl: string = typeof img === "string" ? img : img?.dataUrl || "";

      if (!rawUrl) continue;

      if (rawUrl.startsWith("data:") && rawUrl.includes(",")) {
        const commaIndex = rawUrl.indexOf(",");
        const header = rawUrl.slice(0, commaIndex);
        const base64Data = rawUrl.slice(commaIndex + 1);

        const mimeMatch = header.match(/:(.*?);/);
        const mimeType = (mimeMatch ? mimeMatch[1] : "image/jpeg").toLowerCase();
        const validMime = allowedMimes.includes(mimeType) ? mimeType : "image/jpeg";

        imageParts.push({
          inlineData: {
            mimeType: validMime,
            data: base64Data,
          },
        });
      } else if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
        try {
          const resp = await fetch(rawUrl);
          if (!resp.ok) {
            console.warn(`Server fetch image failed (${resp.status}):`, rawUrl);
            continue;
          }

          const contentType = resp.headers.get("content-type") || "";
          const mimeType = contentType.split(";")[0].trim().toLowerCase();
          const validMime = allowedMimes.includes(mimeType) ? mimeType : "image/jpeg";

          const arrayBuffer = await resp.arrayBuffer();
          const base64Data = Buffer.from(arrayBuffer).toString("base64");

          imageParts.push({
            inlineData: {
              mimeType: validMime,
              data: base64Data,
            },
          });
        } catch (err) {
          console.error("Error fetching image URL on server:", rawUrl, err);
        }
      }
    }

    if (imageParts.length === 0) {
      return res.status(400).json({
        error: "Keine gültigen Bilddaten empfangen.",
      });
    }

    // Build context with user measurements and notes
    const measurementLines: string[] = [];
    if (measurements?.waist?.trim()) {
      measurementLines.push(`- Bundweite: ca. ${measurements.waist.trim()} cm`);
    }
    if (measurements?.totalLength?.trim()) {
      measurementLines.push(`- Gesamtlänge: ca. ${measurements.totalLength.trim()} cm`);
    }
    if (measurements?.inseam?.trim()) {
      measurementLines.push(`- Innenbeinlänge: ca. ${measurements.inseam.trim()} cm`);
    }
    if (measurements?.legOpening?.trim()) {
      measurementLines.push(`- Beinöffnung: ca. ${measurements.legOpening.trim()} cm`);
    }
    if (measurements?.thighWidth?.trim()) {
      measurementLines.push(`- Oberschenkelbreite: ca. ${measurements.thighWidth.trim()} cm`);
    }

    const manualMeasurementsBlock = measurementLines.length > 0
      ? `\n\nMANUELL EINGEGEBENE MAẞE DES NUTZERS (DIESE HABEN ABSOLUTE PRIORITÄT UND MÜSSEN GENAU SO IN DER BESCHREIBUNG MIT "ca." STEHEN):\n${measurementLines.join("\n")}`
      : "\n\n(Der Nutzer hat keine manuellen Maße eingegeben.)";

    const customNotesBlock = customNotes?.trim()
      ? `\n\nEIGENE HINWEISE DES NUTZERS (UNBEDINGT BEACHTEN UND IN DIE BESCHREIBUNG EINFLIEẞEN LASSEN, Z.B. MÄNGEL/ZUSTAND/BESONDERHEITEN):\n"${customNotes.trim()}"`
      : "";

    const userPromptInstructions = customPrompt?.trim()
      ? customPrompt.trim()
      : `Ich schicke dir gleich Fotos von einem Kleidungsstück für Vinted.

Erstell daraus bitte eine komplette Vinted-Anzeige mit Titel, Beschreibung und passenden Keywords.

Wichtig:
Schreib locker, natürlich und menschlich. Es soll sich so lesen, als hätte ich die Anzeige selbst geschrieben und nicht wie ein KI- oder Shoptext.

Nutze die Fotos, um möglichst viel selbst zu erkennen:
- Marke
- Modell, falls erkennbar
- Kleidungsart
- Farbe / Waschung
- Schnitt / Fit
- Größe
- Material, falls Etikett sichtbar
- besondere Details
- sichtbare Gebrauchsspuren oder Mängel

Wenn du dir bei etwas nicht sicher bist, erfinde nichts.

TITEL:
Mach einen kurzen, suchfreundlichen Titel mit den wichtigsten Begriffen wie Marke, Modell, Größe, Farbe und Schnitt. Keine unnötigen Emojis und kein Keyword-Spam.

BESCHREIBUNG:

✅ ZUSTAND
Kurz und ehrlich beschreiben. Sichtbare Mängel unbedingt nennen.

👕 GRÖẞE
Größe laut Etikett nennen. Wenn der Fit anhand der Bilder gut erkennbar ist, kurz dazuschreiben.

📐 MAẞE
Wenn ich Maße mitschicke, hier sauber auflisten.

🪡 DETAILS
Farbe, Waschung, Schnitt, Taschen, Logos, Nähte und andere auffällige Details kurz beschreiben.

↘️ EXTRAS
1–2 lockere Sätze zum Style oder wie man das Piece kombinieren kann. Nicht übertreiben.

🚚 VERSAND
Kurz erwähnen, dass ich schnell verschicke.

💬
Am Ende:
„Bei Fragen gerne melden :)“

KEYWORDS:
Danach 20–25 passende Suchbegriffe ohne Hashtags.
Nur Begriffe verwenden, die wirklich zum Piece passen.
Deutsche und englische Begriffe dürfen gemischt werden.
Keine fremden Marken als Keywords benutzen.

Vermeide typische KI-Sätze wie:
„absolutes Must-have“
„perfekt für jeden Anlass“
„zeitloses Design“
„ein echter Hingucker“

Die Anzeige soll eher wie eine normale gute Vinted-Anzeige wirken: kurz, sauber und sympathisch.`;

    const fullPromptText = `${userPromptInstructions}

Hose #${number || 1}
Anzahl Bilder dieser Hose: ${imageParts.length}
${manualMeasurementsBlock}
${customNotesBlock}

WICHTIGE REGELN:
- Alle übergebenen Bilder gehören zu DIESEM EINEN Kleidungsstück.
- NIEMALS Angaben erfinden! Wenn Marke, Modell, Größe, Schnitt oder Material nicht sicher erkennbar sind, lasse sie weg oder schreibe "nicht angegeben" bzw. nenne nur das Sichtbare.
- Manuelle Maße des Nutzers haben IMMER Vorrang gegenüber Schätzungen aus Bildern.
- Die Keywords müssen genau 25 thematisch passende Suchbegriffe als Liste von Strings sein (z.B. ["jeans", "vintage", "mom jeans", ...]).`;

    const ai = getGeminiClient();

    // Candidate models in order of priority:
    // gemini-3.1-flash-lite has high capacity and stability against 503 spikes,
    // followed by gemini-3.6-flash and gemini-3.8-flash.
    const candidateModels = [
      "gemini-3.1-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.8-flash",
    ];

    let response: any = null;
    let lastError: any = null;

    const requestConfig = {
      systemInstruction:
        "Du bist ein professioneller Vinted-Assistent für Bekleidung/Hosen. Du erstellst authentische, menschlich klingende Anzeigen. Du erfindest NIEMALS Daten, Marken oder Maße.",
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Kurzer, suchfreundlicher Vinted-Titel, max. 100 Zeichen.",
          },
          description: {
            type: Type.STRING,
            description:
              "Komplette Vinted-Beschreibung gegliedert nach ZUSTAND, GRÖẞE, MAẞE, DETAILS, EXTRAS, VERSAND, Fragen.",
          },
          keywords: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: "Genau 25 relevante Suchbegriffe / Tags.",
          },
          detected: {
            type: Type.OBJECT,
            properties: {
              brand: {
                type: Type.STRING,
                description: "Erkannte Marke oder leer wenn unklar.",
              },
              model: {
                type: Type.STRING,
                description: "Erkanntes Modell oder Schnittbezeichnung.",
              },
              gender: {
                type: Type.STRING,
                description: "Damen, Herren oder Unisex (nur wenn erkennbar).",
              },
              size: {
                type: Type.STRING,
                description: "Größe laut Etikett oder W/L Angabe.",
              },
              color: {
                type: Type.STRING,
                description: "Farbe oder Waschung.",
              },
              fit: {
                type: Type.STRING,
                description: "Schnitt / Passform (z.B. Slim Fit, Straight, Wide Leg, Mom Jeans).",
              },
              material: {
                type: Type.STRING,
                description: "Materialzusammensetzung (nur falls Etikett lesbar).",
              },
            },
            required: [
              "brand",
              "model",
              "gender",
              "size",
              "color",
              "fit",
              "material",
            ],
          },
        },
        required: ["title", "description", "keywords", "detected"],
      },
    };

    // Helper for sleeping with jitter
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Try models with clean retry on demand spikes
    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      try {
        response = await ai.models.generateContent({
          model,
          contents: [
            ...imageParts,
            {
              text: fullPromptText,
            },
          ],
          config: requestConfig,
        });
        if (response?.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        const errStatus = err?.status || err?.statusCode || err?.error?.code;
        const errMsg = err?.message || err?.error?.message || "";
        console.log(`[AI Info] Model ${model} request note:`, errMsg.slice(0, 100));

        // If rate limit (429), break immediately and propagate
        if (
          errStatus === 429 ||
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("quota")
        ) {
          throw err;
        }

        // If 503 or high demand spike, pause briefly before next model candidate
        const is503 =
          errStatus === 503 ||
          errMsg.includes("503") ||
          errMsg.includes("high demand") ||
          errMsg.includes("UNAVAILABLE");

        if (is503 && i < candidateModels.length - 1) {
          const waitTime = 600 + Math.floor(Math.random() * 400);
          await sleep(waitTime);
        }
      }
    }

    if (!response && lastError) {
      throw lastError;
    }

    const rawText = response.text || "{}";
    let parsedResult;
    try {
      parsedResult = JSON.parse(rawText);
    } catch {
      // Fallback in case response had surrounding formatting
      const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
      parsedResult = JSON.parse(cleaned);
    }

    // Automatically append keywords to the bottom of the description
    if (Array.isArray(parsedResult.keywords) && parsedResult.keywords.length > 0) {
      const desc = (parsedResult.description || "").trim();
      if (!/Keywords:\s*/i.test(desc)) {
        parsedResult.description = `${desc}\n\nKeywords:\n${parsedResult.keywords.join(", ")}`;
      }
    }

    // Automatically attach Artikelnummer to the end of the title if provided (without hashtag)
    if (parsedResult.title) {
      let cleanTitle = parsedResult.title.replace(/\s*#[\w\-\.\/]+$/i, "").trim();
      const trimmedArt = artikelnummer
        ? String(artikelnummer).trim().replace(/^#+/, "")
        : "";
      if (trimmedArt) {
        // Strip if already ending with trimmedArt to avoid duplicate appending
        const escapedArt = trimmedArt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        cleanTitle = cleanTitle.replace(new RegExp(`\\s+${escapedArt}$`, "i"), "").trim();

        const suffix = ` ${trimmedArt}`;
        const maxBaseLen = 100 - suffix.length;
        if (maxBaseLen > 0 && cleanTitle.length > maxBaseLen) {
          cleanTitle = cleanTitle.slice(0, maxBaseLen);
          const lastSpace = cleanTitle.lastIndexOf(" ");
          if (lastSpace > 15) {
            cleanTitle = cleanTitle.slice(0, lastSpace);
          }
          cleanTitle = cleanTitle.trim();
        }
        parsedResult.title = `${cleanTitle}${suffix}`;
      } else {
        parsedResult.title = cleanTitle.slice(0, 100).trim();
      }
    }

    return res.json({
      success: true,
      data: parsedResult,
    });
  } catch (error: any) {
    console.error("Gemini Pant Analysis Error:", error);

    const errorMessage = error?.message || "";
    const errorStatus = error?.status || error?.statusCode;

    // Check for rate limit / quota exceeded
    if (
      errorStatus === 429 ||
      errorMessage.includes("429") ||
      errorMessage.includes("RESOURCE_EXHAUSTED") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("Rate limit")
    ) {
      return res.status(429).json({
        error: "Kostenloses KI-Limit momentan erreicht. Versuche es später erneut.",
        rateLimited: true,
      });
    }

    // Check for temporary high demand / 503
    if (
      errorStatus === 503 ||
      errorMessage.includes("503") ||
      errorMessage.includes("high demand") ||
      errorMessage.includes("UNAVAILABLE")
    ) {
      return res.status(503).json({
        error: "Die KI ist momentan stark ausgelastet (503). Bitte kurz warten und erneut versuchen.",
        temporarilyUnavailable: true,
      });
    }

    return res.status(500).json({
      error: "Analyse fehlgeschlagen – erneut versuchen.",
      details: errorMessage,
    });
  }
});

// Background replacement endpoint
app.post("/api/replace-background", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Kein Bild übergeben." });
    }

    let base64Data = "";
    let mimeType = "image/jpeg";

    if (image.startsWith("data:") && image.includes(",")) {
      const commaIndex = image.indexOf(",");
      const header = image.slice(0, commaIndex);
      base64Data = image.slice(commaIndex + 1);

      const mimeMatch = header.match(/:(.*?);/);
      if (mimeMatch) mimeType = mimeMatch[1].toLowerCase();
    } else if (image.startsWith("http://") || image.startsWith("https://")) {
      try {
        const resp = await fetch(image);
        if (!resp.ok) {
          return res.status(400).json({ error: "Bild konnte nicht geladen werden." });
        }
        const contentType = resp.headers.get("content-type") || "";
        mimeType = contentType.split(";")[0].trim().toLowerCase() || "image/jpeg";
        const arrayBuffer = await resp.arrayBuffer();
        base64Data = Buffer.from(arrayBuffer).toString("base64");
      } catch (err) {
        return res.status(400).json({ error: "Fehler beim Laden der Bild-URL." });
      }
    }

    if (!base64Data) {
      return res.status(400).json({ error: "Gültiges Bild erforderlich." });
    }

    const ai = getGeminiClient();

    const backgroundPrompt = `Modify ONLY the background of this image while keeping the clothing item 100% exact and unchanged.

CRITICAL INSTRUCTIONS:
1. EXCLUSIVELY CHANGE THE BACKGROUND: Do not touch or modify the clothing item (jeans/pants) in any way.
2. KEEP CLOTHING EXACTLY UNCHANGED:
   - Form / shape
   - Color / wash (Farbe & Waschung)
   - Stitching & seams (Nähte)
   - Logos & brand marks
   - Labels & tags (Etiketten)
   - Holes / distressing / signs of wear (Löcher & Gebrauchsspuren)
   - Folds & creases (Falten)
   - Perspective & orientation
   - Size and position within the image frame
3. NEW BACKGROUND: Replace the existing background with a photorealistic, light gray-greige microcement / plaster floor (heller grau-greige Mikrozement-/Putzboden).
   - Matte surface
   - Subtly cloudy fine plaster texture (leicht wolkige feine Struktur)
   - NO tile joints / grout lines (keine Fliesenfugen)
   - NO bold, loud, or distracting patterns
4. NATURAL CONTACT SHADOWS: Render realistic, soft dark contact shadows directly beneath the pants where it physically rests on the surface, making it look as though it was photographed lying flat on this microcement floor.
5. Return the edited image.`;

    // Model priority starting explicitly with gemini-3.1-flash-image
    const candidateModels = [
      "gemini-3.1-flash-image",
      "gemini-2.5-flash",
      "gemini-3.6-flash",
      "imagen-3.0-capability-001",
    ];

    let editedImageDataUrl: string | null = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        if (model.startsWith("imagen-")) {
          const response = await ai.models.editImage({
            model,
            prompt: backgroundPrompt,
            referenceImages: [
              {
                image: {
                  imageBytes: base64Data,
                },
                referenceId: 1,
              } as any,
            ],
            config: {
              numberOfImages: 1,
              outputMimeType: "image/jpeg",
            },
          });

          if (response?.generatedImages?.[0]?.image?.imageBytes) {
            editedImageDataUrl = `data:image/jpeg;base64,${response.generatedImages[0].image.imageBytes}`;
            break;
          }
        } else {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: backgroundPrompt,
              },
            ],
          });

          const candidates = response?.candidates;
          if (candidates && candidates.length > 0) {
            const parts = candidates[0].content?.parts || [];
            for (const part of parts) {
              if (part.inlineData && part.inlineData.data) {
                const outMime = part.inlineData.mimeType || "image/jpeg";
                editedImageDataUrl = `data:${outMime};base64,${part.inlineData.data}`;
                break;
              }
            }
          }
          if (editedImageDataUrl) break;
        }
      } catch (err: any) {
        lastError = err;
        console.log(`[AI Background Replace Note] Model ${model}:`, err?.message || err);
      }
    }

    if (editedImageDataUrl) {
      return res.json({
        success: true,
        image: editedImageDataUrl,
      });
    }

    return res.status(500).json({
      success: false,
      error:
        lastError?.message ||
        "Hintergrund-Ersetzung durch KI fehlgeschlagen. Bitte versuche es erneut.",
    });
  } catch (error: any) {
    console.error("Background replacement error:", error);
    return res.status(500).json({
      error: error?.message || "Fehler bei der Hintergrund-Ersetzung.",
    });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Vinted AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
