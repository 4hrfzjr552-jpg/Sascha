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
      className="bg-white dark:bg-stone-900 p-2 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs transition-colors duration-200"
    >
      <div className="flex flex-wrap items-center gap-1.5 w-full">
        {filterOptions.map((option) => {
          const isActive = currentFilter === option.id;
          return (
            <button
              key={option.id}
              id={`sale-filter-tab-${option.id}`}
              type="button"
              onClick={() => onFilterChange(option.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all min-h-[44px] ${
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
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
