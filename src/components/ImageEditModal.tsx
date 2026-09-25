import React, { useState, useEffect } from "react";
import { X, Check, Sparkles, Loader2, ArrowLeftRight, RefreshCw, AlertCircle } from "lucide-react";
import { replaceBackground } from "../lib/backgroundEditor";

interface ImageEditModalProps {
  isOpen: boolean;
  originalDataUrl: string;
  imageName?: string;
  onClose: () => void;
  onAccept: (editedDataUrl: string) => void;
}

export const ImageEditModal: React.FC<ImageEditModalProps> = ({
  isOpen,
  originalDataUrl,
  imageName = "Foto",
  onClose,
  onAccept,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [editedDataUrl, setEditedDataUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"compare" | "edited" | "original">("compare");
  const [error, setError] = useState<string | null>(null);

  // Reset modal state whenever modal opens or original image changes
  useEffect(() => {
    if (isOpen) {
      setEditedDataUrl(null);
      setError(null);
      setIsLoading(false);
      setActiveTab("compare");
    }
  }, [isOpen, originalDataUrl]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await replaceBackground(originalDataUrl);
      setEditedDataUrl(result);
    } catch (err: any) {
      console.error("Error editing background:", err);
      setError(err?.message || "Fehler beim Ersetzen des Hintergrunds.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/80 backdrop-blur-xs overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-stone-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[92vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-stone-200 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 truncate">
                Hintergrund ersetzen
              </h3>
              <p className="text-[11px] sm:text-xs text-stone-500 dark:text-stone-400">
                Heller Mikrozement-Betonboden mit natürlichen Kontakt-Schatten
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-40 min-h-[44px] min-w-[44px]"
            title="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body / Preview */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {/* Initial State before generation */}
          {!isLoading && !editedDataUrl && !error && (
            <div className="flex flex-col items-center justify-center gap-4 py-4 sm:py-8 text-center max-w-lg mx-auto">
              <div className="relative rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-800 aspect-3/4 w-full max-w-xs sm:max-w-sm flex items-center justify-center shadow-md">
                <img
                  src={originalDataUrl}
                  alt="Original Hose Foto"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-1">
                <h4 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
                  Originalbild bereit zur Anpassung
                </h4>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Klicke auf den Button unten, um den Hintergrund per KI durch hellen Mikrozement-Betonboden zu ersetzen.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm shadow-lg hover:shadow-xl transition-all min-h-[48px] cursor-pointer"
              >
                <Sparkles className="h-5 w-5 text-stone-950" />
                <span>Hintergrund erstellen</span>
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="py-16 sm:py-24 flex flex-col items-center justify-center gap-3 text-center">
              <div className="relative flex items-center justify-center">
                <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
                <Sparkles className="h-4 w-4 text-amber-600 absolute" />
              </div>
              <p className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100">
                Hintergrund wird realistisch angepasst…
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm">
                Jeans wird sauber freigestellt, helle Mikrozement-Struktur eingesetzt und Kontaktschatten berechnet.
              </p>
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs sm:text-sm space-y-3">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <span>Anpassung fehlgeschlagen</span>
              </div>
              <p>{error}</p>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors min-h-[40px] shadow-xs cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Erneut versuchen</span>
              </button>
            </div>
          )}

          {/* Result Preview View */}
          {!isLoading && editedDataUrl && (
            <div className="space-y-3">
              {/* Mobile View Toggle Buttons */}
              <div className="flex items-center justify-center gap-1 p-1 rounded-xl bg-stone-100 dark:bg-stone-800/80 max-w-md mx-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab("compare")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-colors min-h-[38px] ${
                    activeTab === "compare"
                      ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs"
                      : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Vergleich
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("edited")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-colors min-h-[38px] ${
                    activeTab === "edited"
                      ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs"
                      : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                  }`}
                >
                  Bearbeitet
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("original")}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-colors min-h-[38px] ${
                    activeTab === "original"
                      ? "bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs"
                      : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                  }`}
                >
                  Original
                </button>
              </div>

              {/* Compare Mode (Side-by-side or stacked on small screens) */}
              {activeTab === "compare" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* Original */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-600 dark:text-stone-400 px-1">
                      <span>Original</span>
                    </div>
                    <div className="relative rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-800 aspect-3/4 max-h-[50vh] sm:max-h-[60vh] flex items-center justify-center">
                      <img
                        src={originalDataUrl}
                        alt="Original Hose"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* Bearbeitet */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300 px-1">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        Bearbeitet (Neuer Hintergrund)
                      </span>
                    </div>
                    <div className="relative rounded-2xl overflow-hidden border-2 border-amber-400/80 dark:border-amber-500/80 bg-stone-100 dark:bg-stone-800 aspect-3/4 max-h-[50vh] sm:max-h-[60vh] flex items-center justify-center shadow-md">
                      <img
                        src={editedDataUrl}
                        alt="Bearbeitetes Hose Foto"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Single Image Views */}
              {activeTab === "edited" && (
                <div className="relative rounded-2xl overflow-hidden border-2 border-amber-400 dark:border-amber-500 bg-stone-100 dark:bg-stone-800 aspect-3/4 max-h-[60vh] mx-auto flex items-center justify-center shadow-lg max-w-md">
                  <img
                    src={editedDataUrl}
                    alt="Bearbeitetes Hose Foto"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}

              {activeTab === "original" && (
                <div className="relative rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-800 aspect-3/4 max-h-[60vh] mx-auto flex items-center justify-center max-w-md">
                  <img
                    src={originalDataUrl}
                    alt="Original Hose Foto"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / Action Buttons */}
        <div className="p-3.5 sm:p-5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/90 flex flex-wrap items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs sm:text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[44px] disabled:opacity-40"
          >
            Abbrechen
          </button>

          <button
            type="button"
            disabled={isLoading || !editedDataUrl}
            onClick={() => {
              if (editedDataUrl) {
                onAccept(editedDataUrl);
              }
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-stone-200 text-xs sm:text-sm font-bold text-white dark:text-stone-900 transition-all min-h-[44px] shadow-xs disabled:opacity-40 disabled:pointer-events-none"
          >
            <Check className="h-4 w-4 text-emerald-400 dark:text-emerald-600" />
            <span>Übernehmen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
