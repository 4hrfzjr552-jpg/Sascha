import React, { useState } from "react";
import { ExpenseItem, ExpenseCategory, EXPENSE_CATEGORIES } from "../types";
import {
  X,
  Plus,
  Trash2,
  Receipt,
  Euro,
  Calendar,
  Tag,
  FileText,
  Edit2,
  AlertCircle,
} from "lucide-react";

interface ExpenseModalProps {
  isOpen: boolean;
  expenses: ExpenseItem[];
  onClose: () => void;
  onSaveExpense: (expense: ExpenseItem) => void;
  onDeleteExpense: (id: string) => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  expenses,
  onClose,
  onSaveExpense,
  onDeleteExpense,
}) => {
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [dateInput, setDateInput] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [categoryInput, setCategoryInput] = useState<ExpenseCategory>("Einkauf");
  const [notesInput, setNotesInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartEdit = (exp: ExpenseItem) => {
    setEditingExpenseId(exp.id);
    setAmountInput(exp.amount.toString());
    setDateInput(exp.date);
    setCategoryInput(exp.category);
    setNotesInput(exp.notes || "");
    setErrorMsg(null);
  };

  const handleCancelEdit = () => {
    setEditingExpenseId(null);
    setAmountInput("");
    setDateInput(new Date().toISOString().split("T")[0]);
    setCategoryInput("Einkauf");
    setNotesInput("");
    setErrorMsg(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountInput.replace(",", "."));

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("Bitte gib einen gültigen Betrag größer als 0 € ein.");
      return;
    }

    if (!dateInput) {
      setErrorMsg("Bitte wähle ein Datum aus.");
      return;
    }

    const expense: ExpenseItem = {
      id:
        editingExpenseId ||
        `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: Math.round(parsedAmount * 100) / 100,
      date: dateInput,
      category: categoryInput,
      notes: notesInput.trim(),
      createdAt: editingExpenseId
        ? expenses.find((e) => e.id === editingExpenseId)?.createdAt || Date.now()
        : Date.now(),
    };

    onSaveExpense(expense);
    handleCancelEdit();
  };

  const formatDateDE = (d: Date) => {
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div
        className="w-full max-w-lg bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Ausgaben erfassen
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Verwalte deine Geschäftsausgaben & Einkäufe
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[36px] min-w-[36px]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* Add / Edit Form */}
          <form
            onSubmit={handleSubmit}
            className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-800 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                {editingExpenseId ? "Ausgabe bearbeiten" : "Neue Ausgabe hinzufügen"}
              </span>
              {editingExpenseId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-stone-500 dark:text-stone-400 hover:underline"
                >
                  Abbrechen
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Betrag */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Betrag (€) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="z.B. 15,00"
                    value={amountInput}
                    onChange={(e) => {
                      setAmountInput(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-semibold text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[44px]"
                    required
                  />
                </div>
              </div>

              {/* Datum */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Datum <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-semibold text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[44px]"
                    required
                  />
                </div>
              </div>

              {/* Kategorie */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Kategorie <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
                  <select
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value as ExpenseCategory)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-semibold text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[44px]"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notiz */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Notiz (optional)
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-stone-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="z.B. Kartons & Klebeband von Amazon"
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-sm font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors shadow-xs min-h-[44px]"
            >
              <Plus className="h-4 w-4" />
              <span>{editingExpenseId ? "Ausgabe aktualisieren" : "Ausgabe speichern"}</span>
            </button>
          </form>

          {/* List of Existing Expenses */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Erfasste Ausgaben ({expenses.length})
              </h3>
            </div>

            {expenses.length === 0 ? (
              <div className="p-6 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/80 dark:border-stone-800 text-center">
                <Receipt className="h-8 w-8 mx-auto text-stone-400 dark:text-stone-500 mb-2" />
                <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
                  Noch keine Ausgaben erfasst
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Verwende das Formular oben, um deine erste Ausgabe hinzuzufügen.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-bold">
                          {exp.category}
                        </span>
                        <span className="text-xs text-stone-500 dark:text-stone-400 font-medium">
                          {formatDateDE(new Date(exp.date))}
                        </span>
                      </div>
                      {exp.notes && (
                        <p className="text-xs text-stone-600 dark:text-stone-300 font-medium truncate mt-1">
                          {exp.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm sm:text-base font-black text-rose-600 dark:text-rose-400">
                        -{formatCurrency(exp.amount)}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(exp)}
                        className="p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Bearbeiten"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>

                      {deleteConfirmId === exp.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteExpense(exp.id);
                              setDeleteConfirmId(null);
                            }}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold min-h-[36px]"
                          >
                            Löschen?
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="p-1 text-stone-400 hover:text-stone-600 min-h-[36px]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(exp.id)}
                          className="p-2 rounded-lg text-stone-500 dark:text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="Löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
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
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
};
