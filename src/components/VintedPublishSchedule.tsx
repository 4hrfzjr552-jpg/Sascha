import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ExternalLink, RefreshCw, SkipForward } from "lucide-react";
import type { VintedDraftData } from "../types";
import {
  VINTED_PLAN_STORAGE_KEY, VINTED_SLOT_TIMES,
  berlinTimeNow, buildVintedPublishingPlan, eligibleVintedDrafts,
  markVintedSlot, readVintedPublishingPlan,
  type VintedPublishingPlan, type VintedScheduledSlot,
} from "../lib/vintedPublishSchedule";

interface Props {
  drafts: VintedDraftData[];
}

/**
 * Safe publishing calendar, not a Vinted automation bot.
 * The existing Chrome extension can prepare Vinted forms/drafts, but an
 * ordinary Vinted account requires an explicit user publication step.
 */
export const VintedPublishSchedule: React.FC<Props> = ({ drafts }) => {
  const [plan, setPlan] = useState<VintedPublishingPlan | null>(() => {
    try { return readVintedPublishingPlan(window.localStorage.getItem(VINTED_PLAN_STORAGE_KEY)); }
    catch { return null; }
  });
  const [now, setNow] = useState(() => new Date());
  const [storageError, setStorageError] = useState(false);
  const ready = useMemo(() => eligibleVintedDrafts(drafts), [drafts]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const save = (next: VintedPublishingPlan | null) => {
    try {
      if (next) window.localStorage.setItem(VINTED_PLAN_STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(VINTED_PLAN_STORAGE_KEY);
      setStorageError(false);
      setPlan(next);
    } catch {
      setStorageError(true);
    }
  };

  const create = () => {
    if (plan?.slots?.some(slot => slot.status === "published") &&
      !window.confirm("Es wurden bereits Artikel als veröffentlicht bestätigt. Einen neuen Zeitplan erstellen? Die alten Plan-Bestätigungen werden überschrieben.")) return;
    if (!ready.length) return;
    save(buildVintedPublishingPlan(ready, new Date()));
  };

  const update = (slot: VintedScheduledSlot, status: "published" | "skipped") => {
    if (!plan) return;
    if (status === "published" && !window.confirm(
      `Hast du Artikel #${slot.articleNumber} wirklich auf Vinted veröffentlicht? Nur dann als veröffentlicht markieren. Dieser Knopf veröffentlicht nichts selbst.`
    )) return;
    save(markVintedSlot(plan, slot.id, status));
  };

  const activeSlots = (plan?.slots || []).filter(slot => slot.status === "pending");
  const publishedCount = (plan?.slots || []).filter(slot => slot.status === "published").length;
  const skippedCount = (plan?.slots || []).filter(slot => slot.status === "skipped").length;
  const berlin = berlinTimeNow(now);
  const showSlots = activeSlots.slice(0, 12);

  return (
    <section className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/70 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="w-5 h-5 shrink-0 text-teal-600 dark:text-teal-400" />
        <div>
          <h3 className="font-bold text-stone-900 dark:text-stone-100 text-sm">Täglicher Vinted-Zeitplan</h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">Vier Zeitfenster pro Tag · Deutschland (Europe/Berlin)</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {VINTED_SLOT_TIMES.map(time => (
          <div key={time} className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-center py-2 text-xs font-bold text-stone-800 dark:text-stone-200">
            {time}
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
        <strong>Wichtig:</strong> Der Zeitplan ordnet die Anzeigen, veröffentlicht aber nicht automatisch auf Vinted.
        Die bestehende PC-Erweiterung kann Daten in Vinted übertragen; die Veröffentlichung musst du bestätigen.
        Vollautomatisches Hochladen erfordert eine von Vinted autorisierte Integration.
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={create} disabled={!ready.length}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-50">
          <CalendarClock className="w-4 h-4"/>
          {plan ? "Zeitplan neu berechnen" : "Zeitplan anlegen"}
        </button>
        {plan && (
          <button type="button" onClick={() => save({ ...plan, enabled: !plan.enabled })}
            className="px-3 py-2 min-h-[40px] rounded-lg border border-stone-300 dark:border-stone-700 text-xs font-semibold text-stone-700 dark:text-stone-200">
            {plan.enabled ? "Pausieren" : "Fortsetzen"}
          </button>
        )}
        <span className="text-xs text-stone-500 dark:text-stone-400">
          {ready.length} geeignete Entwürfe
        </span>
      </div>

      {storageError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
        Der Zeitplan konnte in diesem Browser nicht gespeichert werden. Bitte Browser-Speicher prüfen.
      </p>}

      {plan && (
        <>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            {plan.enabled ? "Zeitplan aktiv" : "Zeitplan pausiert"} · {activeSlots.length} offen · {publishedCount} bestätigt · {skippedCount} übersprungen.
            Die Zuordnung wird nur in diesem Browser gespeichert.
          </p>

          <div className="space-y-2">
            {showSlots.length === 0 ? (
              <p className="text-xs text-stone-500">Keine weiteren Anzeigen eingeplant.</p>
            ) : showSlots.map(slot => {
              const missing = !drafts.some(d => d.id === slot.draftId);
              const due = `${slot.date}T${slot.time}` <= `${berlin.date}T${berlin.time}`;
              return (
                <div key={slot.id} className="rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-2.5 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 dark:text-stone-100">
                        {slot.date.split("-").reverse().join(".")} · {slot.time} Uhr
                        {due && <span className="ml-2 text-amber-700 dark:text-amber-300">Termin erreicht</span>}
                      </div>
                      <div className="text-xs text-stone-600 dark:text-stone-300 break-words">
                        #{slot.articleNumber} · {slot.title}
                      </div>
                      {missing && <p className="text-xs text-rose-600">Dieser Entwurf ist nicht mehr vorhanden.</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <a href="https://www.vinted.de/items/new" target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold">
                      <ExternalLink className="w-3.5 h-3.5"/> Vinted öffnen
                    </a>
                    <button type="button" onClick={() => update(slot, "published")}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-emerald-300 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5"/> Veröffentlicht
                    </button>
                    <button type="button" onClick={() => update(slot, "skipped")}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-300">
                      <SkipForward className="w-3.5 h-3.5"/> Überspringen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            Der Browserplan löst keine Uploads aus, wenn die App geschlossen ist. Bei neuen Artikeln über
            <RefreshCw className="w-3 h-3 inline-block mx-1"/> „Zeitplan neu berechnen“ neu zuordnen.
            Vorhandene Anzeigen auf Vinted prüfen, bevor sie als veröffentlicht markiert werden.
          </p>
        </>
      )}
    </section>
  );
};
