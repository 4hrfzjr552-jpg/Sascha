import { useState, useEffect, useRef, useMemo } from "react";
import { PantItem, PantImage, FilterType, SaleStatus } from "./types";
import { DEFAULT_VINTED_PROMPT, LEGACY_DEFAULT_PROMPTS } from "./lib/defaultPrompt";
import {
  getAllPants,
  savePantToDB,
  saveMultiplePantsToDB,
  deletePantFromDB,
  clearAllPantsFromDB,
  getSetting,
  setSetting,
} from "./lib/indexedDb";
import {
  exportPantsAsCsv,
  exportPantsAsJson,
  parseImportedJson,
} from "./lib/exportUtils";
import {
  formatTitleWithArticleNumber,
  appendKeywordsToDescription,
} from "./lib/titleUtils";
import { Header } from "./components/Header";
import { FilterBar } from "./components/FilterBar";
import { SaleStatusBar } from "./components/SaleStatusBar";
import { PantCard } from "./components/PantCard";
import { SettingsModal } from "./components/SettingsModal";
import { AddMultipleModal } from "./components/AddMultipleModal";
import { BulkUploadModal } from "./components/BulkUploadModal";
import { SoldModal } from "./components/SoldModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { Plus, Sparkles, AlertCircle } from "lucide-react";
import { normalizePantSaleStatus } from "./lib/saleStatus";

const MAX_PANTS_LIMIT = 100;
const MAX_CONCURRENT_ANALYSES = 3;

