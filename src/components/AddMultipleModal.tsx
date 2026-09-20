import React, { useState } from "react";
import { X, PlusCircle } from "lucide-react";

interface AddMultipleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount: number;
  maxLimit: number;
  onAdd: (count: number) => void;
}

export const AddMultipleModal: React.FC<AddMultipleModalProps> = ({
  isOpen,
  onClose,
  currentCount,
  maxLimit,
  onAdd,
}) => {
  const remaining = Math.max(0, maxLimit - currentCount);
  const [count, setCount] = useState<number>(Math.min(5, remaining));

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (count > 0 && count <= remaining) {
      onAdd(count);
      onClose();
    }
  };

  return (
    <div
      id="add-multiple-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 dark:bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        id="add-multiple-modal-container"
        className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 p-6 shadow-xl border border-stone-200 dark:border-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-stone-900 dark:text-stone-100" />
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Mehrere Hosen hinzufügen
            </h2>
          </div>
          <button
            id="add-multiple-close-btn"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="add-count-input"
              className="block text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1"
            >
              Anzahl neuer Hosen
            </label>
            <p className="text-xs text-stone-700 dark:text-stone-400 mb-3">
              Aktuell {currentCount} von {maxLimit} Hosen angelegt. Du kannst noch bis zu {remaining} weitere hinzufügen.
            </p>
            <div className="flex items-center gap-3">
              <input
                id="add-count-input"
                type="number"
                min={1}
                max={remaining}
                value={count}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setCount(isNaN(val) ? 1 : Math.max(1, Math.min(val, remaining)));
                }}
                className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-3 text-lg font-semibold text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[48px] transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[3, 5, 10, 20].map((preset) => {
              if (preset > remaining) return null;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCount(preset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    count === preset
                      ? "border-stone-900 dark:border-stone-100 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900"
                      : "border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700"
                  }`}
                >
                  +{preset} Hosen
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <button
              id="add-multiple-cancel-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 min-h-[44px] transition-colors"
            >
              Abbrechen
            </button>
            <button
              id="add-multiple-submit-btn"
              type="submit"
              disabled={remaining === 0 || count < 1}
              className="px-5 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-sm font-medium text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-40 min-h-[44px] transition-colors shadow-xs"
            >
              {count} {count === 1 ? "Hose" : "Hosen"} anlegen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
