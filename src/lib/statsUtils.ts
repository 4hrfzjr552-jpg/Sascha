import { PantItem, ExpenseItem, ExpenseCategory } from "../types";

export interface RecentSaleItem {
  pantNumber: number;
  title: string;
  brand: string;
  salePrice: number;
  saleDate: Date | null;
  saleDurationText: string | null;
}

export interface RecentExpenseItem {
  id: string;
  date: Date | null;
  category: ExpenseCategory;
  notes?: string;
  amount: number;
}

export interface StatsData {
  totalPants: number;
  currentlyUploaded: number;
  totalSold: number;
  salesToday: number;
  salesThisMonth: number;
  totalRevenue: number;
  revenueThisMonth: number;
  avgSalePrice: number;
  avgSaleDurationDays: number;
  recentSales: RecentSaleItem[];
  // Goods Cost & Profit per Pant
  totalGoodsCost: number; // Wareneinsatz / Summe Einkaufspreise verkaufter Hosen
  goodsCostThisMonth: number;
  grossProfit: number; // Gewinn aus verkauften Hosen (Umsatz - Wareneinsatz)
  grossProfitThisMonth: number;
  avgProfitPerSoldPant: number; // Durchschnittlicher Gewinn pro verkaufter Hose
  // General Expenses & Net Profit
  totalGeneralExpenses: number; // Allgemeine Ausgaben gesamt
  generalExpensesThisMonth: number;
  netProfit: number; // Netto-Ergebnis = Umsatz - Wareneinsatz - allgemeine Ausgaben
  netProfitThisMonth: number;
  recentExpenses: RecentExpenseItem[];
}

/**
 * Returns the sale Date for a pant item.
 * Precedence: saleDate ("YYYY-MM-DD") -> soldAt (ms timestamp).
 */
