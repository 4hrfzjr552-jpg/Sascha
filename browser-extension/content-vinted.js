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

  // Main Form Filling Controller
  async function fillVintedForm(draft, debugMode) {
    const logs = [];
    const log = (msg) => {
      console.log(`[SaschaAI-Vinted] ${msg}`);
      logs.push(msg);
    };

    log(`Starte das Befüllen für Entwurf: "${draft.title || draft.artikelnummer}"`);

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
        const titleEl = findInputField(["title", "titel", "heading", "name"]);
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
        const descEl = findTextareaField([
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
        const priceEl = findInputField([
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
      results.category = await selectVintedOption(
        "category",
        ["kategorie", "category"],
        draft.category,
        log
      );
    } else {
      results.category = { success: false, reason: "Kein Wert" };
    }

    if (draft.brand) {
      results.brand = await selectVintedOption(
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
        "condition",
        ["zustand", "condition"],
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
        const fileInput = document.querySelector('input[type="file"]');

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

            // Try setting files on input
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

  // Robust Input Finder
  function findInputField(keywords) {
    // 1. Check exact/partial name or id attributes
    for (const kw of keywords) {
      const el = document.querySelector(
        `input[name*="${kw}" i], input[id*="${kw}" i], input[data-testid*="${kw}" i], input[placeholder*="${kw}" i]`
      );
      if (el && isElementVisible(el)) return el;
    }

    // 2. Check labels with matching text
    const inputs = Array.from(document.querySelectorAll("input"));
    for (const input of inputs) {
      if (!isElementVisible(input)) continue;

      // Label element
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label && matchesKeywords(label.textContent, keywords)) {
          return input;
        }
      }

      // Parent label/container
      let parent = input.parentElement;
      for (let depth = 0; depth < 3 && parent; depth++) {
        if (matchesKeywords(parent.textContent, keywords)) {
          return input;
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  // Robust Textarea Finder
  function findTextareaField(keywords) {
    for (const kw of keywords) {
      const el = document.querySelector(
        `textarea[name*="${kw}" i], textarea[id*="${kw}" i], textarea[data-testid*="${kw}" i], textarea[placeholder*="${kw}" i]`
      );
      if (el && isElementVisible(el)) return el;
    }

    const textareas = Array.from(document.querySelectorAll("textarea"));
    for (const ta of textareas) {
      if (!isElementVisible(ta)) continue;
      let parent = ta.parentElement;
      for (let depth = 0; depth < 3 && parent; depth++) {
        if (matchesKeywords(parent.textContent, keywords)) {
          return ta;
        }
        parent = parent.parentElement;
      }
    }

    return null;
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

  function matchesKeywords(text, keywords) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  // Robust Dropdown Selector Helper
  async function selectVintedOption(fieldName, fieldKeywords, desiredValue, log) {
    log(`Versuche Dropdown "${fieldName}" auf "${desiredValue}" zu setzen...`);

    try {
      if (!desiredValue) {
        return { success: false, reason: "Kein Zielwert angegeben" };
      }

      // 1. Find trigger container or element for the dropdown
      let triggerEl = null;

      // Find by selector or label matching
      for (const kw of fieldKeywords) {
        triggerEl = document.querySelector(
          `[data-testid*="${kw}" i], [name*="${kw}" i], [id*="${kw}" i], [aria-label*="${kw}" i]`
        );
        if (triggerEl && isElementVisible(triggerEl)) break;
      }

      if (!triggerEl) {
        // Search visible text/labels
        const candidates = Array.from(
          document.querySelectorAll("button, div[role='button'], input, label, div")
        );

        for (const cand of candidates) {
          if (!isElementVisible(cand)) continue;
          const txt = cand.textContent?.trim() || "";
          if (matchesKeywords(txt, fieldKeywords) && txt.length < 50) {
            triggerEl = cand;
            break;
          }
        }
      }

      if (!triggerEl) {
        log(`✗ Dropdown-Element für "${fieldName}" nicht gefunden.`);
        return { success: false, reason: "Dropdown-Element nicht gefunden" };
      }

      // 2. Open Dropdown
      triggerEl.click();
      triggerEl.focus?.();
      await delay(300);

      // 3. Search options menu for matching option
      const targetLower = desiredValue.trim().toLowerCase();
      let matchedOption = null;

      // Wait briefly for popup menu items
      for (let attempt = 0; attempt < 5; attempt++) {
        const optionEls = Array.from(
          document.querySelectorAll(
            '[role="option"], [role="menuitem"], li, button, div[class*="option" i], div[class*="item" i]'
          )
        );

        for (const opt of optionEls) {
          if (!isElementVisible(opt)) continue;
          const optText = opt.textContent?.trim().toLowerCase() || "";

          // Exact match or clean substring match
          if (optText === targetLower || (optText.length < 40 && optText.includes(targetLower))) {
            matchedOption = opt;
            break;
          }
        }

        if (matchedOption) break;
        await delay(200);
      }

      if (matchedOption) {
        matchedOption.click();
        await delay(200);
        log(`✓ Dropdown "${fieldName}" auf "${desiredValue}" gesetzt.`);
        return { success: true };
      } else {
        log(`✗ Keine eindeutige Option für "${desiredValue}" in Dropdown "${fieldName}" gefunden.`);
        // Close dropdown if opened, avoid clicking random incorrect option
        document.body.click();
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
})();
