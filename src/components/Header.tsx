import React, { useRef, useState, useEffect } from "react";
import {
  Plus,
  PlusCircle,
  Play,
  Settings,
  Download,
  Upload,
  FileSpreadsheet,
  Trash2,
  Minimize2,
  Maximize2,
  StopCircle,
  Sparkles,
  Sun,
  Moon,
  Layers,
  BarChart2,
  MoreHorizontal,
  X,
  Receipt,
  LogOut,
  User,
} from "lucide-react";

interface HeaderProps {
  userEmail?: string;
  onLogout?: () => void;
  totalCount: number;
  maxLimit: number;
  doneCount: number;
  isBatchRunning: boolean;
  batchActiveCount: number;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onAddNewPant: () => void;
  onOpenAddMultiple: () => void;
  onOpenBulkUpload: () => void;
  onOpenBatchModal: () => void;
  onStopBatch: () => void;
  onToggleCollapseAll: () => void;
  areAllCollapsed: boolean;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  onOpenExpenses: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportCsv: () => void;
  onOpenDeleteProject: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  userEmail,
  onLogout,
  totalCount,
  maxLimit,
  doneCount,
  isBatchRunning,
  batchActiveCount,
  isDarkMode,
  onToggleDarkMode,
  onAddNewPant,
  onOpenAddMultiple,
  onOpenBulkUpload,
  onOpenBatchModal,
  onStopBatch,
  onToggleCollapseAll,
  areAllCollapsed,
  onOpenSettings,
  onOpenStats,
  onOpenExpenses,
  onExportJson,
  onImportJson,
  onExportCsv,
  onOpenDeleteProject,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const percentDone =
    totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMoreOpen]);

  return (
    <header
      id="app-header"
      className="sticky top-0 z-30 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 shadow-xs transition-colors duration-200"
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5">
        {/* Top bar: Brand + Counts + Stats + Dark Mode + Settings */}
        <div className="flex items-center justify-between gap-2">
          {/* Brand & Count */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-black text-sm sm:text-base shadow-xs transition-colors">
              S
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-black text-stone-900 dark:text-stone-100 tracking-tight leading-none truncate">
                Sascha AI
              </h1>
              <p className="text-[11px] sm:text-xs text-stone-600 dark:text-stone-400 font-medium leading-tight mt-0.5 truncate">
                {totalCount} Hosen <span className="text-stone-400">•</span>{" "}
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {doneCount} fertig
                </span>
              </p>
            </div>
          </div>

          {/* Right side icons & Stats button */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Button Statistiken */}
            <button
              id="open-stats-btn"
              type="button"
              onClick={onOpenStats}
              className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 px-2.5 sm:px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors shadow-xs font-semibold text-xs min-h-[44px]"
              title="Statistiken anzeigen"
              aria-label="Statistiken anzeigen"
            >
              <BarChart2 className="h-4 w-4 text-stone-700 dark:text-stone-200" />
              <span>Statistiken</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              id="dark-mode-toggle-btn"
              type="button"
              onClick={onToggleDarkMode}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors shadow-xs min-h-[44px] min-w-[44px]"
              title={isDarkMode ? "Hellmodus aktivieren" : "Dunkelmodus aktivieren"}
              aria-label={isDarkMode ? "Hellmodus aktivieren" : "Dunkelmodus aktivieren"}
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 sm:h-5 sm:w-5" />
              )}
            </button>

            {/* Settings Trigger */}
            <button
              id="open-settings-btn"
              type="button"
              onClick={onOpenSettings}
              className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors shadow-xs min-h-[44px] min-w-[44px]"
              title="Einstellungen (Mein Vinted-Prompt)"
              aria-label="Einstellungen"
            >
              <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {totalCount > 0 && (
          <div className="mt-2">
            <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden border border-stone-200/60 dark:border-stone-700/60">
              <div
                className="bg-emerald-600 dark:bg-emerald-500 h-1.5 transition-all duration-300 rounded-full"
                style={{ width: `${percentDone}%` }}
              />
            </div>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="mt-2 flex items-center justify-between gap-1.5 pt-1.5 border-t border-stone-100 dark:border-stone-800 relative" ref={moreMenuRef}>
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap w-full">
            {/* Neue Hose */}
            <button
              id="add-new-pant-btn"
              type="button"
              disabled={totalCount >= maxLimit}
              onClick={onAddNewPant}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-xs sm:text-sm font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-40 transition-colors shadow-xs min-h-[44px] shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Neue Hose</span>
            </button>

            {/* Sammel-Upload */}
            <button
              id="bulk-upload-btn"
              type="button"
              onClick={onOpenBulkUpload}
              className="inline-flex items-center justify-center gap-1 px-2.5 sm:px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs sm:text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors shadow-xs min-h-[44px] shrink-0"
              title="Viele Bilder auf einmal hochladen"
            >
              <Layers className="h-4 w-4 text-stone-600 dark:text-stone-400" />
              <span>Sammel-Upload</span>
            </button>

            {/* Alle Anzeigen erstellen */}
            {isBatchRunning ? (
              <button
                id="stop-batch-btn"
                type="button"
                onClick={onStopBatch}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-rose-600 text-xs sm:text-sm font-semibold text-white hover:bg-rose-700 transition-colors shadow-xs min-h-[44px] shrink-0"
              >
                <StopCircle className="h-4 w-4 animate-pulse" />
                <span>Abbrechen ({batchActiveCount})</span>
              </button>
            ) : (
              <button
                id="create-all-ads-btn"
                type="button"
                disabled={totalCount === 0}
                onClick={onOpenBatchModal}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-40 transition-colors shadow-xs min-h-[44px] shrink-0"
                title="Mehrfach-Generierung starten"
              >
                <Play className="h-3.5 w-3.5 fill-white" />
                <span>Alle generieren</span>
              </button>
            )}

            {/* Button Mehr */}
            <button
              id="more-actions-btn"
              type="button"
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs sm:text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors shadow-xs min-h-[44px] shrink-0 ml-auto"
              title="Weitere Aktionen"
              aria-label="Weitere Aktionen"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>Mehr</span>
            </button>
          </div>

          {/* More Menu Dropdown / Bottom-Sheet */}
          {isMoreOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2 shadow-xl z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-stone-100 dark:border-stone-800">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Weitere Aktionen
                </span>
                <button
                  type="button"
                  onClick={() => setIsMoreOpen(false)}
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Ausgaben erfassen */}
              <button
                id="open-expenses-btn"
                type="button"
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenExpenses();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[44px]"
              >
                <Receipt className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                <span>Ausgaben erfassen</span>
              </button>

              {/* + Mehrere Hosen */}
              <button
                id="add-multiple-pants-btn"
                type="button"
                disabled={totalCount >= maxLimit}
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenAddMultiple();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 transition-colors min-h-[44px]"
              >
                <PlusCircle className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                <span>+ Mehrere Hosen anlegen</span>
              </button>

              {/* Batch-Generierung ausführen */}
              <button
                id="create-missing-ads-btn"
                type="button"
                disabled={totalCount === 0 || isBatchRunning}
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenBatchModal();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 transition-colors min-h-[44px]"
              >
                <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Batch-Generierung…</span>
              </button>

              {/* Einklappen / Ausklappen */}
              <button
                id="collapse-all-btn"
                type="button"
                onClick={() => {
                  setIsMoreOpen(false);
                  onToggleCollapseAll();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[44px]"
              >
                {areAllCollapsed ? (
                  <>
                    <Maximize2 className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                    <span>Alle Ausklappen</span>
                  </>
                ) : (
                  <>
                    <Minimize2 className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                    <span>Alle fertigen einklappen</span>
                  </>
                )}
              </button>

              <div className="border-t border-stone-100 dark:border-stone-800 my-1" />

              {/* CSV Export */}
              <button
                id="export-csv-btn"
                type="button"
                disabled={totalCount === 0}
                onClick={() => {
                  setIsMoreOpen(false);
                  onExportCsv();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 transition-colors min-h-[44px]"
              >
                <FileSpreadsheet className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                <span>CSV exportieren</span>
              </button>

              {/* JSON Export */}
              <button
                id="export-project-btn"
                type="button"
                disabled={totalCount === 0}
                onClick={() => {
                  setIsMoreOpen(false);
                  onExportJson();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 transition-colors min-h-[44px]"
              >
                <Download className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                <span>Projekt exportieren (JSON)</span>
              </button>

              {/* JSON Import */}
              <button
                id="import-project-btn"
                type="button"
                onClick={() => {
                  setIsMoreOpen(false);
                  fileInputRef.current?.click();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[44px]"
              >
                <Upload className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                <span>Projekt importieren (JSON)</span>
              </button>

              <div className="border-t border-stone-100 dark:border-stone-800 my-1" />

              {/* Projekt löschen */}
              <button
                id="delete-project-btn"
                type="button"
                disabled={totalCount === 0}
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenDeleteProject();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 transition-colors min-h-[44px]"
              >
                <Trash2 className="h-4 w-4 text-rose-600" />
                <span>Gesamtes Projekt löschen</span>
              </button>

              {onLogout && (
                <>
                  <div className="border-t border-stone-100 dark:border-stone-800 my-1" />
                  <div className="px-3 py-1 text-[10px] font-medium text-stone-500 dark:text-stone-400 flex items-center gap-1 truncate">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{userEmail}</span>
                  </div>
                  <button
                    id="logout-btn"
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[44px]"
                  >
                    <LogOut className="h-4 w-4 text-stone-500" />
                    <span>Abmelden</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Hidden JSON file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </header>
  );
};
