import React, { useEffect, useMemo, useState } from "react";
import { X, TrendingUp, Package, Timer, Tag, Receipt } from "lucide-react";
import type { PantItem, SaleStatus } from "../types";
import {
  computeStatistics,
  formatDurationDe,
  formatEuro,
  STAT_PERIOD_OPTIONS,
  type StatPeriod,
  type TimeBucket,
} from "../lib/statistics";

interface StatisticsModalProps {
  isOpen: boolean;
  pants: PantItem[];
  onClose: () => void;
}

const STATUS_BAR_COLORS: Record<SaleStatus, string> = {
  draft: "bg-stone-400 dark:bg-stone-500",
  ready: "bg-sky-500 dark:bg-sky-500",
  uploaded: "bg-amber-500 dark:bg-amber-500",
  sold: "bg-emerald-600 dark:bg-emerald-500",
  archived: "bg-stone-300 dark:bg-stone-700",
};

export const StatisticsModal: React.FC<StatisticsModalProps> = ({
  isOpen,
  pants,
  onClose,
}) => {
  const [period, setPeriod] = useState<StatPeriod>("30d");

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const stats = useMemo(
    () => computeStatistics(pants, period),
    [pants, period]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-stone-950/60 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="statistics-modal-title"
    >
      <div className="flex w-full max-w-3xl flex-col overflow-hidden bg-stone-50 dark:bg-stone-950 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl sm:border sm:border-stone-200 sm:dark:border-stone-800">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="statistics-modal-title"
                className="text-lg font-black tracking-tight text-stone-900 dark:text-stone-100 leading-none"
              >
                Statistiken
              </h2>
              <p className="mt-0.5 text-[11px] font-medium text-stone-600 dark:text-stone-400">
                Aus deinen lokal gespeicherten Hosen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Statistiken schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 space-y-6">
          {/* Period filter */}
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Zeitraum">
            {STAT_PERIOD_OPTIONS.map((option) => {
              const active = option.id === period;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(option.id)}
                  className={`min-h-[40px] rounded-xl px-3.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900"
                      : "border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* KPI grid */}
          <section aria-label="Kennzahlen" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard label="Hosen insgesamt" value={String(stats.totalPants)} icon={<Package className="h-4 w-4" />} />
            <KpiCard label="Aktuell hochgeladen" value={String(stats.currentlyUploaded)} />
            <KpiCard label="Verkauft insgesamt" value={String(stats.totalSold)} accent="emerald" />
            <KpiCard label="Verkäufe heute" value={String(stats.salesToday)} />
            <KpiCard label="Verkäufe diese Woche" value={String(stats.salesWeek)} />
            <KpiCard label="Verkäufe diesen Monat" value={String(stats.salesMonth)} />
            <KpiCard label="Umsatz insgesamt" value={formatEuro(stats.revenueTotal)} accent="emerald" icon={<Receipt className="h-4 w-4" />} />
            <KpiCard label="Umsatz diesen Monat" value={formatEuro(stats.revenueMonth)} accent="emerald" />
            <KpiCard label="Ø Verkaufspreis" value={formatEuro(stats.avgSalePrice)} />
          </section>

          {/* Duration stats */}
          <section aria-label="Verkaufsdauer">
            <SectionTitle icon={<Timer className="h-4 w-4" />}>Verkaufsdauer</SectionTitle>
            {stats.duration.avgDays === null ? (
              <EmptyHint>Noch keine Verkäufe mit Upload- und Verkaufsdatum im gewählten Zeitraum.</EmptyHint>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <KpiCard label="Durchschnitt" value={formatDurationDe(stats.duration.avgDays)} />
                <KpiCard label="Schnellster Verkauf" value={formatDurationDe(stats.duration.fastestDays)} accent="emerald" />
                <KpiCard label="Längster Verkauf" value={formatDurationDe(stats.duration.longestDays)} />
              </div>
            )}
          </section>

          {/* Revenue over time */}
          <section aria-label="Umsatz im Zeitverlauf">
            <SectionTitle icon={<TrendingUp className="h-4 w-4" />}>Umsatz im Zeitverlauf</SectionTitle>
            <BarChart
              buckets={stats.timeSeries}
              metric="revenue"
              barClass="bg-emerald-600 dark:bg-emerald-500"
              formatValue={(v) => formatEuro(v)}
              emptyLabel="Keine Umsätze im gewählten Zeitraum."
            />
          </section>

          {/* Sales over time */}
          <section aria-label="Verkäufe im Zeitverlauf">
            <SectionTitle icon={<TrendingUp className="h-4 w-4" />}>Verkäufe im Zeitverlauf</SectionTitle>
            <BarChart
              buckets={stats.timeSeries}
              metric="count"
              barClass="bg-stone-700 dark:bg-stone-300"
              formatValue={(v) => `${v} Verkäufe`}
              emptyLabel="Keine Verkäufe im gewählten Zeitraum."
            />
          </section>

          {/* Status distribution */}
          <section aria-label="Verteilung der Verkaufsstatus">
            <SectionTitle icon={<Package className="h-4 w-4" />}>Verteilung der Verkaufsstatus</SectionTitle>
            <div className="space-y-2.5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
              {stats.statusDistribution.map((entry) => {
                const pct =
                  stats.totalPants > 0
                    ? Math.round((entry.count / stats.totalPants) * 100)
                    : 0;
                return (
                  <div key={entry.status}>
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-stone-700 dark:text-stone-300">
                      <span>{entry.label}</span>
                      <span className="tabular-nums text-stone-500 dark:text-stone-400">
                        {entry.count} · {pct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                      <div
                        className={`h-full rounded-full transition-all ${STATUS_BAR_COLORS[entry.status]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Brand analysis */}
          <section aria-label="Marken-Auswertung">
            <SectionTitle icon={<Tag className="h-4 w-4" />}>Top 5 Marken nach Umsatz</SectionTitle>
            {stats.topBrands.length === 0 ? (
              <EmptyHint>Keine verkauften Hosen mit Marke im gewählten Zeitraum.</EmptyHint>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-stone-100 dark:border-stone-800 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  <span>Marke</span>
                  <span className="text-right">Verk.</span>
                  <span className="text-right">Umsatz</span>
                  <span className="text-right">Ø Preis</span>
                </div>
                {stats.topBrands.map((brand) => (
                  <div
                    key={brand.brand}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b border-stone-100 dark:border-stone-800 px-4 py-2.5 text-sm last:border-b-0"
                  >
                    <span className="truncate font-semibold text-stone-900 dark:text-stone-100">
                      {brand.brand}
                    </span>
                    <span className="text-right tabular-nums text-stone-600 dark:text-stone-400">
                      {brand.count}
                    </span>
                    <span className="text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatEuro(brand.revenue)}
                    </span>
                    <span className="text-right tabular-nums text-stone-600 dark:text-stone-400">
                      {formatEuro(brand.avgPrice)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent sales */}
          <section aria-label="Letzte Verkäufe">
            <SectionTitle icon={<Receipt className="h-4 w-4" />}>Letzte Verkäufe</SectionTitle>
            {stats.recentSales.length === 0 ? (
              <EmptyHint>Keine Verkäufe im gewählten Zeitraum.</EmptyHint>
            ) : (
              <ul className="space-y-2.5">
                {stats.recentSales.map((sale) => (
                  <li
                    key={sale.id}
                    className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                          <span className="text-stone-500 dark:text-stone-400">
                            #{sale.number}
                          </span>{" "}
                          {sale.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-600 dark:text-stone-400">
                          <span className="font-medium">{sale.brand}</span>
                          <span aria-hidden="true">·</span>
                          <span>{sale.saleDateLabel}</span>
                          {sale.durationDays !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatDurationDe(sale.durationDays)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {sale.salePrice !== null ? formatEuro(sale.salePrice) : "–"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */

interface KpiCardProps {
  label: string;
  value: string;
  accent?: "emerald" | "default";
  icon?: React.ReactNode;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, accent = "default", icon }) => (
  <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3.5">
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
      {icon}
      <span className="leading-tight">{label}</span>
    </div>
    <p
      className={`mt-1.5 text-xl font-black tabular-nums leading-none ${
        accent === "emerald"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-stone-900 dark:text-stone-100"
      }`}
    >
      {value}
    </p>
  </div>
);

const SectionTitle: React.FC<{ icon?: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <h3 className="mb-2.5 flex items-center gap-1.5 px-1 text-sm font-bold text-stone-800 dark:text-stone-200">
    {icon}
    {children}
  </h3>
);

const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 bg-white/50 dark:bg-stone-900/50 p-4 text-center text-xs text-stone-500 dark:text-stone-400">
    {children}
  </div>
);

interface BarChartProps {
  buckets: TimeBucket[];
  metric: "revenue" | "count";
  barClass: string;
  formatValue: (value: number) => string;
  emptyLabel: string;
}

const BarChart: React.FC<BarChartProps> = ({
  buckets,
  metric,
  barClass,
  formatValue,
  emptyLabel,
}) => {
  const values = buckets.map((b) => (metric === "revenue" ? b.revenue : b.count));
  const max = Math.max(0, ...values);
  const hasData = values.some((v) => v > 0);

  return (
    <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
      {!hasData ? (
        <p className="py-6 text-center text-xs text-stone-500 dark:text-stone-400">
          {emptyLabel}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex h-44 items-end gap-1.5" style={{ minWidth: `${buckets.length * 26}px` }}>
            {buckets.map((bucket, index) => {
              const value = values[index];
              const heightPct = max > 0 ? (value / max) * 100 : 0;
              return (
                <div
                  key={`${bucket.label}-${index}`}
                  className="flex min-w-[20px] flex-1 flex-col items-center gap-1"
                  title={`${bucket.label} — ${formatValue(value)}`}
                >
                  <div className="flex h-full w-full items-end">
                    <div
                      className={`w-full rounded-t-md transition-all ${barClass} ${value === 0 ? "opacity-30" : ""}`}
                      style={{ height: `${Math.max(heightPct, value > 0 ? 4 : 2)}%` }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[9px] leading-tight text-stone-500 dark:text-stone-400">
                    {bucket.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
