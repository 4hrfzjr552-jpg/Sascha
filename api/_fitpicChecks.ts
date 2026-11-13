/**
 * Pure validation helpers for server-side Gemini fitpic checks.
 * Untrusted model responses must NEVER be treated as automatic approval.
 */
export type PhotoKind = "full_front" | "full_back" | "detail" | "inventory" | "other";

export function parseFitpicJson(raw: string): any {
  const value = String(raw || "").trim();
  const json = value.startsWith("```")
    ? value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : value;
  try {
    return JSON.parse(json);
  } catch {
    // Some models wrap valid structured output in a short explanation.
    const first = json.indexOf("{");
    const last = json.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("KI hat kein lesbares JSON zurückgegeben.");
    return JSON.parse(json.slice(first, last + 1));
  }
}

export function pickJeansReferences(raw: any, total: number): number[] {
  const photos = raw?.photos;
  if (!Array.isArray(photos) || photos.length !== total) {
    throw new Error("Die Fotoerkennung war unvollständig. Bitte noch einmal versuchen.");
  }
  const kinds = new Set<PhotoKind>(["full_front", "full_back", "detail", "inventory", "other"]);
  const seen = new Set<number>();
  const eligible: Array<{ index: number; kind: PhotoKind; confidence: number }> = [];
  for (const entry of photos) {
    const index = entry?.index;
    const kind = entry?.kind as PhotoKind;
    const confidence = entry?.confidence;
    if (!Number.isInteger(index) || index < 1 || index > total || seen.has(index)
        || !kinds.has(kind) || typeof confidence !== "number"
        || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("Die Fotoerkennung war uneindeutig. Bitte noch einmal versuchen.");
    }
    seen.add(index);
    // Never risk shipping an uncertain bag / handwritten inventory number as
    // a garment reference. Do not guess a role when the model is uncertain.
    if (confidence < 0.75) {
      throw new Error("Ein Foto konnte nicht sicher als Jeans- oder Tütenfoto erkannt werden. Bitte Foto prüfen.");
    }
    if (kind !== "inventory" && kind !== "other") {
      eligible.push({ index: index - 1, kind, confidence });
    }
  }
  if (!eligible.some(p => p.kind === "full_front")) {
    throw new Error("Bitte ein Foto der gesamten Jeans-Vorderseite (Bund bis zu beiden Säumen) hochladen.");
  }
  if (eligible.length < 2) {
    throw new Error("Bitte mindestens zwei deutliche Jeansfotos hochladen (Vorderseite und Rückseite oder Detail).");
  }
  const rank: Record<PhotoKind, number> = {
    full_front: 0, full_back: 1, detail: 2, inventory: 3, other: 4,
  };
  eligible.sort((a,b) => rank[a.kind] - rank[b.kind] || b.confidence - a.confidence);
  return eligible.slice(0, 4).map(p => p.index);
}

export function validateFitpicReview(raw: any): { approved: boolean; issues: string[]; confidence: number } {
  const confidence = typeof raw?.confidence === "number" && Number.isFinite(raw.confidence)
    ? raw.confidence : 0;
  const issues = Array.isArray(raw?.issues)
    ? raw.issues.filter((s: unknown): s is string => typeof s === "string").slice(0, 3)
    : [];
  return {
    approved: raw?.approved === true && confidence >= 0.85,
    confidence,
    issues,
  };
}

export function fitpicCheckErrorMessage(error: any, purpose: string): string {
  const status = Number(error?.status || error?.statusCode || error?.error?.code || 0);
  const detail = String(error?.message || error?.error?.message || "").toLowerCase();
  if (status === 429 || detail.includes("quota") || detail.includes("resource_exhausted")) {
    return purpose + ": Gemini-Kontingent erreicht. Bitte später erneut versuchen.";
  }
  if (status === 404 || detail.includes("not found") || detail.includes("not supported")) {
    return purpose + ": Kein verfügbares Prüfmodell. Bitte FITPIC_QA_MODEL/GEMINI_MODELS in Vercel prüfen.";
  }
  return purpose + ": KI-Prüfservice vorübergehend nicht erreichbar. Das Bild wurde sicherheitshalber nicht übernommen.";
}
