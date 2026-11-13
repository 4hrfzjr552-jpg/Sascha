/**
 * Daily Vinted publishing PLAN for an explicitly user-controlled publish step.
 *
 * Vinted's ordinary accounts do not expose a public listing API; this module
 * never claims to publish. It only allocates eligible existing Sascha AI drafts
 * to four fixed Europe/Berlin time slots. Never infer publication from a clock.
 */
import type { VintedDraftData } from "../types";

export const VINTED_SLOT_TIMES = ["10:00", "14:00", "16:00", "18:00"] as const;
export const VINTED_PLAN_STORAGE_KEY = "sascha-vinted-publish-plan-v1";
export type ScheduledSlotStatus = "pending" | "published" | "skipped";

export interface VintedScheduledSlot {
  id: string;  // Berlin-local date + time
  date: string;
  time: string;
  draftId: string;
  articleNumber: string;
  title: string;
  status: ScheduledSlotStatus;
}

export interface VintedPublishingPlan {
  enabled: boolean;
  createdAt: number;
  slots: VintedScheduledSlot[];
  /** Manual confirmations persist across recalculations: never suggest the same item again. */
  publishedArticleNumbers: string[];
}

function partsInBerlin(when: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(when);
  const get = (name: string) => parts.find(p => p.type === name)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function berlinTimeNow(when: Date = new Date()): { date: string; time: string } {
  return partsInBerlin(when);
}

function dayPlus(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function eligibleVintedDrafts(drafts: VintedDraftData[]): VintedDraftData[] {
  const usedArticleNumbers = new Set<string>();
  return drafts
    .filter(d => ["prepared", "opened"].includes(d.status))
    .filter(d => Boolean(d.id && d.pantId && d.title?.trim() && d.description?.trim() &&
      Number.isFinite(d.price) && Number(d.price) > 0 && d.imageIds?.length > 0))
    .filter(d => /^\d{1,8}$/.test(String(d.artikelnummer || "")))
    .sort((a, b) =>
      Number(b.artikelnummer) - Number(a.artikelnummer) || a.createdAt - b.createdAt
    )
    .filter(d => {
      const nr = String(d.artikelnummer);
      if (usedArticleNumbers.has(nr)) return false;
      usedArticleNumbers.add(nr);
      return true;
    });
}

/** Assign future Berlin-local clock slots, without retroactively posting missed slots. */
export function buildVintedPublishingPlan(
  drafts: VintedDraftData[],
  now = new Date(),
  previous?: VintedPublishingPlan | null,
): VintedPublishingPlan {
  const time = berlinTimeNow(now);
  const publishedArticleNumbers = [...new Set([
    ...(previous?.publishedArticleNumbers || []),
    ...(previous?.slots || []).filter(s => s.status === "published").map(s => s.articleNumber),
  ])];
  const publishedSet = new Set(publishedArticleNumbers);
  const pending = eligibleVintedDrafts(drafts).filter(d => !publishedSet.has(String(d.artikelnummer)));
  const slots: VintedScheduledSlot[] = [];
  let index = 0;
  for (let dayOffset = 0; dayOffset < 90 && index < pending.length; dayOffset++) {
    const date = dayPlus(time.date, dayOffset);
    for (const clock of VINTED_SLOT_TIMES) {
      if (dayOffset === 0 && clock <= time.time) continue;
      const draft = pending[index++];
      if (!draft) break;
      slots.push({
        id: `${date}T${clock}`,
        date, time: clock,
        draftId: draft.id,
        articleNumber: String(draft.artikelnummer),
        title: draft.title,
        status: "pending",
      });
    }
  }
  return { enabled: true, createdAt: now.getTime(), slots, publishedArticleNumbers };
}

export function markVintedSlot(
  plan: VintedPublishingPlan,
  slotId: string,
  status: ScheduledSlotStatus,
): VintedPublishingPlan {
  if (!plan.slots.some(s => s.id === slotId)) return plan;
  return {
    ...plan,
    slots: plan.slots.map(s => s.id === slotId ? {...s, status} : s),
    publishedArticleNumbers: status === "published"
      ? [...new Set([...(plan.publishedArticleNumbers || []), plan.slots.find(s => s.id === slotId)!.articleNumber])]
      : [...(plan.publishedArticleNumbers || [])],
  };
}

export function readVintedPublishingPlan(raw: string | null): VintedPublishingPlan | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<VintedPublishingPlan>;
    if (typeof candidate.enabled !== "boolean" ||
      !Array.isArray(candidate.slots) || !Number.isFinite(candidate.createdAt)) return null;
    const knownStatus = new Set<ScheduledSlotStatus>(["pending", "published", "skipped"]);
    const valid = candidate.slots.every(s => typeof s.id === "string" &&
      /^\d{4}-\d{2}-\d{2}T(?:10|14|16|18):00$/.test(s.id) &&
      typeof s.draftId === "string" && typeof s.articleNumber === "string" &&
      knownStatus.has(s.status));
    if (!valid) return null;
    return {
      ...(candidate as VintedPublishingPlan),
      publishedArticleNumbers: Array.isArray(candidate.publishedArticleNumbers)
        ? candidate.publishedArticleNumbers.filter((id): id is string => typeof id === "string")
        : candidate.slots.filter(s => s.status === "published").map(s => s.articleNumber),
    };
  } catch {
    return null;
  }
}