export default function App() {
  const [pants, setPants] = useState<PantItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_VINTED_PROMPT);

  // Filters & Search
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddMultipleOpen, setIsAddMultipleOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [pantToDeleteId, setPantToDeleteId] = useState<string | null>(null);
  const [pantForSaleModalId, setPantForSaleModalId] = useState<string | null>(null);

  // Batch Processing State
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchActiveCount, setBatchActiveCount] = useState(0);
  const stopBatchRef = useRef(false);

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sascha_ai_theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("sascha_ai_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("sascha_ai_theme", "light");
    }
  }, [isDarkMode]);

  const handleToggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  // Notification message toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "info" | "success" | "error";
  } | null>(null);

  const showToast = (text: string, type: "info" | "success" | "error" = "info") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // 1. Initial Load from IndexedDB
  useEffect(() => {
    async function loadData() {
      try {
        const storedPants = await getAllPants();
        const normalizedPants = storedPants.map(normalizePantSaleStatus);
        setPants(normalizedPants);
        if (
          normalizedPants.some(
            (pant, index) => pant.saleStatus !== storedPants[index]?.saleStatus
          )
        ) {
          await saveMultiplePantsToDB(normalizedPants);
        }

        const storedPrompt = await getSetting<string | null>(
          "custom_vinted_prompt",
          null
        );
        if (!storedPrompt) {
          setCustomPrompt(DEFAULT_VINTED_PROMPT);
        } else if (LEGACY_DEFAULT_PROMPTS.some((lp) => lp.trim() === storedPrompt.trim())) {
          // Unedited legacy default: migrate to new standard prompt
          setCustomPrompt(DEFAULT_VINTED_PROMPT);
        } else {
          // User edited the prompt themselves: preserve their custom version
          setCustomPrompt(storedPrompt);
        }
      } catch (err) {
        console.error("Failed to initialize database:", err);
      } finally {
        setIsLoaded(true);
      }
    }
    loadData();
  }, []);

  // Recalculate and re-index pant numbers cleanly when list changes or on demand
  const getNextNumber = (list: PantItem[]) => {
    if (list.length === 0) return 1;
    const maxNum = Math.max(...list.map((p) => p.number || 0));
    return maxNum + 1;
  };

  // Add 1 New Pant
  const handleAddNewPant = async () => {
    if (pants.length >= MAX_PANTS_LIMIT) {
      showToast("Das Maximum von 100 Hosen ist erreicht.", "error");
      return;
    }

    const newPant: PantItem = {
      id: `pant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      number: getNextNumber(pants),
      artikelnummer: "",
      images: [],
      measurements: {
        waist: "",
        totalLength: "",
        inseam: "",
        legOpening: "",
        thighWidth: "",
      },
      customNotes: "",
      status: "waiting",
        saleStatus: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCollapsed: false,
      isDetectedOpen: false,
    };

    const updatedList = [...pants, newPant];
    setPants(updatedList);
    await savePantToDB(newPant);
    showToast(`Hose #${newPant.number} hinzugefügt.`, "success");
  };

  // Add Multiple Pants
  const handleAddMultiple = async (count: number) => {
    const remaining = Math.max(0, MAX_PANTS_LIMIT - pants.length);
    const toAdd = Math.min(count, remaining);
    if (toAdd <= 0) return;

    let currentMax = pants.length > 0 ? Math.max(...pants.map((p) => p.number || 0)) : 0;
    const newItems: PantItem[] = [];

    for (let i = 0; i < toAdd; i++) {
      currentMax += 1;
      newItems.push({
        id: `pant_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        number: currentMax,
        artikelnummer: "",
        images: [],
        measurements: {
          waist: "",
          totalLength: "",
          inseam: "",
          legOpening: "",
          thighWidth: "",
        },
        customNotes: "",
        status: "waiting",
        saleStatus: "draft",
        createdAt: Date.now() + i,
        updatedAt: Date.now() + i,
        isCollapsed: false,
        isDetectedOpen: false,
      });
    }

    const updatedList = [...pants, ...newItems];
    setPants(updatedList);
    await saveMultiplePantsToDB(newItems);
    showToast(`${toAdd} neue Hosen angelegt.`, "success");
  };

  // Create pants from bulk-upload groups (each group => one new pant)
  const handleCreatePantsFromGroups = async (
    groups: PantImage[][]
  ): Promise<{ added: number; skipped: number }> => {
    const remaining = Math.max(0, MAX_PANTS_LIMIT - pants.length);
    const groupsToAdd = groups.slice(0, remaining);
    const skipped = groups.length - groupsToAdd.length;

    if (groupsToAdd.length === 0) {
      return { added: 0, skipped };
    }

    let currentMax =
      pants.length > 0 ? Math.max(...pants.map((p) => p.number || 0)) : 0;

    const newItems: PantItem[] = groupsToAdd.map((imgs, i) => {
      currentMax += 1;
      return {
        id: `pant_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
        number: currentMax,
        artikelnummer: "",
        images: imgs.slice(0, 5),
        measurements: {
          waist: "",
          totalLength: "",
          inseam: "",
          legOpening: "",
          thighWidth: "",
        },
        customNotes: "",
        status: "waiting",
        saleStatus: "draft",
        createdAt: Date.now() + i,
        updatedAt: Date.now() + i,
        isCollapsed: false,
        isDetectedOpen: false,
      };
    });

    setPants((prev) => [...prev, ...newItems]);
    await saveMultiplePantsToDB(newItems);
    return { added: newItems.length, skipped };
  };

  // Duplicate Pant (Only measurements & structure, NO photos or KI results)
  const handleDuplicatePant = async (pant: PantItem) => {
    if (pants.length >= MAX_PANTS_LIMIT) {
      showToast("Das Maximum von 100 Hosen ist erreicht.", "error");
      return;
    }

    const duplicatedPant: PantItem = {
      id: `pant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      number: getNextNumber(pants),
      artikelnummer: "",
      images: [], // Explicitly no photos
      measurements: { ...pant.measurements }, // Copy measurements
      customNotes: pant.customNotes || "", // Copy notes
      status: "waiting", // Reset status
      saleStatus: "draft",
      result: undefined, // Explicitly no KI result
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCollapsed: false,
      isDetectedOpen: false,
    };

    const updatedList = [...pants, duplicatedPant];
    setPants(updatedList);
    await savePantToDB(duplicatedPant);
    showToast(`Hose #${pant.number} als #${duplicatedPant.number} dupliziert (ohne Fotos).`, "success");
  };

  // Update Pant State & IndexedDB
  const handleUpdatePant = async (updated: PantItem) => {
    setPants((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    await savePantToDB(updated);
  };

  const handleSaleStatusChange = (pant: PantItem, saleStatus: SaleStatus) => {
    if (saleStatus === "sold") {
      setPantForSaleModalId(pant.id);
      return;
    }

    void handleUpdatePant({
      ...pant,
      saleStatus,
      uploadedAt:
        saleStatus === "uploaded" && pant.saleStatus !== "uploaded"
          ? Date.now()
          : pant.uploadedAt,
      updatedAt: Date.now(),
    });
  };

  const handleSaveSale = async (data: {
    salePrice: number;
    saleDate: string;
  }) => {
    const pant = pants.find((item) => item.id === pantForSaleModalId);
    if (!pant) return;

    await handleUpdatePant({
      ...pant,
      saleStatus: "sold",
      salePrice: data.salePrice,
      saleDate: data.saleDate,
      soldAt: pant.soldAt || Date.now(),
      updatedAt: Date.now(),
    });
    setPantForSaleModalId(null);
    showToast(`Verkauf für Hose #${pant.number} gespeichert.`, "success");
  };

  // Delete single Pant
  const handleDeletePant = async (id: string) => {
    const updatedList = pants.filter((p) => p.id !== id);
    setPants(updatedList);
    await deletePantFromDB(id);
    showToast("Hose gelöscht.", "info");
  };

  // Delete all pants (Projekt löschen)
  const handleConfirmDeleteProject = async () => {
    setPants([]);
    await clearAllPantsFromDB();
    showToast("Projekt und alle Hosen wurden gelöscht.", "info");
  };

  // Toggle Collapse on All Finished Pants
  const areAllCollapsed = useMemo(() => {
    const donePants = pants.filter((p) => p.status === "done");
    if (donePants.length === 0) return false;
    return donePants.every((p) => p.isCollapsed);
  }, [pants]);

  const handleToggleCollapseAll = async () => {
    const targetState = !areAllCollapsed;
    const updated = pants.map((p) => {
      if (p.status === "done") {
        return { ...p, isCollapsed: targetState };
      }
      return p;
    });
    setPants(updated);
    await saveMultiplePantsToDB(updated);
    showToast(
      targetState ? "Alle fertigen Hosen eingeklappt." : "Alle fertigen Hosen ausgeklappt.",
      "info"
    );
  };

  // Save Custom Prompt
  const handleSavePrompt = async (newPrompt: string) => {
    setCustomPrompt(newPrompt);
    await setSetting("custom_vinted_prompt", newPrompt);
    showToast("Vinted-Prompt dauerhaft gespeichert.", "success");
  };

  // Export JSON
  const handleExportJson = () => {
    exportPantsAsJson(pants);
    showToast("Projekt erfolgreich als JSON exportiert.", "success");
  };

  // Import JSON
  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const importedPants = parseImportedJson(text);

      if (importedPants.length === 0) {
        showToast("Die Datei enthielt keine Hosen.", "error");
        return;
      }

      const mergedList = [...pants, ...importedPants].slice(0, MAX_PANTS_LIMIT);
      setPants(mergedList);
      await saveMultiplePantsToDB(mergedList);
      showToast(`${importedPants.length} Hosen erfolgreich importiert.`, "success");
    } catch (err: any) {
      console.error("Import error:", err);
      showToast("Fehler beim Import: " + (err.message || "Ungültiges Format"), "error");
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    exportPantsAsCsv(pants);
    showToast("CSV erfolgreich exportiert.", "success");
  };

  // Perform single pant AI analysis
  const analyzeSinglePant = async (
    targetPant: PantItem,
    promptToUse: string
  ): Promise<boolean> => {
    // Check photos
    if (targetPant.images.length === 0) {
      const updatedWithError: PantItem = {
        ...targetPant,
        status: "error",
        errorMessage: "Bitte mindestens ein Foto hinzufügen.",
        updatedAt: Date.now(),
      };
      await handleUpdatePant(updatedWithError);
      return false;
    }

    // Set analyzing status
    const analyzingPant: PantItem = {
      ...targetPant,
      status: "analyzing",
      errorMessage: undefined,
      updatedAt: Date.now(),
    };
    await handleUpdatePant(analyzingPant);

    try {
      const response = await fetch("/api/analyze-pant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pantId: targetPant.id,
          number: targetPant.number,
          artikelnummer: targetPant.artikelnummer,
          images: targetPant.images.map((img) => ({
            dataUrl: img.dataUrl,
            name: img.name,
          })),
          measurements: targetPant.measurements,
          customNotes: targetPant.customNotes,
          customPrompt: promptToUse,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        let msg = data.error || "Analyse fehlgeschlagen – erneut versuchen.";
        if (response.status === 429 || data.rateLimited) {
          msg = "Kostenloses KI-Limit momentan erreicht. Versuche es später erneut.";
        } else if (response.status === 503 || data.temporarilyUnavailable) {
          msg = "Die KI ist momentan stark ausgelastet. Bitte kurz warten und erneut versuchen.";
        }

        const failedPant: PantItem = {
          ...targetPant,
          status: "error",
          errorMessage: msg,
          updatedAt: Date.now(),
        };
        await handleUpdatePant(failedPant);
        return false;
      }

      // Success - format title with artikelnummer and description with keywords
      const rawResult = data.data;
      const formattedTitle = formatTitleWithArticleNumber(
        rawResult.title || "",
        targetPant.artikelnummer
      );
      const formattedDescription = appendKeywordsToDescription(
        rawResult.description || "",
        rawResult.keywords || []
      );

      const completedPant: PantItem = {
        ...targetPant,
        status: "done",
        errorMessage: undefined,
        result: {
          ...rawResult,
          title: formattedTitle,
          description: formattedDescription,
        },
        isCollapsed: false,
        isDetectedOpen: false,
        updatedAt: Date.now(),
      };
      await handleUpdatePant(completedPant);
      return true;
    } catch (err: any) {
      console.error(`Pant #${targetPant.number} analysis error:`, err);
      const failedPant: PantItem = {
        ...targetPant,
        status: "error",
        errorMessage: "Analyse fehlgeschlagen – erneut versuchen.",
        updatedAt: Date.now(),
      };
      await handleUpdatePant(failedPant);
      return false;
    }
  };

  // Trigger single analysis from card
  const handleAnalyzeFromCard = (pant: PantItem) => {
    analyzeSinglePant(pant, customPrompt);
  };

  // Batch analysis engine with Concurrency Pool (max 3 simultaneously)
  const handleStartBatch = async (onlyMissing: boolean) => {
    // Select candidates
    const candidates = pants.filter((p) => {
      if (p.images.length === 0) return false;
      if (onlyMissing) {
        return p.status !== "done";
      }
      return true;
    });

    if (candidates.length === 0) {
      showToast(
        onlyMissing
          ? "Keine Hosen mit Fotos gefunden, die noch analysiert werden müssen."
          : "Keine Hosen mit Fotos vorhanden.",
        "info"
      );
      return;
    }

    setIsBatchRunning(true);
    stopBatchRef.current = false;
    showToast(
      `Stapelverarbeitung gestartet (${candidates.length} Hosen, max. ${MAX_CONCURRENT_ANALYSES} gleichzeitig)...`,
      "info"
    );

    let activeRunning = 0;
    let index = 0;
    const queue = [...candidates];

    const runNext = async (): Promise<void> => {
      if (stopBatchRef.current || index >= queue.length) {
        return;
      }

      const currentItem = queue[index++];
      activeRunning += 1;
      setBatchActiveCount(activeRunning);

      try {
        await analyzeSinglePant(currentItem, customPrompt);
      } catch (e) {
        console.error("Batch item failed:", e);
      } finally {
        activeRunning -= 1;
        setBatchActiveCount(activeRunning);

        if (!stopBatchRef.current && index < queue.length) {
          // Brief pause between requests to prevent API rate bursts
          await new Promise((r) => setTimeout(r, 400));
          await runNext();
        }
      }
    };

    // Spawn up to MAX_CONCURRENT_ANALYSES workers with staggered start
    const workers = [];
    const concurrency = Math.min(MAX_CONCURRENT_ANALYSES, queue.length);
    for (let i = 0; i < concurrency; i++) {
      workers.push(
        (async () => {
          if (i > 0) {
            await new Promise((r) => setTimeout(r, i * 400));
          }
          await runNext();
        })()
      );
    }

    await Promise.all(workers);

    setIsBatchRunning(false);
    setBatchActiveCount(0);

    if (stopBatchRef.current) {
      showToast("Stapelverarbeitung abgebrochen.", "info");
    } else {
      showToast("Stapelverarbeitung abgeschlossen!", "success");
    }
  };

  const handleStopBatch = () => {
    stopBatchRef.current = true;
    setIsBatchRunning(false);
    showToast("Stapelverarbeitung wird angehalten...", "info");
  };

  const pantForSaleModal = pants.find((pant) => pant.id === pantForSaleModalId);

  // Sale status counts and technical analysis count stay separate.
  const counts = useMemo(() => {
    const saleCounts = {
      all: pants.length,
      draft: 0,
      ready: 0,
      uploaded: 0,
      sold: 0,
      archived: 0,
    };
    pants.forEach((pant) => {
      const saleStatus = pant.saleStatus || "draft";
      saleCounts[saleStatus] += 1;
    });
    return saleCounts;
  }, [pants]);
  const analysisDoneCount = useMemo(
    () => pants.filter((pant) => pant.status === "done").length,
    [pants]
  );

  // Filtered & Searched List
  const filteredPants = useMemo(() => {
    let result = pants;

    // Sale status filter. The AI analysis status remains independent.
    if (filter !== "all") {
      result = result.filter((p) => p.saleStatus === filter);
    }

    // Search Query (Titel oder Marke)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((p) => {
        const titleMatch = p.result?.title?.toLowerCase().includes(q);
        const brandMatch = p.result?.detected?.brand?.toLowerCase().includes(q);
        const notesMatch = p.customNotes?.toLowerCase().includes(q);
        const artNrMatch = p.artikelnummer?.toLowerCase().includes(q);
        const numberMatch = `hose #${p.number}`.includes(q) || `#${p.number}`.includes(q);
        return titleMatch || brandMatch || notesMatch || artNrMatch || numberMatch;
      });
    }

    return result;
  }, [pants, filter, searchQuery]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-700 dark:text-stone-300 transition-colors">
        <div className="text-center space-y-3">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-black text-xl animate-pulse">
            S
          </div>
          <p className="text-sm font-semibold">Sascha Ai wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans selection:bg-stone-900 selection:text-white dark:selection:bg-stone-100 dark:selection:text-stone-900 transition-colors">
      {/* Sticky Header */}
      <Header
        totalCount={pants.length}
        maxLimit={MAX_PANTS_LIMIT}
        doneCount={analysisDoneCount}
        isBatchRunning={isBatchRunning}
        batchActiveCount={batchActiveCount}
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
        onAddNewPant={handleAddNewPant}
        onOpenAddMultiple={() => setIsAddMultipleOpen(true)}
        onOpenBulkUpload={() => setIsBulkUploadOpen(true)}
        onStartBatch={handleStartBatch}
        onStopBatch={handleStopBatch}
        onToggleCollapseAll={handleToggleCollapseAll}
        areAllCollapsed={areAllCollapsed}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onExportCsv={handleExportCsv}
        onOpenDeleteProject={() => setIsDeleteProjectOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:px-6 space-y-6">
        {/* Filter & Search Bar */}
        {pants.length > 0 && (
          <div className="space-y-3">
            <SaleStatusBar
              currentFilter={filter}
              onFilterChange={setFilter}
              counts={counts}
            />
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>
        )}

        {/* Empty State when no pants exist */}
        {pants.length === 0 && (
          <div
            id="empty-state"
            className="text-center py-16 px-6 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-xs max-w-xl mx-auto my-8"
          >
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 mb-4">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              Noch keine Hosen angelegt
            </h2>
            <p className="mt-2 text-sm text-stone-700 dark:text-stone-400 leading-relaxed max-w-md mx-auto">
              Lege deine erste Hose an, lade 1 bis 5 Fotos hoch und lasse dir per Sascha Ai eine fertige Vinted-Anzeige mit suchoptimiertem Titel, Beschreibung und 25 Keywords erstellen.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                id="empty-state-add-first-btn"
                type="button"
                onClick={handleAddNewPant}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-stone-900 dark:bg-stone-100 text-sm font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors shadow-xs min-h-[44px]"
              >
                <Plus className="h-4 w-4" />
                <span>+ Erste Hose anlegen</span>
              </button>

              <button
                id="empty-state-add-five-btn"
                type="button"
                onClick={() => handleAddMultiple(5)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[44px]"
              >
                <span>5 Hosen auf einmal anlegen</span>
              </button>
            </div>
          </div>
        )}

        {/* No Search Results */}
        {pants.length > 0 && filteredPants.length === 0 && (
          <div className="text-center py-12 px-6 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
            <AlertCircle className="h-8 w-8 mx-auto text-stone-600 dark:text-stone-400 mb-2" />
            <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Keine Hosen gefunden
            </p>
            <p className="text-xs text-stone-700 dark:text-stone-400 mt-1">
              Keine Einträge für den Filter „{filter}“{" "}
              {searchQuery && `oder die Suche „${searchQuery}“`}.
            </p>
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setSearchQuery("");
              }}
              className="mt-4 px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-semibold text-stone-800 dark:text-stone-200 transition-colors"
            >
              Filter zurücksetzen
            </button>
          </div>
        )}

        {/* List of Pant Cards */}
        <div id="pants-list" className="space-y-4 sm:space-y-6">
          {filteredPants.map((pant) => (
            <PantCard
              key={pant.id}
              pant={pant}
              onUpdate={handleUpdatePant}
              onDelete={(id) => setPantToDeleteId(id)}
              onDuplicate={handleDuplicatePant}
              onAnalyze={handleAnalyzeFromCard}
              onSaleStatusChange={handleSaleStatusChange}
              onEditSale={(pant) => setPantForSaleModalId(pant.id)}
              isAnalyzingAny={isBatchRunning}
            />
          ))}
        </div>
      </main>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          id="global-toast-notification"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm ${
            toastMessage.type === "error"
              ? "bg-rose-900 text-white border-rose-800"
              : toastMessage.type === "success"
              ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-800 dark:border-stone-200"
              : "bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 border-stone-200 dark:border-stone-700 shadow-md"
          }`}
        >
          {toastMessage.text}
        </div>
      )}

      {/* Settings Modal (Mein Vinted-Prompt) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentPrompt={customPrompt}
        onSavePrompt={handleSavePrompt}
      />

      {/* Add Multiple Modal */}
      <AddMultipleModal
        isOpen={isAddMultipleOpen}
        onClose={() => setIsAddMultipleOpen(false)}
        currentCount={pants.length}
        maxLimit={MAX_PANTS_LIMIT}
        onAdd={handleAddMultiple}
      />

      {/* Sammel-Upload Modal */}
      <BulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        remainingPantSlots={Math.max(0, MAX_PANTS_LIMIT - pants.length)}
        onCreatePants={handleCreatePantsFromGroups}
        onToast={showToast}
      />

      <SoldModal
        isOpen={pantForSaleModal !== undefined}
        pantNumber={pantForSaleModal?.number || 0}
        initialPrice={pantForSaleModal?.salePrice}
        initialDate={pantForSaleModal?.saleDate}
        onClose={() => setPantForSaleModalId(null)}
        onSave={handleSaveSale}
      />

      {/* Confirm Delete Single Pant */}
      <ConfirmModal
        isOpen={pantToDeleteId !== null}
        title="Hose löschen?"
        message="Möchtest du diese Hose und alle zugehörigen Fotos und Daten wirklich entfernen?"
        confirmLabel="Hose löschen"
        isDestructive={true}
        onConfirm={() => {
          if (pantToDeleteId) {
            handleDeletePant(pantToDeleteId);
            setPantToDeleteId(null);
          }
        }}
        onClose={() => setPantToDeleteId(null)}
      />

      {/* Confirm Delete Whole Project */}
      <ConfirmModal
        isOpen={isDeleteProjectOpen}
        title="Gesamtes Projekt löschen?"
        message="Möchtest du wirklich alle Hosen, Maße, Fotos und generierten Anzeigen unwiderruflich aus dem Browser löschen?"
        confirmLabel="Alles löschen"
        isDestructive={true}
        onConfirm={handleConfirmDeleteProject}
        onClose={() => setIsDeleteProjectOpen(false)}
      />
    </div>
  );
}
