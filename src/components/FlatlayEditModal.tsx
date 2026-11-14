import React, { useEffect, useState } from "react";
import { Check, ImagePlus, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import type { PantImage, PantItem } from "../types";
import { DEFAULT_FLATLAY_LAYOUT_REFERENCE } from "../lib/flatlayReference";
import { flatlayPoseGuideSvg } from "../lib/flatlayPoseGuide";
import {
  BACKGROUND_OPTIONS, clearFlatlayReference, generateJeansFlatlay,
  getFlatlayReference, saveFlatlayReference,
  type BeautifyBackground, type BeautifyMode, type BeautifyResult,
} from "../lib/flatlay";
import { FLUX_BASE_COST_USD, FLUX_RESERVED_USD, getLocalFluxCap, getLocalFluxUsage, setLocalFluxCap, type ImageProvider } from "../lib/fluxBudget";

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
  const [provider,setProvider] = useState<ImageProvider>(() => {
    try { return window.localStorage.getItem("sascha-photo-provider-v1")==="flux-pro" ? "flux-pro" : "flux-klein"; }
    catch { return "flux-klein"; }
  });
  const [sourceView,setSourceView] = useState<"" | "front" | "back">("");
  const [usePoseGuide,setUsePoseGuide] = useState(true);
  const [monthlyCap,setMonthlyCap] = useState(getLocalFluxCap);
  const [spentEstimate,setSpentEstimate] = useState(getLocalFluxUsage);
  const [sellerChecks,setSellerChecks]=useState({side:false,identity:false,bends:false,hems:false});

  useEffect(() => {
    setVariant(null); setError(""); setBusy(false);
    setSellerChecks({side:false,identity:false,bends:false,hems:false});
    setMode(initialMode);setSourceView("");setSpentEstimate(getLocalFluxUsage());
    const prior=pant.flatlays?.find(f=>f.sourceImageId===image?.id);
    setBackground(prior?.background || "rug");
    setReference(getFlatlayReference());
  }, [image?.id,initialMode]);

  if (!image) return null;

  async function generate() {
    if(!image||busy)return;
    setBusy(true); setError(""); setVariant(null);
    setSellerChecks({side:false,identity:false,bends:false,hems:false});
    try {
      setVariant(await generateJeansFlatlay(image,pant,{
        mode,background,provider,sourceView:sourceView || undefined,
        usePoseGuide,
      }));
      setSpentEstimate(getLocalFluxUsage());
    }
    catch(e:any) {setError(e?.message || "Foto-KI fehlgeschlagen.");}
    finally {setSpentEstimate(getLocalFluxUsage());setBusy(false);}
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

  const isGenerated = Boolean(variant && variant.provider!=="local");
  const requiresFlatlayChecks = variant?.operation==="flatlay";
  const checksComplete = !isGenerated ||
    (sellerChecks.side && sellerChecks.identity &&
     (!requiresFlatlayChecks || (sellerChecks.bends && sellerChecks.hems)));
  const flatlayPreview = provider==="gemini" ? (reference||DEFAULT_FLATLAY_LAYOUT_REFERENCE)
    : "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(flatlayPoseGuideSvg());
  const operationLabel = variant?.operation === "flatlay" ? "Ganzes Hosen-Flatlay"
    : variant?.operation === "natural" ? "Originalfoto sanft optimiert"
    : variant?.operation === "detail" ? "Detailfoto verschönert" : "Hintergrund gewechselt";

  return (
    <div className="fixed inset-0 z-[60] bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-4xl max-h-[96vh] flex flex-col rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl">
        <header className="flex items-start justify-between gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Foto bearbeiten</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Originalgetreu optimieren oder optional mit KI neu anordnen
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
                <option value="auto">Originaltreu: Licht/Kontrast verbessern (ohne KI-Neuzeichnung)</option>
                <option value="flatlay">Experimentell: Hose mit 2 Knicken je Bein neu hinlegen (KI)</option>
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
          {mode!=="auto" && (
            <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/70 p-3 space-y-2">
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-200">
                Bild-KI auswählen
                <select value={provider} disabled={busy} onChange={e=>{
                  const p=e.target.value as ImageProvider;
                  setProvider(p);setVariant(null);
                  try{window.localStorage.setItem("sascha-photo-provider-v1",p);}catch{ /* optional */ }
                }}
                  className="w-full mt-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 px-3 py-2.5 text-sm text-stone-900 dark:text-stone-100">
                  <option value="flux-klein">FLUX.2 Klein – Sparmodus · ab ca. $0,015/Bild</option>
                  <option value="flux-pro">FLUX.2 Pro – Qualitätsmodus · ab ca. $0,045/Bild</option>
                  <option value="gemini">Gemini (bisheriges Modell – aktuell Guthaben leer)</option>
                </select>
              </label>
              {provider!=="gemini" && (
                <>
                  <p className="text-xs text-stone-600 dark:text-stone-300">
                    Reservierter Richtwert je Bearbeitung: <strong>${FLUX_RESERVED_USD[provider].toFixed(3)}</strong> USD.
                    Offizieller Grundpreis ab ${FLUX_BASE_COST_USD[provider].toFixed(3)} USD.
                    Ein Versuch, kein bezahlter KI-Prüfer. Originalfoto immer selbst kontrollieren.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-stone-600 dark:text-stone-300 font-semibold">
                      Lokales Monatsbudget
                      <select value={monthlyCap} disabled={busy} onChange={e=>{
                        const next=Number(e.target.value);
                        try {setLocalFluxCap(next);setMonthlyCap(next);setError("");}
                        catch(err:any){setError(err?.message || "Budget konnte nicht gespeichert werden.");}
                      }} className="ml-2 border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 rounded-lg px-2 py-2">
                        {[0.5,1,2,5].map(v=><option key={v} value={v}>${v.toFixed(2)}</option>)}
                      </select>
                    </label>
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                      Im Browser vorgemerkt: ${spentEstimate.toFixed(2)} / ${monthlyCap.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Nur Browser-Schätzung, nicht geräteübergreifend und keine harte Konto-Sperre.
                    In BFL automatische Aufladung deaktiviert lassen und nur gewünschtes Guthaben aufladen.
                  </p>
                </>
              )}
            </div>
          )}
          {mode==="flatlay" && provider!=="gemini" && (
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-200">
              Originalfoto zeigt (wichtig gegen verwechselte Gesäßtaschen)
              <select value={sourceView} disabled={busy} onChange={e=>{setSourceView(e.target.value as any);setVariant(null);}}
                className="w-full mt-1 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2.5 text-sm">
                <option value="">Bitte auswählen</option>
                <option value="front">Vorderseite (Reißverschluss / Fronttaschen)</option>
                <option value="back">Rückseite (Gesäßtaschen)</option>
              </select>
            </label>
          )}
          {mode==="auto" && (
            <p className="text-xs text-teal-700 dark:text-teal-300">
              Originalgetreue Bildverbesserung ohne neue Jeans, ohne API-Kosten.
              Nur Licht und Kontrast werden vorsichtig angepasst. Die ausgewählte Hintergrundfarbe
              wird in diesem Modus nicht verändert. Wähle „Nur Hintergrund ändern“, um die Oberfläche auszutauschen.
            </p>
          )}

          {mode==="flatlay" && (
            <div className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 space-y-2">
              <div className="font-bold text-xs text-stone-800 dark:text-stone-100">{provider==="gemini"?"Deine Gemini-Flatlay-Vorlage":"Neutrale FLUX-Umrissvorlage (ohne fremde Jeans)"}</div>
              <div className="flex items-center gap-3">
                <img src={flatlayPreview} alt={provider==="gemini"?"Jeans-Layoutvorlage für Gemini":"Neutrale geometrische Zwei-Knick-Silhouette für FLUX"}
                  className="w-16 h-16 object-cover rounded-lg border border-stone-200 dark:border-stone-700"/>
                <p className="text-xs text-stone-600 dark:text-stone-300">
                  Bund oben, zwei echte Knicke pro Bein, unten berühren sich die Beinöffnungen.
                  FLUX kann eine zusätzliche neutrale Umrissvorlage ohne fremde Jeansmerkmale verwenden.
                  Du kannst sie unten abschalten. Kein Modell garantiert perfekte Übereinstimmung.
                </p>
              </div>
              {provider!=="gemini" && (
                <label className="flex gap-2 items-start text-xs text-stone-700 dark:text-stone-300">
                  <input type="checkbox" checked={usePoseGuide}
                    disabled={busy}
                    onChange={e=>{setUsePoseGuide(e.target.checked);setVariant(null);}}
                    className="mt-0.5 h-4 w-4 accent-teal-700"/>
                  <span>
                    Zusätzliche neutrale Umrissvorlage verwenden (experimentell).
                    Wenn FLUX die Anfrage als „Request Moderated“ ablehnt, kannst du
                    die Vorlage testweise ausschalten. Jeder erneute Versuch wird
                    manuell gestartet und kann bei erfolgreicher Generierung Credits kosten.
                  </span>
                </label>
              )}
              {provider==="gemini" && <div className="flex flex-wrap gap-2 items-center">
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs rounded-lg border border-stone-300 dark:border-stone-700 px-3 py-2 font-semibold text-stone-800 dark:text-stone-200">
                  <ImagePlus className="h-4 w-4"/> {savingReference?"Speichert…":"Gemini-Vorlage auswählen"}
                  <input type="file" accept="image/*" className="hidden" disabled={busy||savingReference}
                    onChange={e=>{void onTemplateFile(e.target.files?.[0]);e.target.value="";}}/>
                </label>
                {reference && <button type="button" disabled={busy} onClick={()=>{clearFlatlayReference();setReference(null);}}
                  className="text-xs text-stone-600 dark:text-stone-300 underline">Zur Originalvorlage</button>}
              </div>}
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
            Dieses Bild wurde von generativer KI erstellt und ist NICHT automatisch als echte
            Produktdarstellung geprüft. Insbesondere hellere Stofffarbe, andere Etiketten,
            fehlende Knicke oder vertauschte Vorder-/Rückseite sind Ablehnungsgründe.
          </p>}
          {variant && isGenerated && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 p-3 space-y-2 text-xs">
              <p className="font-bold text-amber-800 dark:text-amber-300">
                Vor dem Übernehmen jedes Kriterium selbst am Original vergleichen.
                Nur abhaken, wenn es wirklich stimmt.
              </p>
              {([
                ["side","Die Vorder-/Rückseite bzw. der Detail-Ausschnitt stimmt."],
                ["identity","Es ist genau dieselbe Jeans: Waschung, Farbe, echte Schäden, Taschen, Etiketten und Nähte stimmen."],
                ...(requiresFlatlayChecks ? [
                  ["bends","JEDES Hosenbein hat tatsächlich zwei deutliche Knicke in der Form, nicht nur Falten im Stoff."],
                  ["hems","Die beiden unteren Beinöffnungen berühren sich an den inneren Kanten."]
                ] : []),
              ] as Array<[keyof typeof sellerChecks,string]>).map(([key,label])=>(
                <label key={key} className="flex gap-2 items-start p-2 rounded-lg bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100">
                  <input type="checkbox" checked={sellerChecks[key]}
                    onChange={e=>setSellerChecks(old=>({...old,[key]:e.target.checked}))}
                    className="mt-0.5 h-4 w-4 accent-teal-700"/>
                  <span>{label}</span>
                </label>
              ))}
              {!checksComplete && (
                <p className="text-amber-800 dark:text-amber-300 font-semibold">
                  Freigabe gesperrt, bis alle Punkte bestätigt sind. Bei Abweichungen abbrechen.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 px-3 py-3 border-t border-stone-200 dark:border-stone-800">
          <button type="button" disabled={busy} onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-bold text-stone-700 dark:text-stone-200 disabled:opacity-50">Abbrechen</button>
          <button type="button" disabled={busy||savingReference||(mode==="flatlay"&&provider!=="gemini"&&!sourceView)} onClick={()=>void generate()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold disabled:opacity-50">
            {busy?<Loader2 className="h-4 w-4 animate-spin"/>:variant?<RefreshCw className="h-4 w-4"/>:<Sparkles className="h-4 w-4"/>}
            {busy?"Wird erstellt…":variant?"Neu erstellen":"Foto verschönern"}
          </button>
          <button type="button" disabled={busy||!variant||!checksComplete}
            onClick={()=>{if(variant&&checksComplete)onAccept(variant);}}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold disabled:opacity-40">
            <Check className="h-4 w-4"/> Nach Prüfung übernehmen
          </button>
        </footer>
      </div>
    </div>
  );
};
