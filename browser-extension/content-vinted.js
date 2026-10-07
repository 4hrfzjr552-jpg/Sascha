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

  // Detect language of Vinted UI
  // Priority: 1. document.documentElement.lang -> 2. Visible UI text -> 3. Domain/Hostname fallback
  function detectVintedLanguage() {
    // 1. Check document.documentElement.lang
    const htmlLang = (document.documentElement.lang || "").toLowerCase();
    if (htmlLang.startsWith("en")) return "en";
    if (htmlLang.startsWith("de")) return "de";
    if (htmlLang.startsWith("fr")) return "fr";
    if (htmlLang.startsWith("es")) return "es";
    if (htmlLang.startsWith("it")) return "it";

    // 2. Check visible UI / body text (allows detecting English UI on vinted.de)
    const bodyText = (document.body?.innerText || "").slice(0, 2000).toLowerCase();
    if (
      bodyText.includes("select a category") ||
      bodyText.includes("upload photos") ||
      bodyText.includes("describe your item") ||
      bodyText.includes("choose a category") ||
      bodyText.includes("select category")
    ) {
      return "en";
    }
    if (
      bodyText.includes("kategorie wählen") ||
      bodyText.includes("fotos hochladen") ||
      bodyText.includes("beschreibe deinen artikel") ||
      bodyText.includes("kategorie auswä")
    ) {
      return "de";
    }

    // 3. Domain / Hostname fallback LAST
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith(".co.uk") || host.endsWith(".com")) return "en";
    if (host.endsWith(".fr")) return "fr";
    if (host.endsWith(".de") || host.endsWith(".at") || host.endsWith(".ch")) return "de";

    return "de";
  }

  // Synonym dictionaries for category steps and dropdown values
  const CATEGORY_SYNONYMS = {
    // Gender / Target Section
    herren: ["Herren", "Men", "Men's", "Homme", "Uomo", "Mannen", "Männer", "Männlich"],
    damen: ["Damen", "Women", "Women's", "Femme", "Donna", "Dames", "Frauen", "Weiblich"],
    kinder: ["Kinder", "Kids", "Children", "Enfants", "Bambini", "Kinderen"],

    // Main Category
    kleidung: ["Kleidung", "Clothing", "Clothes", "Vêtements", "Kleding", "Abbigliamento", "Ropa"],

    // Subcategory / Leaf Category
    hosen: ["Hosen", "Trousers", "Pants", "Pantalons", "Broeken", "Pantaloni"],
    jeans: ["Jeans", "Denim"],
    stoffhosen: ["Stoffhosen & Chinos", "Stoffhosen", "Chinos", "Trousers", "Pants", "Pantalons en tissu"],
    jogginghosen: ["Jogginghosen", "Sweatpants", "Tracksuit bottoms", "Joggers", "Pantalons de jogg"],
    shorts: ["Shorts", "Bermudas"],
  };

  const CONDITION_SYNONYMS = {
    "neu mit etikett": ["Neu mit Etikett", "New with tags", "New with tag", "Neuf avec étiquette", "Nuovo con cartellino"],
    "neu ohne etikett": ["Neu ohne Etikett", "New without tags", "New without tag", "Neuf sans étiquette", "Nuovo senza cartellino"],
    "sehr gut": ["Sehr gut", "Very good", "Very Good", "Très bon état", "Ottime condizioni", "Sehr Gut"],
    "gut": ["Gut", "Good", "Bon état", "Buone condizioni"],
    "zufriedenstellend": ["Zufriedenstellend", "Satisfactory", "Fair", "Satisfaisant", "In ordine"],
  };

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

  // Convert base64 dataUrl or http URL to File asynchronously
  async function imageRefToFile(dataUrl, fileName, log) {
    if (!dataUrl || typeof dataUrl !== "string") {
      if (log) log(`  ⚠ Bild "${fileName}": dataUrl ist leer oder ungültig.`);
      return null;
    }

    if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) {
      try {
        const res = await fetch(dataUrl);
        if (!res.ok) {
          if (log) log(`  ⚠ Bild "${fileName}": HTTP-Fetch fehlgeschlagen Status ${res.status}`);
          return null;
        }
        const blob = await res.blob();
        const mime = blob.type || "image/jpeg";
        return new File([blob], fileName, { type: mime });
      } catch (err) {
        if (log) log(`  ⚠ Bild "${fileName}": HTTP-Fetch Fehler - ${err.message}`);
        return null;
      }
    }

    try {
      const arr = dataUrl.split(",");
      if (arr.length < 2) {
        if (log) log(`  ⚠ Bild "${fileName}": Base64 dataUrl Format ungültig (kein Komma-Separator).`);
        return null;
      }
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
      if (log) log(`  ⚠ Bild "${fileName}": Base64-Konvertierung fehlgeschlagen - ${e.message}`);
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

  // Count presence of selling fields inside container
  function countSellFieldsInContainer(container) {
    if (!container) return 0;
    const keywords = [
      "title", "titel", "description", "beschreibung", "price", "preis",
      "kategorie", "category", "catalog", "brand", "marke", "size", "größe",
      "grosse", "condition", "zustand", "farbe", "color", "colour"
    ];
    let score = 0;

    try {
      const els = container.querySelectorAll(
        "input, textarea, button, [role='button'], [role='combobox'], [data-testid], [class*='cell'], [class*='field'], label"
      );
      for (const el of els) {
        const attrStr = `${el.name || ""} ${el.id || ""} ${el.placeholder || ""} ${el.getAttribute("data-testid") || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
        if (keywords.some((kw) => attrStr.includes(kw))) {
          score++;
        } else {
          const text = el.textContent?.toLowerCase() || "";
          if (text.length > 0 && text.length < 100 && keywords.some((kw) => text.includes(kw))) {
            score++;
          }
        }
      }
    } catch (e) {
      console.error("Error in countSellFieldsInContainer:", e);
    }

    return score;
  }

  function logContainerSelection(el, reason, log) {
    const tag = el && el.tagName ? el.tagName.toUpperCase() : "UNKNOWN";
    const id = (el && el.id) || "(keine)";
    const className = el && el.className && typeof el.className === "string" ? el.className.trim() : "(keine)";
    const testId = el && el.getAttribute ? (el.getAttribute("data-testid") || "(keines)") : "(keines)";

    const msg = `Formular-Container gewählt (${reason}): Tag=${tag}, id=${id}, class=${className}, data-testid=${testId}`;
    if (log) {
      log(`[FormContainer] ${msg}`);
    } else {
      console.log(`[SaschaAI-Vinted] [FormContainer] ${msg}`);
    }
  }

  // Get the main Vinted seller form container
  function getFormContainer(log) {
    const mainEl = document.querySelector("main");
    const specificSelectors = [
      '[data-testid*="item-form"]',
      '[data-testid*="sell-form"]',
      '[data-testid*="upload-form"]',
      'form[action*="item"]',
      'form[action*="upload"]',
      '.cell-form',
    ];

    function evaluateContainer(el) {
      if (!el || !isElementVisible(el)) return -1;
      if (el.closest('nav, header, footer, [role="navigation"], sidebar, .sidebar, #sidebar')) {
        return -1;
      }
      return countSellFieldsInContainer(el);
    }

    // 1. First check specific sell form selectors with fields
    for (const sel of specificSelectors) {
      const candidate = document.querySelector(sel);
      if (candidate) {
        const score = evaluateContainer(candidate);
        if (score >= 1) {
          logContainerSelection(candidate, "Spezifischer Verkaufs-Formular-Selector", log);
          return candidate;
        }
      }
    }

    // 2. Check main element if available and contains selling fields
    if (mainEl && isElementVisible(mainEl)) {
      const score = evaluateContainer(mainEl);
      if (score >= 1) {
        logContainerSelection(mainEl, "Main-Element mit Verkaufsfeldern", log);
        return mainEl;
      }
    }

    // 3. Check generic forms, but ONLY if they actually contain selling fields (score >= 2)
    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      const score = evaluateContainer(form);
      if (score >= 2) {
        logContainerSelection(form, "Formular mit Verkaufsfeldern", log);
        return form;
      }
    }

    // 4. Fallback: Use main if available, otherwise document.body
    const fallback = (mainEl && isElementVisible(mainEl)) ? mainEl : document.body;
    logContainerSelection(fallback, "Sicherer Such-Root Fallback (main/body)", log);
    return fallback;
  }

  // Find input field restricted to form container
  function findInputField(formContainer, keywords, log) {
    if (!formContainer) formContainer = getFormContainer(log);

    for (const kw of keywords) {
      const el = formContainer.querySelector(
        `input[name*="${kw}" i], input[id*="${kw}" i], input[data-testid*="${kw}" i], input[placeholder*="${kw}" i]`
      );
      if (el && isSafeInteractiveElement(el)) {
        if (log) log(`✓ Input-Feld gefunden via Direct-Attribute ("${kw}")`);
        return el;
      }
    }

    const inputs = Array.from(formContainer.querySelectorAll("input"));
    for (const input of inputs) {
      if (!isSafeInteractiveElement(input)) continue;

      if (input.id) {
        try {
          const label = formContainer.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          if (label && matchesKeywords(label.textContent, keywords)) {
            if (log) log(`✓ Input-Feld gefunden via Label-For ("${label.textContent?.trim()}")`);
            return input;
          }
        } catch (e) {
          // CSS.escape fallback
        }
      }

      let parent = input.parentElement;
      for (
        let depth = 0;
        depth < 3 && parent && parent !== formContainer;
        depth++
      ) {
        if (matchesKeywords(parent.textContent, keywords)) {
          if (log) log(`✓ Input-Feld gefunden via Parent-Text ("${keywords.join('/')}")`);
          return input;
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  // Find textarea field restricted to form container
  function findTextareaField(formContainer, keywords, log) {
    if (!formContainer) formContainer = getFormContainer(log);

    for (const kw of keywords) {
      const el = formContainer.querySelector(
        `textarea[name*="${kw}" i], textarea[id*="${kw}" i], textarea[data-testid*="${kw}" i], textarea[placeholder*="${kw}" i]`
      );
      if (el && isSafeInteractiveElement(el)) {
        if (log) log(`✓ Textarea gefunden via Direct-Attribute ("${kw}")`);
        return el;
      }
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
          if (log) log(`✓ Textarea gefunden via Parent-Text ("${keywords.join('/')}")`);
          return ta;
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  // Find trigger button/cell for a dropdown field within form container
  function findFieldTrigger(formContainer, fieldName, fieldKeywords, log) {
    if (!formContainer) formContainer = getFormContainer(log);

    const matchInfo = (el, strategy) => {
      const tag = el.tagName ? el.tagName.toUpperCase() : "UNKNOWN";
      const id = el.id || "(keine)";
      const className = el.className && typeof el.className === "string" ? el.className.trim() : "(keine)";
      const testId = el.getAttribute ? (el.getAttribute("data-testid") || "(keines)") : "(keines)";
      const role = el.getAttribute ? (el.getAttribute("role") || "(keine)") : "(keine)";
      const ariaHasPopup = el.getAttribute ? (el.getAttribute("aria-haspopup") || "(keines)") : "(keines)";
      return `[${fieldName}] Trigger gefunden via ${strategy}: Tag=${tag}, id=${id}, class=${className}, data-testid=${testId}, role=${role}, aria-haspopup=${ariaHasPopup}`;
    };

    // Strategy 1: Visible field title / label search (finds "Brand", "Size", "Color", "Condition", "Category")
    const labelCandidates = Array.from(
      formContainer.querySelectorAll("label, span, p, div, h1, h2, h3, h4, h5, h6")
    );

    for (const label of labelCandidates) {
      if (!isElementVisible(label)) continue;
      const text = label.textContent?.trim() || "";
      if (text.length > 0 && text.length < 80 && matchesKeywords(text, fieldKeywords)) {
        // Check label[for]
        if (label.htmlFor) {
          try {
            const target = formContainer.querySelector(`#${CSS.escape(label.htmlFor)}`);
            if (target && isSafeInteractiveElement(target)) {
              const msg = matchInfo(target, `Sichtbarer Feldtitel Label-For ("${text}")`);
              if (log) log(`✓ ${msg}`);
              return target;
            }
          } catch (e) {
            // CSS.escape fallback
          }
        }

        // Search parent container up to 4 levels for interactive controls
        let parent = label.parentElement;
        for (let depth = 0; depth < 4 && parent && parent !== formContainer; depth++) {
          const interactiveCandidate = parent.querySelector(
            "button, [role='button'], [role='combobox'], [aria-haspopup], input, select, div[class*='select'], div[class*='input'], div[class*='cell'], div[class*='value'], div[class*='wrapper']"
          );
          if (interactiveCandidate && isSafeInteractiveElement(interactiveCandidate)) {
            const msg = matchInfo(interactiveCandidate, `Sichtbarer Feldtitel Wrapper ("${text}")`);
            if (log) log(`✓ ${msg}`);
            return interactiveCandidate;
          }
          parent = parent.parentElement;
        }
      }
    }

    // Strategy 2: Direct selector on attributes & interactive elements
    for (const kw of fieldKeywords) {
      const selectors = [
        `[data-testid*="${kw}" i]`,
        `[name*="${kw}" i]`,
        `[id*="${kw}" i]`,
        `[aria-label*="${kw}" i]`,
        `[placeholder*="${kw}" i]`,
        `button[data-testid*="${kw}" i]`,
        `[role="button"][data-testid*="${kw}" i]`,
        `[role="combobox"][data-testid*="${kw}" i]`,
        `[aria-haspopup="dialog"][data-testid*="${kw}" i]`,
        `[aria-haspopup="listbox"][data-testid*="${kw}" i]`,
      ];
      for (const sel of selectors) {
        const candidate = formContainer.querySelector(sel);
        if (candidate && isSafeInteractiveElement(candidate)) {
          const clickTarget =
            candidate.querySelector(
              "button, input, [role='button'], [role='combobox'], [aria-haspopup], div[class*='input'], div[class*='select']"
            ) || candidate;
          if (isSafeInteractiveElement(clickTarget)) {
            const msg = matchInfo(clickTarget, `Attribut-Match ("${kw}")`);
            if (log) log(`✓ ${msg}`);
            return clickTarget;
          }
        }
      }
    }

    // Strategy 3: Vinted row / cell / field wrappers
    const candidateRows = Array.from(
      formContainer.querySelectorAll(
        '[data-testid*="cell"], [class*="cell"], [class*="row"], [class*="field"], [class*="item"], div[class*="wrapper"]'
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
        const interactiveEl = row.querySelector(
          "button, [role='button'], [role='combobox'], [aria-haspopup], input, select, div[class*='select'], div[class*='input'], div[class*='value']"
        );
        if (interactiveEl && isSafeInteractiveElement(interactiveEl)) {
          const msg = matchInfo(interactiveEl, `Cell-Row-Interactive-Match ("${fieldName}")`);
          if (log) log(`✓ ${msg}`);
          return interactiveEl;
        }
        if (isSafeInteractiveElement(row)) {
          const msg = matchInfo(row, `Cell-Row-Element-Match ("${fieldName}")`);
          if (log) log(`✓ ${msg}`);
          return row;
        }
      }
    }

    if (log) log(`✗ Dropdown-Trigger für "${fieldName}" nicht gefunden.`);
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
      if (log) log(`  🔍 Suche im Dropdown/Modal nach: "${searchValue}"`);
      searchInput.focus();
      setNativeInputValue(searchInput, searchValue);
      await delay(400); // Wait for filtered options to render
      return true;
    }

    return false;
  }

  // Find matching option element ONLY within the open overlay scope (supports synonyms / string arrays)
  function findMatchingOptionInOverlay(overlayScope, desiredValueOrSynonyms) {
    if (!overlayScope || !desiredValueOrSynonyms) return null;

    const candidates = Array.isArray(desiredValueOrSynonyms)
      ? desiredValueOrSynonyms.map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [desiredValueOrSynonyms.trim().toLowerCase()];

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
      for (const targetLower of candidates) {
        if (text === targetLower) {
          return opt;
        }
      }
    }

    // Pass 2: Substring match
    for (const opt of optionEls) {
      if (!isSafeInteractiveElement(opt)) continue;
      if (!overlayScope.contains(opt)) continue;

      const text = opt.textContent?.trim().toLowerCase() || "";
      if (text.length < 80) {
        for (const targetLower of candidates) {
          if (text.includes(targetLower) || targetLower.includes(text)) {
            return opt;
          }
        }
      }
    }

    return null;
  }

  // Build multi-step category sequence with synonym lists
  function getCategoryPathSequence(categoryStr, genderStr) {
    if (!categoryStr) return [];

    // If delimited by >, /, -> or ,
    if (/[>\/,-]/.test(categoryStr) && categoryStr.includes(" ")) {
      const parts = categoryStr
        .split(/[>\/]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        return parts.map((p) => [p]);
      }
    }

    const catLower = categoryStr.trim().toLowerCase();
    const genderLower = (genderStr || "").trim().toLowerCase();

    let genderSynonyms = CATEGORY_SYNONYMS.herren; // Default
    if (
      genderLower.includes("herren") ||
      genderLower.includes("men") ||
      genderLower.includes("männlich")
    ) {
      genderSynonyms = CATEGORY_SYNONYMS.herren;
    } else if (
      genderLower.includes("damen") ||
      genderLower.includes("women") ||
      genderLower.includes("weiblich")
    ) {
      genderSynonyms = CATEGORY_SYNONYMS.damen;
    } else if (
      genderLower.includes("kinder") ||
      genderLower.includes("kids") ||
      genderLower.includes("child")
    ) {
      genderSynonyms = CATEGORY_SYNONYMS.kinder;
    }

    if (catLower === "jeans") {
      return [genderSynonyms, CATEGORY_SYNONYMS.kleidung, CATEGORY_SYNONYMS.hosen, CATEGORY_SYNONYMS.jeans];
    }

    if (catLower === "hosen" || catLower === "pants" || catLower === "trousers") {
      return [genderSynonyms, CATEGORY_SYNONYMS.kleidung, CATEGORY_SYNONYMS.hosen];
    }

    if (catLower.includes("stoffhose") || catLower.includes("chino")) {
      return [genderSynonyms, CATEGORY_SYNONYMS.kleidung, CATEGORY_SYNONYMS.hosen, CATEGORY_SYNONYMS.stoffhosen];
    }

    if (catLower.includes("jogging") || catLower.includes("sweatpant") || catLower.includes("jogger")) {
      return [genderSynonyms, CATEGORY_SYNONYMS.kleidung, CATEGORY_SYNONYMS.hosen, CATEGORY_SYNONYMS.jogginghosen];
    }

    if (catLower.includes("short")) {
      return [genderSynonyms, CATEGORY_SYNONYMS.kleidung, CATEGORY_SYNONYMS.shorts];
    }

    return [genderSynonyms, [categoryStr.trim()]];
  }

  // Check if field value displays expected value or synonym after selection
  function verifyFieldValue(triggerEl, expectedSynonyms, log) {
    if (!expectedSynonyms) return false;
    const candidates = Array.isArray(expectedSynonyms)
      ? expectedSynonyms.map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [expectedSynonyms.trim().toLowerCase()];

    let container = triggerEl;
    for (let depth = 0; depth < 3 && container; depth++) {
      const text = container.textContent?.trim().toLowerCase() || "";
      for (const targetLower of candidates) {
        if (text.includes(targetLower)) {
          return true;
        }
      }
      container = container.parentElement;
    }

    return false;
  }

  // Multi-step Category Selector Helper with Language & Synonym Support
  async function selectVintedCategory(formContainer, draftCategory, draftGender, log) {
    const pageLang = detectVintedLanguage();
    log(`Versuche Kategorie "${draftCategory}" zu setzen (Erkannte Sprache: ${pageLang.toUpperCase()})...`);

    const categoryPath = getCategoryPathSequence(draftCategory, draftGender);
    const pathDescription = categoryPath.map((syns) => syns[0]).join(" → ");
    log(`  Kategorie-Pfad (Synonym-Gruppen): ${pathDescription}`);

    const triggerEl = findFieldTrigger(
      formContainer,
      "category",
      ["category", "kategorie", "catalog", "catégorie"],
      log
    );

    if (!triggerEl) {
      log("✗ Kategorie-Trigger im Formular nicht gefunden.");
      return { success: false, reason: "Kategorie-Trigger nicht gefunden" };
    }

    triggerEl.click();
    await delay(400);

    let completedSteps = 0;

    for (let i = 0; i < categoryPath.length; i++) {
      const currentStepSynonyms = categoryPath[i];
      const overlayScope = getOpenOverlayScope();

      if (!overlayScope) {
        log(`  ⚠ Kategorie-Modal nach Schritt ${completedSteps}/${categoryPath.length} nicht mehr geöffnet.`);
        break;
      }

      let matchedOption = findMatchingOptionInOverlay(overlayScope, currentStepSynonyms);

      // Fallback check at step 0: Maybe target leaf category is already directly visible
      if (!matchedOption && i === 0 && categoryPath.length > 1) {
        const finalCategorySynonyms = categoryPath[categoryPath.length - 1];
        matchedOption = findMatchingOptionInOverlay(overlayScope, finalCategorySynonyms);
        if (matchedOption) {
          log(`  ✓ Direktes Ziel in Schritt 1 gefunden und wird geklickt.`);
        }
      }

      if (matchedOption) {
        const optionText = matchedOption.textContent?.trim() || currentStepSynonyms[0];
        log(`  ✓ Kategorie-Schritt ${i + 1}/${categoryPath.length}: "${optionText}" geklickt`);
        matchedOption.click();
        completedSteps++;
        await delay(400);
      } else {
        log(`✗ Kategorie-Schritt ${i + 1}/${categoryPath.length} ("${currentStepSynonyms.join('/')}") in Auswahlliste nicht gefunden.`);
        break;
      }
    }

    const remainingOverlay = getOpenOverlayScope();
    if (remainingOverlay) {
      await closeOverlaySafely(remainingOverlay);
    }

    const lastStepSynonyms = categoryPath[categoryPath.length - 1] || [draftCategory];
    const allStepsCompleted = completedSteps === categoryPath.length;
    const verified = verifyFieldValue(triggerEl, lastStepSynonyms, log);

    if (verified) {
      log(`✓ Kategorie erfolgreich im Feld verifiziert: "${draftCategory}"`);
      return { success: true };
    } else if (allStepsCompleted) {
      log(`✓ Alle Kategorie-Schritte (${completedSteps}/${categoryPath.length}) abgeschlossen.`);
      return { success: true };
    } else {
      const failedStepName = categoryPath[completedSteps]?.[0] || draftCategory;
      log(`✗ Kategorie-Auswahl bei Schritt "${failedStepName}" (${completedSteps}/${categoryPath.length}) gescheitert. Nicht verifiziert.`);
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

      const triggerEl = findFieldTrigger(formContainer, fieldName, fieldKeywords, log);

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

      // Determine synonyms for value if applicable (e.g. condition)
      let desiredSynonyms = [desiredValue];
      const valLower = desiredValue.trim().toLowerCase();
      if (fieldName === "condition" && CONDITION_SYNONYMS[valLower]) {
        desiredSynonyms = CONDITION_SYNONYMS[valLower];
      }

      let matchedOption = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        matchedOption = findMatchingOptionInOverlay(overlayScope, desiredSynonyms);
        if (matchedOption) break;
        await delay(200);
      }

      if (matchedOption) {
        const optionText = matchedOption.textContent?.trim() || desiredValue;
        matchedOption.click();
        await delay(400);

        const remainingOverlay = getOpenOverlayScope();
        if (remainingOverlay) {
          await closeOverlaySafely(remainingOverlay);
        }

        const verified = verifyFieldValue(triggerEl, desiredSynonyms, log);
        if (verified) {
          log(`✓ Dropdown "${fieldName}" auf "${optionText}" gesetzt und verifiziert.`);
        } else {
          log(`✓ Dropdown "${fieldName}" auf "${optionText}" geklickt.`);
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

    const pageLang = detectVintedLanguage();
    log(`Starte Formular-Befüllung für "${draft.title || draft.artikelnummer}" (Vinted Sprache: ${pageLang.toUpperCase()})`);

    const formContainer = getFormContainer(log);

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
        const titleEl = findInputField(
          formContainer,
          ["title", "titel", "heading", "name"],
          log
        );
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
        const descEl = findTextareaField(
          formContainer,
          ["description", "beschreibung", "details", "body"],
          log
        );
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
        const priceEl = findInputField(
          formContainer,
          ["price", "preis", "amount", "wert", "cost", "value"],
          log
        );
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
        log("ℹ Kein Preis im Draft/Payload vorhanden (result.pricing.listingPrice war undefined/nicht gesetzt). Kein erfundener Preis eingesetzt.");
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
        ["brand", "marke", "marque", "marca"],
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
        ["size", "größe", "grosse", "taille", "talla"],
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
        ["color", "colour", "farbe", "couleur"],
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
        ["condition", "zustand", "état", "estado"],
        draft.condition,
        log
      );
    } else {
      results.condition = { success: false, reason: "Kein Wert" };
    }

    // 5. Fill Images
    try {
      if (draft.images && draft.images.length > 0) {
        const totalDraftImages = draft.images.length;
        const validDataUrlImages = draft.images.filter(
          (img) => img.dataUrl && (img.dataUrl.startsWith("data:") || img.dataUrl.startsWith("http"))
        ).length;

        log(`${totalDraftImages} Bilder, ${validDataUrlImages} gültige Bildquellen empfangen.`);

        const fileInput = formContainer.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');

        if (!fileInput) {
          results.images = {
            success: false,
            reason: "Datei-Input (<input type='file'>) nicht gefunden",
          };
          log("✗ Dateiauswahl-Element auf Vinted nicht gefunden.");
        } else {
          const files = [];
          for (let idx = 0; idx < draft.images.length; idx++) {
            const img = draft.images[idx];
            const fileName = img.name || `image_${idx + 1}.jpg`;
            const file = await imageRefToFile(img.dataUrl, fileName, log);
            if (file) {
              files.push(file);
            }
          }

          log(`✓ ${files.length}/${totalDraftImages} Bild-Dateien bereit.`);

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
