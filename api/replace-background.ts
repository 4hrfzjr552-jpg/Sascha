import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      status: 405,
      model: "gemini-3.1-flash-image",
      error: {
        message: "Method not allowed",
        status: 405,
        code: "METHOD_NOT_ALLOWED",
        name: "MethodError",
      },
    });
  }

  const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
  console.log("[Replace Background] GEMINI_API_KEY exists:", hasApiKey);

  if (!hasApiKey) {
    console.error("[Replace Background Error] GEMINI_API_KEY ist auf dem Server nicht konfiguriert.");
    return res.status(500).json({
      success: false,
      status: 500,
      model: "gemini-3.1-flash-image",
      error: {
        message: "GEMINI_API_KEY ist auf dem Server nicht konfiguriert.",
        status: 500,
        code: "MISSING_API_KEY",
        name: "ConfigurationError",
      },
    });
  }

  const modelName = "gemini-3.1-flash-image";
  console.log("[Replace Background] Model:", modelName);

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          success: false,
          status: 400,
          model: modelName,
          error: {
            message: "Ungültiger Request-Body.",
            status: 400,
            code: "BAD_REQUEST",
            name: "ParseError",
          },
        });
      }
    }

    const { image } = body || {};
    if (!image || typeof image !== "string") {
      return res.status(400).json({
        success: false,
        status: 400,
        model: modelName,
        error: {
          message: "Kein Bild übergeben.",
          status: 400,
          code: "MISSING_IMAGE",
          name: "ValidationError",
        },
      });
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
          return res.status(400).json({
            success: false,
            status: 400,
            model: modelName,
            error: {
              message: `Bild konnte nicht von URL geladen werden (HTTP ${resp.status}).`,
              status: 400,
              code: "IMAGE_FETCH_FAILED",
              name: "FetchError",
            },
          });
        }
        const contentType = resp.headers.get("content-type") || "";
        mimeType = contentType.split(";")[0].trim().toLowerCase() || "image/jpeg";
        const arrayBuffer = await resp.arrayBuffer();
        base64Data = Buffer.from(arrayBuffer).toString("base64");
      } catch (err: any) {
        return res.status(400).json({
          success: false,
          status: 400,
          model: modelName,
          error: {
            message: `Fehler beim Laden der Bild-URL: ${err?.message || err}`,
            status: 400,
            code: "IMAGE_FETCH_ERROR",
            name: "FetchError",
          },
        });
      }
    }

    if (!base64Data) {
      return res.status(400).json({
        success: false,
        status: 400,
        model: modelName,
        error: {
          message: "Gültiges Bild erforderlich.",
          status: 400,
          code: "INVALID_IMAGE",
          name: "ValidationError",
        },
      });
    }

    const inputSizeBytes = Buffer.from(base64Data, "base64").length;
    console.log("[Replace Background] Input image compressed size:", `${(inputSizeBytes / 1024).toFixed(2)} KB`);

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

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

    console.log("[Replace Background] Starting Gemini API call...");

    const response = await ai.models.generateContent({
      model: modelName,
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
      config: {
        responseModalities: ["IMAGE"],
      },
    });

    let editedImageDataUrl: string | null = null;
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

    if (editedImageDataUrl) {
      return res.status(200).json({
        success: true,
        image: editedImageDataUrl,
      });
    }

    console.error("[Replace Background Error] Gemini response did not contain an image inlineData part.");
    return res.status(500).json({
      success: false,
      status: 500,
      model: modelName,
      error: {
        message: "Die KI lieferte kein direktes Bild zurück. Bitte versuche es erneut.",
        status: 500,
        code: "NO_IMAGE_RETURNED",
        name: "EmptyResponseError",
      },
    });
  } catch (error: any) {
    const rawStatus = error?.status || error?.statusCode || error?.error?.status || error?.error?.code || 500;
    const httpStatus = typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

    console.error("[Replace Background Error] Full Error:", error);
    console.error("[Replace Background Error] HTTP/API Status:", httpStatus);

    return res.status(httpStatus).json({
      success: false,
      status: httpStatus,
      model: modelName,
      error: {
        message: error?.message || error?.error?.message || String(error),
        status: error?.status || error?.statusCode || error?.error?.status || httpStatus,
        code: error?.code || error?.errorCode || error?.error?.code || null,
        name: error?.name || error?.error?.name || "GeminiError",
      },
    });
  }
}
