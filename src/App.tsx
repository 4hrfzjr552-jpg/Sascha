import { useState, useEffect, useRef, useMemo } from "react";
import { PantItem, PantImage, FilterType, AnalysisFilterType, SaleStatus, ExpenseItem } from "./types";
import { DEFAULT_VINTED_PROMPT, LEGACY_DEFAULT_PROMPTS } from "./lib/defaultPrompt";
import {
  supabase,
  fetchPantsFromSupabase,
  savePantToSupabase,
  deletePantFromSupabase,
  fetchExpensesFromSupabase,
  saveExpenseToSupabase,
  deleteExpenseFromSupabase,
} from "./lib/supabase";
import { Auth } from "./components/Auth";
import { Session } from "@supabase/supabase-js";
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
import { AnalysisStatusBar } from "./components/AnalysisStatusBar";
import { PantCard } from "./components/PantCard";
import { SettingsModal } from "./components/SettingsModal";
import { AddMultipleModal } from "./components/AddMultipleModal";
import { BulkUploadModal } from "./components/BulkUploadModal";
import { SoldModal } from "./components/SoldModal";
import { StatsModal } from "./components/StatsModal";
import { ExpenseModal } from "./components/ExpenseModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { Plus, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { normalizePantSaleStatus } from "./lib/saleStatus";

