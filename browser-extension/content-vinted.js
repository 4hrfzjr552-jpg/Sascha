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
      const entries=Array.from(root.querySelectorAll(selectors))
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

  async function chooseField(field,desired,draft,log) {
    const found=findFieldRoot(field,log);
    if(!found)return {success:false,reason:"Feld nicht gefunden"};
    const {control}=found, candidates=optionAliases(field,desired,draft);
    if(control instanceof HTMLSelectElement) {
      const option=Array.from(control.options).find(opt=>
        candidates.includes(norm(opt.textContent))||candidates.includes(norm(opt.value)));
      if(!option)return {success:false,reason:"Keine passende Auswahl"};
      control.value=option.value;
      control.dispatchEvent(new Event("input",{bubbles:true}));
      control.dispatchEvent(new Event("change",{bubbles:true}));
      await sleep(250);
      return control.value===option.value?{success:true}:
        {success:false,reason:"Auswahl nicht übernommen"};
    }
    try {
      control.click();
      await sleep(250);
      let candidate=null;
      // Vinted can render the popup directly below body, outside the field.
      for(let attempt=0;attempt<12;attempt++) {
        const surfaces=getOpenDropdownSurfaces(control);
        candidate=dropdownOption(surfaces,candidates,control);
        if(candidate)break;
        await sleep(150);
      }
      if(!candidate) {
        const surfaces=getOpenDropdownSurfaces(control);
        const search=dropdownSearchInput(control,surfaces);
        if(search) {
          log("[SEARCH "+field+"] "+(search.id||search.getAttribute("placeholder")||"input"));
          setInput(search,String(desired));
          await sleep(400);
          for(let attempt=0;attempt<8;attempt++) {
            candidate=dropdownOption(getOpenDropdownSurfaces(control),candidates,control);
            if(candidate)break;
            await sleep(150);
          }
        }
      }
      if(!candidate) {
        dropdownDebug(field,control,log);
        return {success:false,reason:"Auswahlmenü enthält keine erkannte Option"};
      }
      const chosen=labelText(candidate);
      candidate.click();
      await sleep(450);
      // Re-query field only, never parent/form text. A successful click by
      // itself does not prove that Vinted stored a chosen value.
      const fresh=findFieldRoot(field,()=>{})?.control||control;
      const actual=[fresh.value,fresh.getAttribute("data-value"),
        fresh.getAttribute("aria-valuetext"),fresh.innerText,
        fresh.getAttribute("placeholder")].map(norm);
      const confirmed=actual.some(value=>candidates.includes(value));
      log("[SELECT "+field+"] clicked="+chosen+" confirmed="+confirmed);
      if(!confirmed)dropdownDebug(field,fresh,log);
      return confirmed?{success:true}:
        {success:false,reason:"Option geklickt, aber nicht bestätigt"};
    }catch(err) {
      log("[ERROR "+field+"] "+err.message);
      dropdownDebug(field,control,log);
      return {success:false,reason:err.message};
    }
  }

  async function chooseCategory(draft,log) {
    const found=findFieldRoot("category",log);
    if(!found)return {success:false,reason:"Kategorie-Auswahl nicht gefunden"};
    const raw=String(draft.category||"").trim();
    if(!raw)return {success:false,reason:"Keine Kategorie angegeben"};
    const leaf=raw.split(/[>/]/).pop().trim();
    const trigger=found.control;
    trigger.click();
    await sleep(300);
    // Vinted's catalog picker creates a portal search input outside its
    // category cell, e.g. #catalog-search-input. Searching the cell misses it.
    const search=document.querySelector('#catalog-search-input, input[name="catalog-search-input"], [data-testid="catalog-search-input"]');
    if(search && shown(search)) {
      setInput(search,leaf);
      await sleep(550);
    }
    const desired=norm(leaf);
    function matches() {
      const field=document.querySelector('#catalog-search-input');
      const scopes=overlays();
      const roots=[...scopes,field?.parentElement?.parentElement?.parentElement,document.body].filter(Boolean);
      for(const scope of roots) {
        const all=Array.from(scope.querySelectorAll(
          '[role=option], [role=treeitem], [role=menuitem], li, button, [data-testid*="item" i], [data-testid*="cell" i], [class*="item" i], [class*="cell" i]'
        )).filter(el=>shown(el) && !ignore(el) && !el.contains(trigger));
        const exact=all.filter(el=>labelText(el)===desired);
        if(exact.length) {
          // Prefer the deepest matching row and avoid unrelated page controls.
          exact.sort((a,b)=>a.contains(b)?1:b.contains(a)?-1:0);
          return exact[0];
        }
      }
      return null;
    }
    let option=null;
    for(let attempt=0;attempt<6;attempt++){
      option=matches();
      if(option)break;
      await sleep(250);
    }
    if(!option) {
      const searchEl=document.querySelector("#catalog-search-input");
      const holder=searchEl?.closest('[role=dialog], [data-testid*="modal" i]') || searchEl?.parentElement?.parentElement?.parentElement;
      const examples=Array.from((holder||document.body).querySelectorAll(
        'button, li, [role=option], [data-testid*="item" i], [data-testid*="cell" i]'
      )).filter(shown).slice(0,45).map(el=>({
        tag:el.tagName, text:labelText(el).slice(0,65), testid:el.getAttribute("data-testid")||""
      }));
      log("[CATALOG DIAG] searchInput="+!!searchEl+" options="+JSON.stringify(examples));
      return {success:false,reason:"Kategorie im geöffneten Vinted-Katalog nicht gefunden"};
    }
    log("[CATALOG] click "+labelText(option));
    option.click();
    await sleep(600);
    const selected=document.querySelector('#category');
    const picked=norm(selected?.value||selected?.getAttribute("data-value")||"");
    const dependent=!!findFieldRoot("brand",()=>{}) || !!findFieldRoot("size",()=>{});
    const catalogSearch=document.querySelector('#catalog-search-input');
    const menuOpen=!!catalogSearch && shown(catalogSearch);
    log("[CATALOG CONFIRM] picked="+picked+" dependent="+dependent+" menuOpen="+menuOpen);
    // A dependent input may exist behind an unfinished category picker.
    // Do not click through an active catalog menu.
    if(!menuOpen && (picked.includes(desired) || dependent)) return {success:true};
    return {success:false,reason:menuOpen ?
      "Kategoriefenster noch geöffnet: Jeans noch nicht bestätigt" :
      "Kategorie angeklickt, aber nicht bestätigt"};
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
    const number=String(id||"").trim();
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
    } else for (const field of ["brand","size","color","condition"]) {
      results[field]=draft[field] ?
        await chooseField(field,draft[field],draft,log) :
        {success:false,reason:"Kein Wert"};
    }
    // Wait briefly for fields Vinted renders asynchronously after category.
    if (draft.price !== undefined && draft.price !== null && String(draft.price).trim()) {
      for(let retry=0;retry<6;retry++) {
        if(findFieldRoot("price",()=>{}))break;
        await sleep(250);
      }
    }
    results.price=await fillText("price",draft.price,log);
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
