import React from "react";
import { Sparkles, Layers, X, AlertTriangle, CheckCircle2 } from "lucide-react";

interface BatchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: "all" | "only_not_generated") => void;
  visiblePantsCount: number;
  allCandidatesCount: number;
  notGeneratedCandidatesCount: number;
  skippedNoArtNrCount: number;
  skippedNoImagesCount: number;
  alreadyGeneratedCount: number;
}

export const BatchSelectionModal: React.FC<BatchSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  visiblePantsCount,
  allCandidatesCount,
  notGeneratedCandidatesCount,
  skippedNoArtNrCount,
  skippedNoImagesCount,
  alreadyGeneratedCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div
        className="w-full sm:max-w-md bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl border border-stone-200 dark:border-stone-800 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Batch-Generierung
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Wähle den Modus für die Mehrfach-Generierung
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Summary */}
        <div className="bg-stone-50 dark:bg-stone-800/50 rounded-2xl p-3.5 space-y-2 border border-stone-200/60 dark:border-stone-800">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-700 dark:text-stone-300">
            <span>Aktuell gefiltert / sichtbar:</span>
            <span className="font-bold text-stone-900 dark:text-stone-100">
              {visiblePantsCount} {visiblePantsCount === 1 ? "Hose" : "Hosen"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-200/50 dark:border-stone-700/50 text-[11px]">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Bereits generiert: {alreadyGeneratedCount}</span>
            </div>
            {skippedNoArtNrCount > 0 ? (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Ohne Art.-Nr.: {skippedNoArtNrCount}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400 font-medium">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Ohne Fotos: {skippedNoImagesCount}</span>
              </div>
            )}
          </div>

          {skippedNoArtNrCount > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300/90 leading-tight bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
              * Hosen ohne Artikelnummer werden im Batch automatisch übersprungen.
            </p>
          )}
        </div>

        {/* Options */}
        <div className="space-y-2.5 pt-1">
          {/* Option 1: Alle Hosen generieren */}
          <button
            type="button"
            onClick={() => onConfirm("all")}
            disabled={allCandidatesCount === 0}
            className="w-full text-left p-3.5 rounded-2xl border border-stone-200 dark:border-stone-800 hover:border-stone-900 dark:hover:border-stone-100 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800/80 transition-all group disabled:opacity-50 disabled:pointer-events-none"
          >
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>Alle Hosen generieren</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900">
                {allCandidatesCount}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 leading-snug">
              Generiert oder überschreibt alle {allCandidatesCount} bereitstehenden Hosen im aktuellen Kontext neu.
            </p>
          </button>

          {/* Option 2: Nur nicht generierte Hosen generieren */}
          <button
            type="button"
            onClick={() => onConfirm("only_not_generated")}
            disabled={notGeneratedCandidatesCount === 0}
            className="w-full text-left p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all group disabled:opacity-50 disabled:pointer-events-none"
          >
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm text-emerald-950 dark:text-emerald-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Nur nicht generierte Hosen</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-700 dark:bg-emerald-500 text-white dark:text-stone-900">
                {notGeneratedCandidatesCount}
              </span>
            </div>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1 leading-snug">
              Überspringt bereits fertig generierte Ergebnisse und verarbeitet nur die {notGeneratedCandidatesCount} ausstehenden Hosen.
            </p>
          </button>
        </div>

        {/* Cancel Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-stone-200 dark:border-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[44px]"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
};
