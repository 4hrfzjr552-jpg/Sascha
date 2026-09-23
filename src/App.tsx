import React, { useState, useEffect, useMemo, useRef } from "react";
import { Session } from "@supabase/supabase-js";
import {
  PantItem,
  FilterType,
  AnalysisFilterType,
  GenerationFilterType,
  ArticleNumberFilterType,
  ExpenseItem,
  SaleStatus,
  PantImage,
} from "./types";
import { DEFAULT_VINTED_PROMPT } from "./lib/defaultPrompt";
import { exportPantsAsJson, exportPantsAsCsv, parseImportedJson } from "./lib/exportUtils";
import {
  supabase,
  fetchPantsFromSupabase,
  savePantToSupabase,
  deletePantFromSupabase,
  fetchExpensesFromSupabase,
  saveExpenseToSupabase,
  deleteExpenseFromSupabase,
} from "./lib/supabase";
import {
  formatTitleWithArticleNumber,
  appendKeywordsToDescription,
} from "./lib/titleUtils";
import { sortPantsByArticleNumber } from "./lib/articleNumberUtils";
import { Auth } from "./components/Auth";
import { Header } from "./components/Header";
import { FilterBar } from "./components/FilterBar";
import { PantCard } from "./components/PantCard";
import { SettingsModal } from "./components/SettingsModal";
import { AddMultipleModal } from "./components/AddMultipleModal";
import { BulkUploadModal } from "./components/BulkUploadModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { StatsModal } from "./components/StatsModal";
import { ExpenseModal } from "./components/ExpenseModal";
import { SoldModal } from "./components/SoldModal";
import {
  Plus,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";

const MAX_PANTS_LIMIT = 100;
const PROMPT_STORAGE_KEY = "sascha_vinted_custom_prompt";
const DARK_MODE_STORAGE_KEY = "sascha_vinted_dark_mode";

/**
 * Calculates next numeric pant number (highest current + 1)
 */
function getNextNumber(currentPants: PantItem[]): number {
  if (currentPants.length === 0) return 1;
  const max = Math.max(...currentPants.map((p) => p.number || 0));
  return max + 1;
}

export default function App() {
  // Supabase Auth session state
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // App data state
  const [pants, setPants] = useState<PantItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_VINTED_PROMPT);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // UI Filter & Search states
  const [filter, setFilter] = useState<FilterType>("all");
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilterType>("all");
  const [generationFilter, setGenerationFilter] = useState<GenerationFilterType>("all");
  const [articleNumberFilter, setArticleNumberFilter] = useState<ArticleNumberFilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [articleNumberSearchQuery, setArticleNumberSearchQuery] = useState("");
  const [editingArticleNumberPantId, setEditingArticleNumberPantId] = useState<string | null>(null);

  // Modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isExpensesOpen, setIsExpensesOpen] = useState(false);
  const [isAddMultipleOpen, setIsAddMultipleOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [pantToDeleteId, setPantToDeleteId] = useState<string | null>(null);
  const [pantForSaleModalId, setPantForSaleModalId] = useState<string | null>(null);

  // Toast notifications
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "info" | "success" | "error";
  } | null>(null);

  // Batch analysis state
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchActiveCount, setBatchActiveCount] = useState(0);
  const stopBatchRef = useRef(false);

  const showToast = (
    text: string,
    type: "info" | "success" | "error" = "info"
  ) => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // 1. Initial Auth Session check & subscription
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Load preferences & saved prompt from localStorage
  useEffect(() => {
    const savedPrompt = localStorage.getItem(PROMPT_STORAGE_KEY);
    if (savedPrompt) setCustomPrompt(savedPrompt);

    const savedDarkMode = localStorage.getItem(DARK_MODE_STORAGE_KEY);
    if (savedDarkMode !== null) {
      const isDark = savedDarkMode === "true";
      setIsDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setIsDarkMode(true);
        document.documentElement.classList.add("dark");
      }
    }
  }, []);

  // 3. Load user pants and expenses from Supabase on session
  useEffect(() => {
    if (!session?.user?.id) {
      setPants([]);
      setExpenses([]);
      return;
    }

    const userId = session.user.id;
    let isCancelled = false;

    async function loadData() {
      setIsSyncing(true);
      try {
        const [fetchedPants, fetchedExpenses] = await Promise.all([
          fetchPantsFromSupabase(userId),
          fetchExpensesFromSupabase(userId),
        ]);

        if (!isCancelled) {
          setPants(fetchedPants);
          setExpenses(fetchedExpenses);
        }
      } catch (err) {
        console.error("Error loading data from Supabase:", err);
        if (!isCancelled) {
          showToast("Fehler beim Laden der Daten aus Supabase.", "error");
        }
      } finally {
        if (!isCancelled) {
          setIsSyncing(false);
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [session?.user?.id]);

  // Dark Mode Toggle
  const handleToggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem(DARK_MODE_STORAGE_KEY, String(newMode));
    if (newMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Prompt Save
  const handleSavePrompt = (newPrompt: string) => {
    setCustomPrompt(newPrompt);
    localStorage.setItem(PROMPT_STORAGE_KEY, newPrompt);
    showToast("Vinted-Prompt erfolgreich gespeichert!", "success");
  };

  // Logout
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setPants([]);
      setExpenses([]);
      showToast("Erfolgreich abgemeldet.", "info");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // Single Pant Update Helper (Updates Local State + Saves to Supabase)
  const handleUpdatePant = async (updatedPant: PantItem) => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    // Optimistic UI update
    setPants((prev) =>
      prev.map((p) => (p.id === updatedPant.id ? updatedPant : p))
    );

    try {
      const saved = await savePantToSupabase(userId, updatedPant);
      setPants((prev) =>
        prev.map((p) => (p.id === saved.id ? saved : p))
      );
    } catch (err) {
      console.error("Failed to save pant to Supabase:", err);
      showToast("Fehler beim Speichern in Supabase.", "error");
    }
  };

  // Add Single Pant
  const handleAddNewPant = async () => {
    if (!session?.user?.id) return;
    if (pants.length >= MAX_PANTS_LIMIT) {
      showToast(`Maximales Limit von ${MAX_PANTS_LIMIT} Hosen erreicht.`, "error");
      return;
    }

    const userId = session.user.id;
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
    };

    setPants((prev) => [newPant, ...prev]);

    try {
      const saved = await savePantToSupabase(userId, newPant);
      setPants((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      showToast(`Hose #${saved.number} angelegt.`, "success");
    } catch (err) {
      console.error("Failed to add new pant to Supabase:", err);
      showToast("Fehler beim Anlegen der Hose.", "error");
    }
  };

  // Add Multiple Pants
  const handleAddMultiple = async (countToAdd: number) => {
    if (!session?.user?.id) return;
    const availableSlots = MAX_PANTS_LIMIT - pants.length;
    const toAdd = Math.min(countToAdd, availableSlots);

    if (toAdd <= 0) {
      showToast(`Maximales Limit von ${MAX_PANTS_LIMIT} Hosen erreicht.`, "error");
      return;
    }

    const userId = session.user.id;
    let currentMax = getNextNumber(pants) - 1;
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
      });
    }

    setPants((prev) => [...newItems, ...prev]);

    try {
      setIsSyncing(true);
      for (const item of newItems) {
        await savePantToSupabase(userId, item);
      }
      showToast(`${toAdd} Hosen erfolgreich angelegt!`, "success");
    } catch (err) {
      console.error("Failed adding multiple pants to Supabase:", err);
      showToast("Fehler beim Speichern der Hosen in Supabase.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Create Pants from Bulk Photo Upload Groups
  const handleCreatePantsFromGroups = async (
    groupsToAdd: PantImage[][]
  ): Promise<{ added: number; skipped: number }> => {
    if (!session?.user?.id || groupsToAdd.length === 0) {
      return { added: 0, skipped: groupsToAdd.length };
    }
    const userId = session.user.id;

    let currentMax = getNextNumber(pants) - 1;
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
      };
    });

    setPants((prev) => [...newItems, ...prev]);

    try {
      setIsSyncing(true);
      const savedItems = await Promise.all(
        newItems.map((item) => savePantToSupabase(userId, item))
      );
      setPants((prev) => {
        const savedMap = new Map(savedItems.map((s) => [s.id, s]));
        return prev.map((p) => savedMap.get(p.id) || p);
      });
      showToast(`${groupsToAdd.length} Hosen mit Fotos angelegt!`, "success");
      return { added: groupsToAdd.length, skipped: 0 };
    } catch (err) {
      console.error("Error creating bulk pants in Supabase:", err);
      showToast("Fehler beim Erstellen der Sammel-Hosen in Supabase.", "error");
      return { added: 0, skipped: groupsToAdd.length };
    } finally {
      setIsSyncing(false);
    }
  };

  // Duplicate Pant
  const handleDuplicatePant = async (pant: PantItem) => {
    if (!session?.user?.id) return;
    if (pants.length >= MAX_PANTS_LIMIT) {
      showToast(`Maximales Limit von ${MAX_PANTS_LIMIT} Hosen erreicht.`, "error");
      return;
    }

    const userId = session.user.id;
    const duplicatedPant: PantItem = {
      id: `pant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      number: getNextNumber(pants),
      artikelnummer: "",
      images: [], // Explicitly no photos
      measurements: { ...pant.measurements },
      customNotes: pant.customNotes || "",
      status: "waiting",
      saleStatus: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setPants((prev) => [duplicatedPant, ...prev]);

    try {
      const saved = await savePantToSupabase(userId, duplicatedPant);
      setPants((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      showToast(`Hose #${duplicatedPant.number} dupliziert!`, "success");
    } catch (err) {
      console.error("Failed to save duplicated pant to Supabase:", err);
      showToast("Fehler beim Duplizieren der Hose.", "error");
    }
  };

  // Delete Single Pant
  const handleDeletePant = async (pantId: string) => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    const target = pants.find((p) => p.id === pantId);
    setPants((prev) => prev.filter((p) => p.id !== pantId));

    try {
      await deletePantFromSupabase(userId, pantId, target?.images);
      showToast("Hose gelöscht.", "info");
    } catch (err) {
      console.error("Error deleting pant from Supabase:", err);
      showToast("Fehler beim Löschen der Hose in Supabase.", "error");
    }
  };

  // Delete Entire Project
  const handleConfirmDeleteProject = async () => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    try {
      setIsSyncing(true);
      for (const p of pants) {
        await deletePantFromSupabase(userId, p.id, p.images);
      }
      for (const e of expenses) {
        await deleteExpenseFromSupabase(userId, e.id);
      }
      setPants([]);
      setExpenses([]);
      setIsDeleteProjectOpen(false);
      showToast("Gesamtes Projekt gelöscht.", "info");
    } catch (err) {
      console.error("Error deleting project in Supabase:", err);
      showToast("Fehler beim Löschen des Projekts.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Expenses management
  const handleSaveExpense = async (expense: ExpenseItem) => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    setExpenses((prev) => {
      const exists = prev.some((e) => e.id === expense.id);
      if (exists) {
        return prev.map((e) => (e.id === expense.id ? expense : e));
      }
      return [expense, ...prev];
    });

    try {
      await saveExpenseToSupabase(userId, expense);
      showToast("Ausgabe gespeichert.", "success");
    } catch (err) {
      console.error("Error saving expense to Supabase:", err);
      showToast("Fehler beim Speichern der Ausgabe.", "error");
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!session?.user?.id) return;
    const userId = session.user.id;

    setExpenses((prev) => prev.filter((e) => e.id !== expenseId));

    try {
      await deleteExpenseFromSupabase(userId, expenseId);
      showToast("Ausgabe gelöscht.", "info");
    } catch (err) {
      console.error("Error deleting expense from Supabase:", err);
      showToast("Fehler beim Löschen der Ausgabe.", "error");
    }
  };

  // Sale status changes
  const handleSaleStatusChange = async (targetPant: PantItem, newStatus: SaleStatus) => {
    if (newStatus === "sold" && targetPant.saleStatus !== "sold") {
      setPantForSaleModalId(targetPant.id);
      return;
    }

    const updated: PantItem = {
      ...targetPant,
      saleStatus: newStatus,
      uploadedAt:
        newStatus === "uploaded" && !targetPant.uploadedAt
          ? Date.now()
          : targetPant.uploadedAt,
      updatedAt: Date.now(),
    };
    await handleUpdatePant(updated);
  };

  const handleSaveSale = async (price: number, date: string) => {
    if (!pantForSaleModalId) return;
    const targetPant = pants.find((p) => p.id === pantForSaleModalId);
    if (!targetPant) return;

    const updated: PantItem = {
      ...targetPant,
      saleStatus: "sold",
      salePrice: price,
      saleDate: date,
      soldAt: targetPant.soldAt || Date.now(),
      updatedAt: Date.now(),
    };

    setPantForSaleModalId(null);
    await handleUpdatePant(updated);
    showToast(`Hose #${targetPant.number} als verkauft markiert!`, "success");
  };

  // Collapse / Expand All
  const areAllCollapsed = useMemo(() => {
    if (pants.length === 0) return false;
    return pants.every((p) => p.isCollapsed);
  }, [pants]);

  const handleToggleCollapseAll = () => {
    const nextState = !areAllCollapsed;
    setPants((prev) =>
      prev.map((p) => ({
        ...p,
        isCollapsed: nextState,
      }))
    );
  };

  // Single Pant AI Analysis
  const analyzeSinglePant = async (
    targetPant: PantItem,
    promptToUse: string
  ): Promise<boolean> => {
    // Check article number requirement
    if (!targetPant.artikelnummer?.trim()) {
      showToast("Bitte zuerst eine Artikelnummer eintragen.", "error");
      return false;
    }

    // Check photos
    if (targetPant.images.length === 0) {
      showToast("Bitte zuerst mindestens ein Foto hinzufügen.", "error");
      return false;
    }

    // Set status analyzing
    const analyzingPant: PantItem = {
      ...targetPant,
      status: "analyzing",
      errorMessage: undefined,
      updatedAt: Date.now(),
    };
    await handleUpdatePant(analyzingPant);

    try {
      // Build images payload for API
      const validPayloadImages = targetPant.images.map((img) => img.dataUrl);

      const response = await fetch("/api/analyze-pant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pantId: targetPant.id,
          number: targetPant.number,
          artikelnummer: targetPant.artikelnummer,
          images: validPayloadImages,
          measurements: targetPant.measurements,
          customNotes: targetPant.customNotes,
          customPrompt: promptToUse,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errMsg = data?.error || "Analyse fehlgeschlagen – erneut versuchen.";
        const failedPant: PantItem = {
          ...targetPant,
          status: "error",
          errorMessage: errMsg,
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

      const donePant: PantItem = {
        ...targetPant,
        status: "done",
        saleStatus: targetPant.saleStatus === "draft" ? "ready" : targetPant.saleStatus,
        errorMessage: undefined,
        result: {
          title: formattedTitle,
          description: formattedDescription,
          keywords: rawResult.keywords || [],
          detected: rawResult.detected || {
            brand: "",
            model: "",
            gender: "",
            size: "",
            color: "",
            fit: "",
            material: "",
          },
        },
        updatedAt: Date.now(),
      };

      await handleUpdatePant(donePant);
      return true;
    } catch (err: any) {
      console.error("Client side pant analysis exception:", err);
      const failedPant: PantItem = {
        ...targetPant,
        status: "error",
        errorMessage: "Netzwerkfehler bei der Kommunikation mit dem Server.",
        updatedAt: Date.now(),
      };
      await handleUpdatePant(failedPant);
      return false;
    }
  };

  // Card trigger handler for single analysis
  const handleAnalyzeFromCard = async (pant: PantItem) => {
    if (isBatchRunning) return;
    const success = await analyzeSinglePant(pant, customPrompt);
    if (success) {
      showToast(`Anzeige für Hose #${pant.number} fertiggestellt!`, "success");
    }
  };

  // Batch analysis engine with Concurrency Pool (max 3 simultaneously)
  const handleStartBatch = async (onlyMissing: boolean) => {
    // Select candidates that have photos and an article number
    const candidates = pants.filter((p) => {
      if (p.images.length === 0) return false;
      if (!p.artikelnummer?.trim()) return false;
      if (onlyMissing) {
        return p.status !== "done" || !p.result;
      }
      return true;
    });

    if (candidates.length === 0) {
      const missingArtNrCount = pants.filter(
        (p) => p.images.length > 0 && !p.artikelnummer?.trim()
      ).length;
      if (missingArtNrCount > 0) {
        showToast("Bitte zuerst eine Artikelnummer eintragen.", "error");
      } else {
        showToast(
          onlyMissing
            ? "Keine Hosen mit Fotos gefunden, die noch analysiert werden müssen."
            : "Keine Hosen mit Fotos vorhanden.",
          "info"
        );
      }
      return;
    }

    setIsBatchRunning(true);
    stopBatchRef.current = false;
    showToast(`Starke KI-Analyse für ${candidates.length} Hosen gestartet...`, "info");

    const queue = [...candidates];
    let active = 0;
    let completedCount = 0;

    return new Promise<void>((resolve) => {
      const processNext = () => {
        if (stopBatchRef.current || (queue.length === 0 && active === 0)) {
          setIsBatchRunning(false);
          setBatchActiveCount(0);
          if (completedCount > 0) {
            showToast(`${completedCount} Anzeigen wurden erfolgreich generiert!`, "success");
          }
          resolve();
          return;
        }

        while (active < 3 && queue.length > 0 && !stopBatchRef.current) {
          const item = queue.shift()!;
          active++;
          setBatchActiveCount(active);

          analyzeSinglePant(item, customPrompt).then((success) => {
            if (success) completedCount++;
            active--;
            setBatchActiveCount(active);
            processNext();
          });
        }
      };

      processNext();
    });
  };

  const handleStopBatch = () => {
    stopBatchRef.current = true;
    setIsBatchRunning(false);
    setBatchActiveCount(0);
    showToast("Batch-Analyse gestoppt.", "info");
  };

  // Export handlers
  const handleExportJson = () => {
    exportPantsAsJson(pants);
    showToast("Projekt als JSON exportiert.", "success");
  };

  const handleExportCsv = () => {
    exportPantsAsCsv(pants);
    showToast("CSV-Tabelle exportiert.", "success");
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const importedPants = parseImportedJson(text);
      if (importedPants.length > 0) {
        if (session?.user?.id) {
          setIsSyncing(true);
          for (const item of importedPants) {
            await savePantToSupabase(session.user.id, item);
          }
        }
        setPants(importedPants);
        showToast(`${importedPants.length} Hosen erfolgreich importiert!`, "success");
      } else {
        showToast("Keine gültigen Hosen im JSON gefunden.", "error");
      }
    } catch (err: any) {
      console.error("JSON Import Error:", err);
      showToast("Fehler beim Importieren der JSON-Datei.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // Status counts for filters
  const counts = useMemo(() => {
    const res: Record<FilterType, number> = {
      all: pants.length,
      draft: 0,
      ready: 0,
      uploaded: 0,
      sold: 0,
      archived: 0,
    };
    for (const p of pants) {
      const st = p.saleStatus || "draft";
      if (res[st] !== undefined) {
        res[st]++;
      }
    }
    return res;
  }, [pants]);

  const analysisCounts = useMemo(() => {
    const res: Record<AnalysisFilterType, number> = {
      all: pants.length,
      waiting: 0,
      done: 0,
      error: 0,
    };
    for (const p of pants) {
      const st = p.status === "analyzing" ? "waiting" : p.status;
      if (res[st] !== undefined) {
        res[st]++;
      }
    }
    return res;
  }, [pants]);

  const generationCounts = useMemo(() => {
    let generated = 0;
    let notGenerated = 0;
    for (const p of pants) {
      if (p.status === "done" && p.result) {
        generated++;
      } else {
        notGenerated++;
      }
    }
    return {
      all: pants.length,
      generated,
      not_generated: notGenerated,
    };
  }, [pants]);

  const articleNumberCounts = useMemo(() => {
    let missing = 0;
    let digit1 = 0;
    let digit2 = 0;
    let digit3Plus = 0;
    for (const p of pants) {
      const trimmed = p.artikelnummer?.trim() || "";
      if (!trimmed) {
        missing++;
      } else if (/^\d+$/.test(trimmed)) {
        const val = parseInt(trimmed, 10);
        if (val >= 0 && val <= 9) {
          digit1++;
        } else if (val >= 10 && val <= 99) {
          digit2++;
        } else if (val >= 100) {
          digit3Plus++;
        }
      }
    }
    return {
      all: pants.length,
      missing,
      digit_1: digit1,
      digit_2: digit2,
      digit_3_plus: digit3Plus,
    };
  }, [pants]);

  // Filter & Search pipeline
  const filteredPants = useMemo(() => {
    let result = [...pants];

    // 1. Filter by Verkaufsstatus
    if (filter !== "all") {
      result = result.filter((p) => (p.saleStatus || "draft") === filter);
    }

    // 2. Filter by Analyse-Status
    if (analysisFilter !== "all") {
      result = result.filter((p) => {
        if (analysisFilter === "waiting") {
          return p.status === "waiting" || p.status === "analyzing";
        }
        return p.status === analysisFilter;
      });
    }

    // 3. Filter by Generation status
    if (generationFilter !== "all") {
      result = result.filter((p) => {
        const isGen = p.status === "done" && Boolean(p.result);
        return generationFilter === "generated" ? isGen : !isGen;
      });
    }

    // 4. Filter by Article Number status
    if (articleNumberFilter !== "all") {
      result = result.filter((p) => {
        const trimmed = p.artikelnummer?.trim() || "";
        if (articleNumberFilter === "missing") {
          return !trimmed || p.id === editingArticleNumberPantId;
        }
        if (!/^\d+$/.test(trimmed)) {
          return false;
        }
        const val = parseInt(trimmed, 10);
        if (articleNumberFilter === "digit_1") {
          return val >= 0 && val <= 9;
        }
        if (articleNumberFilter === "digit_2") {
          return val >= 10 && val <= 99;
        }
        if (articleNumberFilter === "digit_3_plus") {
          return val >= 100;
        }
        return true;
      });
    }

    // 5. Article number search filter
    if (articleNumberSearchQuery.trim()) {
      const q = articleNumberSearchQuery.trim().toLowerCase();
      result = result.filter((p) => {
        const art = (p.artikelnummer || "").trim().toLowerCase();
        return art.includes(q);
      });
    }

    // 6. Search query filter
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

    // 7. Numeric sorting: if filter is "uploaded" or generationFilter is "generated", sort numerically by artikelnummer
    if (filter === "uploaded" || generationFilter === "generated") {
      return sortPantsByArticleNumber(result);
    }

    // Default sort: numerical by hose number descending (highest number first)
    return result.sort((a, b) => b.number - a.number);
  }, [pants, filter, analysisFilter, generationFilter, articleNumberFilter, searchQuery, articleNumberSearchQuery, editingArticleNumberPantId]);

  const analysisDoneCount = useMemo(() => {
    return pants.filter((p) => p.status === "done" && p.result).length;
  }, [pants]);

  const pantForSaleModal = useMemo(() => {
    return pants.find((p) => p.id === pantForSaleModalId);
  }, [pants, pantForSaleModalId]);

  // If loading session state from Supabase, display loader
  if (loadingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 dark:bg-stone-950 text-stone-800 dark:text-stone-100">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-stone-900 dark:text-stone-100" />
          <p className="text-sm font-semibold">Lade Anmeldesitzung...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, render Auth screen (NO main app shown without login)
  if (!session) {
    return <Auth onSuccess={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans antialiased flex flex-col selection:bg-stone-900 selection:text-stone-100 dark:selection:bg-stone-100 dark:selection:text-stone-900 transition-colors">
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
        <div className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[11px] py-1 px-3 text-center font-medium flex items-center justify-center gap-1.5 animate-pulse">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Synchronisiere mit Supabase...</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 py-3 sm:px-6 space-y-3 sm:space-y-4">
        {/* Filter & Search Bar */}
        {pants.length > 0 && (
          <FilterBar
            generationFilter={generationFilter}
            onGenerationFilterChange={setGenerationFilter}
            generationCounts={generationCounts}
            analysisFilter={analysisFilter}
            onAnalysisFilterChange={setAnalysisFilter}
            analysisCounts={analysisCounts}
            saleFilter={filter}
            onSaleFilterChange={setFilter}
            saleCounts={counts}
            articleNumberFilter={articleNumberFilter}
            onArticleNumberFilterChange={setArticleNumberFilter}
            articleNumberCounts={articleNumberCounts}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            articleNumberSearchQuery={articleNumberSearchQuery}
            onArticleNumberSearchChange={setArticleNumberSearchQuery}
          />
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
                setGenerationFilter("all");
                setArticleNumberFilter("all");
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
              allPants={pants}
              onUpdate={handleUpdatePant}
              onDelete={(id) => setPantToDeleteId(id)}
              onDuplicate={handleDuplicatePant}
              onAnalyze={handleAnalyzeFromCard}
              onSaleStatusChange={handleSaleStatusChange}
              onEditSale={(p) => setPantForSaleModalId(p.id)}
              isAnalyzingAny={isBatchRunning}
              onArticleNumberFocus={(id) => setEditingArticleNumberPantId(id)}
              onArticleNumberBlur={() => setEditingArticleNumberPantId(null)}
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
        onSave={(data) => handleSaveSale(data.salePrice, data.saleDate)}
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
