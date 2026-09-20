import React from "react";
import { Search, X } from "lucide-react";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div
      id="filter-bar"
      className="flex flex-col gap-3 items-stretch bg-white dark:bg-stone-900 p-3 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs transition-colors duration-200"
    >
      {/* Search Bar */}
      <div className="relative w-full">
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
