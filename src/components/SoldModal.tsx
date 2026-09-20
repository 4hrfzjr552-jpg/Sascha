import React, { useEffect, useState } from "react";
import { CalendarDays, X } from "lucide-react";

interface SoldModalProps {
  isOpen: boolean;
  pantNumber: number;
  initialPrice?: number;
  initialDate?: string;
  onClose: () => void;
  onSave: (data: { salePrice: number; saleDate: string }) => void;
}

function getTodayDateInput(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const SoldModal: React.FC<SoldModalProps> = ({
  isOpen,
  pantNumber,
  initialPrice,
  initialDate,
  onClose,
  onSave,
}) => {
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setPrice(initialPrice !== undefined ? String(initialPrice) : "");
    setDate(initialDate || getTodayDateInput());
    setError("");
  }, [isOpen, initialDate, initialPrice]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericPrice = Number(price.replace(",", "."));

    if (!price.trim() || !Number.isFinite(numericPrice) || numericPrice < 0) {
      setError("Bitte einen gültigen Verkaufspreis eingeben.");
      return;
    }
    if (!date) {
      setError("Bitte ein Verkaufsdatum auswählen.");
      return;
    }

    onSave({
      salePrice: Math.round(numericPrice * 100) / 100,
      saleDate: date,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sold-modal-title"
    >
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 border-b border-stone-200 dark:border-stone-800">
          <div>
            <h2
              id="sold-modal-title"
              className="text-lg font-bold text-stone-900 dark:text-stone-100"
            >
              Verkauf für Hose #{pantNumber}
            </h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Verkaufsdaten eintragen oder später bearbeiten.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Modal schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
          <div>
            <label
              htmlFor="sale-price"
              className="mb-1.5 block text-sm font-semibold text-stone-800 dark:text-stone-200"
            >
              Verkaufspreis
            </label>
            <div className="relative">
              <input
                id="sale-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price}
                onChange={(event) => {
                  setPrice(event.target.value);
                  setError("");
                }}
                placeholder="z. B. 24,90"
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3.5 py-3 pr-10 text-base text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                autoFocus
                required
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-stone-500 dark:text-stone-400">
                €
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="sale-date"
              className="mb-1.5 block text-sm font-semibold text-stone-800 dark:text-stone-200"
            >
              Verkaufsdatum
            </label>
            <div className="relative">
              <input
                id="sale-date"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setError("");
                }}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3.5 py-3 pr-11 text-base text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-300 focus:outline-none focus:ring-2 focus:ring-stone-200 dark:focus:ring-stone-700"
                required
              />
              <CalendarDays className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-500 dark:text-stone-400" />
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm font-medium text-rose-800 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-5 text-sm font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="min-h-[46px] rounded-xl bg-stone-900 dark:bg-stone-100 px-5 text-sm font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200"
            >
              Verkauf speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
