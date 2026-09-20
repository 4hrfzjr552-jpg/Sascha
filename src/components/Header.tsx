import React, { useRef } from "react";
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
} from "lucide-react";

interface HeaderProps {
  totalCount: number;
  maxLimit: number;
  doneCount: number;
  isBatchRunning: boolean;
  batchActiveCount: number;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onAddNewPant: () => void;
  onOpenAddMultiple: () => void;
  onStartBatch: (onlyMissing: boolean) => void;
  onStopBatch: () => void;
  onToggleCollapseAll: () => void;
  areAllCollapsed: boolean;
  onOpenSettings: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportCsv: () => void;
  onOpenDeleteProject: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  totalCount,
  maxLimit,
  doneCount,
  isBatchRunning,
  batchActiveCount,
  isDarkMode,
  onToggleDarkMode,
  onAddNewPant,
  onOpenAddMultiple,
  onStartBatch,
  onStopBatch,
  onToggleCollapseAll,
  areAllCollapsed,
  onOpenSettings,
  onExportJson,
  onImportJson,
  onExportCsv,
  onOpenDeleteProject,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <header
      id="app-header"
      className="sticky top-0 z-30 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 shadow-xs transition-colors duration-200"
    >
      <div className="max-w-5xl mx-auto px-4 py-3 sm:px-6">
        {/* Top bar: Brand + Counts + Dark Mode + Settings */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-black text-base shadow-xs transition-colors">
              S
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight leading-none">
                Sascha Ai
              </h1>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 font-medium mt-0.5 hidden sm:block">
                Massen-Generator für Vinted Hosen-Anzeigen
              </p>
            </div>
          </div>

          {/* Counts and Progress Badge & Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs sm:text-sm font-semibold text-stone-900 dark:text-stone-100 transition-colors">
              <span id="pant-counter">
                {totalCount} / {maxLimit} Hosen
              </span>
              <span className="text-stone-400 dark:text-stone-500">•</span>
              <span id="done-counter" className="text-emerald-700 dark:text-emerald-400 font-bold">
                {doneCount} / {totalCount} fertig
              </span>
            </div>

            {/* Dark Mode Toggle */}
            <button
              id="dark-mode-toggle-btn"
              type="button"
              onClick={onToggleDarkMode}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-white transition-colors shadow-xs"
              title={isDarkMode ? "Hellmodus aktivieren" : "Dunkelmodus aktivieren"}
              aria-label={isDarkMode ? "Hellmodus aktivieren" : "Dunkelmodus aktivieren"}
            >
              {isDarkMode ? (
                <Sun className="h-5 w-5 text-amber-400" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>

            {/* Settings Trigger */}
            <button
              id="open-settings-btn"
              type="button"
              onClick={onOpenSettings}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 hover:text-stone-900 dark:hover:text-white transition-colors shadow-xs"
              title="Einstellungen (Mein Vinted-Prompt)"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {totalCount > 0 && (
          <div className="mt-2.5">
            <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-2 overflow-hidden border border-stone-200 dark:border-stone-700">
              <div
                className="bg-emerald-600 dark:bg-emerald-500 h-2 transition-all duration-300 rounded-full"
                style={{ width: `${percentDone}%` }}
              />
            </div>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-100 dark:border-stone-800">
          <div className="flex flex-wrap items-center gap-2">
            {/* + Neue Hose */}
            <button
              id="add-new-pant-btn"
              type="button"
              disabled={totalCount >= maxLimit}
              onClick={onAddNewPant}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-sm font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-40 transition-colors shadow-xs min-h-[44px]"
            >
              <Plus className="h-4 w-4" />
              <span>+ Neue Hose</span>
            </button>

            {/* Mehrere Hosen hinzufügen */}
            <button
              id="add-multiple-pants-btn"
              type="button"
              disabled={totalCount >= maxLimit}
              onClick={onOpenAddMultiple}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors shadow-xs min-h-[44px]"
            >
              <PlusCircle className="h-4 w-4 text-stone-600 dark:text-stone-400" />
              <span className="hidden xs:inline">Mehrere hinzufügen</span>
              <span className="xs:hidden">+ Mehrere</span>
            </button>

            {/* Alle Anzeigen erstellen */}
            {isBatchRunning ? (
              <button
                id="stop-batch-btn"
                type="button"
                onClick={onStopBatch}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 text-sm font-semibold text-white hover:bg-amber-700 transition-colors shadow-xs min-h-[44px]"
              >
                <StopCircle className="h-4 w-4 animate-pulse" />
                <span>Stoppen ({batchActiveCount} aktiv)</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  id="create-all-ads-btn"
                  type="button"
                  disabled={totalCount === 0}
                  onClick={() => onStartBatch(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-40 transition-colors shadow-xs min-h-[44px]"
                  title="Alle Hosen nacheinander (max. 3 gleichzeitig) analysieren"
                >
                  <Play className="h-4 w-4 fill-white" />
                  <span>Alle Anzeigen erstellen</span>
                </button>

                <button
                  id="create-missing-ads-btn"
                  type="button"
                  disabled={totalCount === 0 || doneCount === totalCount}
                  onClick={() => onStartBatch(true)}
                  className="hidden md:inline-flex items-center gap-1 px-3 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-xs font-semibold text-emerald-900 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-40 transition-colors min-h-[44px]"
                  title="Nur fehlende Anzeigen erstellen"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Nur fehlende</span>
                </button>
              </div>
            )}
          </div>

          {/* Secondary Actions & Menus */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {/* Collapse all */}
            <button
              id="collapse-all-btn"
              type="button"
              onClick={onToggleCollapseAll}
              className="flex h-10 px-2.5 items-center justify-center gap-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              title={areAllCollapsed ? "Alle ausklappen" : "Alle fertigen einklappen"}
            >
              {areAllCollapsed ? (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Alle ausklappen</span>
                </>
              ) : (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Alle fertigen einklappen</span>
                </>
              )}
            </button>

            {/* CSV Export */}
            <button
              id="export-csv-btn"
              type="button"
              onClick={onExportCsv}
              disabled={totalCount === 0}
              className="flex h-10 px-2.5 items-center justify-center gap-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors"
              title="CSV exportieren"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-stone-600 dark:text-stone-400" />
              <span className="hidden lg:inline">CSV</span>
            </button>

            {/* JSON Export */}
            <button
              id="export-project-btn"
              type="button"
              onClick={onExportJson}
              disabled={totalCount === 0}
              className="flex h-10 px-2.5 items-center justify-center gap-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors"
              title="Projekt exportieren (JSON)"
            >
              <Download className="h-3.5 w-3.5 text-stone-600 dark:text-stone-400" />
              <span className="hidden lg:inline">Export</span>
            </button>

            {/* JSON Import */}
            <button
              id="import-project-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 px-2.5 items-center justify-center gap-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
              title="Projekt importieren (JSON)"
            >
              <Upload className="h-3.5 w-3.5 text-stone-600 dark:text-stone-400" />
              <span className="hidden lg:inline">Import</span>
            </button>

            {/* Hidden JSON file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Projekt löschen */}
            <button
              id="delete-project-btn"
              type="button"
              onClick={onOpenDeleteProject}
              disabled={totalCount === 0}
              className="flex h-10 px-2.5 items-center justify-center gap-1 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-800 disabled:opacity-40 transition-colors"
              title="Projekt löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Projekt löschen</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
