// Vinted Content Script for Sascha AI WebExtension

(function () {
  console.log("Vinted Content Script initialized.");

  // Listen for fill commands from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "FILL_VINTED_FORM") {
      const draft = request.draft;
      const debugMode = request.debugMode || false;

      fillVintedForm(draft, debugMode)
        .then(({ results, logs }) => {
          sendResponse({ success: true, results, logs });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });

      return true; // Keep response channel open for async execution
    }
  });

  // Helper to set input/textarea value with React-compatible dispatch
  function setNativeInputValue(element, value) {
    if (!element) return false;

    const isTextArea = element instanceof HTMLTextAreaElement;
    const proto = isTextArea
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

    const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  // Format Vinted Title: Article number at the end, no duplicates
  function formatVintedTitle(rawTitle, rawArtNr) {
    let baseTitle = (rawTitle || "").trim();
    const artNr = (rawArtNr || "").trim();

    if (!artNr) {
      return baseTitle;
    }

    const artNrTag = `#${artNr}`;

    // Strip leading article number if present (e.g., "#42 Diesel...", "42 - Diesel...", "#42 - Diesel...")
    const escapedArtNr = artNr.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const leadingRegex = new RegExp(`^#?${escapedArtNr}\\b[\\s:-]*`, "i");
    if (leadingRegex.test(baseTitle)) {
      baseTitle = baseTitle.replace(leadingRegex, "").trim();
    }

    // If title already contains the article tag (#42), do not duplicate
    if (baseTitle.includes(artNrTag)) {
      return baseTitle;
    }

    if (!baseTitle) {
      return artNrTag;
    }

    return `${baseTitle} ${artNrTag}`.trim();
  }

  // Convert base64 dataUrl to File
  function dataURLToFile(dataUrl, fileName) {
    try {
      const arr = dataUrl.split(",");
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], fileName, { type: mime });
    } catch (e) {
      console.error("Error converting dataUrl to File:", e);
      return null;
    }
  }

  // Helper to pause execution
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Check element visibility
  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0
    );
  }

  // Check if an element is safe to click (not link, no href, not navigation/sidebar/header)
  function isSafeInteractiveElement(el) {
    if (!el || !isElementVisible(el)) return false;

    // Reject links or elements with href attribute
    if (el.tagName === "A" || el.hasAttribute("href") || el.closest("a")) {
      return false;
    }

    // Reject elements inside navigation, header, footer, or sidebars
    if (
      el.closest(
        'nav, header, footer, [role="navigation"], sidebar, .sidebar, #sidebar, [data-testid*="header"], [data-testid*="footer"], [data-testid*="nav"]'
      )
    ) {
      return false;
    }

    return true;
  }

  function matchesKeywords(text, keywords) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  // Get the main Vinted seller form container
  function getFormContainer() {
    const selectors = [
      'form[action*="item"]',
      'form[action*="upload"]',
      'form',
      '[data-testid*="item-form"]',
      '[data-testid*="sell-form"]',
      '.cell-form',
      'main',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) {
        return el;
      }
    }

    return document.body;
  }

  // Find input field restricted to form container
  function findInputField(formContainer, keywords) {
    if (!formContainer) formContainer = getFormContainer();

    for (const kw of keywords) {
      const el = formContainer.querySelector(
        `input[name*="${kw}" i], input[id*="${kw}" i], input[data-testid*="${kw}" i], input[placeholder*="${kw}" i]`
      );
      if (el && isSafeInteractiveElement(el)) return el;
    }

    const inputs = Array.from(formContainer.querySelectorAll("input"));
    for (const input of inputs) {
      if (!isSafeInteractiveElement(input)) continue;

      if (input.id) {
        const label = formContainer.querySelector(`label[for="${input.id}"]`);
        if (label && matchesKeywords(label.textContent, keywords)) {
          return input;
        }
      }

      let parent = input.parentElement;
      for (
        let depth = 0;
        depth < 3 && parent && parent !== formContainer;
        depth++
      ) {
        if (matchesKeywords(parent.textContent, keywords)) {
          return input;
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  // Find textarea field restricted to form container
  function findTextareaField(formContainer, keywords) {
    if (!formContainer) formContainer = getFormContainer();

    for (const kw of keywords) {
      const el = formContainer.querySelector(
        `textarea[name*="${kw}" i], textarea[id*="${kw}" i], textarea[data-testid*="${kw}" i], textarea[placeholder*="${kw}" i]`
      );
      if (el && isSafeInteractiveElement(el)) return el;
    }

    const textareas = Array.from(formContainer.querySelectorAll("textarea"));
    for (const ta of textareas) {
      if (!isSafeInteractiveElement(ta)) continue;
      let parent = ta.parentElement;
      for (
        let depth = 0;
        depth < 3 && parent && parent !== formContainer;
        depth++
      ) {
        if (matchesKeywords(parent.textContent, keywords)) {
          return ta;
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  // Find trigger button/cell for a dropdown field within form container
  function findFieldTrigger(formContainer, fieldName, fieldKeywords) {
    if (!formContainer) formContainer = getFormContainer();

    // 1. Check direct attributes within form container
    for (const kw of fieldKeywords) {
      const selector = `[data-testid*="${kw}" i], [name*="${kw}" i], [id*="${kw}" i], [aria-label*="${kw}" i]`;
      const candidate = formContainer.querySelector(selector);
      if (candidate && isSafeInteractiveElement(candidate)) {
        const clickTarget =
          candidate.querySelector(
            "button, input, [role='button'], div[class*='input'], div[class*='select']"
          ) || candidate;
        if (isSafeInteractiveElement(clickTarget)) return clickTarget;
      }
    }

    // 2. Search form cells / rows
    const candidateRows = Array.from(
      formContainer.querySelectorAll(
        '[data-testid*="cell"], [class*="cell"], [class*="row"], [class*="field"], label, div'
      )
    );

    for (const row of candidateRows) {
      if (!isElementVisible(row)) continue;
      const directText = Array.from(row.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .filter(Boolean)
        .join(" ");

      const textToTest = directText || row.textContent?.trim() || "";
      if (textToTest.length < 200 && matchesKeywords(textToTest, fieldKeywords)) {
        const btn = row.querySelector(
          "button, div[role='button'], input, div[class*='select'], div[class*='input']"
        );
        if (btn && isSafeInteractiveElement(btn)) {
          return btn;
        }
        if (isSafeInteractiveElement(row)) {
          return row;
        }
      }
    }

    return null;
  }

  // Get currently active dropdown or modal overlay element
  function getOpenOverlayScope() {
    const overlaySelectors = [
      '[role="dialog"]',
      '[role="menu"]',
      '[role="listbox"]',
      '[aria-modal="true"]',
      '[data-testid*="modal"]',
      '[data-testid*="dropdown"]',
      '[data-testid*="popover"]',
      '[data-testid*="catalog"]',
      '.web_ui__Modal__modal',
      '.c-modal',
      '.portal-content',
      '.vinted-box',
    ];

    const candidates = [];
    for (const sel of overlaySelectors) {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        if (
          isElementVisible(el) &&
          !el.closest("nav, header, footer, sidebar")
        ) {
          candidates.push(el);
        }
      }
    }

    if (candidates.length > 0) {
      return candidates[candidates.length - 1];
    }

    return null;
  }

  // Safely close open overlay without clicking body or random elements
  async function closeOverlaySafely(overlayScope) {
    if (!overlayScope || !isElementVisible(overlayScope)) return;

    const closeBtn = overlayScope.querySelector(
      'button[aria-label*="schließen" i], button[aria-label*="close" i], button[data-testid*="close"], .c-modal__close, button[class*="close" i]'
    );
    if (closeBtn && isSafeInteractiveElement(closeBtn)) {
      closeBtn.click();
      await delay(200);
      return;
    }

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        bubbles: true,
      })
    );
    await delay(200);
  }

  // Handle typing in overlay search inputs (e.g. for Brand / Size search)
  async function handleOverlaySearchInput(overlayScope, searchValue, log) {
    if (!overlayScope || !searchValue) return false;

    const searchInput = overlayScope.querySelector(
      'input[type="search"], input[placeholder*="suchen" i], input[placeholder*="search" i], input[data-testid*="search" i], input[type="text"]'
    );

    if (searchInput && isSafeInteractiveElement(searchInput)) {
      log(`  🔍 Suche im Dropdown/Modal nach: "${searchValue}"`);
      searchInput.focus();
      setNativeInputValue(searchInput, searchValue);
      await delay(400); // Wait for filtered options to render
      return true;
    }

    return false;
  }

  // Find matching option element ONLY within the open overlay scope
  function findMatchingOptionInOverlay(overlayScope, desiredValue) {
    if (!overlayScope || !desiredValue) return null;

    const targetLower = desiredValue.trim().toLowerCase();

    const optionSelectors = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="treeitem"]',
      "li",
      "button",
      'div[class*="option" i]',
      'div[class*="item" i]',
      'div[class*="cell" i]',
      "label",
      "span",
    ];

    const optionEls = Array.from(
      overlayScope.querySelectorAll(optionSelectors.join(", "))
    );

    // Pass 1: Exact text match
    for (const opt of optionEls) {
      if (!isSafeInteractiveElement(opt)) continue;
      if (!overlayScope.contains(opt)) continue;

      const text = opt.textContent?.trim().toLowerCase() || "";
      if (text === targetLower) {
        return opt;
      }
    }

    // Pass 2: Clean normalized partial/substring match
    for (const opt of optionEls) {
      if (!isSafeInteractiveElement(opt)) continue;
      if (!overlayScope.contains(opt)) continue;

      const text = opt.textContent?.trim().toLowerCase() || "";
      if (
        text.length < 60 &&
        (text.includes(targetLower) || targetLower.includes(text))
      ) {
        return opt;
      }
    }

    return null;
  }

  // Build category hierarchy step sequence based on category string & gender
  function getCategoryPathSequence(categoryStr, genderStr) {
    if (!categoryStr) return [];

    // If delimited by >, /, -> or ,
    if (/[>\/,-]/.test(categoryStr) && categoryStr.includes(" ")) {
      const parts = categoryStr
        .split(/[>\/]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) return parts;
    }

    const catLower = categoryStr.trim().toLowerCase();
    const genderLower = (genderStr || "").trim().toLowerCase();

    let genderLabel = "";
    if (
      genderLower.includes("herren") ||
      genderLower.includes("men") ||
      genderLower.includes("männlich")
    ) {
      genderLabel = "Herren";
    } else if (
      genderLower.includes("damen") ||
      genderLower.includes("women") ||
      genderLower.includes("weiblich")
    ) {
      genderLabel = "Damen";
    } else if (
      genderLower.includes("kinder") ||
      genderLower.includes("kids")
    ) {
      genderLabel = "Kinder";
    }

    if (catLower === "jeans") {
      if (genderLabel === "Herren") return ["Herren", "Kleidung", "Hosen", "Jeans"];
      if (genderLabel === "Damen") return ["Damen", "Kleidung", "Hosen", "Jeans"];
      if (genderLabel === "Kinder") return ["Kinder", "Kleidung", "Hosen", "Jeans"];
      return ["Kleidung", "Hosen", "Jeans"];
    }

    if (catLower === "hosen" || catLower === "pants") {
      if (genderLabel === "Herren") return ["Herren", "Kleidung", "Hosen"];
      if (genderLabel === "Damen") return ["Damen", "Kleidung", "Hosen"];
      return ["Kleidung", "Hosen"];
    }

    if (genderLabel) {
      return [genderLabel, categoryStr.trim()];
    }

    return [categoryStr.trim()];
  }

  // Check if field value displays the expected value after selection
  function verifyFieldValue(triggerEl, expectedValue, log) {
    if (!expectedValue) return false;
    const targetLower = expectedValue.trim().toLowerCase();

    let container = triggerEl;
    for (let depth = 0; depth < 3 && container; depth++) {
      const text = container.textContent?.trim().toLowerCase() || "";
      if (text.includes(targetLower)) {
        return true;
      }
      container = container.parentElement;
    }

    return false;
  }

  // Multi-step Category Selector Helper
  async function selectVintedCategory(formContainer, draftCategory, draftGender, log) {
    log(`Versuche Kategorie "${draftCategory}" zu setzen...`);

    const categoryPath = getCategoryPathSequence(draftCategory, draftGender);
    log(`  Kategorie-Pfad: ${categoryPath.join(" → ")}`);

    const triggerEl = findFieldTrigger(formContainer, "category", [
      "kategorie",
      "category",
      "catalog",
    ]);

    if (!triggerEl) {
      log("✗ Kategorie-Trigger im Formular nicht gefunden.");
      return { success: false, reason: "Kategorie-Trigger nicht gefunden" };
    }

    triggerEl.click();
    await delay(400);

    let completedSteps = 0;
    let allStepsCompleted = false;

    for (let i = 0; i < categoryPath.length; i++) {
      const currentStep = categoryPath[i];
      const overlayScope = getOpenOverlayScope();

      if (!overlayScope) {
        log(`✗ Kein geöffnetes Kategorie-Modal für Schritt ${i + 1}/${categoryPath.length} ("${currentStep}") gefunden.`);
        break;
      }

      let matchedOption = findMatchingOptionInOverlay(overlayScope, currentStep);

      // Fallback check at step 0: Maybe target leaf category is already directly visible
      if (!matchedOption && i === 0 && categoryPath.length > 1) {
        const finalCategory = categoryPath[categoryPath.length - 1];
        matchedOption = findMatchingOptionInOverlay(overlayScope, finalCategory);
        if (matchedOption) {
          log(`  ✓ Direktes Ziel "${finalCategory}" in Schritt 1 gefunden und wird geklickt.`);
        }
      }

      if (matchedOption) {
        log(`  ✓ Kategorie-Schritt ${i + 1}/${categoryPath.length}: "${currentStep}" geklickt`);
        matchedOption.click();
        completedSteps++;
        await delay(400);

        const nextOverlay = getOpenOverlayScope();
        if (!nextOverlay) {
          log("  ✓ Kategorie-Modal geschlossen. Pfadbeendigung erreicht.");
          allStepsCompleted = true;
          break;
        } else if (i === categoryPath.length - 1) {
          allStepsCompleted = true;
        }
      } else {
        log(`✗ Kategorie-Schritt ${i + 1}/${categoryPath.length} ("${currentStep}") in Auswahlliste nicht gefunden.`);
        allStepsCompleted = false;
        break;
      }
    }

    const remainingOverlay = getOpenOverlayScope();
    if (remainingOverlay) {
      await closeOverlaySafely(remainingOverlay);
    }

    const verified = verifyFieldValue(triggerEl, draftCategory, log);

    if (allStepsCompleted || verified) {
      log(`✓ Kategorie erfolgreich ausgewählt: "${draftCategory}"`);
      return { success: true };
    } else {
      const failedStepName = categoryPath[completedSteps] || draftCategory;
      log(`✗ Kategorie-Auswahl bei Schritt "${failedStepName}" gescheitert. Nicht vollständig durchlaufen oder verifiziert.`);
      return {
        success: false,
        reason: `Kategorie-Auswahl bei Schritt "${failedStepName}" gescheitert`,
      };
    }
  }

  // Single Dropdown Option Selector Helper (Marke, Größe, Farbe, Zustand)
  async function selectVintedOption(
    formContainer,
    fieldName,
    fieldKeywords,
    desiredValue,
    log
  ) {
    log(`Versuche Dropdown "${fieldName}" auf "${desiredValue}" zu setzen...`);

    try {
      if (!desiredValue) {
        return { success: false, reason: "Kein Zielwert angegeben" };
      }

      const triggerEl = findFieldTrigger(formContainer, fieldName, fieldKeywords);

      if (!triggerEl) {
        log(`✗ Dropdown-Element für "${fieldName}" nicht gefunden.`);
        return { success: false, reason: `Dropdown-Element für "${fieldName}" nicht gefunden` };
      }

      triggerEl.click();
      await delay(400);

      const overlayScope = getOpenOverlayScope();
      if (!overlayScope) {
        log(`✗ Kein geöffnetes Dropdown/Modal für "${fieldName}" gefunden.`);
        return { success: false, reason: `Overlay für "${fieldName}" nicht geöffnet` };
      }

      // Check search input inside overlay
      await handleOverlaySearchInput(overlayScope, desiredValue, log);

      let matchedOption = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        matchedOption = findMatchingOptionInOverlay(overlayScope, desiredValue);
        if (matchedOption) break;
        await delay(200);
      }

      if (matchedOption) {
        matchedOption.click();
        await delay(400);

        const remainingOverlay = getOpenOverlayScope();
        if (remainingOverlay) {
          await closeOverlaySafely(remainingOverlay);
        }

        const verified = verifyFieldValue(triggerEl, desiredValue, log);
        if (verified) {
          log(`✓ Dropdown "${fieldName}" auf "${desiredValue}" gesetzt und verifiziert.`);
        } else {
          log(`✓ Dropdown "${fieldName}" auf "${desiredValue}" geklickt.`);
        }
        return { success: true };
      } else {
        log(`✗ Keine Option für "${desiredValue}" in Dropdown "${fieldName}" gefunden.`);
        await closeOverlaySafely(overlayScope);
        return {
          success: false,
          reason: `Option "${desiredValue}" nicht in Auswahlliste gefunden`,
        };
      }
    } catch (err) {
      log(`✗ Fehler in selectVintedOption (${fieldName}): ${err.message}`);
      return { success: false, reason: err.message };
    }
  }

  // Main Form Filling Controller
  async function fillVintedForm(draft, debugMode) {
    const logs = [];
    const log = (msg) => {
      console.log(`[SaschaAI-Vinted] ${msg}`);
      logs.push(msg);
    };

    log(`Starte das Befüllen für Entwurf: "${draft.title || draft.artikelnummer}"`);

    const formContainer = getFormContainer();

    const results = {
      title: { success: false },
      description: { success: false },
      price: { success: false },
      brand: { success: false },
      size: { success: false },
      color: { success: false },
      condition: { success: false },
      category: { success: false },
      images: { success: false },
    };

    // 1. Fill Title
    try {
      const titleVal = formatVintedTitle(draft.title, draft.artikelnummer);

      if (titleVal) {
        const titleEl = findInputField(formContainer, ["title", "titel", "heading", "name"]);
        if (titleEl) {
          setNativeInputValue(titleEl, titleVal);
          results.title = { success: true };
          log(`✓ Titel eingefügt: "${titleVal}"`);
        } else {
          results.title = { success: false, reason: "Feld nicht gefunden" };
          log("✗ Titel-Feld nicht gefunden");
        }
      } else {
        results.title = { success: false, reason: "Kein Wert vorhanden" };
      }
    } catch (e) {
      results.title = { success: false, reason: e.message };
      log(`✗ Fehler bei Titel: ${e.message}`);
    }

    // 2. Fill Description
    try {
      if (draft.description) {
        const descEl = findTextareaField(formContainer, [
          "description",
          "beschreibung",
          "details",
          "body",
        ]);
        if (descEl) {
          setNativeInputValue(descEl, draft.description);
          results.description = { success: true };
          log("✓ Beschreibung eingefügt");
        } else {
          results.description = { success: false, reason: "Feld nicht gefunden" };
          log("✗ Beschreibungs-Feld nicht gefunden");
        }
      } else {
        results.description = { success: false, reason: "Keine Beschreibung" };
      }
    } catch (e) {
      results.description = { success: false, reason: e.message };
      log(`✗ Fehler bei Beschreibung: ${e.message}`);
    }

    // 3. Fill Price
    try {
      if (draft.price !== undefined && draft.price !== null) {
        const priceVal = String(draft.price);
        const priceEl = findInputField(formContainer, [
          "price",
          "preis",
          "amount",
          "price_numeric",
        ]);
        if (priceEl) {
          setNativeInputValue(priceEl, priceVal);
          results.price = { success: true };
          log(`✓ Preis eingefügt: ${priceVal} €`);
        } else {
          results.price = { success: false, reason: "Feld nicht gefunden" };
          log("✗ Preis-Feld nicht gefunden");
        }
      } else {
        results.price = { success: false, reason: "Kein Preis angegeben" };
      }
    } catch (e) {
      results.price = { success: false, reason: e.message };
      log(`✗ Fehler bei Preis: ${e.message}`);
    }

    // 4. Dropdowns (Kategorie, Marke, Größe, Farbe, Zustand)
    if (draft.category) {
      results.category = await selectVintedCategory(
        formContainer,
        draft.category,
        draft.gender,
        log
      );
    } else {
      results.category = { success: false, reason: "Kein Wert" };
    }

    if (draft.brand) {
      results.brand = await selectVintedOption(
        formContainer,
        "brand",
        ["marke", "brand"],
        draft.brand,
        log
      );
    } else {
      results.brand = { success: false, reason: "Kein Wert" };
    }

    if (draft.size) {
      results.size = await selectVintedOption(
        formContainer,
        "size",
        ["größe", "grosse", "size"],
        draft.size,
        log
      );
    } else {
      results.size = { success: false, reason: "Kein Wert" };
    }

    if (draft.color) {
      results.color = await selectVintedOption(
        formContainer,
        "color",
        ["farbe", "color", "colour"],
        draft.color,
        log
      );
    } else {
      results.color = { success: false, reason: "Kein Wert" };
    }

    if (draft.condition) {
      results.condition = await selectVintedOption(
        formContainer,
        "condition",
        ["zustand", "condition", "status"],
        draft.condition,
        log
      );
    } else {
      results.condition = { success: false, reason: "Kein Wert" };
    }

    // 5. Fill Images
    try {
      if (draft.images && draft.images.length > 0) {
        log(`Versuche ${draft.images.length} Bilder einzufügen...`);
        const fileInput = formContainer.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');

        if (!fileInput) {
          results.images = {
            success: false,
            reason: "Datei-Input (<input type='file'>) nicht gefunden",
          };
          log("✗ Dateiauswahl-Element auf Vinted nicht gefunden.");
        } else {
          const files = [];
          draft.images.forEach((img, idx) => {
            if (img.dataUrl) {
              const file = dataURLToFile(
                img.dataUrl,
                img.name || `image_${idx + 1}.jpg`
              );
              if (file) files.push(file);
            }
          });

          if (files.length === 0) {
            results.images = {
              success: false,
              reason: "Keine gültigen Bild-Dateien konvertiert",
            };
            log("✗ Keine gültigen Bild-Dateien aus dataUrl konvertiert.");
          } else {
            const dataTransfer = new DataTransfer();
            files.forEach((f) => dataTransfer.items.add(f));

            try {
              fileInput.files = dataTransfer.files;
              fileInput.dispatchEvent(new Event("change", { bubbles: true }));
              fileInput.dispatchEvent(new Event("input", { bubbles: true }));

              results.images = { success: true };
              log(`✓ ${files.length} Bilder erfolgreich dem Datei-Input zugewiesen.`);
            } catch (errSetFiles) {
              log(`⚠ Datei-Input Setter durch Browser blockiert: ${errSetFiles.message}`);
              results.images = {
                success: false,
                reason:
                  "Bilder konnten unter iOS nicht automatisch eingefügt werden. Bitte Bilder manuell auswählen.",
              };
            }
          }
        }
      } else {
        results.images = { success: false, reason: "Keine Bilder im Entwurf" };
      }
    } catch (e) {
      results.images = {
        success: false,
        reason:
          "Bilder konnten unter iOS nicht automatisch eingefügt werden. Bitte Bilder manuell auswählen.",
      };
      log(`⚠ Bilder Fallback ausgelöst: ${e.message}`);
    }

    log("Formular-Befüllung abgeschlossen. Nicht automatisch veröffentlicht!");
    return { results, logs };
  }
})();