export function getPantSaleDate(pant: PantItem): Date | null {
  if (pant.saleDate) {
    const parts = pant.saleDate.split("-").map(Number);
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const year = parts[0];
      const month = parts[1] - 1;
      const day = parts[2];
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }

  if (typeof pant.soldAt === "number" && Number.isFinite(pant.soldAt)) {
    const date = new Date(pant.soldAt);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

export function parseDateString(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return !isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isSameMonth(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()
  );
}

/**
 * Returns sale duration formatted in German (e.g. "< 1 Tag", "1 Tag", "4 Tage")
 * or null if either uploadedAt or soldAt is missing/invalid.
 */
export function getSaleDurationText(
  uploadedAt?: number,
  soldAt?: number
): string | null {
  if (
    typeof uploadedAt !== "number" ||
    !Number.isFinite(uploadedAt) ||
    typeof soldAt !== "number" ||
    !Number.isFinite(soldAt) ||
    soldAt < uploadedAt
  ) {
    return null;
  }

  const durationMs = soldAt - uploadedAt;
  const days = durationMs / (1000 * 60 * 60 * 24);

  if (days < 1) {
    return "< 1 Tag";
  }

  const roundedDays = Math.round(days);
  return `${roundedDays} ${roundedDays === 1 ? "Tag" : "Tage"}`;
}

export function formatCurrency(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(safeAmount);
}

export function formatDateDE(date: Date | null): string {
  if (!date || isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatAvgDuration(days: number): string {
  if (!Number.isFinite(days) || days <= 0) {
    return "0 Tage";
  }

  const formatted = days.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  return `${formatted} ${days === 1 ? "Tag" : "Tage"}`;
}

export function calculateStats(
  pants: PantItem[],
  expenses: ExpenseItem[] = []
): StatsData {
  const today = new Date();

  const totalPants = pants.length;
  const currentlyUploaded = pants.filter(
    (p) => p.saleStatus === "uploaded"
  ).length;

  const soldPants = pants.filter((p) => p.saleStatus === "sold");
  const totalSold = soldPants.length;

  let salesToday = 0;
  let salesThisMonth = 0;
  let totalRevenue = 0;
  let revenueThisMonth = 0;
  let soldPantsWithValidPriceCount = 0;

  let totalGoodsCost = 0;
  let goodsCostThisMonth = 0;
  let totalProfitSum = 0;
  let soldPantsWithPurchasePriceCount = 0;

  let totalDurationDaysSum = 0;
  let durationCount = 0;

  for (const pant of soldPants) {
    const saleDate = getPantSaleDate(pant);

    if (saleDate) {
      if (isSameDay(saleDate, today)) {
        salesToday += 1;
      }
      if (isSameMonth(saleDate, today)) {
        salesThisMonth += 1;
      }
    }

    const hasValidSalePrice =
      typeof pant.salePrice === "number" &&
      Number.isFinite(pant.salePrice) &&
      pant.salePrice >= 0;

    if (hasValidSalePrice) {
      totalRevenue += pant.salePrice!;
      soldPantsWithValidPriceCount += 1;

      if (saleDate && isSameMonth(saleDate, today)) {
        revenueThisMonth += pant.salePrice!;
      }
    }

    const hasValidPurchasePrice =
      typeof pant.purchasePrice === "number" &&
      Number.isFinite(pant.purchasePrice) &&
      pant.purchasePrice >= 0;

    if (hasValidPurchasePrice) {
      totalGoodsCost += pant.purchasePrice!;

      if (saleDate && isSameMonth(saleDate, today)) {
        goodsCostThisMonth += pant.purchasePrice!;
      }

      if (hasValidSalePrice) {
        const pantProfit = pant.salePrice! - pant.purchasePrice!;
        totalProfitSum += pantProfit;
        soldPantsWithPurchasePriceCount += 1;
      }
    }

    if (
      typeof pant.uploadedAt === "number" &&
      Number.isFinite(pant.uploadedAt) &&
      typeof pant.soldAt === "number" &&
      Number.isFinite(pant.soldAt) &&
      pant.soldAt >= pant.uploadedAt
    ) {
      const days = (pant.soldAt - pant.uploadedAt) / (1000 * 60 * 60 * 24);
      totalDurationDaysSum += days;
      durationCount += 1;
    }
  }

  const avgSalePrice =
    soldPantsWithValidPriceCount > 0
      ? totalRevenue / soldPantsWithValidPriceCount
      : 0;

  const avgProfitPerSoldPant =
    soldPantsWithPurchasePriceCount > 0
      ? totalProfitSum / soldPantsWithPurchasePriceCount
      : 0;

  const grossProfit = totalRevenue - totalGoodsCost;
  const grossProfitThisMonth = revenueThisMonth - goodsCostThisMonth;

  const avgSaleDurationDays =
    durationCount > 0 ? totalDurationDaysSum / durationCount : 0;

  // Letzte Verkäufe (maximal 10 Einträge, neueste zuerst)
  const sortedSoldPants = [...soldPants].sort((a, b) => {
    const dateA = getPantSaleDate(a);
    const dateB = getPantSaleDate(b);

    const tsA = dateA
      ? dateA.getTime()
      : a.soldAt || a.updatedAt || a.createdAt || 0;
    const tsB = dateB
      ? dateB.getTime()
      : b.soldAt || b.updatedAt || b.createdAt || 0;

    return tsB - tsA;
  });

  const recentSales: RecentSaleItem[] = sortedSoldPants
    .slice(0, 10)
    .map((pant) => {
      const title =
        pant.result?.title || pant.artikelnummer || `Hose #${pant.number}`;
      const brand = pant.result?.detected?.brand || "-";
      const salePrice =
        typeof pant.salePrice === "number" && Number.isFinite(pant.salePrice)
          ? pant.salePrice
          : 0;
      const saleDate = getPantSaleDate(pant);
      const saleDurationText = getSaleDurationText(
        pant.uploadedAt,
        pant.soldAt
      );

      return {
        pantNumber: pant.number,
        title,
        brand,
        salePrice,
        saleDate,
        saleDurationText,
      };
    });

  // Calculate General Expenses & Net Profit
  let totalGeneralExpenses = 0;
  let generalExpensesThisMonth = 0;

  for (const exp of expenses) {
    if (typeof exp.amount === "number" && Number.isFinite(exp.amount) && exp.amount > 0) {
      totalGeneralExpenses += exp.amount;

      const expDate = parseDateString(exp.date) || new Date(exp.createdAt);
      if (isSameMonth(expDate, today)) {
        generalExpensesThisMonth += exp.amount;
      }
    }
  }

  const netProfit = grossProfit - totalGeneralExpenses;
  const netProfitThisMonth = grossProfitThisMonth - generalExpensesThisMonth;

  // Recent Expenses (max 10, newest first)
  const sortedExpenses = [...expenses].sort((a, b) => {
    const dateA = parseDateString(a.date) || new Date(a.createdAt);
    const dateB = parseDateString(b.date) || new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime();
  });

  const recentExpenses: RecentExpenseItem[] = sortedExpenses
    .slice(0, 10)
    .map((exp) => ({
      id: exp.id,
      date: parseDateString(exp.date) || new Date(exp.createdAt),
      category: exp.category,
      notes: exp.notes,
      amount: typeof exp.amount === "number" && Number.isFinite(exp.amount) ? exp.amount : 0,
    }));

  return {
    totalPants,
    currentlyUploaded,
    totalSold,
    salesToday,
    salesThisMonth,
    totalRevenue,
    revenueThisMonth,
    avgSalePrice,
    avgSaleDurationDays,
    recentSales,
    totalGoodsCost,
    goodsCostThisMonth,
    grossProfit,
    grossProfitThisMonth,
    avgProfitPerSoldPant,
    totalGeneralExpenses,
    generalExpensesThisMonth,
    netProfit,
    netProfitThisMonth,
    recentExpenses,
  };
}
