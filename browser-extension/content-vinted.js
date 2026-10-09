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
    // Prefer for/id associations, Vinted data-testid, aria-label and placeholder.
    const query = "input, textarea, select, button, [role=combobox], [aria-haspopup], [data-testid]";
    for (const el of root.querySelectorAll(query)) {
      if (!shown(el) || ignore(el)) continue;
      const attributes = ["name","id","data-testid","aria-label","placeholder"].map(a=>norm(el.getAttribute(a)));
      if (attributes.some(a => names.some(n => a === n || a.startsWith(n + "-") || a.startsWith(n + "_")))) {
        log("[FIELD " + field + "] direct attribute: " + el.tagName);
        return {fieldRoot:el.parentElement || el,control:el};
      }
    }
    // Labels must match exactly, not by substring or a large ancestor's innerText.
    const labels = Array.from(root.querySelectorAll("label, span, div, p, dt"))
      .filter(el => shown(el) && !ignore(el) && fieldLabelMatches(labelText(el),field))
      .filter(el => !Array.from(el.children).some(ch => fieldLabelMatches(labelText(ch),field)));
    for (const label of labels) {
      if (label instanceof HTMLLabelElement && label.htmlFor) {
        const associated = document.getElementById(label.htmlFor);
        if (associated && shown(associated)) return {fieldRoot:label.parentElement,control:associated};
      }
      let parent = label.parentElement;
      for (let level=0;level<4 && parent && parent!==root;level++,parent=parent.parentElement) {
        const controls=Array.from(parent.querySelectorAll(
          "input:not([type=hidden]):not([type=file]), textarea, select, button, [role=combobox], [aria-haspopup], [role=button], [tabindex='0']"
        )).filter(el=>shown(el) && !ignore(el) && !el.contains(label));
        if (controls.length===1) {
          log("[FIELD " + field + "] label -> control: " + controls[0].tagName);
          return {fieldRoot:parent,control:controls[0]};
        }
        // Vinted's clickable cells can be divs with no role or tabindex.
        if (level<=2 && parent.matches('[data-testid*="cell" i], [class*="cell" i], [class*="field" i]')) {
          log("[FIELD " + field + "] label -> cell");
          return {fieldRoot:parent,control:parent};
        }
      }
    }
    log("[FIELD " + field + "] not found");
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
  async function chooseField(field,desired,draft,log) {
    const found=findFieldRoot(field,log);
    if(!found)return {success:false,reason:"Feld nicht gefunden (Diagnose im Log)"};
    const {control}=found;
    const candidates=optionAliases(field,desired,draft);
    if(control instanceof HTMLSelectElement) {
      const option=Array.from(control.options).find(opt=>candidates.includes(norm(opt.textContent)) || candidates.includes(norm(opt.value)));
      if(!option)return {success:false,reason:"Keine passende Auswahl"};
      control.value=option.value;
      control.dispatchEvent(new Event("input",{bubbles:true}));
      control.dispatchEvent(new Event("change",{bubbles:true}));
      await sleep(200);
      return {success:control.value===option.value,reason:control.value===option.value?"":"Auswahl nicht gespeichert"};
    }
    control.click();
    await sleep(350);
    let scope=overlays()[0];
    // Some Vinted dropdowns are nested in the field cell rather than a portal.
    if(!scope)scope=found.fieldRoot;
    let option=optionIn(scope,candidates);
    if(!option) {
      const search=scope?.querySelector('input[type=search], input[placeholder*="suchen" i], input[placeholder*="search" i]');
      if(search && shown(search)) {
        setInput(search,String(desired));await sleep(350);
        scope=overlays()[0] || scope;
        option=optionIn(scope,candidates);
        if(!option) {setInput(search,"");await sleep(200);option=optionIn(scope,candidates);}
      }
    }
    if(!option) {
      log("[DIAG " + field + "] available options: " +
        JSON.stringify(Array.from((scope||document).querySelectorAll("[role=option],li,button"))
          .filter(shown).slice(0,35).map(el=>labelText(el).slice(0,60))));
      return {success:false,reason:"Passende Option nicht gefunden"};
    }
    const chosen=labelText(option);
    option.click();
    await sleep(400);
    const fieldNow=findFieldRoot(field,()=>{})?.control || control;
    const state=[fieldNow.value,fieldNow.getAttribute("data-value"),
      fieldNow.getAttribute("aria-valuetext"),fieldNow.innerText].map(norm);
    const confirmed=state.some(v=>candidates.includes(v));
    log("[SELECT " + field + "] clicked=" + chosen + " confirmed=" + confirmed);
    return confirmed ? {success:true} :
      {success:false,reason:"Angeklickt, aber nicht als ausgewählt bestätigt"};
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
    if(picked.includes(desired) || dependent) return {success:true};
    log("[CATALOG DIAG] picked="+picked+" dependent="+dependent);
    return {success:false,reason:"Kategorie angeklickt, aber nicht bestätigt"};
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
    results.price=await fillText("price",draft.price,log);
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
