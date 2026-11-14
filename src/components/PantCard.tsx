import React, { useState, useRef } from "react";
import {
  PantItem,
  PantImage,
  PantMeasurements,
  SaleStatus,
} from "../types";
import {
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Sparkles,
  RefreshCw,
  CopyPlus,
  Info,
  Loader2,
  ImageIcon,
  Share2,
  Wand2,
} from "lucide-react";
import { FlatlayEditModal } from "./FlatlayEditModal";
import { BACKGROUND_OPTIONS, generateJeansFlatlay, type BeautifyBackground, type BeautifyMode, type BeautifyResult } from "../lib/flatlay";
import { FLUX_BASE_COST_USD, FLUX_RESERVED_USD, capCanReserve, getLocalFluxCap, getLocalFluxUsage, type ImageProvider } from "../lib/fluxBudget";
import { defaultListingPhotoRole, modeForListingRole, summarizeListingRoles, type ListingPhotoRole } from "../lib/flatlayBatchRoles";
import { compressImageFile } from "../lib/imageCompressor";
import { shareVintedPhotos } from "../lib/vintedShare";
import { formatTitleWithArticleNumber } from "../lib/titleUtils";
import { SALE_STATUS_OPTIONS, getSaleStatusLabel } from "../lib/saleStatus";
import { getDuplicatePantNumbers } from "../lib/articleNumberUtils";

interface PantCardProps {
  pant: PantItem;
  allPants?: PantItem[];
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onUpdate: (updated: PantItem) => void;
  onDelete: (id: string) => void;
  onDuplicate: (pant: PantItem) => void;
  onAnalyze: (pant: PantItem) => void;
  onGenerateFitpic?: (pant: PantItem) => void;
  isGeneratingFitpic?: boolean;
  onSaleStatusChange: (pant: PantItem, status: SaleStatus) => void;
  onEditSale: (pant: PantItem) => void;
  isAnalyzingAny: boolean;
  onArticleNumberFocus?: (id: string) => void;
  onArticleNumberBlur?: (id: string) => void;
  onPrepareVintedDraft?: (pant: PantItem) => void;
}

