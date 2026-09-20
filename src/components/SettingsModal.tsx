import React, { useState } from "react";
import { X, RotateCcw, Check, Sparkles } from "lucide-react";
import { DEFAULT_VINTED_PROMPT } from "../lib/defaultPrompt";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt: string;
  onSavePrompt: (prompt: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentPrompt,
  onSavePrompt,
}) => {
  const [promptText, setPromptText] = useState(currentPrompt);
  const [savedNotice, setSavedNotice] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSavePrompt(promptText);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 600);
  };

  const handleReset = () => {
    setPromptText(DEFAULT_VINTED_PROMPT);
  };

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 dark:bg-black/70 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        id="settings-modal-container"
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-stone-900 shadow-xl border border-stone-200 dark:border-stone-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/50">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Einstellungen</h2>
              <p className="text-xs text-stone-700 dark:text-stone-400">KI-Prompt für deine Vinted-Anzeigen anpassen</p>
            </div>
          </div>
          <button
            id="settings-close-btn"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            title="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="vinted-prompt-textarea"
                className="text-sm font-semibold text-stone-900 dark:text-stone-100"
              >
                Mein Vinted-Prompt
              </label>
              <button
                id="reset-prompt-btn"
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Standard wiederherstellen
              </button>
            </div>
            <p className="text-xs text-stone-700 dark:text-stone-400 mb-2 leading-relaxed">
              Dieser Prompt wird dauerhaft in deinem Browser gespeichert und bei jeder Analyse an Gemini übermittelt. Du kannst Stil, Abschnitte oder Keywords nach deinen Wünschen anpassen.
            </p>
            <textarea
              id="vinted-prompt-textarea"
              rows={14}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800/90 p-3 text-sm text-stone-900 dark:text-stone-100 font-mono leading-relaxed focus:border-stone-900 dark:focus:border-stone-400 focus:outline-none transition-colors"
              placeholder="Füge hier deinen Vinted-Prompt ein..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
          <button
            id="settings-cancel-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[44px]"
          >
            Abbrechen
          </button>
          <button
            id="settings-save-btn"
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-sm font-medium text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors min-h-[44px] shadow-xs"
          >
            {savedNotice ? (
              <>
                <Check className="h-4 w-4" />
                Gespeichert!
              </>
            ) : (
              "Prompt speichern"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
