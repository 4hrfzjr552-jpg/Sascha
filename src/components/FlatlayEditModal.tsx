import React, { useEffect, useState } from "react";
import { Check, ImagePlus, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import type { PantImage } from "../types";
import { DEFAULT_FLATLAY_LAYOUT_REFERENCE } from "../lib/flatlayReference";
import {
  clearFlatlayReference, generateJeansFlatlay,
  getFlatlayReference, saveFlatlayReference,
} from "../lib/flatlay";

interface Props {
  image: PantImage | null;
  onClose: () => void;
  /** Called only after seller visually compared image and explicitly approved. */
  onAccept: (image: PantImage) => void;
}

export const FlatlayEditModal: React.FC<Props> = ({ image, onClose, onAccept }) => {
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<PantImage | null>(null);
  const [error, setError] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [savingReference, setSavingReference] = useState(false);

  useEffect(() => {
    setVariant(null); setError(""); setBusy(false); setReference(getFlatlayReference());
  }, [image?.id, image?.dataUrl]);

  if (!image) return null;

  async function generate() {
    if (!image) return;
    setBusy(true); setError(""); setVariant(null);
    try {
      setVariant(await generateJeansFlatlay(image));
    } catch (e: any) {
      setError(e?.message || "Flatlay konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function onTemplateFile(file?: File) {
    if (!file) return;
    setSavingReference(true); setError("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Bitte ein Bild als Vorlage auswählen.");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Vorlage konnte nicht gelesen werden."));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
      await saveFlatlayReference(dataUrl);
      setReference(getFlatlayReference());
    } catch (e: any) {
      setError(e?.message || "Vorlage konnte nicht gespeichert werden.");
    } finally {
      setSavingReference(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-stone-950/80 backdrop-blur-xs flex justify-center items-center p-2 sm:p-4">
      <div className="w-full max-w-4xl max-h-[95vh] flex flex-col rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl">
        <header className="p-4 flex justify-between items-start gap-3 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">KI-Flatlay: Hose sauber hinlegen</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              Bund oben, Beine glatt und vollständig, heller Teppich – wie dein Beispielbild.
            </p>
          </div>
          <button type="button" aria-label="Schließen" title="Schließen" onClick={onClose} disabled={busy}
            className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40">
            <X className="h-5 w-5"/>
          </button>
        </header>
        <div className="overflow-y-auto p-3 sm:p-5 space-y-4">
          <p className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
            Nur eine vollständige Vorder- oder Rückansicht optimieren – keine Artikelnummer-Tüte.
            KI kann Waschung, Abnutzung, Löcher und Marken unbeabsichtigt verändern.
            Vergleiche deshalb das Ergebnis genau mit dem echten Foto. Das Original bleibt immer erhalten.
          </p>

          <div className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 space-y-2">
            <div className="text-xs font-bold text-stone-700 dark:text-stone-200">Layout-Vorlage</div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Dein Beispielbild ist als Standardvorlage bereits hinterlegt: heller Teppich, Draufsicht,
              Bund oben und beide Beine ausgelegt. Du kannst die Vorlage hier optional austauschen.
              Eine eigene Vorlage bleibt nur in deinem Browser gespeichert und wird niemals als Produktfoto verwendet.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <img src={reference || DEFAULT_FLATLAY_LAYOUT_REFERENCE} alt="Beispielbild für die Flatlay-Anordnung" className="w-16 h-16 object-cover rounded-lg border border-stone-200"/>
              <label className="cursor-pointer px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-xs font-semibold text-stone-800 dark:text-stone-100 inline-flex items-center gap-2">
                <ImagePlus className="h-4 w-4"/>
                {savingReference ? "Speichert…" : reference ? "Eigene Vorlage ändern" : "Vorlage austauschen"}
                <input type="file" accept="image/*" className="hidden" disabled={busy || savingReference}
                  onChange={e => { void onTemplateFile(e.target.files?.[0]); e.target.value = ""; }}/>
              </label>
              {reference && <button type="button" disabled={busy} onClick={() => {clearFlatlayReference(); setReference(null);}}
                className="px-3 py-2 text-xs text-stone-600 dark:text-stone-400 underline">Zur Standardvorlage zurück</button>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-bold mb-1.5 text-stone-700 dark:text-stone-200">Original (bleibt unverändert)</div>
              <img src={image.dataUrl} alt="Originalfoto der Hose" className="w-full aspect-square object-contain rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"/>
            </div>
            <div>
              <div className="text-xs font-bold mb-1.5 text-stone-700 dark:text-stone-200">KI-Flatlay (nur nach Freigabe)</div>
              {variant
                ? <img src={variant.dataUrl} alt="KI-Flatlay zur Sichtprüfung" className="w-full aspect-square object-contain rounded-xl bg-stone-100 dark:bg-stone-800 border border-teal-300 dark:border-teal-800"/>
                : <div className="w-full aspect-square flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                    {busy ? <Loader2 className="h-8 w-8 animate-spin"/> : <Sparkles className="h-8 w-8"/>}
                    <span className="text-xs text-center p-3">{busy ? "Hose wird als Flatlay angeordnet…" : "KI-Ergebnis erscheint hier"}</span>
                  </div>}
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300 rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3">{error}</p>}
          {variant && <p className="text-xs text-rose-700 dark:text-rose-300">
            Kontrolliere besonders Taschen, Label, Waschung, Kratzer, Löcher und ausgefranste Säume.
            Bei Abweichungen bitte nicht übernehmen.
          </p>}
        </div>
        <footer className="p-3 sm:p-4 flex flex-wrap justify-end gap-2 border-t border-stone-200 dark:border-stone-800">
          <button type="button" onClick={onClose} disabled={busy}
            className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs sm:text-sm font-bold text-stone-700 dark:text-stone-200 disabled:opacity-50">Abbrechen</button>
          <button type="button" disabled={busy || savingReference} onClick={() => {void generate();}}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-stone-950 text-xs sm:text-sm font-bold disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : variant ? <RefreshCw className="h-4 w-4"/> : <Sparkles className="h-4 w-4"/>}
            {busy ? "Erstellt…" : variant ? "Neu erzeugen" : "Flatlay erstellen"}
          </button>
          <button type="button" disabled={busy || !variant} onClick={() => { if (variant) onAccept(variant); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-bold disabled:opacity-40">
            <Check className="h-4 w-4"/> Als Flatlay übernehmen
          </button>
        </footer>
      </div>
    </div>
  );
};
