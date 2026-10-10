/* Sascha AI → Vinted form engine v3. Saves drafts only upon explicit
   batch request; never publishes a listing. */
(() => {
  "use strict";
  if(window.__saschaVintedEngineV3)return;
  window.__saschaVintedEngineV3=true;
  const catalog=window.SaschaVintedCatalogV3;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const norm=catalog?.norm || (v=>String(v??"").toLowerCase().trim());
  const STEP_GAP=850;
  const NAMES={title:"Titel",description:"Beschreibung",category:"Kategorie",
    brand:"Marke",size:"Größe",color:"Farbe",condition:"Zustand",
    price:"Preis",images:"Bilder"};
  const COLORS={
    "hellblau":["hellblau","light blue"],"blau":["blau","blue"],
    "dunkelblau":["dunkelblau","dark blue","navy"],"schwarz":["schwarz","black"],
    "weiß":["weiß","weiss","white"],"grau":["grau","grey","gray"],
    "beige":["beige"],"braun":["braun","brown"],"grun":["grun","grün","green"],
    "rot":["rot","red"]
  };
  const CONDITIONS={
    "sehr gut":["sehr gut","very good"],"gut":["gut","good"],
    "neu mit etikett":["neu mit etikett","new with tags"],
    "neu ohne etikett":["neu ohne etikett","new without tags"],
    "zufriedenstellend":["zufriedenstellend","satisfactory","fair"]
  };
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  function shown(el){
    if(!el||!el.isConnected||el.closest("[inert]"))return false;
    const style=getComputedStyle(el);
    return style.display!=="none"&&style.visibility!=="hidden"&&el.getClientRects().length>0;
  }
  const visible=(selector,root=document)=>qa(selector,root).filter(shown);
  function text(el){return norm(el?.innerText||el?.textContent);}
  function value(el){return norm(el?.value ?? el?.getAttribute("data-value") ?? "");}
  function emit(log,message){log(message);}
  async function until(check,limit=5000,interval=170){
    const start=Date.now();
    do {
      try{const result=check();if(result)return result;}catch(_){}
      await sleep(interval);
    }while(Date.now()-start<limit);
    try{return check()||null;}catch(_){return null;}
  }
  function setReactValue(el,v){
    if(!el||!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))
      throw Error("Eingabefeld ist nicht beschreibbar");
    el.focus();
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const nativeSetter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
    if(nativeSetter)nativeSetter.call(el,String(v));else el.value=String(v);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }
  async function bringIntoView(el,field,log){
    if(!el)return;
    const before=el.getBoundingClientRect?.();
    const outside=!!before && (before.top<70||before.bottom>window.innerHeight-70);
    try{
      el.scrollIntoView?.({behavior:"instant",block:"center",inline:"nearest"});
    }catch(_){
      try{el.scrollIntoView?.({block:"center"});}catch(_){}
    }
    if(outside && log)log("[SCROLL "+field+"] Feld in den sichtbaren Bereich gebracht");
    await sleep(140);
  }

  function required(selector,message){
    const el=q(selector);
    if(!el||!shown(el))throw Error(message);
    return el;
  }
  async function textField(field,selector,raw){
    const str=String(raw??"").trim();
    if(!str)throw Error(field+" hat keinen Wert");
    const el=required(selector,field+" wurde nicht gefunden");
    await bringIntoView(el,field);
    setReactValue(el,str);
    const confirmed=await until(()=>q(selector)?.value===str,1500);
    if(!confirmed)throw Error(field+" wurde nicht übernommen");
    el.blur();
    return {success:true};
  }
  function articleTitle(draft){
    const title=String(draft.title||"").trim();
    const number=String(draft.artikelnummer||"").replace(/^#+/,"").trim();
    return number && !title.includes("#"+number)?(title+" #"+number).trim():title;
  }
  function rowForRadio(radio){
    const label=radio.id?q('label[for="'+radio.id+'"]'):null;
    return radio.closest("li,[role=option],[role=menuitem]") ||
      label?.closest("li,[role=option],[role=menuitem]") ||
      radio.parentElement?.parentElement || radio.parentElement;
  }
  function liveCatalogRows(){
    return qa('input[id^="catalog-search-"][id$="-radio"]').map(radio=>{
      const row=rowForRadio(radio);
      const label=q('label[for="'+radio.id+'"]');
      return {id:Number((radio.id.match(/\d+/)||[])[0]),radio,row,
        text:text(row)||text(label)};
    }).filter(x=>shown(x.row));
  }
  function catalogPanelOpen(){return shown(q("#catalog-search-input"));}
  async function hideCategoryPanel(){
    const search=q("#catalog-search-input");
    if(!shown(search))return;
    search.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",code:"Escape",bubbles:true}));
    await sleep(160);
  }
  async function chooseCategory(draft,log){
    if(!catalog)throw Error("Katalogdatei v3 fehlt – Erweiterung vollständig aktualisieren");
    const resolved=catalog.intentForDraft(draft);
    log("[CATEGORY INTENT] "+JSON.stringify(resolved.ok?
      {gender:resolved.intent.gender,kind:resolved.intent.kind,
        fit:resolved.intent.fit,id:resolved.category.id,
        label:resolved.category.name}:resolved));
    if(!resolved.ok)throw Error(resolved.reason);
    const target=resolved.category;
    const control=required('#category, input[data-testid="catalog-select-dropdown-input"]',
      "Vinted-Kategorieeingabe fehlt");
    await bringIntoView(control,"category",log);
    control.click();
    if(!await until(()=>shown(q("#catalog-search-input")),2800))
      throw Error("Vinted hat die Kategoriesuche nicht geöffnet");
    const terms=[target.term,"Jeans"];
    let match=null;
    for(const term of [...new Set(terms)]){
      const search=q("#catalog-search-input");
      setReactValue(search,term);
      await sleep(250);
      const result=await until(()=>{
        const rows=liveCatalogRows();
        const selected=catalog.selectLiveCategory(rows,target);
        return selected.ok?selected:null;
      },4200,190);
      log("[CATALOG SEARCH] "+term+" matches="+liveCatalogRows().length+
        " wanted="+target.id+" found="+!!result);
      if(result){match=result;break;}
    }
    if(!match){
      const rows=liveCatalogRows();
      log("[CATALOG OPTIONS] "+JSON.stringify(rows.slice(0,24).map(x=>({id:x.id,text:x.text.slice(0,130)}))));
      await hideCategoryPanel();
      throw Error("Vinted zeigt die bestätigte Kategorie #"+target.id+
        " ("+target.name+") nicht an");
    }
    // Click the actual Vinted-provided radio option, never a generic Jeans row.
    const {radio,row}=match.entry;
    const label=q('label[for="'+radio.id+'"]');
    if(label&&shown(label))label.click();
    else if(radio.click)radio.click();
    else row.click();
    const applied=await until(()=>{
      const input=q("#category");
      const chosen=value(input);
      return !catalogPanelOpen() && (chosen===norm(target.name) ||
        chosen.includes(norm(target.name)));
    },4600,170);
    if(!applied){
      log("[CATEGORY VERIFY] value="+value(q("#category"))+
        " panelOpen="+catalogPanelOpen());
      await hideCategoryPanel();
      throw Error("Kategorie #"+target.id+" wurde angeklickt, aber nicht bestätigt");
    }
    log("[CATEGORY SELECTED] "+target.gender+" / "+target.fit+" / "+
      target.name+" (#"+target.id+")");
    return {success:true};
  }
  function optionText(el){return text(el).replace(/\s+/g," ").trim();}
  function closeActiveDialog(control) {
    const active=document.activeElement;
    const event=new KeyboardEvent("keydown",{key:"Escape",code:"Escape",bubbles:true,cancelable:true});
    (active||control).dispatchEvent(event);
  }
  async function brand(draft,log){
    const desired=norm(draft.brand);
    if(!desired)throw Error("Marke fehlt im Entwurf");
    const control=required("#brand", "Markenfeld fehlt");
    if(value(control)===desired)return {success:true};
    await bringIntoView(control,"brand",log);
    control.click();
    const search=await until(()=>shown(q("#brand-search-input"))&&q("#brand-search-input"),3000);
    if(!search)throw Error("Vinted-Markensuche wurde nicht geöffnet");
    setReactValue(search,String(draft.brand));
    const match=await until(()=>{
      const rows=visible("li").filter(el=>
        optionText(el)===desired &&
        (el.contains(search)===false));
      return rows.find(el=>el.querySelector('input[type="radio"]')||
        el.querySelector('label[for]')||el.closest('[role=dialog]')) || rows[0] || null;
    },4200);
    if(!match){
      log("[BRAND OPTIONS] "+JSON.stringify(visible("li").filter(el=>
        el.closest('[role=dialog], [class*="Dialog__portal"], .web_ui__Dialog__portal'))
          .slice(0,16).map(el=>optionText(el))));
      closeActiveDialog(control);
      throw Error("Marke "+draft.brand+" nicht in Vinted gefunden");
    }
    const radio=match.querySelector('input[type="radio"]');
    const label=match.querySelector('label[for]');
    if(label&&shown(label))label.click();
    else if(radio)radio.click();
    else match.click();
    const updated=await until(()=>value(q("#brand"))===desired,4200);
    if(!updated)throw Error("Marke angeklickt, aber nicht übernommen");
    // Some Vinted builds leave the brand search open. Close it before size.
    if(shown(q("#brand-search-input")))closeActiveDialog(control);
    await until(()=>!shown(q("#brand-search-input")),1800);
    if(shown(q("#brand-search-input")))throw Error("Markenmenü noch geöffnet");
    log("[BRAND SELECTED] "+draft.brand);
    return {success:true};
  }
  // Vinted currently has multiple versions of the same size widget:
  // category-size-single-grid-content (older) and
  // category-size-single-grid_chips-input (seen in the real 12:25 log).
  // The latter can render its choices in a portal, outside the input wrapper.
  const SIZE_OPTION_QUERY=[
    '[role="checkbox"][data-testid*="size-group" i]',
    '[data-testid*="size-grid-option" i]',
    '[data-testid*="size-group" i][role="option"]',
    '[role="option"]','[role="checkbox"]',
    '[data-testid*="size" i][class*="option" i]'
  ].join(",");
  const SIZE_CONTENT_QUERY=[
    '[data-testid="category-size-single-grid-content"]',
    '[data-testid*="category-size-single-grid_chips-content" i]',
    '[data-testid*="category-size-single-grid_chips-dropdown" i]',
    '[data-testid*="size-single-grid-content" i]',
    '[data-testid*="size-grid-content" i]',
    '[data-testid*="category-size" i][class*="dropdown" i]'
  ].join(",");
  const sizeLabel=value=>/^(?:xxxxxxxl|xxxxxxl|xxxxxl|xxxxl|xxxl|xxl|xxs|xs|s|m|l|xl|[2-7]xl|w?\s?\d{2}(?:\s?l\d{2})?)$/.test(norm(value));
  function sizeGrids(){
    return visible(SIZE_CONTENT_QUERY);
  }
  function sizeOptionNodes(root){
    if(!root||!shown(root))return [];
    const candidates=[...(root.matches?.(SIZE_OPTION_QUERY)?[root]:[]),...qa(SIZE_OPTION_QUERY,root)];
    const result=[],seen=new Set();
    for(const el of candidates){
      const label=optionText(el);
      if(!shown(el)||!sizeLabel(label))continue;
      const row=el.closest?.('[role="checkbox"],[role="option"],[data-testid*="size-group" i]')||el;
      if(!shown(row))continue;
      const key=label+"|"+(row.getAttribute?.("data-testid")||"");
      if(seen.has(key))continue;
      seen.add(key);result.push({el:row,label});
    }
    return result;
  }
  function sizePopupRoots(){
    const control=q("#size");
    const primary=sizeGrids();
    if(primary.some(el=>sizeOptionNodes(el).length>0))return primary;
    // Explicit Vinted size options can be portaled outside the chips input.
    const anchors=visible('[role="listbox"],[role="dialog"],[class*="dropdown" i],[class*="popover" i]')
      .filter(el=>el!==control&&!el.contains(control)&&
        !el.querySelector?.("#brand-search-input,#catalog-search-input"));
    const portals=anchors.filter(el=>sizeOptionNodes(el).length>=3);
    return [...new Set([...primary,...portals])];
  }
  function sizeGrid(){
    return sizePopupRoots().find(grid=>sizeOptionNodes(grid).length>0)||
      sizePopupRoots()[0]||null;
  }
  function sizeOptions(){
    const seen=new Set();
    const opts=sizePopupRoots().flatMap(sizeOptionNodes);
    if(!opts.length){
      // Older Vinted builds show size-only checkboxes directly in a portal.
      // Restrict fallback to explicitly tagged size options, not arbitrary
      // form checkboxes or shipping controls.
      opts.push(...visible('[role="checkbox"][data-testid*="size-group" i], [data-testid*="size-grid-option" i]')
        .filter(el=>sizeLabel(optionText(el)))
        .map(el=>({el,label:optionText(el)})));
    }
    return opts.filter(({el,label})=>{
      const key=el.getAttribute?.("data-testid")||label;
      if(seen.has(key))return false;
      seen.add(key);return true;
    });
  }
  function sizeMenuReady(){
    return sizeOptions().length>0;
  }
  function sizeOpenEvidence(control){
    const testid=control.getAttribute?.("data-testid")||"";
    const scope=testid.includes("_chips")?"category-size-single-grid_chips":
      "category-size-single-grid";
    const up=visible('[data-testid^="'+scope+'"][data-testid*="chevron-up" i]').length>0;
    const expanded=control.getAttribute?.("aria-expanded")==="true";
    const panel=sizePopupRoots().some(el=>shown(el)&&sizeOptionNodes(el).length>0);
    return {up,expanded,panel,opened:up||expanded||panel};
  }
  function sizeMenuDiagnostic(){
    const control=q("#size");
    const testids=qa('[data-testid*="size" i]').slice(0,28);
    const nodeInfo=testids.map(el=>({
      testid:el.getAttribute?.("data-testid")||"",
      role:el.getAttribute?.("role")||"",
      shown:shown(el),
      childSizeChoices:shown(el)?sizeOptionNodes(el).length:0
    }));
    const visibleOptions=visible('[role="checkbox"],[role="option"],[data-testid*="option" i]')
      .filter(el=>sizeLabel(optionText(el))).slice(0,28)
      .map(el=>({text:optionText(el).slice(0,35),testid:el.getAttribute?.("data-testid")||"",
        role:el.getAttribute?.("role")||""}));
    const inputRect=control?.getBoundingClientRect?.();
    const active=document.activeElement;
    return {
      field:{id:control?.id||"",testid:control?.getAttribute?.("data-testid")||"",
        readonly:!!control?.readOnly,visible:shown(control),
        y:inputRect?Math.round(inputRect.y):null},
      openEvidence:control?sizeOpenEvidence(control):null,
      widgetNodes:nodeInfo,
      visibleSizeOptions:visibleOptions,
      activeId:active?.id||"",
      brandSearchOpen:shown(q("#brand-search-input")),
      categorySearchOpen:shown(q("#catalog-search-input")),
      viewportHeight:window.innerHeight||null
    };
  }
  async function openSizeMenu(control,log){
    // Only click again when there is evidence the first attempt did NOT open
    // a menu. Otherwise a second click may simply toggle it closed.
    if(sizeMenuReady())return true;
    await bringIntoView(control,"size",log);
    log("[SIZE OPEN] click input "+(control.getAttribute?.("data-testid")||""));
    control.click();
    if(await until(sizeMenuReady,2200,140)){
      log("[SIZE OPEN] choices="+sizeOptions().length+" via=input");return true;
    }
    let state=sizeOpenEvidence(control);
    log("[SIZE STATE] after input "+JSON.stringify(state));
    if(state.opened){
      // Do not double-click a dropdown believed to be open.
      await until(sizeMenuReady,1400,140);
      if(sizeMenuReady())return true;
      log("[SIZE DIAG] "+JSON.stringify(sizeMenuDiagnostic()));
      return false;
    }
    const testid=control.getAttribute?.("data-testid")||"";
    const scope=testid.includes("_chips")?"category-size-single-grid_chips":
      "category-size-single-grid";
    const chevron=q('[data-testid^="'+scope+'"][data-testid*="chevron-down" i]');
    const wrapper=control.closest?.('[class*="input-dropdown" i]')||
      control.parentElement?.closest?.('[class*="input-dropdown" i]')||
      control.parentElement;
    const target=chevron&&shown(chevron)?{name:"chevron",el:chevron}:
      wrapper&&wrapper!==control&&shown(wrapper)?{name:"wrapper",el:wrapper}:null;
    if(target){
      log("[SIZE OPEN] click "+target.name);
      target.el.click();
      if(await until(sizeMenuReady,2400,140)){
        log("[SIZE OPEN] choices="+sizeOptions().length+" via="+target.name);
        return true;
      }
      state=sizeOpenEvidence(control);
      log("[SIZE STATE] after "+target.name+" "+JSON.stringify(state));
    }
    log("[SIZE DIAG] "+JSON.stringify(sizeMenuDiagnostic()));
    return false;
  }
  // Vinted separates international XS–7XL from jeans waist sizing.
  // Selecting 'Taillenumfang' changes the SAME size dropdown's option grid.
  const waistModeNames=[
    "taillenumfang","taillenweite","bundweite","waist",
    "waist size","waist measurement","w-größe","w-grosse"
  ];
  const waistModeMatch=raw=>{
    const label=norm(raw).replace(/\s*[:：]\s*$/,"");
    return waistModeNames.includes(label) ||
      /^(?:taillenumfang|taillenweite|bundweite|waist size)\s*(?:\([^)]{1,15}\)|w\d{2}\s*-\s*w\d{2})$/.test(label);
  };
  function waistGroups(){
    // Scan the visible picker, not Vinted's general form fields. Vinted can
    // portal the size modal outside the #size input's ancestor structure.
    const roots=sizePopupRoots();
    const base=[...roots, ...roots.flatMap(root=>{
      const ancestors=[];let el=root.parentElement;
      for(let i=0;i<3&&el&&el!==document.body;i++,el=el.parentElement)
        ancestors.push(el);
      return ancestors;
    }),document.body].filter(Boolean);
    const selector='[role="tab"],button,[role="button"],label,[data-testid*="size" i],span,div,li';
    const found=[],seen=new Set();
    for(const root of base){
      const candidates=[...(root.matches?.(selector)?[root]:[]),...qa(selector,root)];
      for(const el of candidates){
        if(!shown(el))continue;
        const label=optionText(el);
        const aria=norm(el.getAttribute?.("aria-label")||"");
        if(!waistModeMatch(label)&&!waistModeMatch(aria))continue;
        // Prefer the actual tab/button when the text is in its child span.
        const target=el.closest?.('[role="tab"],button,[role="button"]')||
          el.closest?.('[data-testid*="size-group" i]')||el;
        if(!shown(target)||seen.has(target))continue;
        seen.add(target);found.push({el:target,label});
      }
    }
    // If a parent wrapper and a child both say "Taillenumfang",
    // use the innermost visible clickable candidate, not two matches.
    return found.filter(item=>!found.some(other=>other!==item &&
      item.el.contains?.(other.el)));
  }
  function isWaistOption(label,waist){
    const option=norm(label).replace(/\s+/g,"");
    return option===String(waist)||option==="w"+waist;
  }
  async function selectWaistSizing(draft,desired,log){
    const parsed=String(desired).replace(/\s+/g,"").toUpperCase()
      .match(/^W?(\d{2})(?:[/-]?L\d{2})?$/);
    if(!parsed)return; // S/M/L/XL are already explicit sizes.
    const waist=+parsed[1];
    if(sizeOptions().some(o=>isWaistOption(o.label,waist))){
      log("[SIZE WAIST] Originalgröße W"+waist+" bereits sichtbar");
      return;
    }
    const groups=waistGroups();
    log("[SIZE GROUPS] "+JSON.stringify(groups.slice(0,12).map(x=>x.label)));
    if(groups.length!==1){
      log("[SIZE WAIST OPTIONS] "+JSON.stringify(sizeOptions().map(o=>o.label)));
      throw Error(groups.length?
        "Taillenumfang-Menü mehrfach gefunden; bitte Größe manuell auswählen":
        "Taillenumfang-Untermenü nicht erkannt; wähle bitte W"+waist+" manuell");
    }
    const tab=groups[0].el;
    await bringIntoView(tab,"Taillenumfang",log);
    log("[SIZE WAIST] öffne Untermenü "+groups[0].label);
    tab.click();
    const ready=await until(()=>sizeOptions().some(o=>isWaistOption(o.label,waist)),3500,160);
    if(!ready){
      log("[SIZE WAIST OPTIONS] "+JSON.stringify(sizeOptions().map(o=>o.label)));
      log("[SIZE DIAG] "+JSON.stringify(sizeMenuDiagnostic()));
      throw Error("Taillenumfang geöffnet, aber W"+waist+" nicht als Option gefunden");
    }
    log("[SIZE WAIST] W"+waist+" gefunden");
  }

  async function size(draft,log){
    let desired=String(draft.size||"").trim();
    let estimated=null;
    const estimator=window.SaschaVintedWaistEstimate;
    const group=catalog.classify(draft);
    if(estimator?.isMissingSize(desired)||!desired){
      if(!estimator?.estimate)throw Error("Größen-Schätzfunktion fehlt – Extension aktualisieren");
      const result=estimator.estimate(draft,group);
      if(!result.ok)throw Error("Keine Etikettgröße. "+result.reason);
      estimated=result;
      desired=result.size;
      log("[SIZE ESTIMATE] Bundweite flach "+result.waistCm+" cm; "+
        "Umfang "+result.circumferenceCm+" cm. "+
        (group.gender==="women"?"Damen-Buchstabengröße ":"Herren-Taillenumfang ")+
        desired+" vorgeschlagen (nur Schätzung, bitte prüfen).");
    }
    const control=await until(()=>{const el=q("#size");return shown(el)&&el},4000);
    if(!control)throw Error("Größenfeld fehlt oder wurde noch nicht gerendert");
    await bringIntoView(control,"size",log);
    if(!await openSizeMenu(control,log))
      throw Error("Vinted-Größenraster nach Eingabe, Container-Klick und Scrollen nicht geöffnet");

    // Women's jeans generally expose letters on Vinted. A women's W/US/EU
    // label is preserved if Vinted really offers it; otherwise the
    // provisional conversion requires manual review before batch saving.
    const exactOriginal=sizeOptions().some(o=>norm(o.label)===norm(desired));
    if(group.gender==="women"&&!estimated&&!exactOriginal){
      const converted=estimator?.convertWomenLabel?.(desired,group);
      if(converted?.ok){
        estimated=converted;
        desired=converted.size;
        log("[SIZE WOMEN CONVERT] "+converted.originalLabel+" → "+desired+
          " (Damen-Buchstabengröße nur angenähert; Prüfung erforderlich)");
      }
    }
    // Never open the men's W waist submenu for a women's letter size.
    if(group.gender!=="women"||/^w\d{2}$/i.test(desired))
      await selectWaistSizing(draft,desired,log);
    const options=sizeOptions();
    if(options.some(o=>/fruhchen|neugeboren|1-3 monate/i.test(o.label)))
      throw Error("Vinted zeigt Babygrößen – falsche Kategorie");
    let result=catalog.sizeChoice(desired,options.map(o=>o.label),draft);
    // Some Vinted variants display 2XL instead of XXL, or XXXL instead
    // of 3XL. Accept only known equivalent letter labels.
    if(!result.ok&&group.gender==="women"&&estimator?.letterAliases){
      const aliases=estimator.letterAliases(desired);
      const available=options.find(o=>aliases.some(a=>norm(a)===norm(o.label)));
      if(available)result=catalog.sizeChoice(available.label,options.map(o=>o.label),draft);
    }
    if(!result.ok){
      log("[SIZE OPTIONS] "+JSON.stringify(options.map(o=>o.label)));
      throw Error("Größe "+desired+" nicht in der aktuellen Vinted-Größenauswahl gefunden"+
        (group.gender==="women"?"; keine unbestätigte Damen-Größe einsetzen":
          "; Taillenumfang ohne Umrechnung auf XS–XXL prüfen"));
    }
    const choice=options.find(o=>norm(o.label)===norm(result.size));
    if(!choice)throw Error("Zielgröße "+result.size+" steht nicht zur Auswahl");
    choice.el.click();
    const confirmed=await until(()=>value(q("#size"))===norm(result.size),3700);
    if(!confirmed){
      closeActiveDialog(control);
      throw Error("Größe angeklickt, aber nicht als Feldwert bestätigt");
    }
    if(shown(sizeGrid()))closeActiveDialog(control);
    if(estimated){
      const reason=estimated.source==="measured-waist"?
        "Größe "+result.size.toUpperCase()+" aus Bundweite "+estimated.waistCm+
          " cm geschätzt (keine Etikettgröße) – vor Speichern prüfen":
        estimated.reason+" – vor Speichern prüfen";
      log("[SIZE REVIEW] "+reason);
      log("[SIZE SELECTED] "+result.size.toUpperCase()+
        " (geschätzte Damen-/W-Größe, keine bestätigte Herstellergrößen-Zuordnung)");
      return {success:true,needsReview:true,reason};
    }
    log("[SIZE SELECTED] "+result.size.toUpperCase()+" (Originalgröße)");
    return {success:true};
  }
  function nameAlternatives(field,requested) {
    const val=norm(requested);
    const dict=field==="color"?COLORS:CONDITIONS;
    const pair=Object.entries(dict).find(([k,arr])=>[k,...arr].map(norm).includes(val));
    return pair?[...new Set([pair[0],...pair[1]].map(norm))]:[val];
  }
  function isCorrectFieldOption(field,element,aliases) {
    const label=optionText(element);
    if(aliases.includes(label))return true;
    if(field!=="condition")return false;
    // Vinted condition rows embed a long description after the heading,
    // e.g. "Sehr gut Ein nur selten benutzter Artikel ...".
    // Match only a *leading* heading, not any phrase within the description.
    return aliases.some(a=>label.startsWith(a+" ") || label.startsWith(a+",") ||
      label.startsWith(a+".") || label.startsWith(a+":"));
  }
  function fieldOptions(field,control) {
    const pref=field==="color"?
      '[data-testid*="color" i] [role="checkbox"], [data-testid*="color" i] [role="option"]':
      '[data-testid*="condition" i] [role="option"], [data-testid*="condition" i] [role="checkbox"]';
    const nearby=control.closest('[class*="input-dropdown" i],[class*="select" i]')?.parentElement;
    const selectors='[role="checkbox"],[role="option"],li,[role="radio"]';
    const root=nearby||document.body;
    const list=[...visible(pref),...visible(selectors,root)]
      .filter(el=>el!==control && !el.contains(control));
    return [...new Set(list)];
  }
  async function choiceField(field,draft,log){
    const requested=draft[field];
    if(!requested)throw Error(NAMES[field]+" fehlt im Entwurf");
    const control=required("#"+field,NAMES[field]+"-Auswahl fehlt");
    const aliases=nameAlternatives(field,requested);
    await bringIntoView(control,field,log);
    control.click();
    const found=await until(()=>{
      return fieldOptions(field,control).find(el=>isCorrectFieldOption(field,el,aliases))||null;
    },4000);
    if(!found){
      log("[OPTIONS "+field+"] "+JSON.stringify(fieldOptions(field,control)
        .map(el=>optionText(el)).filter(Boolean).slice(0,24)));
      throw Error(NAMES[field]+" "+requested+" nicht gefunden");
    }
    const clickTarget=found.matches('[role="checkbox"],[role="option"],[role="radio"]')?
      found:found.querySelector('[role="checkbox"],[role="option"],[role="radio"]')||found;
    clickTarget.click();
    const inField=()=>{
      const fieldValue=value(q("#"+field));
      return aliases.includes(fieldValue)||fieldValue.split(/[,;/]/).some(v=>aliases.includes(norm(v)));
    };
    // Checkbox pickers can defer writing the readonly input until closed.
    let accepted=await until(inField,950,130);
    if(!accepted){
      const ariaChecked=clickTarget.getAttribute("aria-checked")==="true" ||
        found.getAttribute("aria-checked")==="true";
      if(ariaChecked){
        log("[PENDING "+field+"] Checkbox markiert; prüfe nach Schließen des Menüs");
      }
      closeActiveDialog(control);
      accepted=await until(inField,2700,170);
    } else {
      closeActiveDialog(control);
    }
    if(!accepted)throw Error(NAMES[field]+" angeklickt, aber nicht als Feldwert bestätigt");
    log("["+field.toUpperCase()+" SELECTED] "+requested);
    return {success:true};
  }
  // Vinted's text/number inputs can display the same price as "25",
  // "25,00", "25.00 €" or "1.234,50 €". Normalize to integer cents
  // rather than comparing Number("25,00 €") (which is NaN).
  function priceCents(raw) {
    const compact=String(raw??"").replace(/\u00a0/g," ")
      .replace(/\bEUR\b/gi,"").replace(/€/g,"").replace(/\s+/g,"").trim();
    if(!compact||!/^\d+(?:[.,]\d+)*$/.test(compact))return null;
    const last=Math.max(compact.lastIndexOf(","),compact.lastIndexOf("."));
    let whole=compact,fraction="";
    if(last!==-1){
      const after=compact.slice(last+1);
      // 3 digits after one separator is generally a thousands group.
      const decimals=after.length===1||after.length===2;
      if(decimals){
        whole=compact.slice(0,last);
        fraction=after.padEnd(2,"0");
      }
    }
    const stripped=whole.replace(/[.,]/g,"");
    if(!/^\d+$/.test(stripped))return null;
    const cents=Number(stripped)*100+Number(fraction||"0");
    return Number.isSafeInteger(cents)?cents:null;
  }
  function editablePriceField(){
    return visible('#price, input[name="price"], input[data-testid*="price" i]')
      .find(el=>el.tagName==="INPUT")||null;
  }
  async function price(draft,log){
    const expected=priceCents(draft.price);
    if(expected===null||expected<=0)throw Error("Preis ungültig oder fehlt");
    const el=await until(editablePriceField,4400);
    if(!el)throw Error("Preisfeld nicht sichtbar");
    await bringIntoView(el,"price",log);
    const type=norm(el.getAttribute("type")||el.type||"text");
    const clean=String(draft.price).replace(/\bEUR\b/gi,"")
      .replace(/[€\s]/g,"");
    // Native number inputs require a decimal point. Vinted's common text
    // input receives the original localized representation instead.
    const written=type==="number" ?
      String(expected/100) : clean;
    setReactValue(el,written);
    el.blur(); // React/Vinted may commit and localize on blur.
    await sleep(260);
    const read=()=> {
      const live=editablePriceField();
      if(!live)return {raw:"",cents:null};
      const raw=live.value || live.getAttribute("aria-valuenow") || "";
      return {raw:String(raw),cents:priceCents(raw)};
    };
    const confirmed=await until(()=>read().cents===expected,3200,180);
    // Require the value to survive at least one additional render cycle:
    // this avoids confirming a write that React subsequently overwrites.
    if(confirmed)await sleep(320);
    const actual=read();
    log("[PRICE VERIFY] expected="+(expected/100).toFixed(2)+
      " actual="+JSON.stringify(actual.raw)+
      " parsed="+(actual.cents===null?"invalid":(actual.cents/100).toFixed(2))+
      " confirmed="+Boolean(confirmed&&actual.cents===expected));
    if(!confirmed||actual.cents!==expected)
      throw Error("Preis nicht sicher bestätigt – sichtbaren Wert bitte prüfen");
    return {success:true};
  }
  function imageSourceKind(image) {
    if(image instanceof File)return "file";
    const url=typeof image==="string"?image:(image?.dataUrl||image?.url);
    if(typeof url!=="string"||!url)return "missing";
    if(url.startsWith("data:image/"))return "data-image";
    if(url.startsWith("data:"))return "unsupported-data";
    if(url.startsWith("https://"))return "remote-https";
    if(url.startsWith("http://"))return "remote-http";
    if(url.startsWith("blob:"))return "blob-url";
    return "unsupported";
  }
  async function imageFile(image,index) {
    if(image instanceof File)return image;
    const url=typeof image==="string"?image:(image?.dataUrl||image?.url);
    const kind=imageSourceKind(image);
    const name=image?.name||("jeans_"+(index+1)+".jpg");
    if(kind==="missing")
      throw Error("Bildquelle fehlt. Fotos in Sascha AI kontrollieren.");
    if(kind==="data-image"){
      // Decode portable photo payloads directly. No network, CORS, or
      // expiring Supabase signature is needed on the Vinted page.
      const match=String(url).match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i);
      if(match){
        try {
          const binary=atob(match[2].replace(/\s+/g,""));
          const bytes=new Uint8Array(binary.length);
          for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
          if(!bytes.length)throw Error("Bild ist leer");
          return new File([bytes],name,{type:match[1].toLowerCase()});
        }catch(e) {
          throw Error("Bilddaten sind beschädigt: "+(e?.message||"Base64 ungültig"));
        }
      }
      // Some older drafts use percent-encoded image data URLs.
    }else if(!["remote-https","remote-http"].includes(kind)){
      throw Error("Bildquelle '"+kind+"' kann nicht auf Vinted geladen werden. "+
        "Sascha AI aktualisieren und Entwurf erneut übernehmen.");
    }
    try {
      const response=await fetch(url);
      if(!response.ok)throw Error("HTTP "+response.status);
      const blob=await response.blob();
      if(!blob?.size)
        throw Error("Datei leer oder Bildzugriff nicht möglich");
      return new File([blob],name,{type:blob.type||"image/jpeg"});
    }catch(e) {
      throw Error(kind+": "+(e?.message||"Netzwerk-/CORS-Fehler")+
        ". Sascha AI neu laden, damit die Bilder im eigenen Tab vorbereitet werden.");
    }
  }
  const MAX_VINTED_IMAGES=4;
  function selectedDraftImages(draft) {
    return Array.isArray(draft?.images)?draft.images.slice(0,MAX_VINTED_IMAGES):[];
  }
  function uploadPreviewArea(input) {
    // Vinted uses multiple photo components. Not every variant has a
    // data-testid containing "photo-upload". A nearest form section is
    // preferable to searching all <img> elements on the page.
    const selectors=[
      '[data-testid*="photo-upload" i]',
      '[data-testid*="image-upload" i]',
      '[data-testid*="item-photo" i]',
      '[data-testid*="upload-photo" i]',
      '[data-testid*="photo" i][data-testid*="upload" i]',
      '[data-testid*="image" i][data-testid*="upload" i]',
      '[class*="photo-upload" i]',
      '[class*="PhotoUpload" i]',
      '[class*="upload-photo" i]'
    ].join(",");
    const explicit=input.closest?.(selectors);
    if(explicit)return explicit;
    const roots=visible(selectors);
    const near=roots.find(el=>el.contains?.(input));
    if(near)return near;
    // The uploader is commonly rendered inside a fieldset or section with
    // a localized Photos label, but no stable class or data-testid.
    const structural=input.closest?.("fieldset,section,[role=group]");
    if(structural&&structural.contains?.(input))return structural;
    const ancestor=input.parentElement;
    // A small enclosing wrapper is a valid fallback only when it contains
    // actual photos. Do not count unrelated pictures from the whole form.
    let node=ancestor;
    for(let depth=0;node&&depth<6;depth++,node=node.parentElement){
      if(node===document.body||node.tagName==="FORM"||node.tagName==="MAIN")break;
      if(node.querySelectorAll?.("img,[style*='background-image']").length)
        return node;
    }
    return null;
  }
  function uploadPreviewCount(input){
    const area=uploadPreviewArea(input);
    if(!area)return null;
    const selectors=[
      '[data-testid*="photo-preview" i]',
      '[data-testid*="image-preview" i]',
      '[data-testid*="uploaded-photo" i]',
      '[data-testid*="uploaded-image" i]',
      '[data-testid*="photo-thumbnail" i]',
      '[data-testid*="image-thumbnail" i]',
      '[data-testid*="image-item" i]',
      '[data-testid*="photo-item" i]'
    ].join(",");
    const specific=visible(selectors,area).filter(el=>
      !el.closest?.('[data-testid*="placeholder" i],[data-testid*="loading" i]'));
    if(specific.length)return specific.length;
    // Preview URLs are not guaranteed to be blob: after Vinted uploads the
    // file; some variants use arbitrary CDN hosts and background-image CSS.
    // Only count media with photo-scale geometry, inside the photo section.
    const isPhotoSize=el=>{
      const box=el.getBoundingClientRect?.();
      if(!box||!Number.isFinite(box.width)||!Number.isFinite(box.height))
        return false;
      return box.width>=48&&box.height>=48;
    };
    const photos=visible("img",area).filter(el=>{
      if(!isPhotoSize(el))return false;
      const url=String(el.currentSrc||el.src||el.getAttribute?.("src")||"");
      return url && !/^(?:data:image\/svg|about:blank)/i.test(url) &&
        !el.closest?.('[data-testid*="placeholder" i]');
    });
    if(photos.length)return photos.length;
    const backgrounds=visible('[style*="background-image"]',area)
      .filter(el=>{
        if(!isPhotoSize(el))return false;
        const style=String(el.style?.backgroundImage||getComputedStyle(el).backgroundImage||"");
        return /url\(["']?(?:blob:|data:image\/|https?:\/\/)/i.test(style) &&
          !el.closest?.('[data-testid*="placeholder" i]');
      });
    return backgrounds.length||0;
  }
  function imagePreviewDiagnostic(input){
    const area=uploadPreviewArea(input);
    return {area:area?{
      tag:area.tagName||"unknown",
      testid:area.getAttribute?.("data-testid")||"",
      className:String(area.className||"").slice(0,90)
    }:null,
      visiblePhotos:uploadPreviewCount(input),
      inputFiles:Number(input?.files?.length)||0};
  }
  async function images(draft,log,options={}){
    const selected=selectedDraftImages(draft);
    if(!selected.length)throw Error("Keine Entwurfsbilder");
    const input=q('main input[type="file"]')||q('input[type="file"]');
    if(!input)throw Error("Bilder-Uploadelement nicht gefunden");
    // File inputs are often hidden: scroll to the upload area, not the input.
    await bringIntoView(input.parentElement||input,"images");
    // Always create new edited JPEGs. Never send original image bytes to
    // Vinted, and never silently fall back to unedited files on edit failures.
    const editor=window.SaschaVintedImageEdit;
    if(!editor?.processImage)
      throw Error("Bildbearbeitung fehlt: Extension vollständig aktualisieren");
    const files=[];
    for(let i=0;i<selected.length;i++){
      const kind=imageSourceKind(selected[i]);
      log("[IMAGE SOURCE] "+(i+1)+"/"+selected.length+" kind="+kind);
      let source;
      try {
        source=await imageFile(selected[i],i);
      }catch(e) {
        log("[IMAGE LOAD ERROR] "+(i+1)+": "+(e?.message||String(e)));
        throw Error("Bild "+(i+1)+" konnte nicht geladen werden: "+
          (e?.message||String(e)));
      }
      const rendered=await editor.processImage(source,i);
      if(!rendered?.file || rendered.file.type!=="image/jpeg")
        throw Error("Bearbeitung von Bild "+(i+1)+" fehlgeschlagen");
      files.push(rendered.file);
      log("[IMAGE EDIT] "+(i+1)+"/"+selected.length+
        " new="+rendered.file.name+
        " gradedPixels="+Number(rendered.gradedPixels||0)+
        " colorLook="+(rendered.colorLook||"not-reported")+
        " intensity="+(Number(rendered.gradeIntensity)||"unknown")+
        " avgRgbDelta="+(Number(rendered.averageRgbDelta)||0)+
        " noticeablePct="+(Number(rendered.noticeablePercent)||0));
    }
    const transfer=new DataTransfer();
    for(const file of files)transfer.items.add(file);
    input.files=transfer.files;
    const assigned=Number(input.files?.length)||0;
    if(assigned!==files.length)
      throw Error("Browser hat nur "+assigned+"/"+files.length+" Bilddateien angenommen");
    log("[IMAGES SUBMIT] first="+files.length+" total="+draft.images.length+
      " skipped="+Math.max(0,draft.images.length-files.length)+
      " assigned="+assigned+" edited=true");
    const previewsBefore=uploadPreviewCount(input);
    input.dispatchEvent(new Event("change",{bubbles:true}));
    input.dispatchEvent(new Event("input",{bubbles:true}));
    // In Vinted, the native input may be cleared immediately once React
    // receives the files. input.files.length is NOT upload confirmation.
    const previewSeen=await until(()=>{
      const n=uploadPreviewCount(input);
      return n!==null && n>=files.length && (previewsBefore===null || n>previewsBefore) ? n : null;
    },8500,220);
    const previewsAfter=uploadPreviewCount(input);
    const retained=Number(input.files?.length)||0;
    const verified=Boolean(previewSeen);
    log("[IMAGES VERIFY] requested="+files.length+
      " inputAfter="+retained+" previewBefore="+
      (previewsBefore===null?"unknown":previewsBefore)+
      " previewAfter="+(previewsAfter===null?"unknown":previewsAfter)+
      " verified="+verified);
    if(verified){
      return {success:true,count:files.length,needsReview:false,
        previewVerified:true};
    }
    log("[IMAGES DIAG] "+JSON.stringify(imagePreviewDiagnostic(input)));
    // These images have been successfully handed to the file control;
    // the gallery is simply not externally inspectable in this Vinted
    // variant. Only an EXPLICIT draft-only batch may continue to save
    // a draft; never treat this as actual gallery verification and
    // NEVER publish an item automatically.
    if(options.draftOnlyBatch===true && assigned===files.length &&
        files.length===selected.length){
      log("[IMAGES DRAFT-ONLY] "+files.length+" bearbeitete Bilder übergeben; "+
        "Vorschaubilder technisch nicht nachweisbar. "+
        "Entwurfsspeichern erlaubt, Fotos danach unbedingt prüfen.");
      return {success:true,count:files.length,needsReview:false,
        previewVerified:false,reviewAfterSave:true,
        warning:"Vinted-Vorschau nicht automatisch bestätigt; "+
          "Bilder im gespeicherten Entwurf kontrollieren"};
    }
    log("[IMAGES REVIEW] Vier Bilder an Vinted übergeben; bitte prüfen, "+
      "dass genau Bilder 1–4 sichtbar sind und Bild 5 fehlt.");
    return {success:true,count:files.length,needsReview:true,
      previewVerified:false,
      reason:"Vier Bilder übergeben; die sichtbare Vorschau bitte prüfen"};
  }
  async function run(draft,log,options={}){
    const steps=[
      ["title",()=>textField("Titel","#title",articleTitle(draft))],
      ["description",()=>textField("Beschreibung","#description",draft.description)],
      ["category",()=>chooseCategory(draft,log)],
      ["brand",()=>brand(draft,log)],
      ["size",()=>size(draft,log)],
      ["color",()=>choiceField("color",draft,log)],
      ["condition",()=>choiceField("condition",draft,log)],
      ["price",()=>price(draft,log)],
      ["images",()=>images(draft,log,options)]
    ];
    const results={};
    let stoppedAt=null;
    log("[ENGINE V3] Katalogbasiert, pro Feld bestätigt; keine Veröffentlichung");
    for(let i=0;i<steps.length;i++){
      const [key,fn]=steps[i];
      const n=i+1;log("[SCHRITT "+n+"/9] "+NAMES[key]+" beginnt");
      try{
        results[key]=await fn();
        if(!results[key]?.success)throw Error(results[key]?.reason||"Nicht bestätigt");
        if(results[key]?.needsReview){
          log("[PRÜFEN] "+NAMES[key]+": "+
            (results[key].reason||"Bitte vor Speichern kontrollieren"));
        }else{
          log("[OK] "+NAMES[key]+" bestätigt");
        }
      }catch(error){
        stoppedAt=key;
        results[key]={success:false,reason:error.message||String(error)};
        log("[STOP] "+NAMES[key]+": "+results[key].reason);
        for(const [next] of steps.slice(i+1))
          results[next]={success:false,reason:"Übersprungen wegen "+NAMES[key]};
        break;
      }
      if(i<steps.length-1)await sleep(STEP_GAP);
    }
    const pending=Object.entries(results).filter(([,v])=>v?.needsReview).map(([k])=>NAMES[k]);
    log(stoppedAt?"[FERTIG] Vorzeitig gestoppt, keine Veröffentlichung":
      pending.length?"[FERTIG] Übertragen; manuelle Prüfung: "+pending.join(", ")+
        ". Keine Veröffentlichung":
      "[FERTIG] Felder bestätigt; bitte vor Speichern alles prüfen");
    return {results,stoppedAt};
  }
  // Only explicitly labeled "Save draft" is allowed. Never publish.
  const ALLOWED_DRAFT_BUTTONS=new Set([
    "entwurf speichern","als entwurf speichern","entwurf sichern",
    "save draft","save as draft","save to drafts"
  ]);
  const PUBLISH_TEXT=/ver[oö]ffentlichen|publish|jetzt einstellen|artikel einstellen|upload now|post listing/i;
  function draftButtonCandidates(){
    return visible('button,[role="button"],input[type="submit"],input[type="button"]')
      .filter(el=>{
        const label=norm(el.innerText||el.textContent||el.value||
          el.getAttribute?.("aria-label")||el.getAttribute?.("title")||"")
          .replace(/\s+/g," ").trim();
        const testid=norm(el.getAttribute?.("data-testid")||"");
        const allowed=ALLOWED_DRAFT_BUTTONS.has(label) ||
          /^(?:upload-form-)?save-draft-button$/.test(testid);
        return allowed&&!PUBLISH_TEXT.test(label)&&!el.disabled&&
          el.getAttribute?.("aria-disabled")!=="true";
      });
  }
  function draftSaveDiagnostics(){
    return visible('button,[role="button"]').slice(-30).map(el=>({
      label:String(el.innerText||el.textContent||el.getAttribute?.("aria-label")||"")
        .trim().replace(/\s+/g," ").slice(0,85),
      testid:String(el.getAttribute?.("data-testid")||"").slice(0,80),
      disabled:!!el.disabled
    }));
  }
  function draftSaveStatus(){
    const signals=visible('[role="alert"],[role="status"],[aria-live],'+
      '[data-testid*="toast" i],[class*="Toast" i],[class*="notification" i]');
    const savedWords=/(?:entwurf(?:\s+(?:wurde|ist))?\s+gespeichert|als\s+entwurf\s+gespeichert|draft\s+(?:was\s+)?saved|saved\s+(?:as\s+)?(?:a\s+)?draft)/i;
    const match=signals.find(el=>savedWords.test(String(el.textContent||"")));
    return match?{saved:true,
      evidence:String(match.textContent||"").trim().replace(/\s+/g," ").slice(0,110)
    }:{saved:false};
  }
  function trySaveAsDraft(){
    const buttons=draftButtonCandidates();
    if(buttons.length!==1)return{
      clicked:false,error:buttons.length===0?
        "Kein eindeutiger Button 'Entwurf speichern' gefunden":
        "Mehrere Entwurf-Speichern-Buttons sichtbar",
      available:draftSaveDiagnostics()
    };
    const element=buttons[0];
    element.scrollIntoView?.({block:"center"});
    element.click();
    return {clicked:true,label:String(element.textContent||element.value||"").trim().slice(0,80)};
  }

  let running=false;
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message?.type==="PING_VINTED_ENGINE"){
      sendResponse({ready:!!q("#title")&&!!q("#description")});return false;
    }
    if(message?.type==="CHECK_VINTED_DRAFT_SAVE"){
      sendResponse(draftSaveStatus());return false;
    }
    if(message?.type==="SAVE_VINTED_DRAFT"){
      if(running){sendResponse({clicked:false,error:"Ausfüllung läuft noch"});return false;}
      try{sendResponse(trySaveAsDraft());}
      catch(e){sendResponse({clicked:false,error:e.message||String(e)});}
      return false;
    }
    if(message?.type!=="FILL_VINTED_FORM")return;
    if(running){sendResponse({success:false,error:"Ausfüllung läuft bereits"});return false;}
    running=true;
    const logs=[];
    const log=line=>{
      logs.push(line);
      console.log("[Sascha Vinted V3]",line);
      if(/^\[(SCHRITT|OK|STOP)\]/.test(line)){
        try{chrome.runtime.sendMessage({type:"VINTED_FILL_PROGRESS",message:line},()=>void chrome.runtime.lastError);}catch(_){}
      }
    };
    run(message.draft||{},log,{draftOnlyBatch:message.draftOnlyBatch===true})
      .then(result=>sendResponse({success:true,...result,logs}))
      .catch(err=>sendResponse({success:false,error:err.message}))
      .finally(()=>{running=false;});
    return true;
  });
  // Available only for local, isolated automated tests (not an API for Vinted).
  if(window.__SASCHA_TEST__)window.__SASCHA_ENGINE_TEST__={
    articleTitle,liveCatalogRows,optionText,nameAlternatives,run,chooseCategory,size,
    sizeOptions,sizeMenuDiagnostic,openSizeMenu,selectWaistSizing,waistModeMatch,isCorrectFieldOption,
    price,priceCents,editablePriceField,images,selectedDraftImages,uploadPreviewArea,uploadPreviewCount,imagePreviewDiagnostic,
    imageFile,imageSourceKind,
    draftButtonCandidates,draftSaveDiagnostics,draftSaveStatus,trySaveAsDraft
  };
})();
