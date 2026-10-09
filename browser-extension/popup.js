// Sascha AI -> Vinted Assistant Popup Script

document.addEventListener("DOMContentLoaded", () => {
  const versionLabel = document.getElementById("extensionVersion");
  if (versionLabel) versionLabel.textContent = chrome.runtime.getManifest().version;

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
  const statusList = document.getElementById("statusList");
  const statusSummaryTitle = document.getElementById("statusSummaryTitle");

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

  // Display every completed/active step while the popup stays open.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "VINTED_FILL_PROGRESS") return;
    const line=String(message.message || "");
    if (!/^\[(SCHRITT|OK|STOP|PAUSE)\]/.test(line)) return;
    statusBox.style.display = "block";
    statusSummaryTitle.textContent=line;
    // End-of-run logs are rendered after the response; no duplicate live rows.
  });

  // Load saved state (lightweight metadata list)
  chrome.storage.local.get(["savedDrafts", "selectedDraftId", "debugMode"], (res) => {
    if (res.debugMode) {
      debugToggle.checked = true;
      debugLogContainer.style.display = "block";
    }

    if (res.savedDrafts && Array.isArray(res.savedDrafts)) {
      draftsList = res.savedDrafts;
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

  // Render current selected draft (lightweight metadata)
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
    const imgCount = draft.imageCount !== undefined ? draft.imageCount : (draft.images ? draft.images.length : 0);
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
        const cnt = d.imageCount !== undefined ? d.imageCount : 0;
        opt.textContent = `${art}${d.title || "Entwurf"} (${d.price || 0}€ - ${cnt} Bilder)`;
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

  // Helper check for Sascha AI domain
  function isSaschaUrl(url) {
    if (!url) return false;
    return (
      url.includes("vercel.app") ||
      url.includes("localhost") ||
      url.includes("127.0.0.1")
    );
  }

  function isVintedUrl(url) {
    if (!url) return false;
    return url.includes("vinted.de") || url.includes("vinted.at");
  }

  // Find open Sascha AI tab
  async function findSaschaTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    let activeTab = tabs[0];

    if (activeTab && isSaschaUrl(activeTab.url)) {
      return activeTab;
    }

    const allSaschaTabs = await chrome.tabs.query({
      url: [
        "https://*.vercel.app/*",
        "https://sascha-omega.vercel.app/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
      ],
    });

    if (allSaschaTabs && allSaschaTabs.length > 0) {
      return allSaschaTabs[0];
    }

    return null;
  }

  // 1. Import lightweight draft list from Sascha AI
  btnImport.addEventListener("click", async () => {
    logDebug("Versuche Entwurfsliste aus Sascha AI zu übernehmen...");
    btnImport.disabled = true;

    try {
      const saschaTab = await findSaschaTab();

      if (!saschaTab) {
        alert("Bitte Sascha AI in einem Tab öffnen, um Entwürfe zu übernehmen.");
        logDebug("Fehler: Kein Sascha AI Tab gefunden.");
        btnImport.disabled = false;
        return;
      }

      logDebug(`Sende FETCH_DRAFT_LIST_FROM_SASCHA an Tab ${saschaTab.id}...`);

      chrome.tabs.sendMessage(
        saschaTab.id,
        { type: "FETCH_DRAFT_LIST_FROM_SASCHA" },
        (response) => {
          btnImport.disabled = false;

          if (chrome.runtime.lastError) {
            logDebug(`Runtime Error: ${chrome.runtime.lastError.message}`);
            alert("Konnte Sascha AI nicht erreichen. Stelle sicher, dass die Sascha-AI-Seite geladen ist.");
            return;
          }

          if (!response || !response.success) {
            logDebug(`Fehler-Antwort: ${response?.error || "Keine Daten empfangen."}`);
            alert(`Entwürfe konnten nicht geladen werden: ${response?.error || "Keine Daten vorhanden"}`);
            return;
          }

          const payloadList = response.payload;
          logDebug(`Entwurfsliste erfolgreich empfangen (${payloadList ? payloadList.length : 0} Einträge).`);

          if (!Array.isArray(payloadList) || payloadList.length === 0) {
            alert("Keine vorbereiteten Vinted-Entwürfe in Sascha AI gefunden.");
            return;
          }

          // Save strictly lightweight metadata list
          draftsList = payloadList;
          const activeDraft = draftsList[0];

          chrome.storage.local.set({
            savedDrafts: draftsList,
            selectedDraftId: activeDraft.id,
          });

          renderCurrentDraft(activeDraft);
          logDebug(`Entwurf #${activeDraft.artikelnummer || activeDraft.id} ausgewählt.`);
        }
      );
    } catch (err) {
      btnImport.disabled = false;
      logDebug(`Ausnahme beim Importieren: ${err.message}`);
      alert(`Fehler beim Übernehmen: ${err.message}`);
    }
  });

  // 2. Open Vinted (Preserves existing Sascha AI tab)
  btnOpenVinted.addEventListener("click", () => {
    logDebug("Öffne Vinted Verkaufsseite in neuem Tab...");
    chrome.tabs.create({ url: "https://www.vinted.de/items/new" });
  });

  // 3. Fill Vinted Form (Fetches full draft with images on-demand from Sascha AI tab)
  btnFillVinted.addEventListener("click", async () => {
    if (!currentDraft) {
      alert("Bitte zuerst einen Entwurf aus Sascha AI übernehmen.");
      return;
    }

    logDebug("Starte Einfügen in Vinted...");
    btnFillVinted.disabled = true;
    statusBox.style.display = "block";
    statusList.innerHTML = "";
    statusSummaryTitle.textContent = "Übertrage Schritt für Schritt ...";

    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = activeTabs[0];

      if (!activeTab || !isVintedUrl(activeTab.url)) {
        alert("Bitte wechsle zum Vinted-Tab (z. B. www.vinted.de/items/new), um den Entwurf einzufügen.");
        logDebug("Fehler: Aktiver Tab ist keine Vinted-Seite.");
        btnFillVinted.disabled = false;
        return;
      }

      // Check for open Sascha AI tab to fetch full image payload on demand
      const saschaTab = await findSaschaTab();
      if (!saschaTab) {
        alert("Bitte Sascha AI in einem Tab öffnen, damit die Bilder und Entwurfsdaten geladen werden können.");
        logDebug("Fehler: Sascha AI Tab nicht geöffnet.");
        btnFillVinted.disabled = false;
        return;
      }

      logDebug(`Rufe vollständigen Entwurf #${currentDraft.id} aus Sascha AI Tab ${saschaTab.id} ab...`);

      // Fetch full draft with images dynamically from Sascha AI
      chrome.tabs.sendMessage(
        saschaTab.id,
        {
          type: "REQUEST_VINTED_DRAFT_FROM_SASCHA",
          draftId: currentDraft.id,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logDebug(`Runtime Error beim Abrufen des Entwurfs: ${chrome.runtime.lastError.message}`);
            alert("Konnte Entwurfsdaten aus Sascha AI nicht abrufen. Bitte stelle sicher, dass der Sascha-AI-Tab geladen ist.");
            btnFillVinted.disabled = false;
            return;
          }

          if (!response || !response.success || !response.payload) {
            logDebug(`Fehler beim Abrufen des Entwurfs: ${response?.error || "Kein Payload"}`);
            alert(`Vollständige Entwurfsdaten konnten nicht geladen werden: ${response?.error || "Fehler"}`);
            btnFillVinted.disabled = false;
            return;
          }

          const fullPayload = response.payload;
          logDebug(`Vollständigen Entwurf geladen (${fullPayload.images ? fullPayload.images.length : 0} Bilder). Sende an Vinted...`);

          // Send full payload to Vinted content script
          chrome.tabs.sendMessage(
            activeTab.id,
            {
              type: "FILL_VINTED_FORM",
              draft: fullPayload,
              debugMode: debugToggle.checked,
            },
            (fillResponse) => {
              btnFillVinted.disabled = false;

              if (chrome.runtime.lastError) {
                logDebug(`Runtime Error auf Vinted Tab: ${chrome.runtime.lastError.message}`);
                alert("Konnte Vinted Content Script nicht erreichen. Bitte lade die Vinted-Seite neu.");
                return;
              }

              if (fillResponse && fillResponse.results) {
                logDebug("Formular-Ausfüllung beendet.");
                displayFillResults(fillResponse.results, fillResponse.logs, fillResponse.stoppedAt);
              } else if (fillResponse && fillResponse.error) {
                logDebug(`Fehler beim Ausfüllen: ${fillResponse.error}`);
                alert(`Fehler beim Ausfüllen: ${fillResponse.error}`);
              } else {
                logDebug("Keine Rückmeldung vom Vinted-Script erhalten.");
              }
            }
          );
        }
      );
    } catch (err) {
      btnFillVinted.disabled = false;
      logDebug(`Ausnahme beim Einfügen: ${err.message}`);
      alert(`Fehler beim Einfügen: ${err.message}`);
    }
  });

  // Display results checklist in popup
  function displayFillResults(results, logs, stoppedAt) {
    statusBox.style.display = "block";
    statusList.innerHTML = "";
    statusSummaryTitle.textContent=stoppedAt ? "Gestoppt: "+stoppedAt+" nicht bestätigt" : "Felder einzeln ausgefüllt – bitte prüfen";

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
    if (confirm("Möchtest du die gespeicherten Entwurfs-Metadaten aus der Extension löschen?")) {
      chrome.storage.local.remove(["savedDrafts", "selectedDraftId"], () => {
        draftsList = [];
        renderCurrentDraft(null);
        statusBox.style.display = "none";
        logDebug("Gespeicherte Entwurfs-Metadaten gelöscht.");
      });
    }
  });
});
