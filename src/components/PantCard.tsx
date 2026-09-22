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
} from "lucide-react";
import { compressImageFile } from "../lib/imageCompressor";
import { shareVintedPhotos } from "../lib/vintedShare";
import { formatTitleWithArticleNumber } from "../lib/titleUtils";
import { SALE_STATUS_OPTIONS, getSaleStatusLabel } from "../lib/saleStatus";
import { getDuplicatePantNumbers } from "../lib/articleNumberUtils";

interface PantCardProps {
  pant: PantItem;
  allPants?: PantItem[];
  onUpdate: (updated: PantItem) => void;
  onDelete: (id: string) => void;
  onDuplicate: (pant: PantItem) => void;
  onAnalyze: (pant: PantItem) => void;
  onSaleStatusChange: (pant: PantItem, status: SaleStatus) => void;
  onEditSale: (pant: PantItem) => void;
  isAnalyzingAny: boolean;
}

export const PantCard: React.FC<PantCardProps> = ({
  pant,
  allPants = [],
  onUpdate,
  onDelete,
  onDuplicate,
  onAnalyze,
  onSaleStatusChange,
  onEditSale,
  isAnalyzingAny,
}) => {
  const duplicatePantNumbers = getDuplicatePantNumbers(pant, allPants);
  const isDuplicateArticleNumber = duplicatePantNumbers.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showPhotoWarning, setShowPhotoWarning] = useState(false);
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

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

  // Delete an image
  const handleDeleteImage = (imageId: string) => {
    onUpdate({
      ...pant,
      images: pant.images.filter((img) => img.id !== imageId),
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
  const firstPhoto = pant.images.length > 0 ? pant.images[0].dataUrl : null;

  return (
    <div
      id={`pant-card-${pant.id}`}
      className={`rounded-2xl border transition-all duration-200 bg-white dark:bg-stone-900 shadow-xs overflow-hidden ${
        isAnalyzing
          ? "border-amber-400 dark:border-amber-500 ring-2 ring-amber-100 dark:ring-amber-950"
          : pant.status === "error"
          ? "border-rose-300 dark:border-rose-800"
          : "border-stone-200 dark:border-stone-800"
      }`}
    >
      {/* COLLAPSED HEADER / COMPACT SUMMARY ROW */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
        onClick={() => onUpdate({ ...pant, isCollapsed: !isCollapsed })}
      >
        {/* Left Side: Thumbnail + Hose #Nummer + Analyse-Status */}
        <div className="flex items-center gap-2.5 min-w-0">
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

                  {/* Delete button top right */}
                  <button
                    type="button"
                    onClick={() => handleDeleteImage(img.id)}
                    className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900/80 text-white hover:bg-rose-600 transition-colors backdrop-blur-xs min-h-[36px] min-w-[36px]"
                    title="Foto löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

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

          {/* Section 4: Action Buttons (Anzeige erstellen) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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
