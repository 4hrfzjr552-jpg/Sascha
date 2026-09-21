import { GoogleGenAI, Type } from "@google/genai";

export const config = {
  maxDuration: 60,
};

function getGeminiClient() {
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          error: "Ungültige Anfrage.",
        });
      }
    }

    const {
      number,
      artikelnummer,
      images,
      measurements,
      customNotes,
      customPrompt,
    } = body || {};

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

    const imageParts: any[] = [];

    for (const img of images) {
      const dataUrl =
        typeof img === "string"
          ? img
          : img?.dataUrl || "";

      if (!dataUrl) {
        continue;
      }

      const allowedMimes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
      ];

      // Handle HTTP/HTTPS URLs (e.g. Supabase Storage signed URLs) by fetching image buffer server-side
      if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) {
        try {
          const fetchRes = await fetch(dataUrl);
          if (fetchRes.ok) {
            const arrayBuffer = await fetchRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Data = buffer.toString("base64");
            const contentType = fetchRes.headers.get("content-type") || "image/jpeg";
            const mimeType = contentType.split(";")[0].trim().toLowerCase();
            const validMime = allowedMimes.includes(mimeType) ? mimeType : "image/jpeg";

            imageParts.push({
              inlineData: {
                mimeType: validMime,
                data: base64Data,
              },
            });
            continue;
          }
        } catch (fetchErr) {
          console.error("Server-side image fetch failed for URL:", dataUrl, fetchErr);
        }
      }

      if (!dataUrl.includes(",")) {
        continue;
      }

      const commaIndex = dataUrl.indexOf(",");
      const header = dataUrl.slice(0, commaIndex);
      const base64Data = dataUrl.slice(commaIndex + 1);

      const mimeMatch = header.match(/:(.*?);/);
      const mimeType = mimeMatch?.[1] || "image/jpeg";

      const validMime = allowedMimes.includes(mimeType.toLowerCase())
        ? mimeType
        : "image/jpeg";

      imageParts.push({
        inlineData: {
          mimeType: validMime,
          data: base64Data,
        },
      });
    }

    if (imageParts.length === 0) {
      return res.status(400).json({
        error: "Keine gültigen Bilddaten empfangen.",
      });
    }

    const measurementLines: string[] = [];

    if (measurements?.waist?.trim()) {
      measurementLines.push(
        `- Bundweite: ca. ${measurements.waist.trim()} cm`
      );
    }

    if (measurements?.totalLength?.trim()) {
      measurementLines.push(
        `- Gesamtlänge: ca. ${measurements.totalLength.trim()} cm`
      );
    }

    if (measurements?.inseam?.trim()) {
      measurementLines.push(
        `- Innenbeinlänge: ca. ${measurements.inseam.trim()} cm`
      );
    }

    if (measurements?.legOpening?.trim()) {
      measurementLines.push(
        `- Beinöffnung: ca. ${measurements.legOpening.trim()} cm`
      );
    }

    if (measurements?.thighWidth?.trim()) {
      measurementLines.push(
        `- Oberschenkelbreite: ca. ${measurements.thighWidth.trim()} cm`
      );
    }

    const manualMeasurementsBlock =
      measurementLines.length > 0
        ? `

MANUELL EINGEGEBENE MAẞE DES NUTZERS:
Diese Maße haben absolute Priorität und müssen genau so mit "ca." übernommen werden:
${measurementLines.join("\n")}`
        : `

Der Nutzer hat keine manuellen Maße eingegeben.`;

    const customNotesBlock = customNotes?.trim()
      ? `

EIGENE HINWEISE DES NUTZERS:
"${customNotes.trim()}"

Diese Hinweise unbedingt beachten.`
      : "";

    const userPromptInstructions = customPrompt?.trim()
      ? customPrompt.trim()
      : `Ich schicke dir Fotos von einem Kleidungsstück für Vinted.

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
Kurzer, suchfreundlicher Titel mit Marke, Modell, Größe, Farbe und Schnitt, soweit sicher erkennbar.
Keine unnötigen Emojis und kein Keyword-Spam.

BESCHREIBUNG:

✅ ZUSTAND
Kurz und ehrlich beschreiben. Sichtbare Mängel unbedingt nennen.

👕 GRÖẞE
Größe laut Etikett nennen. Wenn der Fit gut erkennbar ist, kurz dazuschreiben.

📐 MAẞE
Wenn Maße mitgeschickt wurden, sauber auflisten.

🪡 DETAILS
Farbe, Waschung, Schnitt, Taschen, Logos, Nähte und andere auffällige Details.

↘️ EXTRAS
1–2 lockere Sätze zum Style oder zur Kombination.

🚚 VERSAND
Kurz erwähnen, dass schnell verschickt wird.

💬
Am Ende:
„Bei Fragen gerne melden :)“

KEYWORDS:
Danach genau 25 passende Suchbegriffe ohne Hashtags.
Nur Begriffe verwenden, die wirklich zum Piece passen.
Deutsche und englische Begriffe dürfen gemischt werden.
Keine fremden Marken verwenden.

Vermeide typische KI-Sätze wie:
„absolutes Must-have“
„perfekt für jeden Anlass“
„zeitloses Design“
„ein echter Hingucker“

Die Anzeige soll wie eine normale gute Vinted-Anzeige wirken: kurz, sauber und sympathisch.`;

    const fullPromptText = `${userPromptInstructions}

Hose #${number || 1}
Anzahl Bilder: ${imageParts.length}

${manualMeasurementsBlock}
${customNotesBlock}

WICHTIGE REGELN:
- Alle Bilder gehören zu diesem einen Kleidungsstück.
- Niemals Angaben erfinden.
- Wenn Marke, Modell, Größe, Schnitt oder Material nicht sicher erkennbar sind, weglassen oder leer lassen.
- Manuelle Maße haben immer Vorrang.
- Die Keywords müssen genau 25 passende Suchbegriffe sein.`;

    const ai = getGeminiClient();

    const requestConfig = {
      systemInstruction:
        "Du bist ein Vinted-Assistent für Bekleidung und Hosen. Erstelle authentische, menschlich klingende Anzeigen. Erfinde niemals Daten, Marken oder Maße.",
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
          },
          description: {
            type: Type.STRING,
          },
          keywords: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
          detected: {
            type: Type.OBJECT,
            properties: {
              brand: { type: Type.STRING },
              model: { type: Type.STRING },
              gender: { type: Type.STRING },
              size: { type: Type.STRING },
              color: { type: Type.STRING },
              fit: { type: Type.STRING },
              material: { type: Type.STRING },
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
        required: [
          "title",
          "description",
          "keywords",
          "detected",
        ],
      },
    };

    const candidateModels = [
      "gemini-3.1-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.8-flash",
    ];

    let response: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
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

        const status =
          err?.status ||
          err?.statusCode ||
          err?.error?.code;

        const message =
          err?.message ||
          err?.error?.message ||
          "";

        console.log(
          `Gemini model ${model}:`,
          message.slice(0, 200)
        );

        if (
          status === 429 ||
          message.includes("429") ||
          message.includes("RESOURCE_EXHAUSTED") ||
          message.toLowerCase().includes("quota")
        ) {
          throw err;
        }
      }
    }

    if (!response?.text) {
      if (lastError) {
        throw lastError;
      }

      throw new Error("Keine Antwort von Gemini erhalten.");
    }

    const rawText = response.text;

    let parsedResult: any;

    try {
      parsedResult = JSON.parse(rawText);
    } catch {
      const cleaned = rawText
        .replace(/```json\s*/g, "")
        .replace(/```\s*$/g, "")
        .trim();

      parsedResult = JSON.parse(cleaned);
    }

    if (
      Array.isArray(parsedResult.keywords) &&
      parsedResult.keywords.length > 0
    ) {
      const description =
        (parsedResult.description || "").trim();

      if (!/Keywords:\s*/i.test(description)) {
        parsedResult.description =
          `${description}

Keywords:
${parsedResult.keywords.join(", ")}`;
      }
    }

    if (parsedResult.title) {
      let cleanTitle = String(parsedResult.title)
        .replace(/\s*#[\w\-\.\/]+$/i, "")
        .trim();

      const trimmedArt = artikelnummer
        ? String(artikelnummer)
            .trim()
            .replace(/^#+/, "")
        : "";

      if (trimmedArt) {
        const suffix = ` ${trimmedArt}`;
        const maxBaseLength = 100 - suffix.length;

        if (cleanTitle.length > maxBaseLength) {
          cleanTitle = cleanTitle
            .slice(0, maxBaseLength)
            .trim();
        }

        parsedResult.title =
          `${cleanTitle}${suffix}`;
      } else {
        parsedResult.title =
          cleanTitle.slice(0, 100).trim();
      }
    }

    return res.status(200).json({
      success: true,
      data: parsedResult,
    });
  } catch (error: any) {
    console.error(
      "Gemini Pant Analysis Error:",
      error
    );

    const errorMessage =
      error?.message ||
      error?.error?.message ||
      "";

    const errorStatus =
      error?.status ||
      error?.statusCode ||
      error?.error?.code;

    if (
      errorStatus === 429 ||
      errorMessage.includes("429") ||
      errorMessage.includes("RESOURCE_EXHAUSTED") ||
      errorMessage.toLowerCase().includes("quota")
    ) {
      return res.status(429).json({
        error:
          "Kostenloses KI-Limit momentan erreicht. Versuche es später erneut.",
        rateLimited: true,
        details: errorMessage,
      });
    }

    if (
      errorStatus === 503 ||
      errorMessage.includes("503") ||
      errorMessage.includes("UNAVAILABLE")
    ) {
      return res.status(503).json({
        error:
          "Die KI ist momentan stark ausgelastet. Bitte kurz warten und erneut versuchen.",
        temporarilyUnavailable: true,
        details: errorMessage,
      });
    }

    return res.status(500).json({
      error:
        "Analyse fehlgeschlagen – erneut versuchen.",
      details: errorMessage,
    });
  }
}
