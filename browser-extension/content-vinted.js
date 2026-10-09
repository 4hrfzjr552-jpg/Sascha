// Sascha AI → Vinted: independent form engine v2 (Chrome / Manifest V3).
// Uses local labels and accessibility semantics, not page-wide text guesses.
(() => {
  "use strict";
  if (window.__saschaVintedV2) return;
  window.__saschaVintedV2 = true;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const norm = value => String(value ?? "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const aliases = {
    title: ["titel", "title", "artikelbezeichnung"],
    description: ["beschreibung", "description", "beschreibe deinen artikel"],
    price: ["preis", "price", "artikelpreis"],
    category: ["kategorie", "category"],
    brand: ["marke", "brand"],
    size: ["größe", "große", "size"],
    color: ["farbe", "color", "colour"],
    condition: ["zustand", "condition", "artikelzustand"]
  };
  const values = {
    condition: {
      "neu mit etikett": ["new with tags", "neu mit etikett"],
      "neu ohne etikett": ["new without tags", "neu ohne etikett"],
      "sehr gut": ["very good", "sehr gut"],
      "gut": ["good", "gut"],
      "zufriedenstellend": ["satisfactory", "fair", "zufriedenstellend"]
    },
    color: {
      "hellblau": ["light blue", "hellblau"],
      "blau": ["blue", "blau"],
      "dunkelblau": ["dark blue", "navy", "dunkelblau"],
      "schwarz": ["black", "schwarz"],
      "weiß": ["white", "weiss", "weiß"],
      "grau": ["grey", "gray", "grau"],
      "beige": ["beige"], "braun": ["brown", "braun"],
      "grun": ["green", "grün"], "rot": ["red", "rot"]
    }
  };
  const shown = el => {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" &&
      el.getClientRects().length > 0 && !el.closest("[inert]");
  };
  const ignore = el => el.closest("header, footer, nav, [role=navigation]");
  const labelText = el => norm(el?.innerText || el?.textContent);
  const cleanFieldLabel = value => norm(value).replace(/[:*]+$/, "").trim();
  const fieldLabelMatches = (text,field) => aliases[field].some(a => cleanFieldLabel(text) === norm(a));
  const logSnapshot = (log,field,root) => {
    const candidates = Array.from(root.querySelectorAll("label, input, select, [role=combobox], [aria-haspopup]"))
      .filter(shown).slice(0,30).map(el => ({
        tag:el.tagName.toLowerCase(), text:labelText(el).slice(0,45),
        id:el.id || "", name:el.getAttribute("name") || "",
        testid:el.getAttribute("data-testid") || "",
        aria:el.getAttribute("aria-label") || ""
      }));
    log("[DIAG " + field + "] " + JSON.stringify(candidates));
  };
  function setInput(el,value) {
    el.focus();
    const prototype = el instanceof HTMLTextAreaElement ?
      HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype,"value")?.set;
    if (setter) setter.call(el,String(value)); else el.value = String(value);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  function rootForm() {
    return document.querySelector("main") || document.querySelector("form") || document.body;
  }
  function findFieldRoot(field,log) {
    const root = rootForm();
    const names = aliases[field].map(norm);
    const query = "input, textarea, select, button, [role=combobox], [aria-haspopup], [data-testid]";
    const matched = el => {
      const attributes = ["name","id","data-testid","aria-label","placeholder"].map(a=>norm(el.getAttribute(a)));
      return attributes.some(a => names.some(n => a===n || a.startsWith(n+"-") || a.startsWith(n+"_")));
    };
    const elements = Array.from(root.querySelectorAll(query))
      .filter(el => shown(el) && !ignore(el));
    // Inputs always win over wrapper/label testids. The former code selected
    // <label data-testid="title"> instead of <input id="title">.
    for (const el of elements.filter(el => el.matches("input, textarea, select, [role=combobox]"))) {
      if (!matched(el)) continue;
      log("[FIELD "+field+"] input attribute: "+el.tagName);
      return {fieldRoot:el.parentElement||el,control:el};
    }
    for (const el of elements) {
      if (el.tagName==="LABEL" || !matched(el)) continue;
      const control=el.matches("button,[aria-haspopup]") ? el :
        el.querySelector("input, textarea, select, button, [role=combobox], [aria-haspopup]") || el;
      if (!shown(control)) continue;
      log("[FIELD "+field+"] wrapper attribute: "+control.tagName);
      return {fieldRoot:el,control};
    }
    const labels = Array.from(root.querySelectorAll("label, span, div, p, dt"))
      .filter(el => shown(el) && !ignore(el) && fieldLabelMatches(labelText(el),field))
      .filter(el => !Array.from(el.children).some(ch => fieldLabelMatches(labelText(ch),field)));
    for (const label of labels) {
      if (label instanceof HTMLLabelElement && label.htmlFor) {
        const associated=document.getElementById(label.htmlFor);
        if (associated && shown(associated)) return {fieldRoot:label.parentElement,control:associated};
      }
      let parent=label.parentElement;
      for(let level=0;level<5 && parent && parent!==root;level++,parent=parent.parentElement) {
        const controls=Array.from(parent.querySelectorAll(
          "input:not([type=hidden]):not([type=file]), textarea, select, button, [role=combobox], [aria-haspopup], [role=button], [tabindex='0']"
        )).filter(el=>shown(el)&&!ignore(el)&&!el.contains(label));
        if(controls.length===1) {
          log("[FIELD "+field+"] label -> "+controls[0].tagName);
          return {fieldRoot:parent,control:controls[0]};
        }
        if(level<=2 && parent.matches('[data-testid*="cell" i], [class*="cell" i], [class*="field" i]')) {
          log("[FIELD "+field+"] label -> cell");
          return {fieldRoot:parent,control:parent};
        }
      }
    }
    log("[FIELD "+field+"] not found");
    logSnapshot(log,field,root);
    return null;
  }
  function optionAliases(field,desired,draft) {
    const raw=String(desired).trim(), n=norm(raw);
    const candidates=[raw];
    if (values[field]) {
      for (const [key,others] of Object.entries(values[field])) {
        if ([key,...others].map(norm).includes(n)) candidates.push(key,...others);
      }
    }
    if (field==="size") {
      const m=raw.toUpperCase().replace(/\s+/g,"").match(/^W?(\d{2})(?:[\/-]?L\d{2})?$/);
      if (m) {
        const waist=Number(m[1]);
        candidates.push("W"+waist,"W "+waist,String(waist));
        const woman=/damen|frauen|women|female|femme/i.test(
          [draft.gender,draft.category].filter(Boolean).join(" "));
        if (woman) {
          // Size equivalences vary by manufacturer: fall back only after exact waist search.
          const approximate={24:"XS",25:"XS",26:"S",27:"S",28:"M",29:"M",30:"L",31:"L",32:"XL",33:"XL",34:"XXL"};
          if (approximate[waist]) candidates.push(approximate[waist]);
        }
      }
    }
    return [...new Set(candidates.map(norm))];
  }
  function overlays() {
    const selectors=['[role=dialog]','[role=listbox]','[role=menu]',
      '[data-testid*="popover" i]','[data-testid*="dropdown" i]',
      '[data-testid*="modal" i]','[class*="dropdown" i]',
      '[class*="popover" i]','[class*="modal" i]'];
    return Array.from(document.querySelectorAll(selectors.join(",")))
      .filter(el=>shown(el)&&!ignore(el))
      .sort((a,b)=>a.contains(b)?1:b.contains(a)?-1:0);
  }
  function optionIn(scope,candidates) {
    if (!scope) return null;
    const eligible=Array.from(scope.querySelectorAll(
      '[role=option], [role=menuitem], [role=treeitem], button, li, label, [data-testid*="cell" i], [data-testid*="option" i]'
    )).filter(el=>shown(el)&&!ignore(el));
    // Prefer exact leaf options; a full parent containing multiple options is not valid.
    return eligible.find(el=>candidates.includes(labelText(el)) &&
      !eligible.some(child=>child!==el && el.contains(child) && candidates.includes(labelText(child)))) || null;
  }
  // Observe nodes generated while the menu opens. Vinted often mounts option
  // rows into React portals without standard ARIA roles or predictable classes.
  function watchNewMenuNodes() {
    const added=new Set();
    const observer=new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){
          if(node.nodeType===1)added.add(node);
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    return {
      roots:()=>Array.from(added).filter(el=>shown(el)&&!ignore(el)),
      stop:()=>observer.disconnect()
    };
  }

  function safeMenuStructure(trigger,roots) {
    // No form values, cookies, HTML source, title or description text copied.
    const nonSensitiveAttrs=el=>({
      tag:el.tagName.toLowerCase(),id:el.id||"",
      role:el.getAttribute("role")||"",
      testid:el.getAttribute("data-testid")||"",
      cls:typeof el.className==="string"?el.className.slice(0,90):"",
      placeholder:el.getAttribute("placeholder")||"",
      expanded:el.getAttribute("aria-expanded")||"",
      readonly:!!el.readOnly
    });
    const items=[];
    for(const root of roots.slice(0,12)){
      if(!shown(root))continue;
      items.push(nonSensitiveAttrs(root));
      for(const child of Array.from(root.querySelectorAll(
        '[role="option"],[role="menuitem"],[role="listbox"],[data-testid],input,button'
      )).filter(shown).slice(0,12)){
        items.push(nonSensitiveAttrs(child));
      }
      if(items.length>=55)break;
    }
    return {trigger:nonSensitiveAttrs(trigger),nodes:items.slice(0,55)};
  }

  function getOpenDropdownSurfaces(trigger) {
    const selectors=[
      '[role="dialog"]','[role="listbox"]','[role="menu"]',
      '[data-state="open"]','[data-testid*="dropdown" i]',
      '[data-testid*="popover" i]','[data-testid*="modal" i]',
      '[class*="dropdown" i]','[class*="popover" i]',
      '[class*="menu" i]','[data-popper-placement]',
      '[data-radix-popper-content-wrapper]'
    ];
    const layers=Array.from(document.querySelectorAll(selectors.join(",")))
      .filter(el=>shown(el)&&!ignore(el)&&el!==trigger&&
        !el.contains(trigger) && !el.matches("input,textarea"));
    const controlledId=trigger.getAttribute("aria-controls")||trigger.getAttribute("aria-owns");
    const controlled=controlledId&&document.getElementById(controlledId);
    if(controlled&&shown(controlled))layers.unshift(controlled);
    // Some menus live inside the same field wrapper without a role/portal.
    // Keep only nearby wrappers, never the whole form or page.
    let local=trigger.parentElement;
    for(let depth=0;depth<3 && local && local!==rootForm();depth++,local=local.parentElement) {
      if(local.matches('[data-testid*="dropdown" i], [class*="dropdown" i], [class*="select" i], [class*="field" i]')) {
        layers.push(local);
      }
    }
    return [...new Set(layers)].reverse();
  }

  function dropdownOption(roots,candidates,trigger) {
    const selectors=[
      '[role="option"]','[role="menuitem"]','[role="treeitem"]',
      '[data-testid*="option" i]','[data-testid*="item" i]',
      '[data-testid*="cell" i]','li','button','[role="button"]',
      '[class*="option" i]','[class*="item" i]'
    ].join(",");
    for(const root of roots) {
      if(!root||!shown(root))continue;
      const entries=[...(root.matches?.(selectors)?[root]:[]),...root.querySelectorAll(selectors)]
        .filter(el=>shown(el)&&!ignore(el)&&el!==trigger&&!el.contains(trigger));
      const exact=entries.filter(el=>candidates.includes(labelText(el)));
      // Choose a leaf, never a parent of another equally matching option.
      const leaf=exact.find(el=>!exact.some(inner=>inner!==el&&el.contains(inner)));
      if(leaf)return leaf;
      // Some Vinted option rows use unadorned div/span nodes with click listeners.
      // This fallback is allowed only within an already identified open menu.
      if(root!==document.body) {
        const all=Array.from(root.querySelectorAll("span,div,p"))
          .filter(el=>shown(el)&&candidates.includes(labelText(el)));
        const smallest=all.find(el=>!all.some(inner=>inner!==el&&el.contains(inner)));
        if(smallest && !smallest.closest('label[for], [data-testid*="description" i]')) {
          return smallest;
        }
      }
    }
    return null;
  }

  function dropdownSearchInput(trigger,surfaces) {
    const ownId=trigger.id;
    const inputs=Array.from(document.querySelectorAll(
      'input[type="search"], input[id*="search" i], input[name*="search" i], input[placeholder*="suchen" i], input[placeholder*="search" i]'
    )).filter(el=>shown(el)&&!el.matches('[type="hidden"]')&&!ignore(el));
    // Prefer newly focused or the currently opened popup's own search box.
    const focused=document.activeElement;
    const within=inputs.find(el=>surfaces.some(surface=>surface.contains(el)));
    return within || inputs.find(el=>el===focused) ||
      inputs.find(el=>ownId && (el.id.includes(ownId)||el.name.includes(ownId))) || null;
  }

  function dropdownDebug(field,trigger,log) {
    const surfaces=getOpenDropdownSurfaces(trigger);
    const surfaceInfo=surfaces.slice(0,8).map(el=>({
      tag:el.tagName.toLowerCase(), role:el.getAttribute("role")||"",
      id:el.id||"",testid:el.getAttribute("data-testid")||"",
      cls:String(el.className||"").slice(0,65)
    }));
    const entries=Array.from(document.querySelectorAll(
      '[role="option"], [role="menuitem"], [role="listbox"], [role="dialog"], li, button, [data-testid*="item" i], [data-testid*="option" i], [data-testid*="cell" i]'
    )).filter(el=>shown(el)&&!ignore(el)&&
      !el.closest('[data-testid*="description" i], textarea'))
      .slice(0,50).map(el=>({
        tag:el.tagName.toLowerCase(),
        text:labelText(el).slice(0,55),
        testid:el.getAttribute("data-testid")||"",
        role:el.getAttribute("role")||""
      }));
    const active=document.activeElement;
    log("[DROPDOWN DIAG "+field+"] "+JSON.stringify({
      trigger:trigger.outerHTML.slice(0,350), expanded:trigger.getAttribute("aria-expanded"),
      active:active?.outerHTML?.slice(0,250)||"",
      surfaces:surfaceInfo, entries
    }));
  }


  function isInfantSizeGrid() {
    const grid=document.querySelector('[data-testid="category-size-single-grid-content"]');
    if(!grid || !shown(grid)) return false;
    const text=norm(grid.innerText || grid.textContent);
    return /(fruhchen|neugeboren|bis zu 1 monat|1-3 monate|3-6 monate|6-9 monate)/.test(text);
  }

  // Select only inside the menu that belongs to this field. In particular,
  // the brand-search-input must NEVER be used for size, color or condition.
  function scopesForField(field, control, watcher) {
    const specific={
      size:'[data-testid="category-size-single-grid-content"]',
      color:'[data-testid*="color-select-dropdown" i], [data-testid*="color-grid" i]',
      condition:'[data-testid*="condition-select" i], [data-testid*="status-select" i]',
      brand:'[data-testid*="brand-search" i]'
    };
    const related=Array.from(document.querySelectorAll(specific[field]||"body"))
      .filter(el=>shown(el) && !el.matches("input,button,span") && !el.contains(control));
    if(field==="size" && related.length)return related;
    // Brand options are list items mounted next to #brand-search-input in a
    // dialog portal, not necessarily descendants of a dropdown element.
    if(field==="brand" && shown(document.querySelector("#brand-search-input"))) {
      const search=document.querySelector("#brand-search-input");
      const dialog=search.closest('[role="dialog"], [class*="Dialog__portal"], .web_ui__Dialog__portal');
      if(dialog)related.unshift(dialog);
      else related.push(document.body); // only while the brand search is visible
    }
    const discovered=watcher.roots().filter(el=>shown(el));
    return [...new Set([...related,...discovered,...getOpenDropdownSurfaces(control)])];
  }

  function fieldSearchInput(field) {
    if(field!=="brand")return null;
    const el=document.querySelector('#brand-search-input, input[data-testid="brand-search--input"]');
    return shown(el)?el:null;
  }

  function exactFieldOption(roots,candidates,field,trigger) {
    const selectors=field==="size"
      ? '[role="checkbox"][data-testid*="size-group" i], [data-testid*="size-grid-option" i]'
      : field==="brand"
      ? 'li, label[for^="brand-radio"], [role="radio"], [role="option"]'
      : '[role="checkbox"], [role="option"], [role="menuitem"], [data-testid*="option" i], li, button, label';
    for(const root of roots) {
      if(!root||!shown(root))continue;
      const candidatesInRoot=[
        ...(root.matches?.(selectors)?[root]:[]),
        ...root.querySelectorAll(selectors)
      ].filter(el=>shown(el)&&!ignore(el)&&el!==trigger&&!el.contains(trigger));
      const exact=candidatesInRoot.filter(el=>candidates.includes(labelText(el)));
      if(exact.length) {
        exact.sort((a,b)=>a.contains(b)?1:b.contains(a)?-1:0);
        return exact[0];
      }
    }
    return null;
  }

  function activateFieldOption(field,option) {
    const row=option.closest("li,[role=option],[role=checkbox]") || option;
    if(field==="brand") {
      // Vinted's brand picker uses a radio, and clicking <li> does not
      // necessarily trigger the radio selection.
      const radio=row.querySelector('input[type="radio"]') ||
        (row.matches('input[type="radio"]')?row:null);
      if(radio && !radio.checked) {radio.click();return radio;}
      const label=row.querySelector('label[for]') ||
        (row.matches("label[for]")?row:null);
      if(label) {
        const target=document.getElementById(label.htmlFor);
        if(target && !target.checked) {target.click();return target;}
        label.click();return label;
      }
      const labeled=Array.from(row.querySelectorAll("[role=radio], [data-testid*='brand-radio' i]"))
        .find(shown);
      if(labeled){labeled.click();return labeled;}
    }
    if(field==="size"||field==="color") {
      const checkbox=row.matches('[role="checkbox"]')?row:
        row.querySelector('[role="checkbox"]');
      if(checkbox){checkbox.click();return checkbox;}
    }
    option.click();
    return option;
  }

  function currentFieldValue(field) {
    const input=findFieldRoot(field,()=>{})?.control;
    return norm(input?.value || input?.getAttribute("data-value") ||
      input?.getAttribute("aria-valuetext") || (input?.tagName==="INPUT"?"":input?.innerText));
  }

  async function dismissMenu(field,trigger) {
    const search=fieldSearchInput(field);
    // Dialog confirm buttons only (never the page's publish/save actions).
    if(search) {
      const box=search.closest('[role="dialog"], .web_ui__Dialog__portal');
      const confirm=box && Array.from(box.querySelectorAll("button"))
        .find(el=>shown(el)&&/^(fertig|done|ubernehmen|anwenden|bestatigen|auswahlen|apply|confirm)$/.test(labelText(el)));
      if(confirm){confirm.click();await sleep(250);}
    }
    if(field==="brand" && fieldSearchInput(field)) {
      const active=document.activeElement || trigger;
      active.dispatchEvent(new KeyboardEvent("keydown",
        {key:"Escape",code:"Escape",bubbles:true,cancelable:true}));
      await sleep(200);
    }
  }

  async function chooseField(field,desired,draft,log) {
    const found=findFieldRoot(field,log);
    if(!found)return {success:false,reason:"Feld nicht gefunden"};
    const {control}=found,candidates=optionAliases(field,desired,draft);
    if(control instanceof HTMLSelectElement) {
      const option=Array.from(control.options).find(el=>
        candidates.includes(norm(el.textContent))||candidates.includes(norm(el.value)));
      if(!option)return {success:false,reason:"Option fehlt"};
      control.value=option.value;
      control.dispatchEvent(new Event("input",{bubbles:true}));
      control.dispatchEvent(new Event("change",{bubbles:true}));
      await sleep(250);
      return control.value===option.value?{success:true}:{success:false,reason:"Auswahl nicht übernommen"};
    }
    const watcher=watchNewMenuNodes();
    try {
      // A previous brand search still open means any subsequent click can
      // accidentally type size W36 into the brand search. Stop rather than corrupt.
      if(field!=="brand" && fieldSearchInput("brand")) {
        log("[BLOCK "+field+"] Marken-Suchfenster noch geöffnet");
        return {success:false,reason:"Markenauswahl zuerst abschließen"};
      }
      control.click();
      await sleep(320);
      if(field==="size" && isInfantSizeGrid() &&
          !/kinder|baby|kids|kind/i.test([draft.gender,draft.category].join(" "))) {
        log("[SIZE SAFETY] Babygrößen geöffnet, Kategorie ist nicht für Erwachsenen-Jeans geeignet");
        return {success:false,reason:"Falsche Kategorie: Babykonfektionsgrößen"};
      }
      let choice=null;
      for(let i=0;i<10;i++) {
        choice=exactFieldOption(scopesForField(field,control,watcher),candidates,field,control);
        if(choice)break;
        await sleep(120);
      }
      if(!choice) {
        const search=fieldSearchInput(field);
        if(search) {
          log("[SEARCH "+field+"] "+search.id);
          setInput(search,String(desired));
          await sleep(320);
          for(let i=0;i<12;i++){
            choice=exactFieldOption(scopesForField(field,control,watcher),candidates,field,control);
            if(choice)break;
            await sleep(140);
          }
        }
      }
      if(!choice) {
        log("[FIELD OPTIONS "+field+"] "+JSON.stringify(
          scopesForField(field,control,watcher).slice(0,4).flatMap(root=>
            Array.from(root.querySelectorAll('[role="checkbox"],li,[role="option"]'))
              .filter(shown).slice(0,22).map(el=>({
                text:labelText(el).slice(0,60),
                role:el.getAttribute("role")||"",
                testid:el.getAttribute("data-testid")||""
              }))).slice(0,40)));
        return {success:false,reason:"Zielwert nicht im passenden Auswahlmenü gefunden"};
      }
      const name=labelText(choice);
      const activated=activateFieldOption(field,choice);
      await sleep(400);
      await dismissMenu(field,control);
      await sleep(250);
      const actual=currentFieldValue(field);
      const checked=activated?.checked===true ||
        activated?.getAttribute?.("aria-checked")==="true";
      const persisted=candidates.some(c=>actual===c ||
        (field==="size" && actual.split(/[,;\/]/).map(norm).includes(c)));
      const openBrand=field==="brand" && !!fieldSearchInput("brand");
      log("[SELECT "+field+"] clicked="+name+" actual="+actual+
        " radioChecked="+checked+" brandMenuOpen="+openBrand);
      if(persisted && !openBrand)return {success:true};
      if(!persisted && checked && field==="brand" && !openBrand) {
        // Some Vinted radio controls update the input only after rerender.
        await sleep(350);
        if(candidates.includes(currentFieldValue(field)))return {success:true};
      }
      return {success:false,reason:openBrand?
        "Markenmenü noch geöffnet, Auswahl nicht bestätigt":
        "Option geklickt, aber Feldwert nicht bestätigt"};
    } catch(err) {
      log("[ERROR "+field+"] "+err.message);
      return {success:false,reason:err.message};
    } finally {
      watcher.stop();
    }
  }

  // Verified from public Vinted catalog pages, not inferred from radio IDs.
  // Other cuts/categories must be matched from the live UI or left for review.
    // Vinted's skinny categories are separate for women and men.
  const VERIFIED_JEANS_CATEGORIES = Object.freeze({
    1817: {gender:"men",fit:"skinny",label:"Röhrenjeans"},
    1818: {gender:"men",fit:"slim",label:"Jeans mit enger Passform"},
    1819: {gender:"men",fit:"straight",label:"Gerade geschnittene Jeans"},
    1844: {gender:"women",fit:"skinny",label:"Röhrenjeans"},
    1845: {gender:"women",fit:"straight",label:"Gerade geschnittene Jeans"}
  });

  // Sascha AI already analyzes the photos to generate title/description.
  // This uses those generated signals; it does not pretend to re-analyze raw
  // images inside the Vinted extension.
  function classifyDraftCategory(draft) {
    const explicit=norm([
      draft.gender,draft.sex,draft.targetGender,draft.categoryPath,
      draft.audience,draft.department
    ].filter(Boolean).join(" "));
    const title=norm(draft.title || "");
    const desc=norm(draft.description || "");
    const type=norm([draft.category,draft.subcategory,draft.productType,
      draft.itemType].filter(Boolean).join(" "));
    const fitMeta=norm([draft.fit,draft.cut,draft.style,draft.jeansFit,
      draft.attributes?.fit].filter(Boolean).join(" "));
    const genders={
      men:/(^|[^a-z])(herren|manner|mannlich|men|mens|male|homme|herrenhose|herrenjeans)(?=$|[^a-z])/,
      women:/(^|[^a-z])(damen|frauen|weiblich|women|womens|female|femme|damenhose|damenjeans)(?=$|[^a-z])/,
      children:/(^|[^a-z])(kinder|baby|kids|children|jungen|madchen|junior)(?=$|[^a-z])/
    };
    const genderFrom=text=>{
      const found=Object.entries(genders).filter(([,re])=>re.test(text)).map(([k])=>k);
      return found.length===1?found[0]:"";
    };
    const gender=genderFrom(explicit) || genderFrom(type) || genderFrom(title) || genderFrom(desc);
    const isJacket=/(jeansjacke|denimjacke|denim jacket|jean jacket)/.test(type+" "+title+" "+desc);
    const isJeans=!isJacket && /(jeans|jeanhose|denimhose|denim jeans|denim pants)/.test(
      [type,title,desc].join(" "));
    // Explicit cut wins, otherwise look across title and AI-generated description.
    const fitSource=fitMeta && /(bootcut|flared|schlag|skinny|slim|straight|regular|baggy|wide|loose|mom|gerade)/.test(fitMeta) ?
      fitMeta : [title,desc].join(" ");
    const patterns=[
      ["bootcut",/(bootcut|flared|schlaghose|schlagjeans|flare jeans|boot cut)/],
      ["skinny",/(skinny|super skinny|rohrenjeans|rohrenhose)/],
      ["slim",/(slim fit|slimfit|slim jeans|schmal geschnitten|enge passform)/],
      ["straight",/(straight leg|straight fit|regular fit|gerade geschnitten|gerades bein|straight jeans|regular jeans)/],
      ["wide",/(baggy|wide leg|wide fit|loose fit|mom fit|mom jeans|boyfriend jeans)/]
    ];
    const matches=patterns.filter(([,pattern])=>pattern.test(fitSource)).map(([name])=>name);
    const fit=matches.length===1?matches[0]:"";
    return {
      gender,fit,isJeans,confidence:gender && fit && isJeans?"high":
        gender && isJeans?"medium":"low",
      evidence:{
        gender:gender?(genderFrom(explicit)?"structured":genderFrom(type)?"category":
          genderFrom(title)?"title":"description"):"unresolved",
        fit:fit?(fitMeta?"structured":"text"):"unresolved"
      }
    };
  }

  function desiredGender(draft) {
    return classifyDraftCategory(draft).gender;
  }

  function categoryOptionContext(el) {
    const segments=[];
    let node=el;
    for(let depth=0;depth<5&&node&&node!==document.body;depth++,node=node.parentElement){
      const attr=[node.id,node.getAttribute("data-testid"),node.getAttribute("aria-label")]
        .filter(Boolean).join(" ");
      const text=labelText(node);
      // Avoid the entire modal: only row-level breadcrumb text is meaningful.
      if(text.length<175)segments.push(text);
      if(attr)segments.push(norm(attr));
    }
    return [...new Set(segments)].join(" | ").slice(0,300);
  }

  function categoryScore(context,gender) {
    const baby=/fruhchen|baby|kinder|kids|children|neugeboren|jungen|madchen/.test(context);
    if(gender!=="children" && baby)return -100;
    if(gender==="children")return baby?10:-30;
    const men=/\b(herren|men|mann|manner|homme)\b/.test(context);
    const women=/\b(damen|women|frau|frauen|femme)\b/.test(context);
    if(gender==="men")return men?20:women?-30:1;
    if(gender==="women")return women?20:men?-30:1;
    return (men||women)?5:1;
  }

  async function verifyCategorySizeFamily(draft,log) {
    if(desiredGender(draft)==="children")return {ok:true};
    const size=findFieldRoot("size",()=>{})?.control;
    if(!size)return {ok:true,unknown:true};
    size.click();
    await sleep(300);
    const baby=isInfantSizeGrid();
    const el=document.activeElement||size;
    el.dispatchEvent(new KeyboardEvent("keydown",
      {key:"Escape",code:"Escape",bubbles:true,cancelable:true}));
    await sleep(120);
    const grid=document.querySelector('[data-testid="category-size-single-grid-content"]');
    if(grid && shown(grid)) {
      size.click();
      await sleep(130);
    }
    if(baby){
      log("[CATEGORY SAFETY] Die ausgewählte Jeans-Kategorie liefert Babygrößen.");
      return {ok:false,reason:"Falsche Kategorie: Vinted zeigt Babygrößen"};
    }
    return {ok:true};
  }

  // Catalog search results are native radio inputs such as
  // #catalog-search-1559-radio, NOT generic [role=option] nodes.
  // Do not select a bare "Jeans" result unless its gender/path is verified.
  function catalogRadioOptions(desired,classification) {
    const radios=Array.from(document.querySelectorAll(
      'input[id^="catalog-search-"][id$="-radio"]'));
    const result=[];
    for(const radio of radios) {
      const match=radio.id.match(/^catalog-search-(\d+)-radio$/);
      if(!match)continue;
      const id=Number(match[1]);
      const label=document.querySelector('label[for="'+radio.id+'"]');
      const row=radio.closest("li,[role=option],[role=menuitem]") ||
        label?.closest("li,[role=option],[role=menuitem]") ||
        radio.parentElement?.parentElement;
      if(!row || !shown(row))continue;
      const context=categoryOptionContext(row);
      const name=labelText(label)||labelText(row);
      const labelExact=name===desired || name.endsWith(" > "+desired) ||
        name.endsWith(" › "+desired);
      const verified=VERIFIED_JEANS_CATEGORIES[id]||null;
      const {gender,fit}=classification;
      let score=-100,reason="unverified category";
      if(gender==="children" || !classification.isJeans){
        reason="children/non-jeans need manual confirmation";
      } else if(verified) {
        if(gender!==verified.gender){
          reason="category gender mismatch";
        } else if(fit===verified.fit){
          score=130;
          reason="verified category id matches gender and fit";
        } else {
          reason="verified subtype does not match fit";
        }
      } else {
        const genderScore=categoryScore(context,gender);
        const explicitAudience=gender==="men"?
          /\b(herren|men|mann|manner|homme)\b/.test(context):
          gender==="women"?
          /\b(damen|women|frau|frauen|femme)\b/.test(context):false;
        // Only a clearly marked matching gender AND a fitting category row.
        // Do not mistake a random "Jeans" result from children's categories.
        if(explicitAudience && genderScore>0) {
          const otherFit=/(skinny|slim|bootcut|flared|mom jeans|baggy|wide leg|straight|gerade geschnitten)/;
          const fitsDesired=!fit || (fit==="straight"?
            /(straight|gerade|regular)/.test(context):
            fit==="slim"?/(slim|enge passform)/.test(context):
            fit==="skinny"?/skinny/.test(context):
            fit==="bootcut"?/(bootcut|flared|schlag)/.test(context):
            /(wide|baggy|mom|loose)/.test(context));
          const exactGeneral=labelExact && !otherFit.test(context);
          if(fitsDesired && (fit? !exactGeneral : exactGeneral)){
            score=35;
            reason="live category path and fit matched";
          } else if(!fit && exactGeneral){
            score=30;
            reason="live generic Jeans path and gender matched";
          }
        } else {
          reason="no verified gender in visible result";
        }
      }
      result.push({radio,id,name,context,score,eligible:score>0,
        reason,knownType:verified?.gender||"",verified});
    }
    return result;
  }

  async function chooseCategory(draft,log) {
    const found=findFieldRoot("category",log);
    if(!found)return {success:false,reason:"Kategorie-Auswahl nicht gefunden"};
    const raw=String(draft.category||"").trim();
    if(!raw)return {success:false,reason:"Keine Kategorie angegeben"};
    const desired=norm(raw.split(/[>/]/).pop().trim());
    const classification=classifyDraftCategory(draft);
    const gender=classification.gender;
    log("[CATEGORY CLASSIFICATION] "+JSON.stringify(classification));
    if(!classification.isJeans) {
      return {success:false,reason:"Artikel nicht eindeutig als Jeans erkannt; Kategorie bitte manuell auswählen"};
    }
    if(!gender || gender==="children") {
      return {success:false,reason:"Herren/Damen aus den Entwurfsdaten nicht eindeutig erkannt"};
    }
    const selected=found.control;
    const previous=norm(selected.value||selected.getAttribute("data-value"));
    // Respect a category manually chosen by the user, but still check sizes.
    if(previous===desired && !shown(document.querySelector("#catalog-search-input"))) {
      const inspected=await verifyCategorySizeFamily(draft,log);
      if(inspected.ok)return {success:true};
      return {success:false,reason:inspected.reason};
    }
    selected.click();
    await sleep(260);
    const search=document.querySelector('#catalog-search-input, input[name="catalog-search-input"]');
    if(search && shown(search)) {
      setInput(search,desired);
      await sleep(470);
    }
    // Prefer the actual radio results rather than looking for an exact
    // text-only <li>. Log what Vinted genuinely rendered.
    const radioResults=catalogRadioOptions(desired,classification);
    log("[CATALOG RADIO RESULTS] "+JSON.stringify(radioResults.slice(0,30).map(x=>({
      id:x.id,name:x.name.slice(0,80),context:x.context.slice(0,160),
      score:x.score,known:x.knownType,eligible:x.eligible,reason:x.reason
    }))));
    const candidates=()=>{
      const scopes=overlays();
      const roots=[...scopes,search?.parentElement?.parentElement?.parentElement,document.body]
        .filter(Boolean);
      const matches=[];
      for(const root of roots){
        const elements=Array.from(root.querySelectorAll(
          '[role="option"],[role="treeitem"],[role="menuitem"],li,button,'+
          '[data-testid*="item" i],[data-testid*="cell" i],[class*="item" i],[class*="cell" i]'
        )).filter(el=>shown(el)&&!ignore(el)&&!el.contains(selected)&&labelText(el)===desired);
        for(const el of elements)if(!matches.includes(el))matches.push(el);
      }
      return matches.filter(el=>!matches.some(inner=>inner!==el&&el.contains(inner)));
    };
    const eligibleRadio=radioResults.filter(x=>x.eligible);
    const ranked=eligibleRadio.length?
      eligibleRadio.map(x=>({el:x.radio,context:x.context,score:x.score,radioId:x.id}))
        .sort((a,b)=>b.score-a.score) :
      // If radios exist but are ambiguous, never fall back to clicking the
      // first text-only "Jeans" row (it previously picked children's jeans).
      radioResults.length?[]:
      candidates().map(el=>({el,context:categoryOptionContext(el),
        score:categoryScore(categoryOptionContext(el),gender)}))
        .filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
    log("[CATALOG CANDIDATES] gender="+(gender||"unknown")+" "+
      JSON.stringify(ranked.slice(0,10).map(x=>({
        context:x.context.slice(0,145),score:x.score,id:x.radioId||null
      }))));
    if(!ranked.length)return {success:false,reason:"Keine eindeutig zuordenbare Herren-/Damen-Jeans-Kategorie; bitte Kategorie einmal manuell wählen"};
    if(ranked.length>1 && ranked[0].score===ranked[1].score) {
      return {success:false,reason:"Mehrere gleichnamige Jeans-Kategorien: Herren/Damen nicht eindeutig"};
    }
    if(gender && gender!=="children" && ranked[0].score<5) {
      return {success:false,reason:"Jeans-Kategorie konnte nicht sicher Herren oder Damen zugeordnet werden"};
    }
    const chosen=ranked[0];
    log("[CATALOG] choose "+desired+" path="+chosen.context.slice(0,150));
    chosen.el.click(); // Native catalog radio activates React selection handler.
    await sleep(480);
    const picked=norm(selected.value || selected.getAttribute("data-value"));
    const catalogOpen=shown(document.querySelector("#catalog-search-input"));
    const selectedCategoryName=norm(chosen.radioId &&
      VERIFIED_JEANS_CATEGORIES[chosen.radioId]?.label || "");
    const nameMatches=!!picked && (picked===desired ||
      picked===selectedCategoryName || picked.includes(desired));
    if(catalogOpen || !nameMatches) {
      log("[CATALOG CONFIRM] picked="+picked+" catalogOpen="+catalogOpen+
        " expected="+selectedCategoryName);
      return {success:false,reason:"Kategoriewahl nicht im Feld bestätigt"};
    }
    const sizeFamily=await verifyCategorySizeFamily(draft,log);
    if(!sizeFamily.ok)return {success:false,reason:sizeFamily.reason};
    log("[CATALOG CONFIRM] picked="+picked+" gender="+(gender||"unknown")+" babyGrid=false");
    return {success:true};
  }

  async function fillText(field,value,log) {
    if(value===undefined||value===null||String(value).trim()==="")
      return {success:false,reason:"Kein Wert"};
    const found=findFieldRoot(field,log);
    const el=found?.control;
    if(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setInput(el,String(value));
      await sleep(100);
      return {success:el.value===String(value),reason:el.value===String(value)?"":"Eingabe nicht übernommen"};
    }
    // Price fields can be nested inside an unlabelled currency cell.
    if(found) {
      const inputs=Array.from(found.fieldRoot.querySelectorAll("input, textarea"))
        .filter(shown).filter(el=>!["file","hidden"].includes(el.type));
      if(inputs.length===1) {
        setInput(inputs[0],String(value));
        await sleep(100);
        return {success:inputs[0].value===String(value),reason:"Eingabe nicht übernommen"};
      }
    }
    return {success:false,reason:"Eingabefeld nicht eindeutig gefunden"};
  }
  function formatTitle(title,id) {
    let text=String(title||"").trim();
    const number=String(id||"").trim().replace(/^#+/, "");
    if(number && !text.includes("#"+number)) text=(text+" #"+number).trim();
    return text;
  }
  async function fileFromImage(img,index,log) {
    const url=img?.dataUrl, name=img?.name || "jeans_"+(index+1)+".jpg";
    if(typeof url!=="string")return null;
    try {
      if(/^https?:/.test(url)) {
        const response=await fetch(url);
        if(!response.ok)throw Error("HTTP "+response.status);
        return new File([await response.blob()],name,{type:response.headers.get("content-type")||"image/jpeg"});
      }
      if(url.startsWith("data:")) {
        const response=await fetch(url);
        return new File([await response.blob()],name,{type:url.slice(5,url.indexOf(";"))||"image/jpeg"});
      }
    } catch(err) {log("[IMAGE] "+name+": "+err.message);}
    return null;
  }
  async function fillImages(images,log) {
    if(!Array.isArray(images)||images.length===0)return {success:false,reason:"Keine Bilder"};
    const target=document.querySelector('main input[type=file]')||document.querySelector('input[type=file]');
    if(!target)return {success:false,reason:"Dateiauswahl nicht gefunden"};
    const files=(await Promise.all(images.map((img,i)=>fileFromImage(img,i,log)))).filter(Boolean);
    if(!files.length)return {success:false,reason:"Keine Bilder lesbar"};
    try {
      const transfer=new DataTransfer();
      files.forEach(file=>transfer.items.add(file));
      target.files=transfer.files;
      target.dispatchEvent(new Event("change",{bubbles:true}));
      target.dispatchEvent(new Event("input",{bubbles:true}));
      return {success:true};
    }catch(err){return {success:false,reason:"Browser verhindert Bildzuweisung: "+err.message};}
  }
  async function fill(draft) {
    const logs=[], log=value=>{logs.push(value);console.log("[Sascha V2]",value);};
    const results={};
    results.title=await fillText("title",formatTitle(draft.title,draft.artikelnummer),log);
    results.description=await fillText("description",draft.description,log);
    // Vinted frequently renders the price input after category selection.
    results.category=await chooseCategory(draft,log);
    await sleep(450);
    if (!results.category.success) {
      log("[STOP] Kategorie fehlt: Abhängige Felder werden bewusst nicht ausgefüllt.");
      for (const field of ["brand","size","color","condition"]) {
        results[field]={success:false,reason:"Kategorie zuerst auswählen: "+results.category.reason};
      }
    } else {
      const fields=["brand","size","color","condition"];
      for(let i=0;i<fields.length;i++){
        const field=fields[i];
        if(fieldSearchInput("brand") && field!=="brand"){
          log("[STOP] Marken-Suchfenster ist noch geöffnet. Andere Felder bleiben unverändert.");
          for(const remaining of fields.slice(i)){
            results[remaining]={success:false,reason:"Offenes Markenmenü; weitere Eingaben aus Sicherheitsgründen gestoppt"};
          }
          break;
        }
        results[field]=draft[field] ?
          await chooseField(field,draft[field],draft,log) :
          {success:false,reason:"Kein Wert"};
      }
    }
    // Price is not rendered while the catalog search modal is open.
    // Avoid reporting an independent price bug when category failed.
    if(!results.category.success && shown(document.querySelector("#catalog-search-input"))) {
      results.price={success:false,reason:"Zuerst Kategorie auswählen; Kategoriesuche noch geöffnet"};
      log("[SKIP price] Preisfeld ist hinter dem offenen Katalog nicht sichtbar.");
    } else {
      if(draft.price!==undefined && draft.price!==null && String(draft.price).trim()){
        for(let retry=0;retry<6;retry++){
          if(findFieldRoot("price",()=>{}))break;
          await sleep(250);
        }
      }
      results.price=await fillText("price",draft.price,log);
    }
    results.images=await fillImages(draft.images,log);
    log("Abgeschlossen; kein automatisches Veröffentlichen.");
    return {results,logs};
  }
  chrome.runtime.onMessage.addListener((request,sender,sendResponse)=>{
    if(request?.type!=="FILL_VINTED_FORM")return;
    fill(request.draft||{}).then(data=>sendResponse({success:true,...data}))
      .catch(err=>sendResponse({success:false,error:err.message}));
    return true;
  });
})();
