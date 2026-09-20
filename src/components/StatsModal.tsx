import React from "react";
import { PantItem } from "../types";
import {
  calculateStats,
  formatCurrency,
  formatDateDE,
  formatAvgDuration,
} from "../lib/statsUtils";
import {
  X,
  BarChart2,
  Package,
  UploadCloud,
  CheckCircle2,
  Calendar,
  CalendarDays,
  DollarSign,
  TrendingUp,
  Clock,
  Tag,
  Receipt,
} from "lucide-react";

interface StatsModalProps {
  isOpen: boolean;
  pants: PantItem[];
  onClose: () => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  pants,
  onClose,
}) => {
  if (!isOpen) return null;

  const stats = calculateStats(pants);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-stone-950/60 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-2xl transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6 border-b border-stone-200 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="stats-modal-title"
                className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 tracking-tight"
              >
                Statistiken
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                Übersicht deiner Verkäufe & Kennzahlen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
            aria-label="Statistiken schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin">
          {/* Section 1: Overview Grid (9 Key Metrics) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 px-1">
              Kennzahlen
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {/* 1. Hosen insgesamt */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 text-stone-500 dark:text-stone-400">
                  <span className="text-xs font-semibold leading-snug">
                    Hosen insgesamt
                  </span>
                  <Package className="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                  {stats.totalPants}
                </div>
              </div>

              {/* 2. aktuell Hochgeladen */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 text-stone-500 dark:text-stone-400">
                  <span className="text-xs font-semibold leading-snug">
                    aktuell Hochgeladen
                  </span>
                  <UploadCloud className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                  {stats.currentlyUploaded}
                </div>
              </div>

              {/* 3. Verkauft insgesamt */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 text-stone-500 dark:text-stone-400">
                  <span className="text-xs font-semibold leading-snug">
                    Verkauft insgesamt
                  </span>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                  {stats.totalSold}
                </div>
              </div>

              {/* 4. Verkäufe heute */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 text-stone-500 dark:text-stone-400">
                  <span className="text-xs font-semibold leading-snug">
                    Verkäufe heute
                  </span>
                  <Calendar className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                  {stats.salesToday}
                </div>
              </div>

              {/* 5. Verkäufe diesen Monat */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 text-stone-500 dark:text-stone-400">
                  <span className="text-xs font-semibold leading-snug">
                    Verkäufe diesen Monat
                  </span>
                  <CalendarDays className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                  {stats.salesThisMonth}
                </div>
              </div>

              {/* 6. Umsatz insgesamt */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 text-emerald-700 dark:text-emerald-400">
                  <span className="text-xs font-semibold leading-snug">
                    Umsatz insgesamt
                  </span>
                  <DollarSign className="h-4 w-4 shrink-0" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-200 tracking-tight">
                  {formatCurrency(stats.totalRevenue)}
                </div>
              </div>

              {/* 7. Umsatz diesen Monat */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 text-emerald-700 dark:text-emerald-400">
                  <span className="text-xs font-semibold leading-snug">
                    Umsatz diesen Monat
                  </span>
                  <TrendingUp className="h-4 w-4 shrink-0" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-200 tracking-tight">
                  {formatCurrency(stats.revenueThisMonth)}
                </div>
              </div>

              {/* 8. durchschnittlicher Verkaufspreis */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 text-stone-500 dark:text-stone-400">
                  <span className="text-xs font-semibold leading-snug">
                    Ø Verkaufspreis
                  </span>
                  <Receipt className="h-4 w-4 shrink-0 text-purple-500 dark:text-purple-400" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                  {formatCurrency(stats.avgSalePrice)}
                </div>
              </div>

              {/* 9. durchschnittliche Verkaufsdauer in Tagen */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex flex-col justify-between col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between gap-1 text-stone-500 dark:text-stone-400">
                  <span className="text-xs font-semibold leading-snug">
                    Ø Verkaufsdauer
                  </span>
                  <Clock className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                </div>
                <div className="mt-2 text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight">
                  {formatAvgDuration(stats.avgSaleDurationDays)}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Letzte Verkäufe */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Letzte Verkäufe
              </h3>
              {stats.recentSales.length > 0 && (
                <span className="text-xs font-medium text-stone-400 dark:text-stone-500">
                  Max. 10 Einträge
                </span>
              )}
            </div>

            {stats.recentSales.length === 0 ? (
              <div className="p-6 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/80 dark:border-stone-800 text-center">
                <Tag className="h-8 w-8 mx-auto text-stone-400 dark:text-stone-500 mb-2" />
                <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
                  Noch keine Verkäufe eingetragen
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Setze den Verkaufsstatus einer Hose auf „Verkauft“, um hier Details zu sehen.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {stats.recentSales.map((sale, index) => (
                  <div
                    key={`${sale.pantNumber}_${index}`}
                    className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="inline-flex shrink-0 items-center justify-center px-2.5 py-1 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-xs font-black">
                        #{sale.pantNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
                          {sale.title}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400 font-medium truncate mt-0.5">
                          Marke: <span className="text-stone-700 dark:text-stone-300">{sale.brand}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-200/60 dark:border-stone-700/60 shrink-0">
                      <div className="text-left sm:text-right">
                        <div className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                          {formatDateDE(sale.saleDate)}
                        </div>
                        {sale.saleDurationText && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold mt-0.5">
                            Dauer: {sale.saleDurationText}
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="inline-block px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-sm font-black">
                          {formatCurrency(sale.salePrice)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 sm:px-6 border-t border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[100px] rounded-xl bg-stone-900 dark:bg-stone-100 px-5 text-sm font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors shadow-xs"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
