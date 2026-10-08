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
  function detectVintedLanguage() {
    const htmlLang = (document.documentElement.lang || "").toLowerCase();
    if (htmlLang.startsWith("en")) return "en";
    if (htmlLang.startsWith("de")) return "de";
    if (htmlLang.startsWith("fr")) return "fr";
    if (htmlLang.startsWith("es")) return "es";
    if (htmlLang.startsWith("it")) return "it";

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

    const host = window.location.hostname.toLowerCase();
    if (host.endsWith(".co.uk") || host.endsWith(".com")) return "en";
    if (host.endsWith(".fr")) return "fr";
    if (host.endsWith(".de") || host.endsWith(".at") || host.endsWith(".ch")) return "de";

    return "de";
  }

  // Synonym dictionaries for category steps and dropdown values
  const CATEGORY_SYNONYMS = {
    herren: ["Herren", "Men", "Men's", "Homme", "Uomo", "Mannen", "Männer", "Männlich"],
    damen: ["Damen", "Women", "Women's", "Femme", "Donna", "Dames", "Frauen", "Weiblich"],
    kinder: ["Kinder", "Kids", "Children", "Enfants", "Bambini", "Kinderen"],
    kleidung: ["Kleidung", "Clothing", "Clothes", "Vêtements", "Kleding", "Abbigliamento", "Ropa"],
    hosen: ["Hosen", "Trousers", "Pants", "Pantalons", "Broeken", "Pantaloni"],
    jeans: ["Jeans", "Denim"],
    stoffhosen: ["Stoffhosen & Chinos", "Stoffhosen", "Chinos", "Trousers", "Pants", "Pantalons en tissu"],
    jogginghosen: ["Jogginghosen", "Sweatpants", "Tracksuit bottoms", "Joggers", "Pantalons de jogg"],
    shorts: ["Shorts", "Bermudas"],
  };

  const CONDITION_SYNONYMS = {
    "neu mit etikett": ["Neu mit Etikett", "New with tags", "New with tag", "Neuf avec étiquette", "Nuovo con cartellino"],
    "neu ohne etikett": ["Neu ohne Etikett", "New without tags", "New without tag", "Neuf sans étiquette", "Nuovo senza cartellino"],
    "sehr gut": ["Sehr gut", "Very good", "Very Good", "Très bon état", "Ottime condizioni", "Sehr Gut", "Sehr gut / Very good"],
    "gut": ["Gut", "Good", "Bon état", "Buone condizioni"],
    "zufriedenstellend": ["Zufriedenstellend", "Satisfactory", "Fair", "Satisfaisant", "In ordine"],
  };

  const COLOR_SYNONYMS = {
    "hellblau": ["Hellblau", "Light blue", "Bleu clair", "Azzurro", "Lichtblauw"],
    "blau": ["Blau", "Blue", "Bleu", "Blu"],
    "dunkelblau": ["Dunkelblau", "Dark blue", "Navy", "Bleu marine"],
    "schwarz": ["Schwarz", "Black", "Noir", "Nero"],
    "weiß": ["Weiß", "Weiss", "White", "Blanc", "Bianco"],
    "grau": ["Grau", "Grey", "Gray", "Gris", "Grigio"],
  };

  // Field keywords for visible UI matching
  const FIELD_KEYWORDS = {
    category: ["Kategorie", "Category", "Select a category"],
    brand: ["Marke", "Brand", "Marke auswählen", "Select brand"],
    size: ["Größe", "Size", "Größe auswählen", "Select size"],
    condition: ["Zustand", "Condition", "Zustand auswählen"],
    color: ["Farbe", "Color", "Colour"],
  };

  // Helper to set input/textarea value with React-compatible dispatch
  function setNativeInputValue(element, value) {
    if (!element) return false;

    try {
      element.focus();
    } catch (e) {
      // ignore focus errors
    }

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
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
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

    const escapedArtNr = artNr.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const leadingRegex = new RegExp(`^#?${escapedArtNr}\\b[\\s:-]*`, "i");
    if (leadingRegex.test(baseTitle)) {
      baseTitle = baseTitle.replace(leadingRegex, "").trim();
    }

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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  function isSafeInteractiveElement(el) {
    if (!el || !isElementVisible(el)) return false;

    if (el.tagName === "A" || el.hasAttribute("href") || el.closest("a")) {
      return false;
    }

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

  function getFormContainer(log) {
    const mainEl = document.querySelector("main");
    if (mainEl && isElementVisible(mainEl)) {
      return mainEl;
    }

    const specificSelectors = [
      '[data-testid*="item-form"]',
      '[data-testid*="sell-form"]',
      '[data-testid*="upload-form"]',
      'form[action*="item"]',
      'form[action*="upload"]',
      '.cell-form',
    ];

    for (const sel of specificSelectors) {
      const candidate = document.querySelector(sel);
      if (candidate && isElementVisible(candidate)) {
        return candidate;
      }
    }

    const forms = Array.from(document.querySelectorAll("form"));
    for (const form of forms) {
      if (countSellFieldsInContainer(form) >= 2) {
        return form;
      }
    }

    return mainEl || document.body;
  }

  /**
   * Gather visible interactive controls strictly within form container / main,
   * excluding description textareas and description wrappers.
   */
  function getInteractiveControls(rootEl) {
    const root = rootEl || document.querySelector("main") || document.body;

    const descriptionAreas = Array.from(
      root.querySelectorAll(
        'textarea, [data-testid*="description" i], [name*="description" i], [id*="description" i]'
      )
    );

    const candidateSelectors = [
      "button",
      "[role='button']",
      "[role='combobox']",
      "[aria-haspopup]",
      "select",
      "input:not([type='hidden']):not([type='file'])"
    ];

    let candidates = [];
    try {
      candidates = Array.from(root.querySelectorAll(candidateSelectors.join(", ")));
    } catch (e) {
      candidates = [];
    }

    return candidates.filter((el) => {
      if (!isElementVisible(el)) return false;
      if (!isSafeInteractiveElement(el)) return false;

      // Exclude controls inside description container or textarea
      for (const descArea of descriptionAreas) {
        if (descArea.contains(el) || el === descArea) return false;
      }

      // Check parent tree up to 4 levels for description indicators
      let p = el.parentElement;
      for (let depth = 0; depth < 4 && p && p !== root; depth++) {
        if (p.tagName === "TEXTAREA") return false;
        const testId = p.getAttribute?.("data-testid") || "";
        const name = p.getAttribute?.("name") || "";
        const id = p.id || "";
        if (
          testId.toLowerCase().includes("description") ||
          name.toLowerCase().includes("description") ||
          id.toLowerCase().includes("description")
        ) {
          return false;
        }
        p = p.parentElement;
      }

      return true;
    });
  }

  // Get text context surrounding an interactive control
  function getControlTextContext(control) {
    if (!control) return { ownText: "", ariaLabel: "", placeholder: "", value: "", labelText: "", parentText: "", prevText: "", nextText: "" };

    const ownText = control.textContent?.trim().replace(/\s+/g, " ") || "";
    const ariaLabel = control.getAttribute?.("aria-label")?.trim() || "";
    const placeholder = control.getAttribute?.("placeholder")?.trim() || "";
    const value = control.value?.trim() || "";

    let labelText = "";
    if (control.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
        if (label) labelText = label.textContent?.trim().replace(/\s+/g, " ") || "";
      } catch (e) {
        // Fallback
      }
    }

    let parentText = "";
    const parentEl = control.parentElement;
    if (parentEl) {
      parentText = parentEl.textContent?.trim().replace(/\s+/g, " ") || "";
    }

    let prevText = "";
    const prevEl = control.previousElementSibling;
    if (prevEl) {
      prevText = prevEl.textContent?.trim().replace(/\s+/g, " ") || "";
    }

    let nextText = "";
    const nextEl = control.nextElementSibling;
    if (nextEl) {
      nextText = nextEl.textContent?.trim().replace(/\s+/g, " ") || "";
    }

    return {
      ownText,
      ariaLabel,
      placeholder,
      value,
      labelText,
      parentText,
      prevText,
      nextText,
    };
  }

  /**
   * Find an interactive control matching field keywords by visible UI text and surrounding context.
   */
  function findInteractiveControlByUI(root, fieldName, fieldKeywords, log) {
    const controls = getInteractiveControls(root);

    for (const ctrl of controls) {
      const ctx = getControlTextContext(ctrl);

      // 1. Text of button / control itself
      if (matchesKeywords(ctx.ownText, fieldKeywords)) {
        if (log) log(`✓ [${fieldName}] Control über Button-Text gefunden ("${ctx.ownText}")`);
        return ctrl;
      }

      // 2. aria-label or placeholder
      if (matchesKeywords(ctx.ariaLabel, fieldKeywords) || matchesKeywords(ctx.placeholder, fieldKeywords)) {
        if (log) log(`✓ [${fieldName}] Control über aria-label/placeholder gefunden ("${ctx.ariaLabel || ctx.placeholder}")`);
        return ctrl;
      }

      // 3. Label above/for control
      if (matchesKeywords(ctx.labelText, fieldKeywords)) {
        if (log) log(`✓ [${fieldName}] Control über Label-Text gefunden ("${ctx.labelText}")`);
        return ctrl;
      }

      // 4. Previous sibling element text
      if (matchesKeywords(ctx.prevText, fieldKeywords)) {
        if (log) log(`✓ [${fieldName}] Control über vorheriges Geschwisterelement gefunden ("${ctx.prevText.slice(0, 40)}")`);
        return ctrl;
      }

      // 5. Next sibling element text
      if (matchesKeywords(ctx.nextText, fieldKeywords)) {
        if (log) log(`✓ [${fieldName}] Control über nächstes Geschwisterelement gefunden ("${ctx.nextText.slice(0, 40)}")`);
        return ctrl;
      }

      // 6. Parent container text (if not too large)
      if (ctx.parentText.length < 200 && matchesKeywords(ctx.parentText, fieldKeywords)) {
        if (log) log(`✓ [${fieldName}] Control über Parent-Container-Text gefunden ("${ctx.parentText.slice(0, 50)}")`);
        return ctrl;
      }
    }

    // Fallback search via direct element attributes if no text context matched
    for (const ctrl of controls) {
      const attrStr = `${ctrl.name || ""} ${ctrl.id || ""} ${ctrl.getAttribute?.("data-testid") || ""}`.toLowerCase();
      if (fieldKeywords.some((kw) => attrStr.includes(kw.toLowerCase()))) {
        if (log) log(`✓ [${fieldName}] Control über Fallback-Attribut gefunden`);
        return ctrl;
      }
    }

    if (log) log(`✗ [${fieldName}] Kein Control über sichtbare UI ("${fieldKeywords.join(', ')}") gefunden.`);
    return null;
  }

  // Debug up to 30 visible interactive controls with full attributes
  function debugInteractiveControls(root, log) {
    const controls = getInteractiveControls(root);
    log(`[CONTROL DEBUG] ${controls.length} interaktive Controls im Formular erfasst:`);

    const limit = Math.min(controls.length, 30);
    for (let i = 0; i < limit; i++) {
      const ctrl = controls[i];
      const tag = ctrl.tagName ? ctrl.tagName.toUpperCase() : "UNKNOWN";
      let text = ctrl.textContent?.trim().replace(/\s+/g, " ") || "";
      if (text.length > 60) text = text.slice(0, 57) + "...";

      const ariaLabel = ctrl.getAttribute("aria-label") || "(keines)";
      const ariaHasPopup = ctrl.getAttribute("aria-haspopup") || "(keines)";
      const role = ctrl.getAttribute("role") || "(keine)";
      const dataTestid = ctrl.getAttribute("data-testid") || "(keines)";
      const name = ctrl.getAttribute("name") || "(keine)";
      const id = ctrl.id || "(keine)";
      const placeholder = ctrl.getAttribute("placeholder") || "(keiner)";

      log(
        `[CONTROL ${i}] tag=${tag} text="${text}" role=${role} aria-haspopup=${ariaHasPopup} data-testid=${dataTestid} name=${name} id=${id} placeholder=${placeholder}`
      );
    }
  }

  // Wait for new interactive controls to appear post category selection
  async function waitForNewControls(root, initialCount, log) {
    log(`Warte auf neue Controls nach Kategorie-Auswahl (vorher: ${initialCount} Controls)...`);
    const maxWait = 2000;
    const interval = 200;
    let elapsed = 0;

    while (elapsed < maxWait) {
      await delay(interval);
      elapsed += interval;

      const currentControls = getInteractiveControls(root);
      if (currentControls.length > initialCount) {
        log(`✓ Neue Controls aufgetaucht nach ${elapsed}ms (jetzt ${currentControls.length} Controls).`);
        return currentControls;
      }
    }

    log(`ℹ Control-Anzahl nach ${maxWait}ms unverändert (${initialCount} Controls). Fahre fort.`);
    return getInteractiveControls(root);
  }

  // Find input field restricted to form container
  function findInputField(formContainer, keywords, log) {
    if (!formContainer) formContainer = getFormContainer(log);

    for (const kw of keywords) {
      const el = formContainer.querySelector(
        `input[name*="${kw}" i], input[id*="${kw}" i], input[data-testid*="${kw}" i], input[placeholder*="${kw}" i], input[aria-label*="${kw}" i]`
      );
      if (el && isSafeInteractiveElement(el)) {
        if (log) log(`✓ Input-Feld gefunden via Direct-Attribute ("${kw}")`);
        return el;
      }
    }

    const inputs = Array.from(formContainer.querySelectorAll("input:not([type='hidden']):not([type='file'])"));
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

      const prevEl = input.previousElementSibling;
      if (prevEl && matchesKeywords(prevEl.textContent, keywords)) {
        if (log) log(`✓ Input-Feld gefunden via vorheriges Geschwisterelement ("${prevEl.textContent?.trim().slice(0, 30)}")`);
        return input;
      }

      let parent = input.parentElement;
      for (
        let depth = 0;
        depth < 4 && parent && parent !== formContainer;
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

  // Get all visible overlay candidates in order
  function getAllVisibleOverlays() {
    const overlaySelectors = [
      '[role="dialog"]',
      '[role="menu"]',
      '[role="listbox"]',
      '[aria-modal="true"]',
      '[data-testid*="modal" i]',
      '[data-testid*="dropdown" i]',
      '[data-testid*="popover" i]',
      '[data-testid*="catalog" i]',
      '[data-testid*="dialog" i]',
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
          !el.closest("nav, header, footer, sidebar") &&
          !candidates.includes(el)
        ) {
          candidates.push(el);
        }
      }
    }
    return candidates;
  }

  // Get currently active dropdown or modal overlay element
  function getOpenOverlayScope() {
    const candidates = getAllVisibleOverlays();
    if (candidates.length > 0) {
      return candidates[candidates.length - 1];
    }
    return null;
  }

  // Robustly find overlay associated with a clicked trigger element
  function getOverlayForTrigger(triggerEl, overlaysBefore = [], log = null) {
    if (!triggerEl) return getOpenOverlayScope();

    // 1. Check aria-controls
    const ariaControls = triggerEl.getAttribute("aria-controls");
    if (ariaControls) {
      try {
        const controlledEl = document.getElementById(ariaControls);
        if (controlledEl && isElementVisible(controlledEl)) {
          if (log) log(`✓ Overlay via aria-controls="${ariaControls}" gefunden.`);
          return controlledEl;
        }
      } catch (e) {
        // ignore selector syntax errors
      }
    }

    // 2. Detect newly appeared visible overlays
    const overlaysAfter = getAllVisibleOverlays();
    const newOverlays = overlaysAfter.filter((el) => !overlaysBefore.includes(el));

    if (newOverlays.length === 1) {
      if (log) log(`✓ Genau ein neues Overlay nach Klick erkannt (${newOverlays[0].tagName}, testid=${newOverlays[0].getAttribute("data-testid") || "none"}, role=${newOverlays[0].getAttribute("role") || "none"}).`);
      return newOverlays[0];
    } else if (newOverlays.length > 1) {
      const chosen = newOverlays[newOverlays.length - 1];
      if (log) log(`✓ Multiple (${newOverlays.length}) neue Overlays erkannt. Wähle das oberste/zuletzt erschienene.`);
      return chosen;
    }

    // 3. Fallback: global open overlay scope
    const fallbackOverlay = getOpenOverlayScope();
    if (fallbackOverlay && log) {
      log(`ℹ Kein neues Overlay erschienen, benutze bestehenden Fallback-OverlayScope.`);
    }
    return fallbackOverlay;
  }

  // Resolve actual clickable parent container for a text match element within overlayScope
  function resolveClickableOption(matchEl, overlayScope) {
    if (!matchEl) return null;
    const scope = overlayScope || getOpenOverlayScope() || document.body;

    if (!scope.contains(matchEl)) return null;

    if (matchEl.tagName === "INPUT") {
      const type = (matchEl.getAttribute("type") || "").toLowerCase();
      if (type === "radio" || type === "checkbox") {
        if (isSafeInteractiveElement(matchEl)) return matchEl;
        if (matchEl.id) {
          try {
            const lbl = scope.querySelector(`label[for="${CSS.escape(matchEl.id)}"]`);
            if (lbl && isSafeInteractiveElement(lbl)) return lbl;
          } catch (e) {}
        }
      }
    }

    const clickableSelectors = [
      '[role="option"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[role="menuitem"]',
      'button',
      'label',
      '[data-testid*="cell" i]',
      '[data-testid*="item" i]',
      '[data-testid*="option" i]',
    ];

    let current = matchEl;
    while (current && current !== scope && scope.contains(current)) {
      if (current.tagName === "A" || current.hasAttribute("href")) {
        return null;
      }

      for (const sel of clickableSelectors) {
        if (current.matches && current.matches(sel)) {
          if (isSafeInteractiveElement(current)) {
            return current;
          }
        }
      }

      const inputChild = current.querySelector('input[type="radio"], input[type="checkbox"]');
      if (inputChild && isSafeInteractiveElement(inputChild)) {
        return inputChild;
      }

      current = current.parentElement;
    }

    if (isSafeInteractiveElement(matchEl) && matchEl.tagName !== "A" && !matchEl.hasAttribute("href")) {
      return matchEl;
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

  // Handle typing in overlay search inputs
  async function handleOverlaySearchInput(overlayScope, searchValue, log) {
    if (!overlayScope || !searchValue) return false;

    const searchInput = overlayScope.querySelector(
      'input[type="search"], input[placeholder*="suchen" i], input[placeholder*="search" i], input[data-testid*="search" i], input[type="text"]'
    );

    if (searchInput && isSafeInteractiveElement(searchInput)) {
      if (log) log(`  🔍 Suche im Dropdown/Modal nach: "${searchValue}"`);
      searchInput.focus();
      setNativeInputValue(searchInput, searchValue);
      await delay(400);
      return true;
    }

    return false;
  }

  // Normalize gender string into standard key
  function normalizeGender(genderStr) {
    if (!genderStr) return "unspecified";
    const g = genderStr.trim().toLowerCase();
    if (
      g.includes("damen") ||
      g.includes("women") ||
      g.includes("female") ||
      g.includes("weiblich") ||
      g.includes("frau")
    ) {
      return "women";
    }
    if (
      g.includes("herren") ||
      g.includes("men") ||
      g.includes("male") ||
      g.includes("männlich") ||
      g.includes("mann")
    ) {
      return "men";
    }
    return "unspecified";
  }

  // Extract waist number from size string (e.g. W36, W 36, Waist 36, 36W, W36/L32)
  function extractWaistNumber(str) {
    if (!str) return null;
    const s = str.trim();

    // Exclude explicit EU / US prefix
    if (/\beu\s*\d+/i.test(s) || /\bus\s*\d+/i.test(s)) {
      return null;
    }

    // Explicit W / Waist prefix: e.g., W36, W 36, Waist 36, W36/L32
    const wMatch = s.match(/(?:^|\b)(?:w|waist)\s*(\d{2,3})\b/i);
    if (wMatch) return parseInt(wMatch[1], 10);

    // W suffix: 36W
    const suffixMatch = s.match(/\b(\d{2,3})\s*w\b/i);
    if (suffixMatch) return parseInt(suffixMatch[1], 10);

    // Wxx / Lxx format: 36/32 or 36 / 32
    const lengthMatch = s.match(/\b(\d{2,3})\s*[\/\-]\s*\d{2,3}\b/);
    if (lengthMatch) return parseInt(lengthMatch[1], 10);

    return null;
  }

  // Check if size string contains explicit length specification (e.g., L32, /32)
  function hasExplicitLength(str) {
    if (!str) return false;
    return /\bl\s*\d{2,3}\b/i.test(str) || /\b\d{2,3}\s*[\/\-]\s*\d{2,3}\b/.test(str);
  }

  // Extract EU size number (e.g. EU 38, 38 EU)
  function extractEUSizeNumber(str) {
    if (!str) return null;
    const m = str.match(/(?:^|\b)eu\s*(\d{2})\b/i) || str.match(/\b(\d{2})\s*eu\b/i);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  // Extract US size number (e.g. US 8, 8 US)
  function extractUSSizeNumber(str) {
    if (!str) return null;
    const m = str.match(/(?:^|\b)us\s*(\d{1,2})\b/i) || str.match(/\b(\d{1,2})\s*us\b/i);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  // Conservative Women's W-size to Alpha conversion table
  function mapWomenWToAlpha(waistNum) {
    if (waistNum >= 23 && waistNum <= 26) return "XS";
    if (waistNum >= 27 && waistNum <= 28) return "S";
    if (waistNum >= 29 && waistNum <= 30) return "M";
    if (waistNum >= 31 && waistNum <= 32) return "L";
    if (waistNum >= 33 && waistNum <= 34) return "XL";
    if (waistNum >= 35 && waistNum <= 36) return "XXL";
    return null;
  }

  // Women's EU-size to Alpha conversion table
  function mapWomenEUToAlpha(euNum) {
    if (euNum === 32) return ["XXS", "XS"];
    if (euNum === 34) return ["XS"];
    if (euNum === 36) return ["S"];
    if (euNum === 38) return ["M"];
    if (euNum === 40) return ["L"];
    if (euNum === 42) return ["XL"];
    if (euNum === 44) return ["XXL"];
    return null;
  }

  // Women's US-size to Alpha conversion table
  function mapWomenUSToAlpha(usNum) {
    if (usNum >= 0 && usNum <= 2) return ["XS"];
    if (usNum >= 4 && usNum <= 6) return ["S"];
    if (usNum >= 8 && usNum <= 10) return ["M"];
    if (usNum >= 12 && usNum <= 14) return ["L"];
    if (usNum >= 16 && usNum <= 18) return ["XL"];
    return null;
  }

  // Get all visible candidate option elements inside an overlay
  function getVisibleOptionElements(overlayScope) {
    if (!overlayScope) return [];
    const optionSelectors = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[data-testid*="cell" i]',
      '[data-testid*="item" i]',
      '[data-testid*="option" i]',
      'div[class*="cell" i]',
      'div[class*="option" i]',
      'div[class*="item" i]',
      'li',
      'button',
      'label',
    ];

    const els = Array.from(overlayScope.querySelectorAll(optionSelectors.join(", ")));
    const unique = [];
    for (const el of els) {
      if (isElementVisible(el) && overlayScope.contains(el) && !unique.includes(el)) {
        unique.push(el);
      }
    }
    return unique;
  }

  // Find best matching size element in overlay based on exact match and gender conversion rules
  function findMatchingSizeElement(overlayScope, draftSize, draftGender, log) {
    if (!overlayScope || !draftSize) return null;

    const els = getVisibleOptionElements(overlayScope);
    const options = els
      .map((el) => ({ el, text: el.textContent?.trim() || "" }))
      .filter((o) => o.text.length > 0 && o.text.length < 100);

    if (log) {
      const sampleTexts = options.map((o) => o.text).slice(0, 15).join(" | ");
      log(`  📋 Size Overlay Optionen (${options.length}): ${sampleTexts}`);
    }

    const draftTrimmed = draftSize.trim();
    const draftLower = draftTrimmed.toLowerCase();
    const draftNorm = draftLower.replace(/[^a-z0-9]/g, "");

    // Pass 1: Exact text match or exact normalized alphanumeric match
    for (const opt of options) {
      const t = opt.text.toLowerCase();
      const tNorm = t.replace(/[^a-z0-9]/g, "");
      if (t === draftLower || (draftNorm.length > 0 && tNorm === draftNorm)) {
        return { element: opt.el, matchedText: opt.text, rule: "exact" };
      }
    }

    // Pass 2: Semantic Waist match
    const draftWaist = extractWaistNumber(draftTrimmed);
    if (draftWaist !== null) {
      const waistMatches = options.filter((o) => {
        const optWaist = extractWaistNumber(o.text);
        const optEU = extractEUSizeNumber(o.text);
        return optWaist === draftWaist && optEU === null;
      });

      if (waistMatches.length === 1) {
        return { element: waistMatches[0].el, matchedText: waistMatches[0].text, rule: "waist_exact" };
      } else if (waistMatches.length > 1) {
        const pureWaistMatches = waistMatches.filter((o) => !hasExplicitLength(o.text));
        if (pureWaistMatches.length === 1) {
          return { element: pureWaistMatches[0].el, matchedText: pureWaistMatches[0].text, rule: "waist_pure" };
        } else if (pureWaistMatches.length > 1) {
          return { ambiguous: true, reason: "Mehrere reine Waist-Größen vorhanden" };
        } else {
          if (hasExplicitLength(draftTrimmed)) {
            const lengthMatches = waistMatches.filter((o) => o.text.toLowerCase().includes(draftLower));
            if (lengthMatches.length === 1) {
              return { element: lengthMatches[0].el, matchedText: lengthMatches[0].text, rule: "waist_length" };
            }
          }
          return { ambiguous: true, reason: "Mehrere Größen mit gleicher Waist-Größe vorhanden" };
        }
      }
    }

    // Pass 3: Women's Fallback Conversions (Only if exact match / waist match NOT found and gender is Women)
    const genderNorm = normalizeGender(draftGender);
    if (genderNorm === "women") {
      // A) Women W-Size -> Alpha
      if (draftWaist !== null) {
        const alphaFallback = mapWomenWToAlpha(draftWaist);
        if (alphaFallback) {
          if (log) log(`  👩 Damen W-Größe W${draftWaist} -> Versuche Fallback-Alpha "${alphaFallback}"...`);
          const alphaMatch = options.find((o) => o.text.trim().toUpperCase() === alphaFallback);
          if (alphaMatch) {
            return {
              element: alphaMatch.el,
              matchedText: alphaMatch.text,
              rule: "women_w_to_alpha",
              alpha: alphaFallback,
            };
          } else {
            return { failedConversion: true, reason: "Keine sichere Größenentsprechung gefunden" };
          }
        }
      }

      // B) Women EU-Size -> Alpha
      const draftEU = extractEUSizeNumber(draftTrimmed) || (/^\d{2}$/.test(draftTrimmed) ? parseInt(draftTrimmed, 10) : null);
      if (draftEU) {
        const alphaList = mapWomenEUToAlpha(draftEU);
        const euMatch = options.find((o) => extractEUSizeNumber(o.text) === draftEU);
        if (euMatch) {
          return { element: euMatch.el, matchedText: euMatch.text, rule: "women_eu_exact" };
        }
        if (alphaList) {
          for (const alpha of alphaList) {
            const m = options.find((o) => o.text.trim().toUpperCase() === alpha);
            if (m) {
              return { element: m.el, matchedText: m.text, rule: "women_eu_to_alpha", alpha };
            }
          }
        }
      }

      // C) Women US-Size -> Alpha
      const draftUS = extractUSSizeNumber(draftTrimmed);
      if (draftUS) {
        const alphaList = mapWomenUSToAlpha(draftUS);
        const usMatch = options.find((o) => extractUSSizeNumber(o.text) === draftUS);
        if (usMatch) {
          return { element: usMatch.el, matchedText: usMatch.text, rule: "women_us_exact" };
        }
        if (alphaList) {
          for (const alpha of alphaList) {
            const m = options.find((o) => o.text.trim().toUpperCase() === alpha);
            if (m) {
              return { element: m.el, matchedText: m.text, rule: "women_us_to_alpha", alpha };
            }
          }
        }
      }
    }

    // Pass 4: Generic Alpha match (e.g. XS, S, M, L, XL, XXL)
    const draftUpper = draftTrimmed.toUpperCase();
    if (["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"].includes(draftUpper)) {
      const alphaMatch = options.find((o) => o.text.trim().toUpperCase() === draftUpper);
      if (alphaMatch) {
        return { element: alphaMatch.el, matchedText: alphaMatch.text, rule: "alpha_exact" };
      }
    }

    return null;
  }

  // Refactored Robust Size Selector Helper
  async function selectVintedSize(formContainer, draftSize, draftGender, log) {
    log(`Versuche Größe "${draftSize}" (Gender: ${draftGender || "nicht angegeben"}) zu setzen...`);

    if (!draftSize) {
      return { success: false, reason: "Kein Wert" };
    }

    const activeContainer = getFormContainer(log) || formContainer;
    const triggerEl = findInteractiveControlByUI(activeContainer, "size", FIELD_KEYWORDS.size, log);

    if (!triggerEl) {
      log(`✗ Trigger-Element für "size" nicht gefunden.`);
      return { success: false, reason: "Größe-Trigger nicht gefunden" };
    }

    const overlaysBefore = getAllVisibleOverlays();
    triggerEl.click();
    await delay(400);

    const overlayScope = getOverlayForTrigger(triggerEl, overlaysBefore, log);
    if (!overlayScope) {
      log(`✗ Kein geöffnetes Overlay für "size" gefunden.`);
      return { success: false, reason: "Größe-Overlay nicht geöffnet" };
    }

    log(`  🎯 Suche passende Größe in sichtbaren Optionen...`);
    let sizeMatch = findMatchingSizeElement(overlayScope, draftSize, draftGender, log);

    if (sizeMatch && sizeMatch.ambiguous) {
      log(`✗ Abbruch: ${sizeMatch.reason}`);
      await closeOverlaySafely(overlayScope);
      return { success: false, reason: sizeMatch.reason };
    }

    if (sizeMatch && sizeMatch.failedConversion) {
      log(`✗ Abbruch: ${sizeMatch.reason}`);
      await closeOverlaySafely(overlayScope);
      return { success: false, reason: sizeMatch.reason };
    }

    // Fallback: If no match found, check if overlay contains a strict search input
    if (!sizeMatch || !sizeMatch.element) {
      const strictSearchInput = overlayScope.querySelector(
        'input[type="search"], input[placeholder*="suchen" i], input[placeholder*="search" i], input[data-testid*="search" i], input[aria-label*="suchen" i], input[aria-label*="search" i]'
      );

      if (strictSearchInput && isSafeInteractiveElement(strictSearchInput)) {
        const draftWaist = extractWaistNumber(draftSize);
        const searchTerm = draftWaist !== null ? String(draftWaist) : draftSize;
        log(`  🔍 Suche im Größe-Modal nach: "${searchTerm}"`);
        strictSearchInput.focus();
        setNativeInputValue(strictSearchInput, searchTerm);
        await delay(400);

        sizeMatch = findMatchingSizeElement(overlayScope, draftSize, draftGender, log);
      }
    }

    if (sizeMatch && sizeMatch.element) {
      const clickableEl = resolveClickableOption(sizeMatch.element, overlayScope);
      if (!clickableEl) {
        log(`✗ Klickbares Element für Größe-Option "${sizeMatch.matchedText}" konnte nicht aufgelöst werden.`);
        await closeOverlaySafely(overlayScope);
        return { success: false, reason: "Kein klickbares Element für Größe gefunden" };
      }

      log(`  ✓ Größe-Option gematcht: "${sizeMatch.matchedText}" (Regel: ${sizeMatch.rule}). Klicke Element...`);
      clickableEl.click();
      await delay(400);

      const remainingOverlay = getOpenOverlayScope();
      if (remainingOverlay) {
        await closeOverlaySafely(remainingOverlay);
      }

      // Verification
      const freshContainer = getFormContainer(log);
      const expectedValues = [
        sizeMatch.matchedText,
        sizeMatch.alpha,
        draftSize,
      ].filter(Boolean);

      const verified = verifyFieldValue(
        findInteractiveControlByUI(freshContainer, "size", FIELD_KEYWORDS.size, log) || triggerEl,
        expectedValues,
        log
      );

      if (verified) {
        log(`✓ Größe "${sizeMatch.matchedText || draftSize}" erfolgreich gesetzt und im Formular verifiziert.`);
        return { success: true };
      } else {
        log(`✗ Größe "${sizeMatch.matchedText || draftSize}" geklickt, aber nicht im Formular verifiziert.`);
        return { success: false, reason: "Auswahl geklickt, aber nicht im Formular bestätigt" };
      }
    }

    log(`✗ Keine passende Option für Größe "${draftSize}" gefunden.`);
    await closeOverlaySafely(overlayScope);
    return { success: false, reason: `Option "${draftSize}" nicht in Auswahlliste gefunden` };
  }

  // Find matching option element ONLY within open overlay scope
  function findMatchingOptionInOverlay(overlayScope, desiredValueOrSynonyms) {
    if (!overlayScope || !desiredValueOrSynonyms) return null;

    const candidates = Array.isArray(desiredValueOrSynonyms)
      ? desiredValueOrSynonyms.map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [desiredValueOrSynonyms.trim().toLowerCase()];

    const optionSelectors = [
      '[role="option"]',
      '[role="menuitem"]',
      '[role="treeitem"]',
      '[data-testid*="cell" i]',
      '[data-testid*="item" i]',
      '[data-testid*="option" i]',
      'div[class*="cell" i]',
      'div[class*="option" i]',
      'div[class*="item" i]',
      'li',
      'button',
      'label',
      'span',
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

    // Pass 2: Normalized size/alphanumeric match (e.g., "W36", "36", "36/32", "W36 / L32")
    for (const opt of optionEls) {
      if (!isSafeInteractiveElement(opt)) continue;
      if (!overlayScope.contains(opt)) continue;

      const text = opt.textContent?.trim().toLowerCase() || "";
      const textNorm = text.replace(/[^a-z0-9]/g, "");
      for (const targetLower of candidates) {
        const targetNorm = targetLower.replace(/[^a-z0-9]/g, "");
        if (targetNorm.length > 0 && textNorm === targetNorm) {
          return opt;
        }
      }
    }

    // Pass 3: Substring match
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

    let genderSynonyms = CATEGORY_SYNONYMS.herren;
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

  // Check if category is visibly confirmed as selected value in sales form
  function isCategoryConfirmedInForm(formContainer, expectedLeafSynonyms, log, finalLeafClicked = false) {
    const root = formContainer || document.querySelector("main") || document.body;
    const syns = Array.isArray(expectedLeafSynonyms)
      ? expectedLeafSynonyms.map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [expectedLeafSynonyms.trim().toLowerCase()];

    if (finalLeafClicked) {
      if (log) log(`✓ Kategorie Leaf wurde geklickt. Strukturell als akzeptiert gewertet.`);
      return true;
    }

    const interactiveControls = getInteractiveControls(root);
    for (const ctrl of interactiveControls) {
      const ctx = getControlTextContext(ctrl);

      for (const target of syns) {
        if (
          ctx.ownText.toLowerCase().includes(target) ||
          ctx.value.toLowerCase().includes(target) ||
          ctx.ariaLabel.toLowerCase().includes(target) ||
          ctx.parentText.toLowerCase().includes(target)
        ) {
          if (log) log(`✓ Kategorie "${target}" im Formular-Control/Wrapper verifiziert (Text="${ctx.ownText || ctx.parentText.slice(0, 60)}")`);
          return true;
        }
      }
    }

    const rootText = root.textContent?.toLowerCase() || "";
    for (const target of syns) {
      if (rootText.includes(target)) {
        if (log) log(`✓ Kategorie "${target}" im Verkaufsformular-Text gefunden.`);
        return true;
      }
    }

    if (log) log(`✗ Kategorie konnte im aktuellen Verkaufsformular NICHT als ausgewählter Wert ("${syns.join('/')}") verifiziert werden.`);
    return false;
  }

  // Verify generic field value after selection
  function verifyFieldValue(triggerEl, expectedSynonyms, log) {
    if (!triggerEl || !expectedSynonyms) return false;
    const candidates = Array.isArray(expectedSynonyms)
      ? expectedSynonyms.map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [expectedSynonyms.trim().toLowerCase()];

    let container = triggerEl;
    for (let depth = 0; depth < 3 && container; depth++) {
      const text = container.textContent?.trim().toLowerCase() || "";
      const inputs = Array.from(container.querySelectorAll("input, select, textarea"));
      const inputValues = inputs.map((i) => i.value?.trim().toLowerCase()).filter(Boolean);
      const ariaLabel = container.getAttribute?.("aria-label")?.trim().toLowerCase() || "";
      const testId = container.getAttribute?.("data-testid")?.trim().toLowerCase() || "";

      for (const targetLower of candidates) {
        if (
          text.includes(targetLower) ||
          inputValues.some((v) => v.includes(targetLower)) ||
          ariaLabel.includes(targetLower) ||
          testId.includes(targetLower)
        ) {
          return true;
        }
      }
      container = container.parentElement;
    }

    return false;
  }

  // Refactored Category Selector Helper
  async function selectVintedCategory(formContainer, draftCategory, draftGender, log) {
    const pageLang = detectVintedLanguage();
    log(`Versuche Kategorie "${draftCategory}" zu setzen (Erkannte Sprache: ${pageLang.toUpperCase()})...`);

    const root = formContainer || getFormContainer(log);
    const triggerEl = findInteractiveControlByUI(root, "category", FIELD_KEYWORDS.category, log);

    if (!triggerEl) {
      log("✗ Kategorie-Trigger im Formular nicht gefunden.");
      return { success: false, reason: "Kategorie-Trigger nicht gefunden" };
    }

    triggerEl.click();
    await delay(400);

    let overlayScope = getOpenOverlayScope();
    if (!overlayScope) {
      log("✗ Kein geöffnetes Kategorie-Modal/Overlay gefunden.");
      return { success: false, reason: "Kategorie-Overlay nicht geöffnet" };
    }

    const categoryPath = getCategoryPathSequence(draftCategory, draftGender);
    const leafSynonyms = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1] : [draftCategory];

    log(`  🎯 Priorität 1: Versuche Zielkategorie "${draftCategory}" direkt auszuwählen oder zu suchen...`);

    let directOption = findMatchingOptionInOverlay(overlayScope, leafSynonyms);

    if (!directOption) {
      const searched = await handleOverlaySearchInput(overlayScope, draftCategory, log);
      if (searched) {
        await delay(300);
        overlayScope = getOpenOverlayScope() || overlayScope;
        directOption = findMatchingOptionInOverlay(overlayScope, leafSynonyms);
      }
    }

    let finalLeafClicked = false;

    if (directOption) {
      const optionText = directOption.textContent?.trim() || draftCategory;
      log(`  ✓ Zielkategorie direkt gefunden und geklickt: "${optionText}"`);
      directOption.click();
      finalLeafClicked = true;
      await delay(600); // Wait for React re-render
    } else {
      log(`  Hierarchy: Durchlaufe hierarchische Pfad-Schritte...`);

      for (let i = 0; i < categoryPath.length; i++) {
        const currentStepSynonyms = categoryPath[i];
        overlayScope = getOpenOverlayScope();

        if (!overlayScope) break;

        const leafOption = findMatchingOptionInOverlay(overlayScope, leafSynonyms);
        if (leafOption) {
          const leafText = leafOption.textContent?.trim() || draftCategory;
          log(`  ✓ Zielkategorie im Modal gefunden und geklickt: "${leafText}"`);
          leafOption.click();
          finalLeafClicked = true;
          await delay(600);
          break;
        }

        let matchedOption = findMatchingOptionInOverlay(overlayScope, currentStepSynonyms);
        if (matchedOption) {
          const optionText = matchedOption.textContent?.trim() || currentStepSynonyms[0];
          log(`  ✓ Kategorie-Schritt ${i + 1}/${categoryPath.length}: "${optionText}" geklickt`);
          matchedOption.click();
          if (i === categoryPath.length - 1) {
            finalLeafClicked = true;
          }
          await delay(600);
        } else {
          log(`  ℹ Kategorie-Schritt ${i + 1}/${categoryPath.length} ("${currentStepSynonyms.join('/')}") nicht im Modal vorhanden.`);
        }
      }
    }

    const remainingOverlay = getOpenOverlayScope();
    if (remainingOverlay) {
      await closeOverlaySafely(remainingOverlay);
    }

    // Wait for React re-render and verify category confirmation in main sales form
    await delay(300);
    const freshRoot = getFormContainer(log) || root;
    const verified = isCategoryConfirmedInForm(freshRoot, leafSynonyms, log, finalLeafClicked);

    if (verified) {
      log(`✓ Kategorie-Auswahl für "${draftCategory}" erfolgreich abgeschlossen und im Formular verifiziert.`);
      return { success: true };
    }

    log(`✗ Kategorie-Auswahl für "${draftCategory}" gescheitert. Nicht im Formular verifiziert.`);
    return {
      success: false,
      reason: `Kategorie "${draftCategory}" nicht im Formular als ausgewählter Wert verifiziert`,
    };
  }

  // Refactored Robust Color Selector Helper
  async function selectVintedColor(formContainer, draftColor, log) {
    log(`Versuche Farbe "${draftColor}" zu setzen...`);

    if (!draftColor) {
      return { success: false, reason: "Kein Wert" };
    }

    const activeContainer = getFormContainer(log) || formContainer;
    const triggerEl = findInteractiveControlByUI(activeContainer, "color", FIELD_KEYWORDS.color, log);

    if (!triggerEl) {
      log(`✗ Trigger-Element für "color" nicht gefunden.`);
      return { success: false, reason: "Farbe-Trigger nicht gefunden" };
    }

    const overlaysBefore = getAllVisibleOverlays();
    triggerEl.click();
    await delay(400);

    const overlayScope = getOverlayForTrigger(triggerEl, overlaysBefore, log);
    if (!overlayScope) {
      log(`✗ Kein geöffnetes Overlay für "color" gefunden.`);
      return { success: false, reason: "Farbe-Overlay nicht geöffnet" };
    }

    const valLower = draftColor.trim().toLowerCase();
    let colorSynonyms = COLOR_SYNONYMS[valLower] || [draftColor.trim()];

    const els = getVisibleOptionElements(overlayScope);
    const options = els
      .map((el) => ({ el, text: el.textContent?.trim() || "" }))
      .filter((o) => o.text.length > 0 && o.text.length < 100);

    if (log) {
      const sampleTexts = options.map((o) => o.text).slice(0, 15).join(" | ");
      log(`  📋 Farbe Overlay Optionen (${options.length}): ${sampleTexts}`);
      log(`  🎯 Ziel-Synonyme für Farbe: ${colorSynonyms.join(", ")}`);
    }

    let matchedOption = null;

    // Pass 1: Exact text match with color synonyms
    for (const syn of colorSynonyms) {
      const synLower = syn.trim().toLowerCase();
      for (const opt of options) {
        const optLower = opt.text.toLowerCase();
        if (optLower === synLower) {
          matchedOption = { el: opt.el, text: opt.text, rule: "exact" };
          break;
        }
      }
      if (matchedOption) break;
    }

    // Pass 2: Word boundary prefix/contains match, avoiding bad overlap (e.g. "Blau" matching "Hellblau" or "Dunkelblau")
    if (!matchedOption) {
      for (const syn of colorSynonyms) {
        const synLower = syn.trim().toLowerCase();
        for (const opt of options) {
          const optLower = opt.text.toLowerCase();

          // Strict guard: if target is "blau" / "blue", exclude "hellblau" and "dunkelblau"
          if (synLower === "blau" || synLower === "blue" || synLower === "bleu" || synLower === "blu") {
            if (
              optLower.includes("hell") ||
              optLower.includes("dunkel") ||
              optLower.includes("light") ||
              optLower.includes("dark") ||
              optLower.includes("navy") ||
              optLower.includes("marine") ||
              optLower.includes("clair")
            ) {
              continue;
            }
          }

          const regex = new RegExp(`(?:^|\\b)${CSS.escape(synLower)}(?:$|\\b)`, "i");
          if (regex.test(optLower)) {
            matchedOption = { el: opt.el, text: opt.text, rule: "word_boundary" };
            break;
          }
        }
        if (matchedOption) break;
      }
    }

    if (matchedOption && matchedOption.el) {
      const clickableEl = resolveClickableOption(matchedOption.el, overlayScope);
      if (!clickableEl) {
        log(`✗ Klickbares Element für Farbe-Option "${matchedOption.text}" konnte nicht aufgelöst werden.`);
        await closeOverlaySafely(overlayScope);
        return { success: false, reason: "Kein klickbares Element für Farbe gefunden" };
      }

      log(`  ✓ Farbe-Option gematcht: "${matchedOption.text}" (Regel: ${matchedOption.rule}). Klicke Element...`);
      clickableEl.click();
      await delay(400);

      // Look for confirm button strictly within THIS color overlay Scope
      const confirmBtn = Array.from(overlayScope.querySelectorAll('button, [role="button"]')).find((b) => {
        if (!isSafeInteractiveElement(b)) return false;
        const bt = b.textContent?.trim().toLowerCase() || "";
        return ["fertig", "done", "anwenden", "apply", "bestätigen", "confirm"].includes(bt);
      });

      if (confirmBtn) {
        log(`  ✓ Bestätigungs-Button im Farb-Overlay geklickt ("${confirmBtn.textContent?.trim()}")`);
        confirmBtn.click();
        await delay(400);
      }

      const remainingOverlay = getOpenOverlayScope();
      if (remainingOverlay) {
        await closeOverlaySafely(remainingOverlay);
      }

      // Verification
      const freshContainer = getFormContainer(log);
      const verified = verifyFieldValue(
        findInteractiveControlByUI(freshContainer, "color", FIELD_KEYWORDS.color, log) || triggerEl,
        colorSynonyms,
        log
      );

      if (verified) {
        log(`✓ Farbe "${matchedOption.text || draftColor}" erfolgreich gesetzt und im Formular verifiziert.`);
        return { success: true };
      } else {
        log(`✗ Farbe "${matchedOption.text || draftColor}" geklickt, aber nicht im Formular verifiziert.`);
        return { success: false, reason: "Auswahl geklickt, aber nicht im Formular bestätigt" };
      }
    }

    log(`✗ Keine passende Option für Farbe "${draftColor}" in Auswahlliste gefunden.`);
    await closeOverlaySafely(overlayScope);
    return { success: false, reason: `Option "${draftColor}" nicht in Auswahlliste gefunden` };
  }

  // Refactored Robust Condition Selector Helper
  async function selectVintedCondition(formContainer, draftCondition, log) {
    log(`Versuche Zustand "${draftCondition}" zu setzen...`);

    if (!draftCondition) {
      return { success: false, reason: "Kein Wert" };
    }

    const activeContainer = getFormContainer(log) || formContainer;
    const triggerEl = findInteractiveControlByUI(activeContainer, "condition", FIELD_KEYWORDS.condition, log);

    if (!triggerEl) {
      log(`✗ Trigger-Element für "condition" nicht gefunden.`);
      return { success: false, reason: "Zustand-Trigger nicht gefunden" };
    }

    const overlaysBefore = getAllVisibleOverlays();
    triggerEl.click();
    await delay(400);

    const overlayScope = getOverlayForTrigger(triggerEl, overlaysBefore, log);
    if (!overlayScope) {
      log(`✗ Kein geöffnetes Overlay für "condition" gefunden.`);
      return { success: false, reason: "Zustand-Overlay nicht geöffnet" };
    }

    const valLower = draftCondition.trim().toLowerCase();
    let conditionSynonyms = CONDITION_SYNONYMS[valLower] || [draftCondition.trim()];

    const els = getVisibleOptionElements(overlayScope);
    const options = els
      .map((el) => ({ el, text: el.textContent?.trim() || "" }))
      .filter((o) => o.text.length > 0 && o.text.length < 150);

    if (log) {
      const sampleTexts = options.map((o) => o.text).slice(0, 15).join(" | ");
      log(`  📋 Zustand Overlay Optionen (${options.length}): ${sampleTexts}`);
      log(`  🎯 Ziel-Synonyme für Zustand: ${conditionSynonyms.join(", ")}`);
    }

    let matchedOption = null;

    // Pass 1: Exact text match
    for (const syn of conditionSynonyms) {
      const synLower = syn.trim().toLowerCase();
      for (const opt of options) {
        const optLower = opt.text.toLowerCase();
        if (optLower === synLower) {
          matchedOption = { el: opt.el, text: opt.text, rule: "exact" };
          break;
        }
      }
      if (matchedOption) break;
    }

    // Pass 2: Desired condition at text start with clean word boundary (e.g. "Sehr gut - wenig getragen")
    if (!matchedOption) {
      for (const syn of conditionSynonyms) {
        const synLower = syn.trim().toLowerCase();

        for (const opt of options) {
          const optLower = opt.text.toLowerCase();

          // Strict guard: If target is "Gut" or "Good", exclude "Sehr gut" or "Very good"!
          if (synLower === "gut" || synLower === "good" || synLower === "bon état" || synLower === "buone condizioni") {
            if (optLower.includes("sehr") || optLower.includes("very") || optLower.includes("très") || optLower.includes("ottime")) {
              continue;
            }
          }

          const regex = new RegExp(`^\\s*${CSS.escape(synLower)}(?:$|[\\s\\.,\\-\\:\\/])`, "i");
          if (regex.test(optLower)) {
            matchedOption = { el: opt.el, text: opt.text, rule: "prefix_boundary" };
            break;
          }
        }
        if (matchedOption) break;
      }
    }

    if (matchedOption && matchedOption.el) {
      const clickableEl = resolveClickableOption(matchedOption.el, overlayScope);
      if (!clickableEl) {
        log(`✗ Klickbares Element für Zustand-Option "${matchedOption.text}" konnte nicht aufgelöst werden.`);
        await closeOverlaySafely(overlayScope);
        return { success: false, reason: "Kein klickbares Element für Zustand gefunden" };
      }

      log(`  ✓ Zustand-Option gematcht: "${matchedOption.text}" (Regel: ${matchedOption.rule}). Klicke Element...`);
      clickableEl.click();
      await delay(400);

      const remainingOverlay = getOpenOverlayScope();
      if (remainingOverlay) {
        await closeOverlaySafely(remainingOverlay);
      }

      // Verification
      const freshContainer = getFormContainer(log);
      const verified = verifyFieldValue(
        findInteractiveControlByUI(freshContainer, "condition", FIELD_KEYWORDS.condition, log) || triggerEl,
        conditionSynonyms,
        log
      );

      if (verified) {
        log(`✓ Zustand "${matchedOption.text || draftCondition}" erfolgreich gesetzt und im Formular verifiziert.`);
        return { success: true };
      } else {
        log(`✗ Zustand "${matchedOption.text || draftCondition}" geklickt, aber nicht im Formular verifiziert.`);
        return { success: false, reason: "Auswahl geklickt, aber nicht im Formular bestätigt" };
      }
    }

    log(`✗ Keine passende Option für Zustand "${draftCondition}" in Auswahlliste gefunden.`);
    await closeOverlaySafely(overlayScope);
    return { success: false, reason: `Option "${draftCondition}" nicht in Auswahlliste gefunden` };
  }

  // Single Dropdown Option Selector Helper (Brand)
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
        return { success: false, reason: "Kein Wert" };
      }

      const activeContainer = getFormContainer(log) || formContainer;
      const triggerEl = findInteractiveControlByUI(activeContainer, fieldName, fieldKeywords, log);

      if (!triggerEl) {
        log(`✗ Dropdown-Element für "${fieldName}" nicht gefunden.`);
        return { success: false, reason: `Dropdown-Element für "${fieldName}" nicht gefunden` };
      }

      const overlaysBefore = getAllVisibleOverlays();
      triggerEl.click();
      await delay(400);

      const overlayScope = getOverlayForTrigger(triggerEl, overlaysBefore, log);
      if (!overlayScope) {
        log(`✗ Kein geöffnetes Dropdown/Modal für "${fieldName}" gefunden.`);
        return { success: false, reason: `Overlay für "${fieldName}" nicht geöffnet` };
      }

      if (fieldName === "brand") {
        await handleOverlaySearchInput(overlayScope, desiredValue, log);
      }

      let desiredSynonyms = [desiredValue, desiredValue.toLowerCase(), desiredValue.toUpperCase()];

      let matchedOption = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        matchedOption = findMatchingOptionInOverlay(overlayScope, desiredSynonyms);
        if (matchedOption) break;
        await delay(200);
      }

      if (matchedOption) {
        const optionText = matchedOption.textContent?.trim() || desiredValue;
        const clickableEl = resolveClickableOption(matchedOption, overlayScope) || matchedOption;
        clickableEl.click();
        await delay(400);

        let remainingOverlay = getOpenOverlayScope();
        if (remainingOverlay) {
          const confirmBtn = remainingOverlay.querySelector(
            'button[type="submit"], button[data-testid*="submit" i], button[data-testid*="confirm" i], button[data-testid*="done" i], button[data-testid*="apply" i]'
          ) || Array.from(remainingOverlay.querySelectorAll('button, [role="button"]')).find((b) => {
            const bt = b.textContent?.trim().toLowerCase() || "";
            return ["fertig", "done", "anwenden", "speichern", "anzeigen", "bestätigen", "confirm", "apply"].includes(bt);
          });

          if (confirmBtn && isSafeInteractiveElement(confirmBtn)) {
            if (log) log(`  ✓ Bestätigungs-Button im Dropdown geklickt ("${confirmBtn.textContent?.trim()}")`);
            confirmBtn.click();
            await delay(400);
          }

          remainingOverlay = getOpenOverlayScope();
          if (remainingOverlay) {
            await closeOverlaySafely(remainingOverlay);
          }
        }

        const freshContainer = getFormContainer(log);
        const verified = verifyFieldValue(
          findInteractiveControlByUI(freshContainer, fieldName, fieldKeywords, log) || triggerEl,
          desiredSynonyms,
          log
        );

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

    // 3. Fill Price (Isolated Price Debugging)
    try {
      log(`[Price Debug] draft.price=${draft.price}`);
      if (draft.price !== undefined && draft.price !== null && draft.price !== "") {
        const priceVal = String(draft.price);
        const priceEl = findInputField(
          formContainer,
          ["price", "preis", "amount", "wert", "cost", "value", "prix", "prezzo", "precio", "prijs", "0,00", "0.00", "€"],
          log
        );
        if (priceEl) {
          setNativeInputValue(priceEl, priceVal);
          results.price = { success: true };
          log(`✓ Preis eingefügt: ${priceVal} €`);
        } else {
          // Fallback: look for input[type="number"] or input with name/id containing price or near €
          const priceFallback = formContainer.querySelector('input[name*="price" i], input[id*="price" i], input[data-testid*="price" i], input[placeholder*="0,00"], input[placeholder*="0.00"]');
          if (priceFallback && isSafeInteractiveElement(priceFallback)) {
            setNativeInputValue(priceFallback, priceVal);
            results.price = { success: true };
            log(`✓ Preis über Fallback-Input eingefügt: ${priceVal} €`);
          } else {
            results.price = { success: false, reason: "Feld nicht gefunden" };
            log("✗ Preis-Feld nicht gefunden");
          }
        }
      } else {
        results.price = { success: false, reason: "Kein Preis angegeben" };
        log(`ℹ Kein Preis im Draft/Payload vorhanden (draft.price=${draft.price}). Kein erfundener Preis eingesetzt.`);
      }
    } catch (e) {
      results.price = { success: false, reason: e.message };
      log(`✗ Fehler bei Preis: ${e.message}`);
    }

    // 4. Record initial count of interactive controls before category selection
    const initialControlCount = getInteractiveControls(formContainer).length;

    // 5. Category Selection FIRST & RELIABLY
    if (draft.category) {
      results.category = await selectVintedCategory(
        formContainer,
        draft.category,
        draft.gender,
        log
      );
    } else {
      results.category = { success: false, reason: "Kein Kategorie-Wert" };
    }

    // Handle category confirmation status and proceed with dependent fields
    if (!results.category.success) {
      log("⚠️ Warnung: Kategorie konnte im Verkaufsformular nicht unmittelbar verifiziert werden. Versuche abhängige Felder trotzdem...");
      await delay(400);
    }

    const activeRoot = getFormContainer(log);
    await waitForNewControls(activeRoot, initialControlCount, log);

    // Output debug log for up to 30 visible interactive controls
    debugInteractiveControls(activeRoot, log);

    // Dependent fields strictly mapped via visible UI text and order
    if (draft.brand) {
      results.brand = await selectVintedOption(
        getFormContainer(log),
        "brand",
        FIELD_KEYWORDS.brand,
        draft.brand,
        log
      );
    } else {
      results.brand = { success: false, reason: "Kein Wert" };
    }

    if (draft.size) {
      results.size = await selectVintedSize(
        getFormContainer(log),
        draft.size,
        draft.gender,
        log
      );
    } else {
      results.size = { success: false, reason: "Kein Wert" };
    }

    if (draft.color) {
      results.color = await selectVintedColor(
        getFormContainer(log),
        draft.color,
        log
      );
    } else {
      results.color = { success: false, reason: "Kein Wert" };
    }

    if (draft.condition) {
      results.condition = await selectVintedCondition(
        getFormContainer(log),
        draft.condition,
        log
      );
    } else {
      results.condition = { success: false, reason: "Kein Wert" };
    }

    // If category was previously unconfirmed, but at least one dependent field succeeded,
    // Vinted has accepted the category! Update category success status.
    if (
      !results.category.success &&
      (results.brand.success || results.size.success || results.color.success || results.condition.success)
    ) {
      log("✓ Mindestens ein kategorieabhängiges Feld war erfolgreich. Kategorie nachträglich als erfolgreich verifiziert!");
      results.category = { success: true };
    }

    // 6. Fill Images (Preserved completely unchanged)
    try {
      if (draft.images && draft.images.length > 0) {
        const totalDraftImages = draft.images.length;
        const validDataUrlImages = draft.images.filter(
          (img) => img.dataUrl && (img.dataUrl.startsWith("data:") || img.dataUrl.startsWith("http"))
        ).length;

        log(`${totalDraftImages} Bilder, ${validDataUrlImages} gültige Bildquellen empfangen.`);

        const activeForm = getFormContainer(log);
        const fileInput = activeForm.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');

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
