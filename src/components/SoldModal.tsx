import React, { useEffect, useState } from "react";
import { PantItem } from "../types";
import { BadgeEuro, X } from "lucide-react";

interface SoldModalProps {
  isOpen: boolean;
  pant: PantItem | null;
  onClose: () => void;
  onSave: (
    pantId: string,
    details: { salePrice?: number; soldAt: number }
  ) => void;
}

// Zeitstempel -> Wert für <input type="datetime-local">
function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SoldModal: React.FC<SoldModalProps> = ({
  isOpen,
  pant,
  onClose,
  onSave,
}) => {
  const [priceInput, setPriceInput] = useState("");
  const [dateInput, setDateInput] = useState("");

  // Felder mit den Werten der aktuellen Hose vorbelegen, wenn sich das Modal öffnet
  useEffect(() => {
    if (isOpen && pant) {
      setPriceInput(
        pant.salePrice !== undefined && !Number.isNaN(pant.salePrice)
          ? String(pant.salePrice)
          : ""
      );
      setDateInput(toLocalInput(pant.soldAt ?? Date.now()));
    }
  }, [isOpen, pant]);

  // Schließen mit Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !pant) return null;

  const handleSave = () => {
    const normalized = priceInput.replace(",", ".").trim();
    const parsed = normalized === "" ? undefined : Number.parseFloat(normalized);
    const salePrice =
      parsed !== undefined && !Number.isNaN(parsed) && parsed >= 0
        ? parsed
        : undefined;

    const soldAtMs = dateInput ? new Date(dateInput).getTime() : Date.now();
    const soldAt = Number.isNaN(soldAtMs) ? Date.now() : soldAtMs;

    onSave(pant.id, { salePrice, soldAt });
    onClose();
  };

  return (
    <div
      id="sold-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 dark:bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        id="sold-modal-container"
        className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 p-6 shadow-xl border border-stone-200 dark:border-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
            <BadgeEuro className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
              Verkaufsdetails · Hose #{pant.number}
            </h3>
            <p className="mt-1 text-sm text-stone-700 dark:text-stone-400 leading-relaxed">
              Verkaufspreis und Verkaufsdatum sind optional und können jederzeit
              angepasst werden.
            </p>
          </div>
          <button
            id="sold-close-btn"
            type="button"
            onClick={onClose}
            className="text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 p-1"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Verkaufspreis */}
          <div>
            <label
              htmlFor={`sold-price-${pant.id}`}
              className="block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1"
            >
              Verkaufspreis (optional)
            </label>
            <div className="relative">
              <input
                id={`sold-price-${pant.id}`}
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                placeholder="z.B. 24,90"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-3.5 py-2.5 pr-9 text-sm font-semibold text-stone-900 dark:text-stone-100 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[44px] transition-colors"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-stone-500 dark:text-stone-400 pointer-events-none">
                €
              </span>
            </div>
          </div>

          {/* Verkaufsdatum */}
          <div>
            <label
              htmlFor={`sold-date-${pant.id}`}
              className="block text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300 mb-1"
            >
              Verkaufsdatum
            </label>
            <input
              id={`sold-date-${pant.id}`}
              type="datetime-local"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 px-3.5 py-2.5 text-sm font-semibold text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[44px] transition-colors"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            id="sold-cancel-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 min-h-[44px] transition-colors"
          >
            Abbrechen
          </button>
          <button
            id="sold-save-btn"
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold min-h-[44px] transition-colors shadow-xs bg-emerald-700 dark:bg-emerald-600 hover:bg-emerald-800 dark:hover:bg-emerald-500 text-white"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};
