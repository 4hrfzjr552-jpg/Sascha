import React from "react";
import { AnalysisFilterType } from "../types";

interface AnalysisStatusBarProps {
  currentFilter: AnalysisFilterType;
  onFilterChange: (filter: AnalysisFilterType) => void;
  counts: Record<AnalysisFilterType, number>;
}

const ANALYSIS_FILTER_OPTIONS: Array<{
  id: AnalysisFilterType;
  label: string;
}> = [
  { id: "all", label: "Alle" },
  { id: "waiting", label: "Wartet" },
  { id: "done", label: "Fertig" },
  { id: "error", label: "Fehler" },
];

export const AnalysisStatusBar: React.FC<AnalysisStatusBarProps> = ({
  currentFilter,
  onFilterChange,
  counts,
}) => {
  return (
    <div
      id="analysis-status-bar"
      className="flex flex-wrap items-center gap-1 sm:gap-1.5"
    >
      {ANALYSIS_FILTER_OPTIONS.map((option) => {
        const isActive = currentFilter === option.id;
        return (
          <button
            key={option.id}
            id={`analysis-filter-tab-${option.id}`}
            type="button"
            onClick={() => onFilterChange(option.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all min-h-[44px] ${
              isActive
                ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs"
                : "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800"
            }`}
          >
            <span>{option.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                isActive
                  ? "bg-stone-800 dark:bg-stone-200 text-stone-200 dark:text-stone-800"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400"
              }`}
            >
              {counts[option.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
};