const MAX_PANTS_LIMIT = 100;
const MAX_CONCURRENT_ANALYSES = 3;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [pants, setPants] = useState<PantItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_VINTED_PROMPT);

  // Filters & Search
  const [filter, setFilter] = useState<FilterType>("all");
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isExpensesOpen, setIsExpensesOpen] = useState(false);
  const [isAddMultipleOpen, setIsAddMultipleOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [pantToDeleteId, setPantToDeleteId] = useState<string | null>(null);
  const [pantForSaleModalId, setPantForSaleModalId] = useState<string | null>(null);

  // Batch Processing State
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchActiveCount, setBatchActiveCount] = useState(0);
  const stopBatchRef = useRef(false);

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

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load Data from Supabase when Session is active
  const userId = session?.user?.id;

  const loadData = async (uid: string) => {
    setIsSyncing(true);
    try {
      const fetchedPants = await fetchPantsFromSupabase(uid);
      const normalizedPants = fetchedPants.map(normalizePantSaleStatus);
      setPants(normalizedPants);

      const fetchedExpenses = await fetchExpensesFromSupabase(uid);
      setExpenses(fetchedExpenses);

      // Prompt setting per user
      const storedPrompt = localStorage.getItem(`custom_vinted_prompt_${uid}`);
      if (!storedPrompt) {
        setCustomPrompt(DEFAULT_VINTED_PROMPT);
      } else if (LEGACY_DEFAULT_PROMPTS.some((lp) => lp.trim() === storedPrompt.trim())) {
        setCustomPrompt(DEFAULT_VINTED_PROMPT);
      } else {
        setCustomPrompt(storedPrompt);
      }
    } catch (err: any) {
      console.error("Failed to fetch data from Supabase:", err);
      showToast("Fehler beim Laden der Daten von Supabase.", "error");
    } finally {
      setIsLoaded(true);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadData(userId);
    } else {
      setPants([]);
      setExpenses([]);
      setIsLoaded(false);
    }
  }, [userId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPants([]);
    setExpenses([]);
    showToast("Erfolgreich abgemeldet.", "info");
  };

  // Helper for max number
  const getNextNumber = (list: PantItem[]) => {
    if (list.length === 0) return 1;
    const maxNum = Math.max(...list.map((p) => p.number || 0));
    return maxNum + 1;
  };

  // Add 1 New Pant
  const handleAddNewPant = async () => {
    if (!userId) return;
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
    try {
      const saved = await savePantToSupabase(userId, newPant);
      setPants((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      showToast(`Hose #${newPant.number} hinzugefügt.`, "success");
    } catch (err) {
      showToast("Fehler beim Speichern der Hose.", "error");
    }
  };

  // Add Multiple Pants
  const handleAddMultiple = async (count: number) => {
    if (!userId) return;
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

    try {
      await Promise.all(newItems.map((item) => savePantToSupabase(userId, item)));
      showToast(`${toAdd} neue Hosen angelegt.`, "success");
    } catch (err) {
      showToast("Fehler beim Speichern der Hosen in Supabase.", "error");
    }
  };

  // Bulk Upload Groups
  const handleCreatePantsFromGroups = async (
    groups: PantImage[][]
  ): Promise<{ added: number; skipped: number }> => {
    if (!userId) return { added: 0, skipped: groups.length };
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

    try {
      const savedItems = await Promise.all(
        newItems.map((item) => savePantToSupabase(userId, item))
      );
      setPants((prev) =>
        prev.map((p) => savedItems.find((s) => s.id === p.id) || p)
      );
      return { added: newItems.length, skipped };
    } catch (err) {
      showToast("Fehler beim Speichern der Sammel-Upload Hosen.", "error");
      return { added: 0, skipped: groups.length };
    }
  };

  // Duplicate Pant
  const handleDuplicatePant = async (pant: PantItem) => {
    if (!userId) return;
    if (pants.length >= MAX_PANTS_LIMIT) {
      showToast("Das Maximum von 100 Hosen ist erreicht.", "error");
      return;
    }

    const duplicatedPant: PantItem = {
      id: `pant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      number: getNextNumber(pants),
      artikelnummer: "",
      images: [],
      measurements: { ...pant.measurements },
      customNotes: pant.customNotes || "",
      status: "waiting",
      saleStatus: "draft",
      result: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isCollapsed: false,
      isDetectedOpen: false,
    };

    const updatedList = [...pants, duplicatedPant];
    setPants(updatedList);
    try {
      const saved = await savePantToSupabase(userId, duplicatedPant);
      setPants((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      showToast(`Hose #${pant.number} als #${duplicatedPant.number} dupliziert (ohne Fotos).`, "success");
    } catch (err) {
      showToast("Fehler beim Speichern der duplizierten Hose.", "error");
    }
  };

  // Update Pant
  const handleUpdatePant = async (updated: PantItem) => {
    if (!userId) return;
    setPants((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    try {
      const saved = await savePantToSupabase(userId, updated);
      setPants((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
    } catch (err) {
      console.error("Failed to update pant in Supabase:", err);
      showToast("Fehler beim Aktualisieren in Supabase.", "error");
    }
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

  // Expenses
  const handleSaveExpense = async (expense: ExpenseItem) => {
    if (!userId) return;
    const existingIndex = expenses.findIndex((e) => e.id === expense.id);
    let updated: ExpenseItem[];
    if (existingIndex >= 0) {
      updated = expenses.map((e) => (e.id === expense.id ? expense : e));
    } else {
      updated = [expense, ...expenses];
    }
    updated.sort((a, b) => b.createdAt - a.createdAt);
    setExpenses(updated);
    try {
      await saveExpenseToSupabase(userId, expense);
      showToast("Ausgabe gespeichert.", "success");
    } catch (err) {
      showToast("Fehler beim Speichern der Ausgabe.", "error");
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!userId) return;
    const updated = expenses.filter((e) => e.id !== id);
    setExpenses(updated);
    try {
      await deleteExpenseFromSupabase(userId, id);
      showToast("Ausgabe gelöscht.", "info");
    } catch (err) {
      showToast("Fehler beim Löschen der Ausgabe.", "error");
    }
  };

  // Delete Single Pant
  const handleDeletePant = async (id: string) => {
    if (!userId) return;
    const targetPant = pants.find((p) => p.id === id);
    const updatedList = pants.filter((p) => p.id !== id);
    setPants(updatedList);
    try {
      await deletePantFromSupabase(userId, id, targetPant?.images);
      showToast("Hose gelöscht.", "info");
    } catch (err) {
      showToast("Fehler beim Löschen der Hose in Supabase.", "error");
    }
  };

  // Delete Project
  const handleConfirmDeleteProject = async () => {
    if (!userId) return;
    const currentPants = [...pants];
    setPants([]);
    try {
      await Promise.all(
        currentPants.map((p) => deletePantFromSupabase(userId, p.id, p.images))
      );
      showToast("Projekt und alle Hosen wurden gelöscht.", "info");
    } catch (err) {
      showToast("Fehler beim Löschen des Projekts.", "error");
    }
  };

  // Toggle Collapse
  const areAllCollapsed = useMemo(() => {
    const donePants = pants.filter((p) => p.status === "done");
    if (donePants.length === 0) return false;
    return donePants.every((p) => p.isCollapsed);
  }, [pants]);

  const handleToggleCollapseAll = async () => {
    if (!userId) return;
    const targetState = !areAllCollapsed;
    const updated = pants.map((p) => {
      if (p.status === "done") {
        return { ...p, isCollapsed: targetState };
      }
      return p;
    });
    setPants(updated);
    await Promise.all(updated.map((p) => savePantToSupabase(userId, p)));
    showToast(
      targetState ? "Alle fertigen Hosen eingeklappt." : "Alle fertigen Hosen ausgeklappt.",
      "info"
    );
  };

  // Prompt Setting
  const handleSavePrompt = async (newPrompt: string) => {
    setCustomPrompt(newPrompt);
    if (userId) {
      localStorage.setItem(`custom_vinted_prompt_${userId}`, newPrompt);
    }
    showToast("Vinted-Prompt dauerhaft gespeichert.", "success");
  };

  // Exports
  const handleExportJson = () => {
    exportPantsAsJson(pants);
    showToast("Projekt erfolgreich als JSON exportiert.", "success");
  };

  const handleImportJson = async (file: File) => {
    if (!userId) return;
    try {
      const text = await file.text();
      const importedPants = parseImportedJson(text);

      if (importedPants.length === 0) {
        showToast("Die Datei enthielt keine Hosen.", "error");
        return;
      }

      const mergedList = [...pants, ...importedPants].slice(0, MAX_PANTS_LIMIT);
      setPants(mergedList);
      await Promise.all(importedPants.map((p) => savePantToSupabase(userId, p)));
      showToast(`${importedPants.length} Hosen erfolgreich importiert.`, "success");
    } catch (err: any) {
      console.error("Import error:", err);
      showToast("Fehler beim Import: " + (err.message || "Ungültiges Format"), "error");
    }
  };

  const handleExportCsv = () => {
    exportPantsAsCsv(pants);
    showToast("CSV erfolgreich exportiert.", "success");
  };

  // AI Analysis
  const analyzeSinglePant = async (
    targetPant: PantItem,
    promptToUse: string
  ): Promise<boolean> => {
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

  const handleAnalyzeFromCard = (pant: PantItem) => {
    analyzeSinglePant(pant, customPrompt);
  };

  // Batch Processing
  const handleStartBatch = async (onlyMissing: boolean) => {
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
          await new Promise((r) => setTimeout(r, 400));
          await runNext();
        }
      }
    };

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

  const analysisCounts = useMemo(() => {
    const result: Record<AnalysisFilterType, number> = {
      all: pants.length,
      waiting: 0,
      done: 0,
      error: 0,
    };
    pants.forEach((pant) => {
      if (pant.status === "done") result.done += 1;
      else if (pant.status === "error") result.error += 1;
      else result.waiting += 1;
    });
    return result;
  }, [pants]);

  const filteredPants = useMemo(() => {
    let result = pants;

    if (analysisFilter !== "all") {
      result = result.filter((p) => {
        if (analysisFilter === "done") return p.status === "done";
        if (analysisFilter === "error") return p.status === "error";
        return p.status === "waiting" || p.status === "analyzing";
      });
    }

    if (filter !== "all") {
      result = result.filter((p) => p.saleStatus === filter);
    }

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

    if (filter === "uploaded") {
      result = [...result].sort((a, b) => {
        const parseArtNr = (artNr?: string): number | null => {
          if (!artNr) return null;
          const trimmed = artNr.trim();
          if (!trimmed) return null;
          const num = Number(trimmed);
          return !isNaN(num) && Number.isFinite(num) ? num : null;
        };

        const numA = parseArtNr(a.artikelnummer);
        const numB = parseArtNr(b.artikelnummer);

        if (numA !== null && numB !== null) {
          if (numA !== numB) return numA - numB;
          return a.number - b.number;
        }
        if (numA !== null && numB === null) return -1;
        if (numA === null && numB !== null) return 1;

        return a.number - b.number;
      });
    }

    return result;
  }, [pants, filter, analysisFilter, searchQuery]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-700 dark:text-stone-300 transition-colors">
        <div className="text-center space-y-3">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-black text-xl animate-pulse">
            S
          </div>
          <p className="text-sm font-semibold">Anmeldung wird geprüft...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-700 dark:text-stone-300 transition-colors">
        <div className="text-center space-y-3">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-black text-xl animate-pulse">
            S
          </div>
          <p className="text-sm font-semibold">Daten von Supabase werden geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans selection:bg-stone-900 selection:text-white dark:selection:bg-stone-100 dark:selection:text-stone-900 transition-colors">
      {/* Sticky Header */}
      <Header
        userEmail={session.user.email}
        onLogout={handleLogout}
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
        onOpenStats={() => setIsStatsOpen(true)}
        onOpenExpenses={() => setIsExpensesOpen(true)}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onExportCsv={handleExportCsv}
        onOpenDeleteProject={() => setIsDeleteProjectOpen(true)}
      />

      {/* Sync indicator */}
      {isSyncing && (
        <div className="bg-indigo-600 text-white text-[11px] py-1 px-3 text-center font-medium flex items-center justify-center gap-1.5 animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Synchronisiere mit Supabase...</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 py-3 sm:px-6 space-y-3 sm:space-y-4">
        {/* Filter & Search Bar */}
        {pants.length > 0 && (
          <div className="space-y-2">
            <div>
              <span className="block px-0.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Analyse-Status
              </span>
              <AnalysisStatusBar
                currentFilter={analysisFilter}
                onFilterChange={setAnalysisFilter}
                counts={analysisCounts}
              />
            </div>
            <div>
              <span className="block px-0.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                Verkaufsstatus
              </span>
              <SaleStatusBar
                currentFilter={filter}
                onFilterChange={setFilter}
                counts={counts}
              />
            </div>
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
            className="text-center py-12 px-5 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-xs max-w-xl mx-auto my-6"
          >
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 mb-3">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Noch keine Hosen angelegt
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-stone-700 dark:text-stone-400 leading-relaxed max-w-md mx-auto">
              Lege deine erste Hose an, lade 1 bis 5 Fotos hoch und lasse dir per Sascha AI eine fertige Vinted-Anzeige mit suchoptimiertem Titel, Beschreibung und Keywords erstellen.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                id="empty-state-add-first-btn"
                type="button"
                onClick={handleAddNewPant}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-xs sm:text-sm font-semibold text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors shadow-xs min-h-[44px]"
              >
                <Plus className="h-4 w-4" />
                <span>+ Erste Hose anlegen</span>
              </button>

              <button
                id="empty-state-add-five-btn"
                type="button"
                onClick={() => handleAddMultiple(5)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-xs sm:text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors min-h-[44px]"
              >
                <span>5 Hosen auf einmal anlegen</span>
              </button>
            </div>
          </div>
        )}

        {/* No Search Results */}
        {pants.length > 0 && filteredPants.length === 0 && (
          <div className="text-center py-10 px-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
            <AlertCircle className="h-7 w-7 mx-auto text-stone-600 dark:text-stone-400 mb-2" />
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Keine Hosen gefunden
            </p>
            <p className="text-xs text-stone-700 dark:text-stone-400 mt-1">
              Keine Einträge für die aktiven Filter{" "}
              {searchQuery && `oder die Suche „${searchQuery}“`}.
            </p>
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setAnalysisFilter("all");
                setSearchQuery("");
              }}
              className="mt-3 px-3.5 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-semibold text-stone-800 dark:text-stone-200 transition-colors min-h-[40px]"
            >
              Filter zurücksetzen
            </button>
          </div>
        )}

        {/* List of Pant Cards */}
        <div id="pants-list" className="space-y-2 sm:space-y-3">
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

      {/* Stats Modal */}
      <StatsModal
        isOpen={isStatsOpen}
        pants={pants}
        expenses={expenses}
        onClose={() => setIsStatsOpen(false)}
      />

      {/* Expense Modal */}
      <ExpenseModal
        isOpen={isExpensesOpen}
        expenses={expenses}
        onClose={() => setIsExpensesOpen(false)}
        onSaveExpense={handleSaveExpense}
        onDeleteExpense={handleDeleteExpense}
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
        message="Möchtest du wirklich alle Hosen, Maße, Fotos und generierten Anzeigen unwiderruflich löschen?"
        confirmLabel="Alles löschen"
        isDestructive={true}
        onConfirm={handleConfirmDeleteProject}
        onClose={() => setIsDeleteProjectOpen(false)}
      />
    </div>
  );
}
