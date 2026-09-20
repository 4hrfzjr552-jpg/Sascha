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
      className="flex items-center overflow-hidden bg-white dark:bg-stone-900 p-2 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs transition-colors duration-200"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full">
        {ANALYSIS_FILTER_OPTIONS.map((option) => {
          const isActive = currentFilter === option.id;
          return (
            <button
              key={option.id}
              id={`analysis-filter-tab-${option.id}`}
              type="button"
              onClick={() => onFilterChange(option.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all min-h-[40px] ${
                isActive
                  ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
              }`}
            >
              <span>{option.label}</span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  isActive
                    ? "bg-stone-800 dark:bg-stone-200 text-stone-200 dark:text-stone-800"
                    : "bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300"
                }`}
              >
                {counts[option.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