export const PantCard: React.FC<PantCardProps> = ({
  pant,
  allPants = [],
  isSelected = false,
  onToggleSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  onAnalyze,
  onGenerateFitpic,
  isGeneratingFitpic = false,
  onSaleStatusChange,
  onEditSale,
  isAnalyzingAny,
  onArticleNumberFocus,
  onArticleNumberBlur,
  onPrepareVintedDraft,
}) => {
  const duplicatePantNumbers = getDuplicatePantNumbers(pant, allPants);
  const isDuplicateArticleNumber = duplicatePantNumbers.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showPhotoWarning, setShowPhotoWarning] = useState(false);
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [flatlayEditor, setFlatlayEditor] = useState<{ imageId: string; mode: BeautifyMode } | null>(null);
  const flatlaySource = pant.images.find(img => img.id === flatlayEditor?.imageId) || null;
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkBackground, setBulkBackground] = useState<BeautifyBackground>("rug");
  const [bulkProvider,setBulkProvider] = useState<ImageProvider>("flux-klein");
  const [bulkMode, setBulkMode] = useState<"flatlay" | "auto" | "background">("flatlay");
  const [photoRoles,setPhotoRoles] = useState<Record<string,ListingPhotoRole>>(()=>{
    try {
      const stored=JSON.parse(window.localStorage.getItem("sascha-flatlay-photo-roles-"+pant.id)||"{}");
      return stored && typeof stored==="object" && !Array.isArray(stored) ? stored : {};
    } catch {return {};}
  });
  const getPhotoRole=(img:PantImage,index:number):ListingPhotoRole=>{
    if(pant.images.length===5 && index===4)return "skip";
    const saved=photoRoles[img.id];
    return saved==="front"||saved==="back"||saved==="detail"||saved==="skip"
      ? saved : defaultListingPhotoRole(index,pant.images.length);
  };
  const changePhotoRole=(img:PantImage,role:ListingPhotoRole)=>{
    const next={...photoRoles,[img.id]:role};
    setPhotoRoles(next);
    try {window.localStorage.setItem("sascha-flatlay-photo-roles-"+pant.id,JSON.stringify(next));}
    catch{/* No persistence, selection works during this session */}
  };
  const [bulkProgress, setBulkProgress] = useState<{done:number;total:number;errors:string[]}|null>(null);
  const bulkStop = useRef(false);

  // Vinted photo sharing handler
  const handleShareVintedPhotos = async () => {
    setIsPreparingPhotos(true);
    setShareError(null);
    try {
      const res = await shareVintedPhotos(pant);
      if (!res.success && res.error) {
        setShareError(res.error);
      }
    } catch (err: any) {
      setShareError(err?.message || "Fehler beim Vorbereiten der Fotos.");
    } finally {
      setIsPreparingPhotos(false);
    }
  };

  // Copy helper with feedback
  const triggerCopy = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyFeedback(label);
      setTimeout(() => {
        setCopyFeedback(null);
      }, 2000);
    } catch (err) {
      console.warn("Clipboard write failed:", err);
    }
  };

  // Image Upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentImages = [...pant.images];
    const availableSlots = 5 - currentImages.length;

    if (availableSlots <= 0) {
      setShowPhotoWarning(true);
      setTimeout(() => setShowPhotoWarning(false), 3000);
      return;
    }

    const filesToProcess = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      setShowPhotoWarning(true);
      setTimeout(() => setShowPhotoWarning(false), 3000);
    }

    setIsCompressing(true);
    try {
      const newImages: PantImage[] = [];
      for (const file of filesToProcess) {
        const compressed = await compressImageFile(file);
        newImages.push(compressed);
      }

      onUpdate({
        ...pant,
        images: [...currentImages, ...newImages],
        updatedAt: Date.now(),
      });
    } catch (err: any) {
      console.error("Image processing error:", err);
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Store AI variants separately: Original images are never edited or deleted
  // by these actions. A failed generation has no effect on gallery state.
  const handleAcceptFlatlay = (result: BeautifyResult) => {
    if (!flatlaySource || !pant.images.some(img => img.id === flatlaySource.id)) return;
    onUpdate({
      ...pant,
      flatlays: [
        ...(pant.flatlays || []).filter(f => f.sourceImageId !== flatlaySource.id),
        { sourceImageId: flatlaySource.id, image: result.image, approved: true,
          mode: result.operation, kind: result.kind, background: result.background, provider: result.provider },
      ],
      updatedAt: Date.now(),
    });
    setFlatlayEditor(null);
  };

  // Main button creates full-jeans flatlays; detail photos stay close-ups.
  // Seller explicitly verifies front/back/detail/skip BEFORE any paid request.
  // Separate free local tone correction and background-only remain available.
  const handleBatchPhotos = async (
    mode: "flatlay" | "auto" | "background",
    selectedBackground?: BeautifyBackground,
  ) => {
    if (bulkBusy || isAnalyzing || isCompressing) return;
    const plan=pant.images
      .slice(0,pant.images.length===5?4:5)
      .map((image,index)=>({image,role:getPhotoRole(image,index)}))
      .filter(item=>item.role!=="skip");
    if(!plan.length){
      setBulkProgress({done:0,total:0,errors:["Bitte mindestens ein echtes Produktfoto auswählen."]});
      return;
    }
    const eligible=plan.map(x=>x.image);
    const choice=selectedBackground||bulkBackground;
    const roles=summarizeListingRoles(plan.map(x=>x.role));
    const isPaid=mode!=="auto";
    const estimate=bulkProvider==="gemini" ? "unbekannt (Gemini)" :
      "$"+(FLUX_RESERVED_USD[bulkProvider]*eligible.length).toFixed(2)+" (konservativ geschätzt)";
    if(isPaid && bulkProvider!=="gemini" &&
       !capCanReserve(getLocalFluxUsage(),getLocalFluxCap(),FLUX_RESERVED_USD[bulkProvider]*eligible.length)){
      setBulkMode(mode);
      setBulkProgress({done:0,total:eligible.length,errors:[
        "Dein lokales FLUX-Monatsbudget reicht für diesen gesamten Durchlauf nicht. Im Fotoeditor kannst du das Budget anpassen. Beim Anbieter gilt dein Prepaid-Guthaben als Ausgabengrenze."
      ]});
      return;
    }
    const confirmation=mode==="flatlay"
      ? `FLATLAY-BEARBEITUNG: ${roles.front}× Vorderseite, ${roles.back}× Rückseite, ${roles.detail}× Detailfoto. ${eligible.length} Fotos insgesamt, Anbieter: ${bulkProvider}. Hintergrund: ${BACKGROUND_OPTIONS.find(x=>x.value===choice)?.label||choice}. Geschätzter Kostenrahmen: ${estimate}. Ganze Jeans erhalten die Vorgabe „2 Knicke pro Bein, Säume berühren sich“, Detailfotos bleiben Nahaufnahmen. FLUX zeichnet neu: exakte Markierungen sind NICHT garantiert. Je Foto ein kostenpflichtiger Versuch, danach manuelle Freigabe. Fortfahren?`
      : mode==="background"
      ? `Den Hintergrund von ${eligible.length} Produktfotos auf „${BACKGROUND_OPTIONS.find(x=>x.value===choice)?.label||choice}“ ändern? Anbieter: ${bulkProvider}. Kostenschätzung: ${estimate}. Pro Bild ein kostenpflichtiger Versuch, anschließend manuelle Freigabe. Originale und Tütenfoto bleiben erhalten.`
      : `${eligible.length} echte Produktfotos sanft bei Licht/Kontrast optimieren? Keine neuen Hosen, keine KI-Kosten. Ergebnisse müssen anschließend freigegeben werden.`;
    if(!window.confirm(confirmation))return;

    bulkStop.current=false;
    setBulkMode(mode);
    setBulkBusy(true);
    const errors:string[]=[];
    let finished=0;
    let updated=[...(pant.flatlays||[])];
    setBulkProgress({done:0,total:eligible.length,errors:[]});
    try{
      for(const {image,role} of plan) {
        if(bulkStop.current)break;
        try {
          const requestedMode=mode==="flatlay"?modeForListingRole(role):mode;
          if(!requestedMode)continue;
          const result=await generateJeansFlatlay(image,pant,{
            mode:requestedMode,
            background:mode==="auto"?"original":choice,
            provider:isPaid?bulkProvider:undefined,
            sourceView:role==="front"||role==="back"?role:undefined,
          });
          updated=[
            ...updated.filter(f=>f.sourceImageId!==image.id),
            {sourceImageId:image.id,image:result.image,approved:false,
              mode:result.operation,kind:result.kind,background:result.background,
              provider:result.provider},
          ];
        }catch(e:any){
          const message=e?.message||"Bildbearbeitung fehlgeschlagen";
          errors.push(`Foto #${pant.images.findIndex(img=>img.id===image.id)+1}: ${message}`);
          // Any unexpected paid-photo failure is enough to halt the batch.
          // The provider may already have charged the first request, even if
          // our app did not receive its image. Never bill the next 3 photos
          // after a transport/polling/processing failure.
          if(isPaid) {
            errors.push("Bezahlten Durchlauf nach diesem Fehler gestoppt, um weitere FLUX-Kosten zu vermeiden. Bitte zuerst den einzelnen Fehler prüfen.");
            finished++;
            setBulkProgress({done:finished,total:eligible.length,errors:[...errors]});
            break;
          }
        }
        finished++;
        setBulkProgress({done:finished,total:eligible.length,errors:[...errors]});
      }
      // Original photos unaffected; pending AI variants are never published.
      await Promise.resolve(onUpdate({...pant,flatlays:updated,updatedAt:Date.now()}));
    }finally{setBulkBusy(false);}
  };

  // Delete an image
  const handleDeleteImage = (imageId: string) => {
    onUpdate({
      ...pant,
      images: pant.images.filter((img) => img.id !== imageId),
      flatlays: (pant.flatlays || []).filter(f => f.sourceImageId !== imageId),
      updatedAt: Date.now(),
    });
  };

  // Move image order
  const handleMoveImage = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pant.images.length) return;

    const newImages = [...pant.images];
    const temp = newImages[index];
    newImages[index] = newImages[targetIndex];
    newImages[targetIndex] = temp;

    onUpdate({
      ...pant,
      images: newImages,
      updatedAt: Date.now(),
    });
  };

  // Measurement updates
  const handleMeasurementChange = (
    field: keyof PantMeasurements,
    val: string
  ) => {
    onUpdate({
      ...pant,
      measurements: {
        ...pant.measurements,
        [field]: val,
      },
      updatedAt: Date.now(),
    });
  };

  // Artikelnummer updates & automatic title sync (without hashtag)
  const handleArtikelnummerChange = (val: string) => {
    let updatedTitle = pant.result?.title;
    if (updatedTitle) {
      updatedTitle = formatTitleWithArticleNumber(
        updatedTitle,
        val,
        pant.artikelnummer
      );
    }

    onUpdate({
      ...pant,
      artikelnummer: val,
      result: pant.result
        ? {
            ...pant.result,
            title: updatedTitle!,
          }
        : undefined,
      updatedAt: Date.now(),
    });
  };

  // Notes updates
  const handleNotesChange = (val: string) => {
    onUpdate({
      ...pant,
      customNotes: val,
      updatedAt: Date.now(),
    });
  };

  // Result text edits
  const handleTitleChange = (val: string) => {
    if (!pant.result) return;
    onUpdate({
      ...pant,
      result: {
        ...pant.result,
        title: val,
      },
      updatedAt: Date.now(),
    });
  };

  const handleDescriptionChange = (val: string) => {
    if (!pant.result) return;
    onUpdate({
      ...pant,
      result: {
        ...pant.result,
        description: val,
      },
      updatedAt: Date.now(),
    });
  };

  // Copy All format (Titel + komplette Beschreibung inkl. Keywords)
  const getAllContentToCopy = () => {
    if (!pant.result) return "";
    const title = pant.result.title.trim();
    const desc = pant.result.description.trim();
    return `${title}\n\n${desc}`;
  };

  const isCollapsed = Boolean(pant.isCollapsed);
  const isAnalyzing = pant.status === "analyzing";
  const firstPhoto = (pant.fitpicApproved ? pant.fitpic?.dataUrl : undefined) || (pant.images.length > 0 ? pant.images[0].dataUrl : null);

  return (
    <div
      id={`pant-card-${pant.id}`}
      className={`rounded-2xl border transition-all duration-200 bg-white dark:bg-stone-900 shadow-xs overflow-hidden ${
        isSelected
          ? "border-stone-900 dark:border-stone-100 ring-2 ring-stone-900/20 dark:ring-stone-100/30"
          : isAnalyzing
          ? "border-amber-400 dark:border-amber-500 ring-2 ring-amber-100 dark:ring-amber-950"
          : pant.status === "error"
          ? "border-rose-300 dark:border-rose-800"
          : "border-stone-200 dark:border-stone-800"
      }`}
    >
      <FlatlayEditModal
        pant={pant}
        image={flatlaySource}
        initialMode={flatlayEditor?.mode || "auto"}
        onClose={() => setFlatlayEditor(null)}
        onAccept={handleAcceptFlatlay}
      />
      {/* COLLAPSED HEADER / COMPACT SUMMARY ROW */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
        onClick={() => onUpdate({ ...pant, isCollapsed: !isCollapsed })}
      >
        {/* Left Side: Checkbox + Thumbnail + Hose #Nummer + Analyse-Status */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Selection Checkbox */}
          {onToggleSelect && (
            <div
              className="flex items-center justify-center shrink-0 pr-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                id={`select-pant-checkbox-${pant.id}`}
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(pant.id)}
                className="w-4 h-4 rounded border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:ring-stone-900 dark:focus:ring-stone-100 cursor-pointer"
                aria-label={`Hose #${pant.number} auswählen`}
              />
            </div>
          )}

          {/* Kleines Vorschaubild des ersten Fotos */}
          {firstPhoto ? (
            <img
              src={firstPhoto}
              alt={`Vorschau Hose #${pant.number}`}
              className="w-10 h-10 object-cover rounded-lg border border-stone-200 dark:border-stone-700 shrink-0 bg-stone-100 dark:bg-stone-800"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg border border-dashed border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 text-stone-400">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 tracking-tight whitespace-nowrap">
                Hose #{pant.number}
              </span>

              {/* Analyse-Status klein */}
              {pant.status === "waiting" && (
                <span
                  id={`status-badge-waiting-${pant.id}`}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700"
                >
                  Offen
                </span>
              )}
              {pant.status === "analyzing" && (
                <span
                  id={`status-badge-analyzing-${pant.id}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden xs:inline">Analysiert...</span>
                </span>
              )}
              {pant.status === "done" && (
                <span
                  id={`status-badge-done-${pant.id}`}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                >
                  <Check className="h-3 w-3" />
                  Fertig
                </span>
              )}
              {pant.status === "error" && (
                <span
                  id={`status-badge-error-${pant.id}`}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300"
                >
                  <AlertCircle className="h-3 w-3" />
                  Fehler
                </span>
              )}

              {isDuplicateArticleNumber && (
                <span
                  id={`duplicate-artnr-badge-${pant.id}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                  title={`Artikelnummer wird bereits verwendet bei Hose ${duplicatePantNumbers.map((n) => `#${n}`).join(", ")}`}
                >
                  <AlertCircle className="h-3 w-3" />
                  Doppelte Artikelnummer
                </span>
              )}
            </div>
            {pant.artikelnummer && (
              <span className="text-[10px] text-stone-500 dark:text-stone-400 truncate">
                Art.-Nr.: {pant.artikelnummer}
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Verkaufsstatus + Verkaufspreis + Aufklapp-Pfeil */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Verkaufsstatus Badge / Selector */}
          <div onClick={(e) => e.stopPropagation()}>
            <select
              id={`sale-status-${pant.id}`}
              value={pant.saleStatus || "draft"}
              onChange={(event) =>
                onSaleStatusChange(pant, event.target.value as SaleStatus)
              }
              className="h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-2 text-xs font-semibold text-stone-800 dark:text-stone-200 focus:border-stone-900 dark:focus:border-stone-300 focus:outline-none min-h-[36px]"
              aria-label={`Verkaufsstatus Hose ${pant.number}`}
            >
              {SALE_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Verkaufspreis, wenn verkauft */}
          {pant.saleStatus === "sold" && (
            <button
              id={`edit-sale-btn-${pant.id}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditSale(pant);
              }}
              className="inline-flex h-8 items-center px-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition-colors min-h-[36px]"
              title="Verkaufsdaten bearbeiten"
            >
              {pant.salePrice !== undefined
                ? `${pant.salePrice.toFixed(2).replace(".", ",")} €`
                : "Verkauf"}
            </button>
          )}

          {/* Aufklapp-Pfeil */}
          <button
            id={`toggle-collapse-btn-${pant.id}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate({
                ...pant,
                isCollapsed: !isCollapsed,
              });
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[44px] min-w-[44px]"
            title={isCollapsed ? "Details anzeigen" : "Einklappen"}
          >
            {isCollapsed ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* EXPANDED CONTENT AREA */}
      {!isCollapsed && (
        <div className="p-3.5 sm:p-5 border-t border-stone-100 dark:border-stone-800 space-y-5">
          {/* Action Row inside expanded state: Duplicate & Delete */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
            <button
              id={`duplicate-pant-btn-${pant.id}`}
              type="button"
              onClick={() => onDuplicate(pant)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-300 bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[40px]"
              title="Hose duplizieren (übernimmt Maße & Hinweise ohne Bilder)"
            >
              <CopyPlus className="h-4 w-4" />
              <span>Hose duplizieren</span>
            </button>

            <button
              id={`delete-pant-btn-${pant.id}`}
              type="button"
              onClick={() => onDelete(pant.id)}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 bg-white dark:bg-stone-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors text-xs font-semibold disabled:opacity-40 min-h-[40px]"
              title="Hose löschen"
            >
              <Trash2 className="h-4 w-4" />
              <span>Hose löschen</span>
            </button>
          </div>

          {/* Section 1: Photos */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-stone-100">
                  Fotos ({pant.images.length} / 5)
                </span>
                {pant.images.length > 0 && (
                  <button
                    id={`vinted-share-photos-btn-${pant.id}`}
                    type="button"
                    disabled={isPreparingPhotos}
                    onClick={handleShareVintedPhotos}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 min-h-[38px]"
                    title="Alle Fotos dieser Hose gesammelt im iPhone-Teilen-Menü öffnen"
                  >
                    {isPreparingPhotos ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Fotos werden vorbereitet…</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Fotos für Vinted</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <span className="text-xs text-stone-600 dark:text-stone-400 font-medium">
                {pant.images.length === 1
                  ? `1 Foto gehört zu Hose #${pant.number}`
                  : `${pant.images.length} Fotos gehören zu Hose #${pant.number}`}
              </span>
            </div>

            {/* Error message box for photo sharing */}
            {shareError && (
              <div
                id={`share-error-box-${pant.id}`}
                className="mb-3 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-medium"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span className="truncate">{shareError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShareError(null)}
                  className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 text-xs font-bold shrink-0 min-h-[32px] px-1"
                >
                  ×
                </button>
              </div>
            )}

            {/* Warning if 0 photos */}
            {pant.images.length === 0 && (
              <div
                id={`photo-warning-zero-${pant.id}`}
                className="mb-3 flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Bitte mindestens ein Foto hinzufügen.</span>
              </div>
            )}

            {/* Warning if user tried adding > 5 photos */}
            {showPhotoWarning && (
              <div className="mb-3 flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium animate-fade-in">
                <Info className="h-4 w-4 shrink-0" />
                <span>Maximal 5 Fotos je Hose erlaubt. Überschüssige Dateien wurden ignoriert.</span>
              </div>
            )}

            {/* Synthetic title image is separate from original source photos. */}
            {(pant.fitpic || pant.fitpicError || (pant.status === "done" && onGenerateFitpic)) && (
              <div className="mb-3 rounded-xl border border-stone-200 dark:border-stone-700 p-3 bg-stone-50 dark:bg-stone-800/60">
                <div className="flex items-start gap-3 flex-wrap">
                  {pant.fitpic && (
                    <img
                      src={pant.fitpic.dataUrl}
                      alt="KI-generiertes Tragebeispiel zur Prüfung"
                      className="h-60 w-44 max-w-full object-cover rounded-lg border border-stone-300 dark:border-stone-600"
                    />
                  )}
                  <div className="flex-1 min-w-[160px] space-y-2">
                    <div className="font-bold text-xs text-stone-900 dark:text-stone-100">
                      {pant.fitpic ? pant.fitpicApproved ? "KI-Fitpic freigegeben" : "KI-Fitpic prüfen (noch nicht veröffentlicht)" : "KI-Fitpic als Titelbild"}
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-300">
                      Erst prüfen, ob Waschung, Schnitt und Details deiner Jeans stimmen. Nur freigegebene KI-Tragebeispiele werden vor den Originalfotos exportiert.
                    </p>
                    {pant.fitpicError && <p className="text-xs text-rose-700 dark:text-rose-300">{pant.fitpicError}</p>}
                    {onGenerateFitpic && pant.status === "done" && (
                      <button
                        type="button"
                        disabled={isGeneratingFitpic || isAnalyzing}
                        onClick={() => onGenerateFitpic(pant)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-semibold disabled:opacity-50"
                      >
                        {isGeneratingFitpic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                        {isGeneratingFitpic ? "Fitpic entsteht…" : pant.fitpic ? "Fitpic neu erstellen" : "Fitpic erstellen"}
                      </button>
                    )}
                    {pant.fitpic && !pant.fitpicApproved && (
                      <button
                        type="button"
                        onClick={() => onUpdate({ ...pant, fitpicApproved: true, fitpicError: undefined })}
                        className="block px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
                        title="Nur wählen, wenn die KI-Jeans mit den Originalfotos übereinstimmt"
                      >
                        Geprüft – als Titelbild verwenden
                      </button>
                    )}
                    {pant.fitpic && (
                      <button
                        type="button"
                        onClick={() => onUpdate({ ...pant, fitpic: undefined, fitpicApproved: false, fitpicError: undefined })}
                        className="block text-xs underline text-stone-600 dark:text-stone-300"
                      >
                        Fitpic verwerfen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {pant.images.length > 0 && (
              <div className="mb-3 space-y-3">
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 p-3 space-y-2">
                  <div className="text-xs font-bold text-stone-800 dark:text-stone-100">
                    Flatlay: Welche Aufnahme zeigt was?
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-300">
                    Vor der kostenpflichtigen KI-Bearbeitung bitte prüfen. Standard bei 4 Produktbildern:
                    #1 vorne, #2–3 Detail, #4 hinten. Bei anderen Foto-Reihenfolgen unbedingt ändern.
                    Die graue Artikelnummer-Tüte auf Platz 5 wird nie bearbeitet.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {pant.images.slice(0,pant.images.length===5?4:5).map((img,index)=>(
                      <label key={img.id} className="rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-2 space-y-1 text-[11px] font-semibold text-stone-700 dark:text-stone-200">
                        <div className="flex items-center gap-2">
                          <img src={img.dataUrl} alt={`Originalfoto ${index+1} wählen`}
                            className="w-10 h-10 rounded object-cover bg-stone-100 dark:bg-stone-900"/>
                          Foto #{index+1}
                        </div>
                        <select value={getPhotoRole(img,index)} disabled={bulkBusy}
                          aria-label={`Foto ${index+1}: Vorderseite, Rückseite oder Detail`}
                          onChange={e=>changePhotoRole(img,e.target.value as ListingPhotoRole)}
                          className="w-full rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-1 py-2 text-[12px] text-stone-900 dark:text-stone-100">
                          <option value="front">Vorderseite</option>
                          <option value="back">Rückseite</option>
                          <option value="detail">Bund / Tasche / Detail</option>
                          <option value="skip">Nicht bearbeiten / Tüte</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={()=>void handleBatchPhotos("flatlay",bulkBackground)}
                      disabled={bulkBusy||isAnalyzing||isCompressing}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs px-4 py-2.5 min-h-[42px] disabled:opacity-50">
                      {bulkBusy&&bulkMode==="flatlay"?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}
                      {bulkBusy&&bulkMode==="flatlay"?"Flatlay-Fotos werden erstellt…":"Alle Bilder verschönern (Flatlay)"}
                    </button>
                    <button type="button" onClick={()=>void handleBatchPhotos("auto")}
                      disabled={bulkBusy||isAnalyzing||isCompressing}
                      className="inline-flex items-center gap-1 rounded-xl border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 font-semibold text-xs px-3 py-2.5 min-h-[42px] disabled:opacity-50">
                      {bulkBusy&&bulkMode==="auto"?<Loader2 className="h-4 w-4 animate-spin"/>:<ImageIcon className="h-4 w-4"/>}
                      Nur Licht / Kontrast (gratis)
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/70 p-2.5">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700 dark:text-stone-200 min-w-[140px]">
                    Bild-KI für Flatlays und Hintergründe
                    <select value={bulkProvider} disabled={bulkBusy} onChange={e=>setBulkProvider(e.target.value as ImageProvider)}
                      className="rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-2 py-2.5 text-sm min-h-[40px]">
                      <option value="flux-klein">FLUX Klein · günstig</option>
                      <option value="flux-pro">FLUX Pro · Qualität</option>
                      <option value="gemini">Gemini · bisherig</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-stone-700 dark:text-stone-200 flex-1 min-w-[150px]">
                    Hintergrund für Flatlays und Produktfotos
                    <select value={bulkBackground}
                      onChange={e=>setBulkBackground(e.target.value as BeautifyBackground)}
                      disabled={bulkBusy||isAnalyzing}
                      aria-label="Gemeinsamen Hintergrund auswählen"
                      className="w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-2.5 py-2.5 text-sm text-stone-900 dark:text-stone-100 min-h-[40px]">
                      {BACKGROUND_OPTIONS.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={()=>void handleBatchPhotos("background",bulkBackground)}
                    disabled={bulkBusy||isAnalyzing||isCompressing}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold min-h-[40px] disabled:opacity-50">
                    {bulkBusy&&bulkMode==="background"?<Loader2 className="h-4 w-4 animate-spin"/>:<Wand2 className="h-4 w-4"/>}
                    {bulkBusy&&bulkMode==="background"?"Hintergründe werden geändert…":"Alle Hintergründe ändern"}
                  </button>
                </div>
                {bulkProvider!=="gemini" && (
                  <p className="text-[11px] text-stone-600 dark:text-stone-400">
                    FLUX: Klein ab $0.015 bzw. Pro ab $0.045 je Bearbeitung.
                    Bei aktuell {pant.images.slice(0,pant.images.length===5?4:5).filter((img,i)=>getPhotoRole(img,i)!=="skip").length} ausgewählten Fotos
                    reserviert der Browser ca. $${(FLUX_RESERVED_USD[bulkProvider]*pant.images.slice(0,pant.images.length===5?4:5).filter((img,i)=>getPhotoRole(img,i)!=="skip").length).toFixed(2)}.
                    Diesen Monat lokal vorgemerkt: $${getLocalFluxUsage().toFixed(2)} von $${getLocalFluxCap().toFixed(2)}.
                    Dies ist keine kontoweite Ausgabensperre; Prepaid ohne Auto-Aufladung verwenden.
                  </p>
                )}
                {bulkBusy && <button type="button" onClick={()=>{bulkStop.current=true;}}
                  className="px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 text-xs font-bold text-stone-700 dark:text-stone-200">
                  Nach diesem Foto stoppen
                </button>}
                <p className="text-[11px] text-stone-600 dark:text-stone-400">
                  „Alle Bilder verschönern“ erstellt für Vorder- und Rückseiten Flatlays mit zwei
                  Knicken pro Bein und unten aneinanderliegenden Beinöffnungen. Detailfotos werden
                  als Nahaufnahme verbessert. Es handelt sich um neue KI-Bilder: echte Markenmerkmale
                  und Schäden vor Freigabe immer prüfen. „Nur Licht / Kontrast“ bearbeitet Originalpixel gratis.
                </p>
                {bulkProgress&&(
                  <div role="status" className="rounded-xl border border-stone-200 dark:border-stone-700 p-2.5 text-xs text-stone-700 dark:text-stone-300 space-y-1">
                    <span>{bulkBusy?(bulkMode==="flatlay"?"Flatlays werden erstellt":bulkMode==="background"?"Hintergründe ändern":"Originalfotos optimieren"):(bulkMode==="flatlay"?"Flatlay-Durchlauf beendet":bulkMode==="background"?"Hintergrund-Durchlauf beendet":"Fotokorrektur abgeschlossen")}: {bulkProgress.done}/{bulkProgress.total} Fotos.</span>
                    {!bulkBusy&&<span> Ergebnisse unten einzeln vergleichen und freigeben.</span>}
                    {bulkProgress.errors.map((err,i)=><p key={i} className="text-rose-700 dark:text-rose-300 break-words">{err}</p>)}
                  </div>
                )}
              </div>
            )}
            {/* Photo Preview Strip & Upload Button */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {pant.images.map((img, index) => (
                <div
                  key={img.id}
                  className="relative group rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 aspect-square overflow-hidden flex flex-col justify-between"
                >
                  <img
                    src={img.dataUrl}
                    alt={`Hose #${pant.number} Foto ${index + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Top Badge: Index */}
                  <div className="absolute top-1.5 left-1.5 bg-stone-900/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                    #{index + 1}
                  </div>

                  {/* Each photo: separate background preset / auto detail-aware beautifier. */}
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    {!(pant.images.length === 5 && index === 4) && (
                      <>
                        <button type="button"
                          disabled={bulkBusy || isAnalyzing}
                          onClick={() => setFlatlayEditor({ imageId: img.id, mode:"background" })}
                          className="flex h-9 px-1.5 items-center justify-center gap-1 rounded-lg bg-stone-900/85 text-amber-300 hover:bg-stone-900 min-h-[36px] text-[10px] font-bold disabled:opacity-40"
                          title="Hintergrund für nur dieses Foto auswählen">
                          <Wand2 className="h-3.5 w-3.5"/><span className="hidden sm:inline">BG</span>
                        </button>
                        <button type="button"
                          disabled={bulkBusy || isAnalyzing}
                          onClick={() => setFlatlayEditor({ imageId: img.id, mode:"auto" })}
                          className="flex h-9 px-1.5 items-center justify-center gap-1 rounded-lg bg-stone-900/85 text-teal-300 hover:bg-stone-900 min-h-[36px] text-[10px] font-bold disabled:opacity-40"
                          title="Originalgetreu Licht und Kontrast verbessern; experimentelles Flatlay im Editor wählbar">
                          <Sparkles className="h-3.5 w-3.5"/><span className="hidden sm:inline">Foto</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteImage(img.id)}
                      disabled={bulkBusy}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900/80 text-white hover:bg-rose-600 transition-colors backdrop-blur-xs min-h-[36px] min-w-[36px]"
                      title="Foto löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Bottom reorder bar */}
                  <div className="absolute bottom-0 inset-x-0 bg-stone-900/75 p-1 flex items-center justify-between text-white backdrop-blur-xs">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveImage(index, "left")}
                      className="p-1 hover:bg-white/20 rounded disabled:opacity-30 min-h-[36px]"
                      title="Nach links verschieben"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] font-semibold">
                      {Math.round(img.size / 1024)} KB
                    </span>
                    <button
                      type="button"
                      disabled={index === pant.images.length - 1}
                      onClick={() => handleMoveImage(index, "right")}
                      className="p-1 hover:bg-white/20 rounded disabled:opacity-30 min-h-[36px]"
                      title="Nach rechts verschieben"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add Photo Button (if < 5) */}
              {pant.images.length < 5 && (
                <button
                  id={`upload-photo-btn-${pant.id}`}
                  type="button"
                  disabled={isCompressing || isAnalyzing}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-stone-900 dark:hover:border-stone-300 bg-stone-50 dark:bg-stone-800/40 hover:bg-stone-100 dark:hover:bg-stone-800 aspect-square flex flex-col items-center justify-center gap-1.5 p-2 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors min-h-[100px]"
                >
                  {isCompressing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-stone-600 dark:text-stone-400" />
                      <span className="text-xs font-medium">Verarbeite...</span>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5 text-stone-600 dark:text-stone-400" />
                      <span className="text-xs font-semibold text-center leading-tight">
                        Fotos hinzufügen
                      </span>
                      <span className="text-[10px] text-stone-500 dark:text-stone-400">
                        ({5 - pant.images.length} frei)
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>

            {(pant.flatlays || []).length > 0 && (
              <div className="mt-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 p-3 space-y-2">
                <p className="text-xs font-bold text-stone-800 dark:text-stone-100">
                  Bearbeitete Fotos (Originalbilder bleiben erhalten)
                </p>
                <p className="text-[11px] text-stone-600 dark:text-stone-400">
                  Ergebnisse der Sammelbearbeitung sind zunächst nicht freigegeben. Vergleiche jedes KI-Foto mit dem Original; nur bestätigte Varianten können in den Vinted-Export.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(pant.flatlays || []).filter(entry => pant.images.some(img => img.id === entry.sourceImageId)).map(entry => (
                    <div key={entry.sourceImageId} className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-2 space-y-1.5">
                      <img src={entry.image.dataUrl} alt="Optional bearbeitetes Jeansfoto" className="aspect-square w-full object-contain rounded bg-stone-100 dark:bg-stone-800" />
                      <p className="text-[11px] text-stone-700 dark:text-stone-300 font-semibold">
                        Foto #{pant.images.findIndex(img => img.id === entry.sourceImageId) + 1}
                        {entry.mode === "natural" ? " · Original optimiert" : entry.mode === "detail" ? " · Detail" : entry.mode === "background" ? " · Hintergrund" : " · Flatlay"}
                      </p>
                      <button type="button" onClick={() => setFlatlayEditor({imageId: entry.sourceImageId, mode: "background"})}
                        disabled={bulkBusy}
                        className="block text-left text-[11px] underline text-amber-700 dark:text-amber-300 min-h-[28px]">
                        Hintergrund ändern
                      </button>
                      <button type="button" onClick={() => onUpdate({
                        ...pant,
                        flatlays: (pant.flatlays || []).map(f => f.sourceImageId === entry.sourceImageId
                          ? {...f, approved: !f.approved} : f),
                        updatedAt: Date.now(),
                      })} className="block w-full text-left text-[11px] font-semibold text-teal-700 dark:text-teal-300 min-h-[30px]">
                        {entry.approved ? "✓ Für Vinted freigegeben" : "Nicht freigegeben · aktivieren"}
                      </button>
                      <button type="button" onClick={() => {
                        if (!window.confirm("Diese Fotoversion entfernen? Das echte Original bleibt erhalten.")) return;
                        onUpdate({...pant, flatlays: (pant.flatlays || []).filter(f => f.sourceImageId !== entry.sourceImageId), updatedAt: Date.now()});
                      }} className="text-[11px] text-rose-700 dark:text-rose-300 underline min-h-[28px]">Variante entfernen</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Section 2: Artikelnummer & Optionale Maße */}
          <div className="space-y-3">
            {/* Artikelnummer Input */}
            <div className="max-w-xs">
              <label
                htmlFor={`artnr-${pant.id}`}
                className="block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1"
              >
                Artikelnummer
              </label>
              <input
                id={`artnr-${pant.id}`}
                type="text"
                placeholder="z.B. 123, A45, J-009"
                value={pant.artikelnummer || ""}
                onChange={(e) => handleArtikelnummerChange(e.target.value)}
                onFocus={() => onArticleNumberFocus?.(pant.id)}
                onBlur={() => onArticleNumberBlur?.(pant.id)}
                className={`w-full rounded-xl border ${
                  isDuplicateArticleNumber
                    ? "border-rose-400 dark:border-rose-600 bg-rose-50/30 dark:bg-rose-950/20"
                    : "border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90"
                } px-3 py-2 text-sm font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[40px] transition-colors`}
              />
              {isDuplicateArticleNumber && (
                <div
                  id={`duplicate-artnr-warning-${pant.id}`}
                  className="mt-1.5 flex items-start gap-1.5 p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <div>
                    <p className="font-bold">Artikelnummer bereits vergeben</p>
                    <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                      {duplicatePantNumbers.length === 1
                        ? `Diese Artikelnummer wird bereits bei Hose #${duplicatePantNumbers[0]} verwendet.`
                        : `Diese Artikelnummer wird bereits bei Hosen ${duplicatePantNumbers
                            .map((n) => `#${n}`)
                            .join(", ")} verwendet.`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Optionale Maße */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 block mb-1.5">
                Optionale Maße (in cm)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Bundweite
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="z.B. 40"
                      value={pant.measurements.waist}
                      onChange={(e) =>
                        handleMeasurementChange("waist", e.target.value)
                      }
                      className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-2.5 py-1.5 pr-7 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[40px] transition-colors"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-500 dark:text-stone-400 pointer-events-none">
                      cm
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Gesamtlänge
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="z.B. 104"
                      value={pant.measurements.totalLength}
                      onChange={(e) =>
                        handleMeasurementChange("totalLength", e.target.value)
                      }
                      className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-2.5 py-1.5 pr-7 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[40px] transition-colors"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-500 dark:text-stone-400 pointer-events-none">
                      cm
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Innenbeinlänge
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="z.B. 78"
                      value={pant.measurements.inseam}
                      onChange={(e) =>
                        handleMeasurementChange("inseam", e.target.value)
                      }
                      className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-2.5 py-1.5 pr-7 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[40px] transition-colors"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-500 dark:text-stone-400 pointer-events-none">
                      cm
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Beinöffnung
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="z.B. 18"
                      value={pant.measurements.legOpening}
                      onChange={(e) =>
                        handleMeasurementChange("legOpening", e.target.value)
                      }
                      className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-2.5 py-1.5 pr-7 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[40px] transition-colors"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-500 dark:text-stone-400 pointer-events-none">
                      cm
                    </span>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Oberschenkelbreite
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      placeholder="z.B. 29"
                      value={pant.measurements.thighWidth}
                      onChange={(e) =>
                        handleMeasurementChange("thighWidth", e.target.value)
                      }
                      className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-2.5 py-1.5 pr-7 text-xs sm:text-sm text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[40px] transition-colors"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-500 dark:text-stone-400 pointer-events-none">
                      cm
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Eigene Hinweise */}
          <div>
            <label
              htmlFor={`notes-${pant.id}`}
              className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1"
            >
              Eigene Hinweise
            </label>
            <input
              id={`notes-${pant.id}`}
              type="text"
              value={pant.customNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Beispiele: „kleiner Fleck hinten“, „Herren“, „ungetragen“"
              className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-3 py-2 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[42px] transition-colors"
            />
          </div>

          {/* Section 4: Action Buttons (Anzeige erstellen & Vinted-Entwurf vorbereiten) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                id={`analyze-pant-btn-${pant.id}`}
                type="button"
                disabled={pant.images.length === 0 || isAnalyzing}
                onClick={() => onAnalyze(pant)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all min-h-[44px] ${
                  pant.status === "error"
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-stone-200 text-white dark:text-stone-900 shadow-xs"
                } disabled:opacity-40 disabled:pointer-events-none`}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Wird analysiert...
                  </>
                ) : pant.status === "error" ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Erneut versuchen
                  </>
                ) : pant.status === "done" ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Neu generieren
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Anzeige erstellen
                  </>
                )}
              </button>

              {/* Button: Vinted-Entwurf vorbereiten */}
              {pant.status === "done" && (
                <button
                  id={`prepare-vinted-draft-btn-${pant.id}`}
                  type="button"
                  disabled={
                    pant.status !== "done" ||
                    !pant.result ||
                    !pant.images ||
                    pant.images.length === 0
                  }
                  onClick={() => onPrepareVintedDraft?.(pant)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white transition-all shadow-xs disabled:opacity-40 disabled:pointer-events-none min-h-[44px]"
                  title="Vinted-Entwurf aus diesem Ergebnis vorbereiten"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Vinted-Entwurf vorbereiten</span>
                </button>
              )}
            </div>

            {copyFeedback && (
              <div
                id={`copy-feedback-toast-${pant.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold animate-fade-in"
              >
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{copyFeedback} kopiert ✓</span>
              </div>
            )}
          </div>

          {/* Error display if any */}
          {pant.status === "error" && pant.errorMessage && (
            <div
              id={`error-message-box-${pant.id}`}
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs sm:text-sm flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{pant.errorMessage}</p>
                <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-0.5">
                  Fotos & Maße sind gespeichert. Klicke auf „Erneut versuchen“.
                </p>
              </div>
            </div>
          )}

          {/* Section 5: Generierte Anzeige (Result) */}
          {pant.result && (
            <div
              id={`result-container-${pant.id}`}
              className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-800 space-y-4"
            >
              {/* Top Quick Action: Alles Kopieren */}
              <div className="flex items-center justify-between bg-stone-100/70 dark:bg-stone-800/60 p-2.5 rounded-xl border border-stone-200 dark:border-stone-700">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-800 dark:text-stone-200">
                  Fertige Vinted-Anzeige
                </span>
                <button
                  id={`copy-all-btn-${pant.id}`}
                  type="button"
                  onClick={() =>
                    triggerCopy(getAllContentToCopy(), "Alles")
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-xs font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors min-h-[38px] shadow-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Alles kopieren
                </button>
              </div>

              {/* TITEL */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                    Titel ({pant.result.title.length}/100)
                  </label>
                  <button
                    id={`copy-title-btn-${pant.id}`}
                    type="button"
                    onClick={() => triggerCopy(pant.result!.title, "Titel")}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[32px]"
                  >
                    <Copy className="h-3 w-3" />
                    Kopieren
                  </button>
                </div>
                <input
                  type="text"
                  value={pant.result.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 p-2.5 text-xs sm:text-sm font-semibold text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none transition-colors"
                />
              </div>

              {/* BESCHREIBUNG */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                    Beschreibung
                  </label>
                  <button
                    id={`copy-desc-btn-${pant.id}`}
                    type="button"
                    onClick={() =>
                      triggerCopy(pant.result!.description, "Beschreibung")
                    }
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[32px]"
                  >
                    <Copy className="h-3 w-3" />
                    Kopieren
                  </button>
                </div>
                <textarea
                  rows={10}
                  value={pant.result.description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 p-2.5 text-xs sm:text-sm text-stone-900 dark:text-stone-100 leading-relaxed font-sans focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none transition-colors"
                />
              </div>

              {/* KI-PREISVORSCHLAG */}
              {pant.result.pricing && (
                <div
                  id={`pricing-card-${pant.id}`}
                  className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/30 p-3 sm:p-4 space-y-2.5"
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-amber-950 dark:text-amber-200">
                    <span>💰 KI-PREISVORSCHLAG</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold">
                    <div className="bg-white dark:bg-stone-900 p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-900/40 flex flex-col justify-between">
                      <span className="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">
                        Einstellen:
                      </span>
                      <span className="text-sm font-black text-stone-900 dark:text-stone-100 mt-0.5">
                        {pant.result.pricing.listingPrice} €
                      </span>
                    </div>
                    <div className="bg-white dark:bg-stone-900 p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-900/40 flex flex-col justify-between">
                      <span className="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">
                        Realistisch:
                      </span>
                      <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {pant.result.pricing.realisticPrice} €
                      </span>
                    </div>
                    <div className="bg-white dark:bg-stone-900 p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-900/40 flex flex-col justify-between">
                      <span className="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">
                        Schnellverkauf:
                      </span>
                      <span className="text-sm font-black text-amber-700 dark:text-amber-400 mt-0.5">
                        {pant.result.pricing.quickSalePrice} €
                      </span>
                    </div>
                    <div className="bg-white dark:bg-stone-900 p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-900/40 flex flex-col justify-between">
                      <span className="text-[10px] text-stone-500 dark:text-stone-400 uppercase font-bold">
                        Minimum:
                      </span>
                      <span className="text-sm font-black text-rose-700 dark:text-rose-400 mt-0.5">
                        {pant.result.pricing.minimumPrice} €
                      </span>
                    </div>
                  </div>
                  {pant.result.pricing.reasoning && (
                    <p className="text-xs text-stone-600 dark:text-stone-300 italic leading-snug pt-0.5">
                      „{pant.result.pricing.reasoning}“
                    </p>
                  )}
                </div>
              )}

              {/* Collapsible: Von KI erkannt */}
              <div className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-800/40 overflow-hidden">
                <button
                  id={`toggle-detected-btn-${pant.id}`}
                  type="button"
                  onClick={() =>
                    onUpdate({
                      ...pant,
                      isDetectedOpen: !pant.isDetectedOpen,
                    })
                  }
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-stone-100/70 dark:hover:bg-stone-800/70 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-stone-600 dark:text-stone-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                      Von KI erkannt
                    </span>
                  </div>
                  {pant.isDetectedOpen ? (
                    <ChevronUp className="h-4 w-4 text-stone-600 dark:text-stone-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-stone-600 dark:text-stone-400" />
                  )}
                </button>

                {pant.isDetectedOpen && (
                  <div className="p-3 border-t border-stone-200 dark:border-stone-700 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white dark:bg-stone-900/90">
                    <div>
                      <span className="text-stone-500 dark:text-stone-400 block text-[10px]">Marke:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {pant.result.detected.brand || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 dark:text-stone-400 block text-[10px]">Modell:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {pant.result.detected.model || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 dark:text-stone-400 block text-[10px]">Größe:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {pant.result.detected.size || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 dark:text-stone-400 block text-[10px]">Damen/Herren:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {pant.result.detected.gender || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 dark:text-stone-400 block text-[10px]">Farbe:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {pant.result.detected.color || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 dark:text-stone-400 block text-[10px]">Schnitt:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {pant.result.detected.fit || "—"}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-stone-500 dark:text-stone-400 block text-[10px]">Material:</span>
                      <span className="font-semibold text-stone-900 dark:text-stone-100">
                        {pant.result.detected.material || "—"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
