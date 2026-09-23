import React, { useState } from "react";
import { Search, X } from "lucide-react";
import {
  FilterType,
  AnalysisFilterType,
  GenerationFilterType,
  ArticleNumberFilterType,
  MeasurementsFilterType,
  SaleStatus,
} from "../types";
import { SALE_STATUS_OPTIONS } from "../lib/saleStatus";

export type FilterCategory =
  | "generation"
  | "analysis"
  | "sale"
  | "articleNumber"
  | "measurements";

interface FilterBarProps {
  // Generation
  generationFilter: GenerationFilterType;
  onGenerationFilterChange: (filter: GenerationFilterType) => void;
  generationCounts: Record<GenerationFilterType, number>;

  // Analysis
  analysisFilter: AnalysisFilterType;
  onAnalysisFilterChange: (filter: AnalysisFilterType) => void;
  analysisCounts: Record<AnalysisFilterType, number>;

  // Sale
  saleFilter: FilterType;
  onSaleFilterChange: (filter: FilterType) => void;
  saleCounts: { all: number } & Record<SaleStatus, number>;

  // Article Number
  articleNumberFilter: ArticleNumberFilterType;
  onArticleNumberFilterChange: (filter: ArticleNumberFilterType) => void;
  articleNumberCounts: {
    all: number;
    missing: number;
    digit_1: number;
    digit_2: number;
    digit_3_plus: number;
  };

  // Measurements
  measurementsFilter: MeasurementsFilterType;
  onMeasurementsFilterChange: (filter: MeasurementsFilterType) => void;
  measurementsCounts: {
    all: number;
    missing: number;
  };

  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;
  articleNumberSearchQuery: string;
  onArticleNumberSearchChange: (query: string) => void;
}

const CATEGORY_TABS: Array<{ id: FilterCategory; label: string }> = [
  { id: "generation", label: "Generierung" },
  { id: "analysis", label: "Analyse" },
  { id: "sale", label: "Verkauf" },
  { id: "articleNumber", label: "Artikelnummer" },
  { id: "measurements", label: "Maße" },
];

const GENERATION_OPTIONS: Array<{ id: GenerationFilterType; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "generated", label: "Generiert" },
  { id: "not_generated", label: "Nicht generiert" },
];

const ANALYSIS_OPTIONS: Array<{ id: AnalysisFilterType; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "waiting", label: "Wartet" },
  { id: "done", label: "Fertig" },
  { id: "error", label: "Fehler" },
];

