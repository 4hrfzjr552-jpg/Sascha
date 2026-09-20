import type { PantItem, SaleStatus } from "../types";
import { SALE_STATUS_OPTIONS } from "./saleStatus";

export type StatPeriod = "7d" | "30d" | "month" | "year" | "all";

export const STAT_PERIOD_OPTIONS: Array<{ id: StatPeriod; label: string }> = [
  { id: "7d", label: "7 Tage" },
  { id: "30d", label: "30 Tage" },
  { id: "month", label: "Dieser Monat" },
  { id: "year", label: "Dieses Jahr" },
  { id: "all", label: "Gesamt" },
];

export interface TimeBucket {
  label: string;
  revenue: number;
  count: number;
}

export interface BrandStat {
  brand: string;
  count: number;
  revenue: number;
  avgPrice: number;
}

export interface RecentSale {
  id: string;
  number: number;
  title: string;
  brand: string;
  salePrice: number | null;
  saleDateLabel: string;
  sortTime: number;
  durationDays: number | null;
}

export interface StatusDistributionEntry {
  status: SaleStatus;
  label: string;
  count: number;
}

export interface DurationStats {
  avgDays: number | null;
  fastestDays: number | null;
  longestDays: number | null;
}

export interface Statistics {
  totalPants: number;
  currentlyUploaded: number;
  totalSold: number;
  salesToday: number;
  salesWeek: number;
  salesMonth: number;
  revenueTotal: number;
  revenueMonth: number;
  avgSalePrice: number;
  duration: DurationStats;
  timeSeries: TimeBucket[];
  statusDistribution: StatusDistributionEntry[];
  brands: BrandStat[];
  topBrands: BrandStat[];
  recentSales: RecentSale[];
  periodSoldCount: number;
  periodRevenue: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MONTHS_DE = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

const euroFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatEuro(value: number): string {
  if (!Number.isFinite(value)) return euroFormatter.format(0);
  return euroFormatter.format(value);
}

export function formatDateDe(date: Date): string {
  return dateFormatter.format(date);
}

export function formatDurationDe(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return "–";
  if (days < 1) return "< 1 Tag";
  const rounded = Math.round(days);
  return rounded === 1 ? "1 Tag" : `${rounded} Tage`;
}

/** A sale price counts toward revenue only if it is a finite number > 0. */
function isValidPrice(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}

function isSold(pant: PantItem): boolean {
  return pant.saleStatus === "sold";
}

/** Resolve the sale date from saleDate (YYYY-MM-DD, parsed as local) or soldAt. */
function getSaleDate(pant: PantItem): Date | null {
  if (pant.saleDate && /^\d{4}-\d{2}-\d{2}$/.test(pant.saleDate)) {
    const [y, m, d] = pant.saleDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (typeof pant.soldAt === "number" && Number.isFinite(pant.soldAt)) {
    return new Date(pant.soldAt);
  }
  return null;
}

function getBrand(pant: PantItem): string {
  const raw = pant.result?.detected?.brand?.trim();
  return raw ? raw : "Unbekannt";
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/** Monday-based start of the current week. */
function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  const weekday = (day.getDay() + 6) % 7; // Mon=0 ... Sun=6
  return addDays(day, -weekday);
}

function getPeriodStart(period: StatPeriod, now: Date): Date | null {
  const today = startOfDay(now);
  switch (period) {
    case "7d":
      return addDays(today, -6);
    case "30d":
      return addDays(today, -29);
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
    default:
      return null;
  }
}

interface SoldEntry {
  pant: PantItem;
  date: Date;
  price: number | null;
  revenue: number;
  durationDays: number | null;
}

function buildTimeSeries(
  entries: SoldEntry[],
  period: StatPeriod,
  now: Date
): TimeBucket[] {
  const useMonths = period === "year" || period === "all";

  if (!useMonths) {
    // Daily buckets across the exact visible range.
    let start: Date;
    let end: Date;
    if (period === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = startOfDay(now);
    } else if (period === "7d") {
      end = startOfDay(now);
      start = addDays(end, -6);
    } else {
      end = startOfDay(now);
      start = addDays(end, -29);
    }

    const buckets = new Map<string, TimeBucket>();
    const order: string[] = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      const label = `${String(cursor.getDate()).padStart(2, "0")}.${String(
        cursor.getMonth() + 1
      ).padStart(2, "0")}.`;
      buckets.set(key, { label, revenue: 0, count: 0 });
      order.push(key);
    }

    entries.forEach((entry) => {
      const key = `${entry.date.getFullYear()}-${entry.date.getMonth()}-${entry.date.getDate()}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.revenue += entry.revenue;
      }
    });

    return order.map((key) => buckets.get(key)!);
  }

  // Monthly buckets.
  let startYear: number;
  let startMonth: number;
  let endYear = now.getFullYear();
  let endMonth = now.getMonth();

  if (period === "year") {
    startYear = now.getFullYear();
    startMonth = 0;
    endMonth = 11;
  } else {
    // "all": span from the earliest sale to now (fallback to current month).
    if (entries.length === 0) {
      startYear = now.getFullYear();
      startMonth = now.getMonth();
    } else {
      const earliest = entries.reduce(
        (min, entry) => (entry.date < min ? entry.date : min),
        entries[0].date
      );
      startYear = earliest.getFullYear();
      startMonth = earliest.getMonth();
    }
  }

  const buckets = new Map<string, TimeBucket>();
  const order: string[] = [];
  let y = startYear;
  let m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    const key = `${y}-${m}`;
    const label =
      period === "year"
        ? MONTHS_DE[m]
        : `${MONTHS_DE[m]} ${String(y).slice(2)}`;
    buckets.set(key, { label, revenue: 0, count: 0 });
    order.push(key);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  entries.forEach((entry) => {
    const key = `${entry.date.getFullYear()}-${entry.date.getMonth()}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.revenue += entry.revenue;
    }
  });

  return order.map((key) => buckets.get(key)!);
}

export function computeStatistics(
  pants: PantItem[],
  period: StatPeriod,
  now: Date = new Date()
): Statistics {
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalPants = pants.length;
  const currentlyUploaded = pants.filter((p) => p.saleStatus === "uploaded").length;

  const soldPants = pants.filter(isSold);
  const totalSold = soldPants.length;

  // Absolute KPI windows (independent of the period filter).
  let salesToday = 0;
  let salesWeek = 0;
  let salesMonth = 0;
  let revenueTotal = 0;
  let revenueMonth = 0;
  let pricedCount = 0;

  soldPants.forEach((pant) => {
    const date = getSaleDate(pant);
    const priceValid = isValidPrice(pant.salePrice);
    if (priceValid) {
      revenueTotal += pant.salePrice as number;
      pricedCount += 1;
    }
    if (date) {
      if (date >= todayStart) salesToday += 1;
      if (date >= weekStart) salesWeek += 1;
      if (date >= monthStart) {
        salesMonth += 1;
        if (priceValid) revenueMonth += pant.salePrice as number;
      }
    }
  });

  const avgSalePrice = pricedCount > 0 ? revenueTotal / pricedCount : 0;

  // Period-filtered sold entries (drive charts, brands, recent sales, durations).
  const periodStart = getPeriodStart(period, now);
  const periodEnd = now;

  const periodEntries: SoldEntry[] = [];
  soldPants.forEach((pant) => {
    const date = getSaleDate(pant);
    if (!date) return;
    if (periodStart && date < periodStart) return;
    if (date > periodEnd) return;

    const priceValid = isValidPrice(pant.salePrice);
    const price = priceValid ? (pant.salePrice as number) : null;
    const revenue = priceValid ? (pant.salePrice as number) : 0;

    let durationDays: number | null = null;
    if (
      typeof pant.uploadedAt === "number" &&
      typeof pant.soldAt === "number" &&
      Number.isFinite(pant.uploadedAt) &&
      Number.isFinite(pant.soldAt) &&
      pant.soldAt >= pant.uploadedAt
    ) {
      durationDays = (pant.soldAt - pant.uploadedAt) / MS_PER_DAY;
    }

    periodEntries.push({ pant, date, price, revenue, durationDays });
  });

  const periodRevenue = periodEntries.reduce((sum, e) => sum + e.revenue, 0);

  // Duration stats over the period-filtered set.
  const durationValues = periodEntries
    .map((e) => e.durationDays)
    .filter((d): d is number => d !== null);
  const duration: DurationStats = {
    avgDays:
      durationValues.length > 0
        ? durationValues.reduce((a, b) => a + b, 0) / durationValues.length
        : null,
    fastestDays: durationValues.length > 0 ? Math.min(...durationValues) : null,
    longestDays: durationValues.length > 0 ? Math.max(...durationValues) : null,
  };

  const timeSeries = buildTimeSeries(periodEntries, period, now);

  // Status distribution over ALL pants.
  const statusCounts: Record<SaleStatus, number> = {
    draft: 0,
    ready: 0,
    uploaded: 0,
    sold: 0,
    archived: 0,
  };
  pants.forEach((pant) => {
    const status = (pant.saleStatus || "draft") as SaleStatus;
    if (status in statusCounts) statusCounts[status] += 1;
  });
  const statusDistribution: StatusDistributionEntry[] = SALE_STATUS_OPTIONS.map(
    (option) => ({
      status: option.id,
      label: option.label,
      count: statusCounts[option.id],
    })
  );

  // Brand analysis over the period-filtered sold set.
  const brandMap = new Map<string, { count: number; revenue: number; priced: number }>();
  periodEntries.forEach((entry) => {
    const brand = getBrand(entry.pant);
    const current = brandMap.get(brand) || { count: 0, revenue: 0, priced: 0 };
    current.count += 1;
    if (entry.price !== null) {
      current.revenue += entry.price;
      current.priced += 1;
    }
    brandMap.set(brand, current);
  });
  const brands: BrandStat[] = Array.from(brandMap.entries())
    .map(([brand, data]) => ({
      brand,
      count: data.count,
      revenue: data.revenue,
      avgPrice: data.priced > 0 ? data.revenue / data.priced : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  const topBrands = brands.slice(0, 5);

  // Recent sales (period-filtered), newest first.
  const recentSales: RecentSale[] = periodEntries
    .map((entry) => ({
      id: entry.pant.id,
      number: entry.pant.number,
      title: entry.pant.result?.title?.trim() || `Hose #${entry.pant.number}`,
      brand: getBrand(entry.pant),
      salePrice: entry.price,
      saleDateLabel: formatDateDe(entry.date),
      sortTime: entry.date.getTime(),
      durationDays: entry.durationDays,
    }))
    .sort((a, b) => b.sortTime - a.sortTime)
    .slice(0, 20);

  return {
    totalPants,
    currentlyUploaded,
    totalSold,
    salesToday,
    salesWeek,
    salesMonth,
    revenueTotal,
    revenueMonth,
    avgSalePrice,
    duration,
    timeSeries,
    statusDistribution,
    brands,
    topBrands,
    recentSales,
    periodSoldCount: periodEntries.length,
    periodRevenue,
  };
}
