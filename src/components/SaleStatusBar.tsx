import React from "react";
import { SaleFilterType } from "../types";
import { SALE_STATUS_ORDER, SALE_STATUS_LABELS } from "../lib/saleStatus";
import { Tag } from "lucide-react";

interface SaleStatusBarProps {
  currentFilter: SaleFilterType;
  onFilterChange: (filter: SaleFilterType) => void;
  counts: Record<SaleFilterType, number>;
}

export const SaleStatusBar: React.FC<SaleStatusBarProps> = ({
  currentFilter,
  onFilterChange,
  counts,
}) => {
  const options: Array<{ id: SaleFilterType; label: string }> = [
    { id: "all", label: "Alle" },
    ...SALE_STATUS_ORDER.map((s) => ({ id: s, label: SALE_STATUS_LABELS[s] })),
  ];

  return (
    <div
      id="sale-status-bar"
      className="bg-white dark:bg-stone-900 p-3 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs transition-colors duration-200"
    >
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <Tag className="h-3.5 w-3.5 text-stone-500 dark:text-stone-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Verkaufsstatus
        </span>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {options.map((opt) => {
          const isActive = currentFilter === opt.id;
          return (
            <button
              key={opt.id}
              id={`sale-filter-tab-${opt.id}`}
              type="button"
              onClick={() => onFilterChange(opt.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all min-h-[40px] ${
                isActive
                  ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs"
                  : "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700"
              }`}
            >
              <span>{opt.label}</span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  isActive
                    ? "bg-stone-800 dark:bg-stone-200 text-stone-200 dark:text-stone-800"
                    : "bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300"
                }`}
              >
                {counts[opt.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
