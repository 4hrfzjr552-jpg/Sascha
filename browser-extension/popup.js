// Sascha AI -> Vinted Assistant Popup Script

document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const draftSelect = document.getElementById("draftSelect");
  const noDraftMessage = document.getElementById("noDraftMessage");
  const draftContent = document.getElementById("draftContent");
  const draftHeaderTitle = document.getElementById("draftHeaderTitle");
  const draftPrice = document.getElementById("draftPrice");
  const draftImageCount = document.getElementById("draftImageCount");
  const draftBrand = document.getElementById("draftBrand");
  const draftSize = document.getElementById("draftSize");
  const draftColor = document.getElementById("draftColor");
  const draftCondition = document.getElementById("draftCondition");
  const draftCategory = document.getElementById("draftCategory");

  const btnImport = document.getElementById("btnImport");
  const btnOpenVinted = document.getElementById("btnOpenVinted");
  const btnFillVinted = document.getElementById("btnFillVinted");
  const btnClearDraft = document.getElementById("btnClearDraft");

  const statusBox = document.getElementById("statusBox");
  const statusSummaryTitle = document.getElementById("statusSummaryTitle");
  const statusList = document.getElementById("statusList");

  const debugToggle = document.getElementById("debugToggle");
  const debugLogContainer = document.getElementById("debugLogContainer");
  const debugLog = document.getElementById("debugLog");

  let draftsList = [];
  let currentDraft = null;

  // Logger helper
  function logDebug(message) {
    if (!debugToggle.checked) return;
    const timestamp = new Date().toLocaleTimeString();
    debugLog.textContent += `[${timestamp}] ${message}\n`;
    debugLog.scrollTop = debugLog.scrollHeight;
  }

  function clearDebugLog() {
    debugLog.textContent = "";
  }

  // Load saved state
  chrome.storage.local.get(["savedDrafts", "selectedDraftId", "debugMode"], (res) => {
    if (res.debugMode) {
      debugToggle.checked = true;
      debugLogContainer.style.display = "block";
    }

    if (res.savedDrafts) {
      if (Array.isArray(res.savedDrafts)) {
        draftsList = res.savedDrafts;
      } else {
        draftsList = [res.savedDrafts];
      }
    }

    if (draftsList.length > 0) {
      const selectedId = res.selectedDraftId || draftsList[0].id;
      selectDraftById(selectedId);
    } else {
      renderCurrentDraft(null);
    }
  });

  // Debug toggle listener
  debugToggle.addEventListener("change", () => {
    const isChecked = debugToggle.checked;
    debugLogContainer.style.display = isChecked ? "block" : "none";
    chrome.storage.local.set({ debugMode: isChecked });
    if (isChecked) {
      logDebug("Debug-Modus aktiviert.");
    }
  });

  // Render current selected draft
  function renderCurrentDraft(draft) {
    currentDraft = draft;

    if (!draft) {
      noDraftMessage.style.display = "block";
      draftContent.style.display = "none";
      draftSelect.style.display = "none";
      btnFillVinted.disabled = true;
      btnClearDraft.style.display = "none";
      return;
    }

    noDraftMessage.style.display = "none";
    draftContent.style.display = "block";
    btnFillVinted.disabled = false;
    btnClearDraft.style.display = "inline-flex";

    // Header Title
    const artNrStr = draft.artikelnummer ? `#${draft.artikelnummer}` : "";
    const titleStr = draft.title || "Ohne Titel";
    draftHeaderTitle.textContent = `${artNrStr} ${titleStr}`.trim();

    // Price & Images
    draftPrice.textContent = draft.price !== undefined ? `${draft.price} €` : "-- €";
    const imgCount = draft.images ? draft.images.length : 0;
    draftImageCount.textContent = `${imgCount} Bild${imgCount === 1 ? "" : "er"}`;

    // Meta details
    draftBrand.textContent = draft.brand || "-";
    draftSize.textContent = draft.size || "-";
    draftColor.textContent = draft.color || "-";
    draftCondition.textContent = draft.condition || "Sehr gut";
    draftCategory.textContent = draft.category || "Jeans";

    // Setup draft selector if multiple drafts exist
    if (draftsList.length > 1) {
      draftSelect.style.display = "block";
      draftSelect.innerHTML = "";
      draftsList.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.id;
        const art = d.artikelnummer ? `#${d.artikelnummer} - ` : "";
        opt.textContent = `${art}${d.title || "Entwurf"} (${d.price || 0}€)`;
        if (d.id === draft.id) {
          opt.selected = true;
        }
        draftSelect.appendChild(opt);
      });
    } else {
      draftSelect.style.display = "none";
    }
  }

  function selectDraftById(id) {
    const found = draftsList.find((d) => d.id === id) || draftsList[0] || null;
    currentDraft = found;
    if (found) {
      chrome.storage.local.set({ selectedDraftId: found.id });
    }
    renderCurrentDraft(found);
  }

  draftSelect.addEventListener("change", (e) => {
    selectDraftById(e.target.value);
  });

  // 1. Import draft from Sascha AI
  btnImport.addEventListener("click", async () => {
    logDebug("Versuche Entwurf aus Sascha AI zu übernehmen...");
    btnImport.disabled = true;

    try {
      // Query active tab or any Sascha AI tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      let activeTab = tabs[0];

      // Check if active tab is Sascha AI or find one
      let saschaTab = activeTab;
      if (!activeTab || !isSaschaUrl(activeTab.url)) {
        const allSaschaTabs = await chrome.tabs.query({
          url: ["https://sascha-omega.vercel.app/*", "http://localhost/*", "http://127.0.0.1/*"],
        });
        if (allSaschaTabs && allSaschaTabs.length > 0) {
          saschaTab = allSaschaTabs[0];
        } else {
          alert("Bitte öffne Sascha AI in einem Tab, um einen Entwurf zu übernehmen.");
          logDebug("Fehler: Kein Sascha AI Tab gefunden.");
          btnImport.disabled = false;
          return;
        }
      }

      logDebug(`Sende Anfrage an Tab ${saschaTab.id} (${saschaTab.url})...`);

      chrome.tabs.sendMessage(
        saschaTab.id,
        { type: "REQUEST_VINTED_DRAFT_FROM_SASCHA" },
        (response) => {
          btnImport.disabled = false;

          if (chrome.runtime.lastError) {
            logDebug(`Runtime Error: ${chrome.runtime.lastError.message}`);
            alert("Konnte Sascha AI nicht erreichen. Stelle sicher, dass die Sascha-AI-Seite geladen ist.");
            return;
          }

          if (!response || !response.success) {
            logDebug(`Fehler-Antwort: ${response?.error || "Keine Daten empfangen."}`);
            alert(`Entwurf konnte nicht geladen werden: ${response?.error || "Keine Daten vorhanden"}`);
            return;
          }

          const payload = response.payload;
          logDebug("Entwurf-Daten erfolgreich empfangen.");

          if (Array.isArray(payload)) {
            if (payload.length === 0) {
              alert("Keine Vinted-Entwürfe in Sascha AI gefunden.");
              return;
            }
            draftsList = payload;
          } else if (payload) {
            draftsList = [payload];
          } else {
            alert("Keine Entwurfsdaten in Sascha AI verfügbar.");
            return;
          }

          const activeDraft = draftsList[0];
          chrome.storage.local.set({
            savedDrafts: draftsList,
            selectedDraftId: activeDraft.id,
          });

          renderCurrentDraft(activeDraft);
          logDebug(`Entwurf #${activeDraft.artikelnummer || activeDraft.id} geladen.`);
        }
      );
    } catch (err) {
      btnImport.disabled = false;
      logDebug(`Ausnahme beim Importieren: ${err.message}`);
      alert(`Fehler beim Übernehmen: ${err.message}`);
    }
  });

  // Helper check for Sascha AI domain
  function isSaschaUrl(url) {
    if (!url) return false;
    return (
      url.includes("sascha-omega.vercel.app") ||
      url.includes("localhost") ||
      url.includes("127.0.0.1")
    );
  }

  // 2. Open Vinted
  btnOpenVinted.addEventListener("click", () => {
    logDebug("Öffne Vinted Verkaufsseite...");
    chrome.tabs.create({ url: "https://www.vinted.de/items/new" });
  });

  // 3. Fill Vinted Form
  btnFillVinted.addEventListener("click", async () => {
    if (!currentDraft) {
      alert("Bitte zuerst einen Entwurf aus Sascha AI übernehmen.");
      return;
    }

    logDebug("Starte Einfügen in Vinted...");
    btnFillVinted.disabled = true;
    statusBox.style.display = "none";

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab || !isVintedUrl(activeTab.url)) {
        alert("Bitte wechsle zum Vinted-Tab (z. B. www.vinted.de/items/new), um den Entwurf einzufügen.");
        logDebug("Fehler: Aktiver Tab ist keine Vinted-Seite.");
        btnFillVinted.disabled = false;
        return;
      }

      logDebug(`Sende Befehl FILL_VINTED_FORM an Tab ${activeTab.id}...`);

      chrome.tabs.sendMessage(
        activeTab.id,
        {
          type: "FILL_VINTED_FORM",
          draft: currentDraft,
          debugMode: debugToggle.checked,
        },
        (response) => {
          btnFillVinted.disabled = false;

          if (chrome.runtime.lastError) {
            logDebug(`Runtime Error: ${chrome.runtime.lastError.message}`);
            alert("Konnte Vinted Content Script nicht erreichen. Bitte lade die Vinted-Seite neu.");
            return;
          }

          if (response && response.results) {
            logDebug("Formular-Ausfüllung beendet.");
            displayFillResults(response.results, response.logs);
          } else if (response && response.error) {
            logDebug(`Fehler beim Ausfüllen: ${response.error}`);
            alert(`Fehler beim Ausfüllen: ${response.error}`);
          } else {
            logDebug("Keine Rückmeldung vom Vinted-Script erhalten.");
          }
        }
      );
    } catch (err) {
      btnFillVinted.disabled = false;
      logDebug(`Ausnahme beim Einfügen: ${err.message}`);
      alert(`Fehler beim Einfügen: ${err.message}`);
    }
  });

  function isVintedUrl(url) {
    if (!url) return false;
    return url.includes("vinted.de") || url.includes("vinted.at");
  }

  // Display results checklist in popup
  function displayFillResults(results, logs) {
    statusBox.style.display = "block";
    statusList.innerHTML = "";

    if (logs && Array.isArray(logs)) {
      logs.forEach((line) => logDebug(line));
    }

    const fields = [
      { key: "title", label: "Titel" },
      { key: "description", label: "Beschreibung" },
      { key: "price", label: "Preis" },
      { key: "brand", label: "Marke" },
      { key: "size", label: "Größe" },
      { key: "color", label: "Farbe" },
      { key: "condition", label: "Zustand" },
      { key: "category", label: "Kategorie" },
      { key: "images", label: "Bilder" },
    ];

    fields.forEach((field) => {
      const res = results[field.key];
      const li = document.createElement("li");
      li.className = "status-item";

      if (res && res.success) {
        li.innerHTML = `<span class="status-success">✓</span> <strong>${field.label}</strong>`;
      } else {
        const reason = res?.reason ? ` (${res.reason})` : "";
        li.innerHTML = `<span class="status-fail">✗</span> <strong>${field.label}</strong>${reason}`;
      }

      statusList.appendChild(li);
    });
  }

  // 4. Clear Draft
  btnClearDraft.addEventListener("click", () => {
    if (confirm("Möchtest du den gespeicherten Entwurf aus der Extension löschen?")) {
      chrome.storage.local.remove(["savedDrafts", "selectedDraftId"], () => {
        draftsList = [];
        renderCurrentDraft(null);
        statusBox.style.display = "none";
        logDebug("Gespeicherte Entwürfe gelöscht.");
      });
    }
  });
});
