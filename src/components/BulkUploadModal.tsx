import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Layers,
  ImagePlus,
  Loader2,
  FolderPlus,
  Trash2,
  Check,
  CheckCheck,
  PackageCheck,
  Undo2,
  Plus,
} from "lucide-react";
import { PantImage } from "../types";
import {
  BulkImageMeta,
  saveBulkImage,
  getAllBulkMeta,
  getBulkImagesByIds,
  setBulkImagesGroup,
  deleteBulkImages,
  clearBulkImages,
  getSetting,
  setSetting,
} from "../lib/indexedDb";
import { compressImageFile, createThumbnail } from "../lib/imageCompressor";

const MAX_IMAGES_PER_GROUP = 5;
const PROCESS_FLUSH_EVERY = 8; // flush to state every N processed images
const UNGROUPED_PAGE_SIZE = 80; // paginate the ungrouped gallery

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  remainingPantSlots: number;
  onCreatePants: (
    groups: PantImage[][]
  ) => Promise<{ added: number; skipped: number }>;
  onToast: (text: string, type?: "info" | "success" | "error") => void;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  isOpen,
  onClose,
  remainingPantSlots,
  onCreatePants,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<BulkImageMeta[]>([]);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [visibleUngrouped, setVisibleUngrouped] = useState(UNGROUPED_PAGE_SIZE);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load any previously staged images + group order when opening.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [meta, order] = await Promise.all([
          getAllBulkMeta(),
          getSetting<string[]>("bulk_group_order", []),
        ]);
        if (cancelled) return;
        setImages(meta);
        // Keep only groups that still contain at least one image.
        const liveGroups = new Set(
          meta.map((m) => m.groupId).filter(Boolean) as string[]
        );
        const cleanedOrder = (order || []).filter((g) => liveGroups.has(g));
        for (const g of liveGroups) {
          if (!cleanedOrder.includes(g)) cleanedOrder.push(g);
        }
        setGroupOrder(cleanedOrder);
      } catch (err) {
        console.error("[v0] Failed to load bulk staging:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const persistGroupOrder = (order: string[]) => {
    setSetting("bulk_group_order", order).catch((e) =>
      console.warn("[v0] persist group order failed:", e)
    );
  };

  const ungrouped = useMemo(
    () => images.filter((img) => !img.groupId),
    [images]
  );

  const groups = useMemo(() => {
    return groupOrder.map((gid) => ({
      id: gid,
      items: images
        .filter((img) => img.groupId === gid)
        .sort((a, b) => a.order - b.order),
    }));
  }, [groupOrder, images]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- Image processing (compress + thumbnail) in a memory-safe queue ----
  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    // Reset the input so the same files can be picked again later.
    if (fileInputRef.current) fileInputRef.current.value = "";

    setProcessing({ done: 0, total: files.length });

    let buffer: BulkImageMeta[] = [];
    let done = 0;
    const baseOrder = Date.now();

    for (let i = 0; i < files.length; i++) {
      try {
        const full = await compressImageFile(files[i]);
        const thumbUrl = await createThumbnail(full.dataUrl);
        const order = baseOrder + i;
        await saveBulkImage({
          id: full.id,
          dataUrl: full.dataUrl,
          thumbUrl,
          name: full.name,
          size: full.size,
          groupId: null,
          order,
          createdAt: order,
        });
        buffer.push({
          id: full.id,
          thumbUrl,
          name: full.name,
          size: full.size,
          groupId: null,
          order,
          createdAt: order,
        });
      } catch (err) {
        console.error("[v0] bulk image failed:", err);
      }
      done++;

      if (buffer.length >= PROCESS_FLUSH_EVERY || done === files.length) {
        const flush = buffer;
        buffer = [];
        setImages((prev) => [...prev, ...flush]);
        setProcessing({ done, total: files.length });
        // Yield to the event loop so the UI can paint / stay responsive.
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    setProcessing(null);
    onToast(`${files.length} Bilder verarbeitet und gespeichert.`, "success");
  };

  // ---- Grouping actions ----
  const handleCreateGroupFromSelection = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (ids.length > MAX_IMAGES_PER_GROUP) {
      onToast(
        `Pro Hose sind maximal ${MAX_IMAGES_PER_GROUP} Bilder erlaubt. Du hast ${ids.length} markiert.`,
        "error"
      );
      return;
    }
    const gid = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setBulkImagesGroup(ids, gid);
    setImages((prev) =>
      prev.map((img) => (selected.has(img.id) ? { ...img, groupId: gid } : img))
    );
    const nextOrder = [...groupOrder, gid];
    setGroupOrder(nextOrder);
    persistGroupOrder(nextOrder);
    setSelected(new Set());
    onToast("Neue Hosen-Gruppe erstellt.", "success");
  };

  const handleAddSelectionToGroup = async (gid: string) => {
    const current = images.filter((img) => img.groupId === gid).length;
    const free = MAX_IMAGES_PER_GROUP - current;
    if (free <= 0) {
      onToast(
        `Diese Gruppe ist voll (max. ${MAX_IMAGES_PER_GROUP} Bilder).`,
        "error"
      );
      return;
    }
    const ids = Array.from(selected).slice(0, free);
    if (ids.length === 0) return;
    if (selected.size > free) {
      onToast(
        `Es passen nur noch ${free} Bilder in diese Gruppe. Überschüssige wurden nicht hinzugefügt.`,
        "info"
      );
    }
    await setBulkImagesGroup(ids, gid);
    const idSet = new Set(ids);
    setImages((prev) =>
      prev.map((img) => (idSet.has(img.id) ? { ...img, groupId: gid } : img))
    );
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleRemoveFromGroup = async (id: string) => {
    await setBulkImagesGroup([id], null);
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, groupId: null } : img))
    );
  };

  const handleDissolveGroup = async (gid: string) => {
    const ids = images.filter((img) => img.groupId === gid).map((i) => i.id);
    await setBulkImagesGroup(ids, null);
    setImages((prev) =>
      prev.map((img) => (img.groupId === gid ? { ...img, groupId: null } : img))
    );
    const nextOrder = groupOrder.filter((g) => g !== gid);
    setGroupOrder(nextOrder);
    persistGroupOrder(nextOrder);
    onToast("Gruppe aufgelöst – Bilder sind wieder ungeordnet.", "info");
  };

  const handleDeleteImage = async (id: string) => {
    await deleteBulkImages([id]);
    setImages((prev) => prev.filter((img) => img.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleSelectAllUngrouped = () => {
    const visible = ungrouped.slice(0, visibleUngrouped);
    const allSelected = visible.every((img) => selected.has(img.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visible.forEach((img) => next.delete(img.id));
      } else {
        visible.forEach((img) => next.add(img.id));
      }
      return next;
    });
  };

  const handleClearAll = async () => {
    await clearBulkImages();
    await setSetting("bulk_group_order", []);
    setImages([]);
    setGroupOrder([]);
    setSelected(new Set());
    onToast("Sammel-Upload geleert.", "info");
  };

  // ---- Apply: turn each group into a real pant ----
  const handleApplyGroups = async () => {
    const nonEmpty = groups.filter((g) => g.items.length > 0);
    if (nonEmpty.length === 0) {
      onToast("Es gibt noch keine Gruppen zum Übernehmen.", "info");
      return;
    }
    if (remainingPantSlots <= 0) {
      onToast("Das Maximum an Hosen ist bereits erreicht.", "error");
      return;
    }

    setIsApplying(true);
    try {
      const groupImages: PantImage[][] = [];
      for (const g of nonEmpty) {
        const records = await getBulkImagesByIds(g.items.map((i) => i.id));
        groupImages.push(
          records.slice(0, MAX_IMAGES_PER_GROUP).map((r) => ({
            id: r.id,
            dataUrl: r.dataUrl,
            name: r.name,
            size: r.size,
          }))
        );
      }

      const { added, skipped } = await onCreatePants(groupImages);

      // Only clear staging if everything was successfully taken over.
      if (skipped === 0) {
        await clearBulkImages();
        await setSetting("bulk_group_order", []);
        setImages([]);
        setGroupOrder([]);
        setSelected(new Set());
        onToast(`${added} Hosen aus den Gruppen erstellt.`, "success");
        onClose();
      } else {
        onToast(
          `${added} Hosen erstellt. ${skipped} Gruppen konnten wegen des Hosen-Limits nicht übernommen werden.`,
          "info"
        );
      }
    } catch (err) {
      console.error("[v0] apply groups failed:", err);
      onToast("Fehler beim Übernehmen der Gruppen.", "error");
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  const visibleUngroupedItems = ungrouped.slice(0, visibleUngrouped);
  const selectedCount = selected.size;
  const groupCount = groups.filter((g) => g.items.length > 0).length;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-stone-50 dark:bg-stone-950"
      role="dialog"
      aria-label="Sammel-Upload"
    >
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 px-4 py-3 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-stone-900 dark:text-stone-100 leading-none truncate">
                Sammel-Upload
              </h2>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5">
                {images.length} Bilder · {ungrouped.length} ungeordnet ·{" "}
                {groupCount} Gruppen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-5 sm:px-6 space-y-6 pb-40">
          {/* Upload + global actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={processing !== null}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-sm font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-40 transition-colors shadow-xs min-h-[44px]"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              <span>Bilder auswählen</span>
            </button>

            {images.length > 0 && (
              <button
                type="button"
                disabled={processing !== null || isApplying}
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-medium text-stone-700 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-800 disabled:opacity-40 transition-colors min-h-[44px]"
              >
                <Trash2 className="h-4 w-4" />
                <span>Alles leeren</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
              multiple
              onChange={handleFilesSelected}
              className="hidden"
            />
          </div>

          {/* Progress indicator */}
          {processing && (
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 shadow-xs">
              <div className="flex items-center justify-between text-sm font-semibold text-stone-900 dark:text-stone-100">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Bilder werden verarbeitet…
                </span>
                <span>
                  {processing.done} / {processing.total}
                </span>
              </div>
              <div className="mt-2.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full h-2 overflow-hidden border border-stone-200 dark:border-stone-700">
                <div
                  className="bg-emerald-600 dark:bg-emerald-500 h-2 rounded-full transition-all duration-200"
                  style={{
                    width: `${
                      processing.total > 0
                        ? Math.round(
                            (processing.done / processing.total) * 100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {isLoading && (
            <p className="text-sm text-stone-600 dark:text-stone-400 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Wird geladen…
            </p>
          )}

          {/* Empty state */}
          {!isLoading && images.length === 0 && !processing && (
            <div className="text-center py-16 px-6 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800">
              <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 mb-4">
                <Layers className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                Viele Bilder auf einmal hochladen
              </h3>
              <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 max-w-md mx-auto leading-relaxed">
                Wähle beliebig viele Fotos aus – auch mehrere hundert. Sie
                werden direkt im Browser komprimiert, gespeichert und du kannst
                sie danach zu Hosen gruppieren (max. {MAX_IMAGES_PER_GROUP}{" "}
                Bilder pro Hose).
              </p>
            </div>
          )}

          {/* Groups */}
          {groups.filter((g) => g.items.length > 0).length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                Hosen-Gruppen ({groupCount})
              </h3>
              <div className="space-y-3">
                {groups.map((group, idx) => {
                  if (group.items.length === 0) return null;
                  const free = MAX_IMAGES_PER_GROUP - group.items.length;
                  return (
                    <div
                      key={group.id}
                      className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 shadow-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <span className="text-sm font-bold text-stone-900 dark:text-stone-100">
                          Hose (Vorschau) #{idx + 1}
                          <span className="ml-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                            {group.items.length} / {MAX_IMAGES_PER_GROUP} Bilder
                          </span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          {selectedCount > 0 && free > 0 && (
                            <button
                              type="button"
                              onClick={() => handleAddSelectionToGroup(group.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                              title="Markierte Bilder zu dieser Gruppe hinzufügen"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Auswahl ({selectedCount})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDissolveGroup(group.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                            title="Gruppe auflösen (Bilder bleiben erhalten)"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            Auflösen
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {group.items.map((img) => (
                          <div
                            key={img.id}
                            className="relative group/thumb aspect-square rounded-lg overflow-hidden border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800"
                          >
                            <img
                              src={img.thumbUrl || "/placeholder.svg"}
                              alt={img.name}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveFromGroup(img.id)}
                              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-md bg-stone-900/80 text-white hover:bg-rose-600 transition-colors backdrop-blur-xs"
                              title="Aus Gruppe entfernen"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Ungrouped gallery */}
          {ungrouped.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  Ungeordnete Bilder ({ungrouped.length})
                </h3>
                <button
                  type="button"
                  onClick={handleSelectAllUngrouped}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Sichtbare markieren
                </button>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {visibleUngroupedItems.map((img) => {
                  const isSel = selected.has(img.id);
                  return (
                    <div
                      key={img.id}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        isSel
                          ? "border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900"
                          : "border-stone-200 dark:border-stone-700"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSelect(img.id)}
                        className="absolute inset-0 w-full h-full"
                        aria-pressed={isSel}
                        aria-label={
                          isSel ? "Auswahl aufheben" : "Bild markieren"
                        }
                      >
                        <img
                          src={img.thumbUrl || "/placeholder.svg"}
                          alt={img.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </button>
                      {isSel && (
                        <div className="absolute top-1 left-1 flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white pointer-events-none">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteImage(img.id)}
                        className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-md bg-stone-900/80 text-white hover:bg-rose-600 transition-colors backdrop-blur-xs"
                        title="Bild löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {ungrouped.length > visibleUngrouped && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleUngrouped((v) => v + UNGROUPED_PAGE_SIZE)
                    }
                    className="px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[44px]"
                  >
                    Mehr anzeigen ({ungrouped.length - visibleUngrouped}{" "}
                    weitere)
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 px-4 py-3 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium text-stone-600 dark:text-stone-400">
            {selectedCount > 0 ? (
              <span className="text-stone-900 dark:text-stone-100 font-semibold">
                {selectedCount} markiert
              </span>
            ) : (
              <span>Bilder antippen zum Markieren</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedCount === 0 || processing !== null}
              onClick={handleCreateGroupFromSelection}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors min-h-[44px]"
            >
              <FolderPlus className="h-4 w-4" />
              <span>Neue Hose aus Auswahl</span>
            </button>
            <button
              type="button"
              disabled={groupCount === 0 || isApplying || processing !== null}
              onClick={handleApplyGroups}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-800 dark:hover:bg-emerald-500 disabled:opacity-40 transition-colors shadow-xs min-h-[44px]"
            >
              {isApplying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageCheck className="h-4 w-4" />
              )}
              <span>Gruppen übernehmen{groupCount > 0 ? ` (${groupCount})` : ""}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
