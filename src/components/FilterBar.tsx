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
      className="relative w-full"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500 dark:text-stone-400 pointer-events-none" />
      <input
        id="search-input"
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Nach Titel, Marke oder #..."
        className="w-full pl-9 pr-8 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[40px] transition-colors shadow-xs"
      />
      {searchQuery && (
        <button
          id="clear-search-btn"
          type="button"
          onClick={() => onSearchChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
          title="Suche zurücksetzen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
