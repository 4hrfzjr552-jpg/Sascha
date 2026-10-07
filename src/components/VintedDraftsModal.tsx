import React, { useState } from "react";
import { VintedDraftData, VintedDraftStatus } from "../types";
import { getVintedDraftPayload } from "../lib/vintedDraftUtils";
import {
  X,
  Edit2,
  Trash2,
  Copy,
  Check,
  Download,
  ShoppingBag,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface VintedDraftsModalProps {
  isOpen: boolean;
  drafts: VintedDraftData[];
  onClose: () => void;
  onUpdateDraft: (updated: VintedDraftData) => void;
  onRemoveDraft: (draftId: string) => void;
  onClearAllDrafts?: () => void;
}

const CONDITION_OPTIONS = [
  "Neu mit Etikett",
  "Neu ohne Etikett",
  "Sehr gut",
  "Gut",
  "Zufriedenstellend",
];

const CATEGORY_OPTIONS = [
  "Jeans",
  "Stoffhosen & Chinos",
  "Jogginghosen",
  "Shorts",
  "Lederhosen",
  "Sonstige Hosen",
];

export const VintedDraftsModal: React.FC<VintedDraftsModalProps> = ({
  isOpen,
  drafts,
  onClose,
  onUpdateDraft,
  onRemoveDraft,
  onClearAllDrafts,
}) => {
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  if (!isOpen) return null;

  const handleCopyPayload = async (draft: VintedDraftData) => {
    const payload = getVintedDraftPayload(draft);
    const jsonStr = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(jsonStr);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = jsonStr;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedDraftId(draft.id);
      setTimeout(() => setCopiedDraftId(null), 2000);
    } catch (err) {
      console.error("Clipboard error:", err);
    }
  };

  const handleDownloadAllJson = () => {
    const payloads = drafts.map(getVintedDraftPayload);
    const jsonStr = JSON.stringify(payloads, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vinted_entwuerfe_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: VintedDraftStatus) => {
    switch (status) {
      case "prepared":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            prepared
          </span>
        );
      case "opened":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            opened
          </span>
        );
      case "saved":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            saved
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            error
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 dark:bg-teal-950/60 rounded-xl text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Vinted Entwürfe ({drafts.length})
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Vorbereitete Entwürfe für Vinted (lokal gespeichert)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {drafts.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAllJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[38px]"
                title="Alle Entwürfe als JSON herunterladen"
              >
                <Download className="w-4 h-4" />
                <span className="hidden xs:inline">JSON Export</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Draft List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {drafts.length === 0 ? (
            <div className="text-center py-12 px-4">
              <ShoppingBag className="w-12 h-12 mx-auto text-stone-300 dark:text-stone-700 mb-3" />
              <p className="text-base font-bold text-stone-800 dark:text-stone-200">
                Keine Vinted-Entwürfe in der Warteschlange
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-sm mx-auto">
                Klicke bei einer fertigen Hose auf „Vinted-Entwurf vorbereiten“ oder wähle mehrere Hosen aus.
              </p>
            </div>
          ) : (
            drafts.map((draft) => {
              const isEditing = editingDraftId === draft.id;
              const thumbUrl = draft.images.length > 0 ? draft.images[0].dataUrl : null;

              return (
                <div
                  key={draft.id}
                  className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800/60 p-3 sm:p-4 transition-all space-y-3"
                >
                  {/* Summary Bar */}
                  <div className="flex items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Thumbnail */}
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={draft.title}
                          className="w-12 h-12 rounded-xl object-cover border border-stone-200 dark:border-stone-700 shrink-0 bg-stone-100 dark:bg-stone-800"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400 shrink-0">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {draft.artikelnummer && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                              Art.-Nr.: {draft.artikelnummer}
                            </span>
                          )}
                          {getStatusBadge(draft.status)}
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-stone-900 dark:text-stone-100 truncate mt-0.5">
                          {draft.title || "Ohne Titel"}
                        </h3>

                        <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400 mt-0.5 flex-wrap">
                          {draft.price !== undefined && (
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              {draft.price} €
                            </span>
                          )}
                          {draft.brand && <span>Marke: {draft.brand}</span>}
                          {draft.size && <span>Größe: {draft.size}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyPayload(draft)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[36px]"
                        title="Payload JSON für Browser-Erweiterung kopieren"
                      >
                        {copiedDraftId === draft.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="hidden sm:inline">Kopiert</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Payload</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setEditingDraftId(isEditing ? null : draft.id)
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors min-h-[36px] ${
                          isEditing
                            ? "bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900"
                            : "border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700"
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{isEditing ? "Schließen" : "Bearbeiten"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveDraft(draft.id)}
                        className="inline-flex items-center justify-center p-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors min-h-[36px] min-w-[36px]"
                        title="Aus Warteschlange entfernen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Editable Form Fields (Only shown when Bearbeiten is toggled) */}
                  {isEditing && (
                    <div className="pt-3 border-t border-stone-200 dark:border-stone-700/80 space-y-3 bg-stone-50/70 dark:bg-stone-900/60 p-3 sm:p-4 rounded-xl">
                      <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 italic">
                        Hinweis: Änderungen hier betreffen nur diesen Vinted-Entwurf und verändern nicht das ursprüngliche KI-Ergebnis.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Titel */}
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Vinted Title
                          </label>
                          <input
                            type="text"
                            value={draft.title}
                            onChange={(e) =>
                              onUpdateDraft({
                                ...draft,
                                title: e.target.value,
                                updatedAt: Date.now(),
                              })
                            }
                            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900 min-h-[40px]"
                          />
                        </div>

                        {/* Preis */}
                        <div>
                          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Preis (€)
                          </label>
                          <input
                            type="number"
                            step="1"
                            value={draft.price !== undefined ? draft.price : ""}
                            onChange={(e) =>
                              onUpdateDraft({
                                ...draft,
                                price: e.target.value ? Number(e.target.value) : undefined,
                                updatedAt: Date.now(),
                              })
                            }
                            placeholder="z.B. 45"
                            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900 min-h-[40px]"
                          />
                        </div>

                        {/* Marke */}
                        <div>
                          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Marke
                          </label>
                          <input
                            type="text"
                            value={draft.brand || ""}
                            onChange={(e) =>
                              onUpdateDraft({
                                ...draft,
                                brand: e.target.value,
                                updatedAt: Date.now(),
                              })
                            }
                            placeholder="z.B. Diesel"
                            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900 min-h-[40px]"
                          />
                        </div>

                        {/* Größe */}
                        <div>
                          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Größe
                          </label>
                          <input
                            type="text"
                            value={draft.size || ""}
                            onChange={(e) =>
                              onUpdateDraft({
                                ...draft,
                                size: e.target.value,
                                updatedAt: Date.now(),
                              })
                            }
                            placeholder="z.B. W32 L32"
                            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900 min-h-[40px]"
                          />
                        </div>

                        {/* Farbe */}
                        <div>
                          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Farbe
                          </label>
                          <input
                            type="text"
                            value={draft.color || ""}
                            onChange={(e) =>
                              onUpdateDraft({
                                ...draft,
                                color: e.target.value,
                                updatedAt: Date.now(),
                              })
                            }
                            placeholder="z.B. Blau"
                            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900 min-h-[40px]"
                          />
                        </div>

                        {/* Zustand */}
                        <div>
                          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Zustand
                          </label>
                          <select
                            value={draft.condition || "Sehr gut"}
                            onChange={(e) =>
                              onUpdateDraft({
                                ...draft,
                                condition: e.target.value,
                                updatedAt: Date.now(),
                              })
                            }
                            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900 min-h-[40px]"
                          >
                            {CONDITION_OPTIONS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Kategorie */}
                        <div>
                          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Kategorie
                          </label>
                          <select
                            value={draft.category || "Jeans"}
                            onChange={(e) =>
                              onUpdateDraft({
                                ...draft,
                                category: e.target.value,
                                updatedAt: Date.now(),
                              })
                            }
                            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900 min-h-[40px]"
                          >
                            {CATEGORY_OPTIONS.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Beschreibung */}
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Beschreibung
                          </label>
                          <textarea
                            rows={6}
                            value={draft.description}
                            onChange={(e) =>
                              onUpdateDraft({
                                ...draft,
                                description: e.target.value,
                                updatedAt: Date.now(),
                              })
                            }
                            className="w-full rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 p-2.5 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-900"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between shrink-0 bg-stone-50/50 dark:bg-stone-900/50">
          <span className="text-xs text-stone-500 dark:text-stone-400 font-medium">
            Entwürfe stehen für Browser-Erweiterungen bereit.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-xs font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors min-h-[40px]"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
};
