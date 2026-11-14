import React, { useEffect, useState } from "react";
import { Check, ImagePlus, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import type { PantImage, PantItem } from "../types";
import { DEFAULT_FLATLAY_LAYOUT_REFERENCE } from "../lib/flatlayReference";
import {
  BACKGROUND_OPTIONS, clearFlatlayReference, generateJeansFlatlay,
  getFlatlayReference, saveFlatlayReference,
  type BeautifyBackground, type BeautifyMode, type BeautifyResult,
} from "../lib/flatlay";

interface Props {
  pant: PantItem;
  image: PantImage | null;
  initialMode?: BeautifyMode;
  onClose: () => void;
  /** Apply only AFTER a seller has seen and explicitly accepted the result. */
  onAccept: (result: BeautifyResult) => void;
}

export const FlatlayEditModal: React.FC<Props> = ({
  pant, image, initialMode = "auto", onClose, onAccept,
}) => {
  const [busy,setBusy] = useState(false);
  const [variant,setVariant] = useState<BeautifyResult | null>(null);
  const [error,setError] = useState("");
  const [reference,setReference] = useState<string | null>(null);
  const [savingReference,setSavingReference] = useState(false);
  const [mode,setMode] = useState<BeautifyMode>("auto");
  const [background,setBackground] = useState<BeautifyBackground>("rug");

  useEffect(() => {
    setVariant(null); setError(""); setBusy(false);
    setMode(initialMode);
    const prior=pant.flatlays?.find(f=>f.sourceImageId===image?.id);
    setBackground(prior?.background || "rug");
    setReference(getFlatlayReference());
  }, [image?.id,initialMode]);

  if (!image) return null;

  async function generate() {
    if(!image||busy)return;
    setBusy(true); setError(""); setVariant(null);
    try { setVariant(await generateJeansFlatlay(image,pant,{mode,background})); }
    catch(e:any) {setError(e?.message || "Foto-KI fehlgeschlagen.");}
    finally {setBusy(false);}
  }

  async function onTemplateFile(file?:File) {
    if(!file)return;
    setSavingReference(true);setError("");
    try {
      if(!file.type.startsWith("image/"))throw new Error("Bitte ein Bild auswählen.");
      const dataUrl=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(new Error("Bild konnte nicht gelesen werden."));
        reader.onload=()=>resolve(String(reader.result||""));
        reader.readAsDataURL(file);
      });
      await saveFlatlayReference(dataUrl);
      setReference(getFlatlayReference());
    } catch(e:any){setError(e?.message || "Layoutvorlage konnte nicht gespeichert werden.");}
    finally{setSavingReference(false);}
  }

  const operationLabel = variant?.operation === "flatlay" ? "Ganzes Hosen-Flatlay"
    : variant?.operation === "detail" ? "Detailfoto verschönert" : "Hintergrund gewechselt";

  return (
    <div className="fixed inset-0 z-[60] bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-4xl max-h-[96vh] flex flex-col rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl">
        <header className="flex items-start justify-between gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">KI-Foto verschönern</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Mit den echten Fotos, Titel, Beschreibung und Maßen deiner Jeans
            </p>
          </div>
          <button aria-label="Schließen" type="button" disabled={busy} onClick={onClose}
            className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40">
            <X className="h-5 w-5"/>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
            Originalfotos bleiben unangetastet. Die KI darf keine Schäden, Flecken, Markenmerkmale
            oder die echte Waschung entfernen oder erfinden. Vergleiche das Ergebnis vor Freigabe.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1.5 block text-xs font-bold text-stone-700 dark:text-stone-200">
              Bearbeitungsart
              <select value={mode} disabled={busy} onChange={e=>{setMode(e.target.value as BeautifyMode);setVariant(null);}}
                className="block w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 p-3 text-sm">
                <option value="auto">Automatisch: Ganze Hose oder Detail erkennen</option>
                <option value="flatlay">Ganzes Hosenfoto: Flatlay mit 2 Knicken je Bein</option>
                <option value="detail">Nur Bund / Tasche / Detail verschönern</option>
                <option value="background">Nur Hintergrund ändern (Hose bleibt gleich)</option>
              </select>
            </label>
            <label className="space-y-1.5 block text-xs font-bold text-stone-700 dark:text-stone-200">
              Hintergrund dieses Fotos
              <select value={background} disabled={busy} onChange={e=>{setBackground(e.target.value as BeautifyBackground);setVariant(null);}}
                className="block w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 p-3 text-sm">
                {BACKGROUND_OPTIONS.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </label>
          </div>

          {(mode==="auto"||mode==="flatlay") && (
            <div className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 space-y-2">
              <div className="font-bold text-xs text-stone-800 dark:text-stone-100">Deine Flatlay-Vorlage</div>
              <div className="flex items-center gap-3">
                <img src={reference||DEFAULT_FLATLAY_LAYOUT_REFERENCE} alt="Deine Vorlage: Jeans auf Teppich"
                  className="w-16 h-16 object-cover rounded-lg border border-stone-200 dark:border-stone-700"/>
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  Bund oben, zwei natürliche Knicke pro Bein und unten berühren sich die Beinöffnungen.
                  Das Layout ist automatisch hinterlegt – nicht die abgebildete Jeans.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs rounded-lg border border-stone-300 dark:border-stone-700 px-3 py-2 font-semibold text-stone-800 dark:text-stone-200">
                  <ImagePlus className="h-4 w-4"/> {savingReference?"Speichert…":"Andere Vorlage auswählen"}
                  <input type="file" accept="image/*" className="hidden" disabled={busy||savingReference}
                    onChange={e=>{void onTemplateFile(e.target.files?.[0]);e.target.value="";}}/>
                </label>
                {reference && <button type="button" disabled={busy} onClick={()=>{clearFlatlayReference();setReference(null);}}
                  className="text-xs text-stone-600 dark:text-stone-300 underline">Zur Originalvorlage</button>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-bold text-stone-700 dark:text-stone-200">Original · unverändert</p>
              <img src={image.dataUrl} alt="Echtes Originalfoto der Jeans"
                className="w-full aspect-square object-contain rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800"/>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-stone-700 dark:text-stone-200">
                {variant ? operationLabel : "Neue KI-Version · vor Freigabe"}
              </p>
              {variant
                ? <img src={variant.image.dataUrl} alt="Bearbeitetes Produktfoto zum Vergleich"
                    className="w-full aspect-square object-contain rounded-xl border-2 border-teal-400 dark:border-teal-700 bg-stone-100 dark:bg-stone-800"/>
                : <div className="w-full aspect-square flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 gap-3 p-3 text-stone-500">
                    {busy?<Loader2 className="h-8 w-8 animate-spin"/>:<Sparkles className="h-8 w-8"/>}
                    <span className="text-xs text-center">{busy?"KI erkennt das Foto und erstellt die neue Version…":"Hier erscheint die bearbeitete Version"}</span>
                  </div>}
            </div>
          </div>

          {error && <p role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
          {variant && <p className="text-xs text-rose-700 dark:text-rose-300">
            Prüfe echte Beinweite, Waschung, Label, Knicke, Löcher, Flecken und Säume.
            Bei einer falschen Hose nicht freigeben – lieber „Neu erstellen“ oder abbrechen.
          </p>}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 px-3 py-3 border-t border-stone-200 dark:border-stone-800">
          <button type="button" disabled={busy} onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-bold text-stone-700 dark:text-stone-200 disabled:opacity-50">Abbrechen</button>
          <button type="button" disabled={busy||savingReference} onClick={()=>void generate()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold disabled:opacity-50">
            {busy?<Loader2 className="h-4 w-4 animate-spin"/>:variant?<RefreshCw className="h-4 w-4"/>:<Sparkles className="h-4 w-4"/>}
            {busy?"Wird erstellt…":variant?"Neu erstellen":"Foto verschönern"}
          </button>
          <button type="button" disabled={busy||!variant} onClick={()=>{if(variant)onAccept(variant);}}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold disabled:opacity-40">
            <Check className="h-4 w-4"/> Nach Prüfung übernehmen
          </button>
        </footer>
      </div>
    </div>
  );
};