const MEASUREMENTS_OPTIONS: Array<{ id: MeasurementsFilterType; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "missing", label: "Maße fehlen" },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  generationFilter,
  onGenerationFilterChange,
  generationCounts,
  analysisFilter,
  onAnalysisFilterChange,
  analysisCounts,
  saleFilter,
  onSaleFilterChange,
  saleCounts,
  articleNumberFilter,
  onArticleNumberFilterChange,
  articleNumberCounts,
  measurementsFilter,
  onMeasurementsFilterChange,
  measurementsCounts,
  searchQuery,
  onSearchChange,
  articleNumberSearchQuery,
  onArticleNumberSearchChange,
}) => {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>("generation");

  const saleOptions: Array<{ id: FilterType; label: string }> = [
    { id: "all", label: "Alle" },
    ...SALE_STATUS_OPTIONS.map((opt) => ({
      id: opt.id as FilterType,
      label: opt.label,
    })),
  ];

  const articleNumberOptions: Array<{ id: ArticleNumberFilterType; label: string }> = [
    { id: "all", label: "Alle" },
    { id: "missing", label: "Fehlt" },
    { id: "digit_1", label: "1-stellig" },
    { id: "digit_2", label: "2-stellig" },
    { id: "digit_3_plus", label: "3-stellig+" },
  ];

  return (
    <div
      id="compact-filter-section"
      className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-2 sm:p-2.5 shadow-xs space-y-2 transition-colors"
    >
      {/* 1. Category Tabs Bar */}
      <div className="flex items-center gap-1 border-b border-stone-100 dark:border-stone-800/80 pb-1.5 overflow-x-auto no-scrollbar">
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              id={`filter-tab-${tab.id}`}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`whitespace-nowrap px-2.5 py-1 text-xs font-semibold rounded-lg transition-all min-h-[32px] flex items-center justify-center ${
                isActive
                  ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 2. Active Category Chips / Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {/* Generierung Chips */}
        {activeCategory === "generation" &&
          GENERATION_OPTIONS.map((opt) => {
            const isActive = generationFilter === opt.id;
            const count = generationCounts[opt.id];
            return (
              <button
                key={opt.id}
                id={`generation-chip-${opt.id}`}
                type="button"
                onClick={() => onGenerationFilterChange(opt.id)}
                className={`whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all min-h-[32px] border ${
                  isActive
                    ? "bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 border-stone-800 dark:border-stone-200"
                    : "bg-stone-50 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/60 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive
                      ? "bg-stone-700 dark:bg-stone-300 text-stone-100 dark:text-stone-900"
                      : "bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

        {/* Analyse Chips */}
        {activeCategory === "analysis" &&
          ANALYSIS_OPTIONS.map((opt) => {
            const isActive = analysisFilter === opt.id;
            const count = analysisCounts[opt.id];
            return (
              <button
                key={opt.id}
                id={`analysis-chip-${opt.id}`}
                type="button"
                onClick={() => onAnalysisFilterChange(opt.id)}
                className={`whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all min-h-[32px] border ${
                  isActive
                    ? "bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 border-stone-800 dark:border-stone-200"
                    : "bg-stone-50 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/60 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive
                      ? "bg-stone-700 dark:bg-stone-300 text-stone-100 dark:text-stone-900"
                      : "bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

        {/* Verkauf Chips */}
        {activeCategory === "sale" &&
          saleOptions.map((opt) => {
            const isActive = saleFilter === opt.id;
            const count = opt.id === "all" ? saleCounts.all : saleCounts[opt.id as SaleStatus];
            return (
              <button
                key={opt.id}
                id={`sale-chip-${opt.id}`}
                type="button"
                onClick={() => onSaleFilterChange(opt.id)}
                className={`whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all min-h-[32px] border ${
                  isActive
                    ? "bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 border-stone-800 dark:border-stone-200"
                    : "bg-stone-50 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/60 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive
                      ? "bg-stone-700 dark:bg-stone-300 text-stone-100 dark:text-stone-900"
                      : "bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

        {/* Artikelnummer Chips */}
        {activeCategory === "articleNumber" &&
          articleNumberOptions.map((opt) => {
            const isActive = articleNumberFilter === opt.id;
            const count =
              opt.id === "all"
                ? articleNumberCounts.all
                : opt.id === "missing"
                ? articleNumberCounts.missing
                : opt.id === "digit_1"
                ? articleNumberCounts.digit_1
                : opt.id === "digit_2"
                ? articleNumberCounts.digit_2
                : articleNumberCounts.digit_3_plus;
            return (
              <button
                key={opt.id}
                id={`article-number-chip-${opt.id}`}
                type="button"
                onClick={() => onArticleNumberFilterChange(opt.id)}
                className={`whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all min-h-[32px] border ${
                  isActive
                    ? "bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 border-stone-800 dark:border-stone-200"
                    : "bg-stone-50 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/60 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive
                      ? "bg-stone-700 dark:bg-stone-300 text-stone-100 dark:text-stone-900"
                      : "bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

        {/* Maße Chips */}
        {activeCategory === "measurements" &&
          MEASUREMENTS_OPTIONS.map((opt) => {
            const isActive = measurementsFilter === opt.id;
            const count =
              opt.id === "all"
                ? measurementsCounts.all
                : measurementsCounts.missing;
            return (
              <button
                key={opt.id}
                id={`measurements-chip-${opt.id}`}
                type="button"
                onClick={() => onMeasurementsFilterChange(opt.id)}
                className={`whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all min-h-[32px] border ${
                  isActive
                    ? "bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 border-stone-800 dark:border-stone-200"
                    : "bg-stone-50 dark:bg-stone-800/50 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/60 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive
                      ? "bg-stone-700 dark:bg-stone-300 text-stone-100 dark:text-stone-900"
                      : "bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
      </div>

      {/* 3. Integrated Compact Search Bar */}
      <div className="relative w-full pt-0.5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-500 dark:text-stone-400 pointer-events-none" />
        {activeCategory === "articleNumber" ? (
          <input
            id="article-number-search-input"
            type="text"
            value={articleNumberSearchQuery}
            onChange={(e) => onArticleNumberSearchChange(e.target.value)}
            placeholder="Artikelnummer suchen…"
            className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/50 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:border-stone-900 dark:focus:border-stone-400 focus:bg-white dark:focus:bg-stone-900 focus:outline-none min-h-[36px] transition-colors"
          />
        ) : (
          <input
            id="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Nach Titel, Marke oder #..."
            className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/50 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:border-stone-900 dark:focus:border-stone-400 focus:bg-white dark:focus:bg-stone-900 focus:outline-none min-h-[36px] transition-colors"
          />
        )}
        {activeCategory === "articleNumber" ? (
          articleNumberSearchQuery && (
            <button
              id="clear-article-number-search-btn"
              type="button"
              onClick={() => onArticleNumberSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
              title="Suche zurücksetzen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
        ) : (
          searchQuery && (
            <button
              id="clear-search-btn"
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
              title="Suche zurücksetzen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>
    </div>
  );
};
