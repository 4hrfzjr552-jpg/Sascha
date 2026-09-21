import React from "react";
import { FilterType, SaleStatus } from "../types";
import { SALE_STATUS_OPTIONS } from "../lib/saleStatus";

interface SaleStatusBarProps {
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  counts: {
    all: number;
  } & Record<SaleStatus, number>;
}

export const SaleStatusBar: React.FC<SaleStatusBarProps> = ({
  currentFilter,
  onFilterChange,
  counts,
}) => {
  const filterOptions: Array<{
    id: FilterType;
    label: string;
    count: number;
  }> = [
    { id: "all", label: "Alle", count: counts.all },
    ...SALE_STATUS_OPTIONS.map((option) => ({
      id: option.id as FilterType,
      label: option.label,
      count: counts[option.id],
    })),
  ];

  return (
    <div
      id="sale-status-bar"
      className="flex flex-wrap items-center gap-1 sm:gap-1.5"
    >
      {filterOptions.map((option) => {
        const isActive = currentFilter === option.id;
        return (
          <button
            key={option.id}
            id={`sale-filter-tab-${option.id}`}
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
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
