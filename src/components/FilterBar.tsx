import React from "react";
import { FilterType } from "../types";
import { Search, X } from "lucide-react";

interface FilterBarProps {
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  counts: {
    all: number;
    waiting: number;
    done: number;
    error: number;
  };
}

export const FilterBar: React.FC<FilterBarProps> = ({
  currentFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  counts,
}) => {
  const filterOptions: Array<{ id: FilterType; label: string; count: number }> = [
    { id: "all", label: "Alle", count: counts.all },
    { id: "waiting", label: "Wartet", count: counts.waiting },
    { id: "done", label: "Fertig", count: counts.done },
    { id: "error", label: "Fehler", count: counts.error },
  ];

  return (
    <div
      id="filter-bar"
      className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white dark:bg-stone-900 p-3 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs transition-colors duration-200"
    >
      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {filterOptions.map((opt) => {
          const isActive = currentFilter === opt.id;
          return (
            <button
              key={opt.id}
              id={`filter-tab-${opt.id}`}
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
                {opt.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500 dark:text-stone-400" />
        <input
          id="search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Nach Titel oder Marke suchen..."
          className="w-full pl-9.5 pr-8 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:focus:ring-stone-400 min-h-[40px] transition-colors"
        />
        {searchQuery && (
          <button
            id="clear-search-btn"
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
            title="Suche zurücksetzen"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
