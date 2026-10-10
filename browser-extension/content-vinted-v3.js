/* Sascha AI → Vinted form engine v3. Does not publish or save.
   Requires vinted-catalog-v3.js to be loaded first. */
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
  const SIZE_OPTION_QUERY='[role="checkbox"][data-testid*="size-group" i], [data-testid*="size-grid-option" i]';
  function sizeGrids(){
    return visible('[data-testid="category-size-single-grid-content"], [data-testid*="size-single-grid-content" i], [data-testid*="size-grid-content" i]');
  }
  function sizeGrid(){
    return sizeGrids().find(grid=>visible(SIZE_OPTION_QUERY,grid).length>0) ||
      sizeGrids()[0] || null;
  }
  function sizeOptions(){
    const grids=sizeGrids();
    const seen=new Set();
    return grids.flatMap(grid=>visible(SIZE_OPTION_QUERY,grid))
      .map(el=>({el,label:optionText(el)}))
      .filter(o=>o.label && !seen.has(o.label) && seen.add(o.label));
  }
  function sizeMenuReady(){
    return sizeOptions().length>0;
  }
  function sizeMenuDiagnostic(){
    const control=q("#size"), grids=qa('[data-testid*="size" i][data-testid*="grid" i]');
    const sizeFields=qa('input[id="size"],input[data-testid*="size" i]').slice(0,7);
    const fields=sizeFields.map(el=>({
      tag:el.tagName.toLowerCase(),id:el.id||"",
      testid:el.getAttribute("data-testid")||"",
      readonly:!!el.readOnly,shown:shown(el),
      rect:el.getBoundingClientRect?{
        y:Math.round(el.getBoundingClientRect().y),
        bottom:Math.round(el.getBoundingClientRect().bottom)
      }:null
    }));
    const gridInfo=grids.slice(0,8).map(el=>({
      testid:el.getAttribute("data-testid")||"",
      shown:shown(el),choices:visible(SIZE_OPTION_QUERY,el).length
    }));
    const active=document.activeElement;
    return {fields,gridInfo,activeId:active?.id||"",
      brandSearchOpen:shown(q("#brand-search-input")),
      categorySearchOpen:shown(q("#catalog-search-input")),
      viewportHeight:window.innerHeight||null};
  }
  async function openSizeMenu(control,log){
    const candidates=[{name:"input",el:control}];
    const wrapper=control.closest?.('[data-testid*="size" i][class*="dropdown" i]') ||
      control.parentElement?.closest?.('[class*="input-dropdown" i]') ||
      control.parentElement;
    if(wrapper && wrapper!==control)candidates.push({name:"wrapper",el:wrapper});
    const chev=q('[data-testid="category-size-single-grid-chevron-down"], [data-testid*="size" i][data-testid*="chevron-down" i]');
    if(chev && shown(chev) && !candidates.some(x=>x.el===chev))
      candidates.push({name:"chevron",el:chev});
    for(const {name,el} of candidates){
      if(sizeMenuReady())return true;
      if(!shown(el))continue;
      await bringIntoView(el,"size",log);
      log("[SIZE OPEN] click "+name);
      el.click();
      if(await until(sizeMenuReady,1600,130)){
        log("[SIZE OPEN] choices="+sizeOptions().length+" via="+name);
        return true;
      }
      await sleep(150);
    }
    log("[SIZE DIAG] "+JSON.stringify(sizeMenuDiagnostic()));
    return false;
  }
  async function size(draft,log){
    const desired=String(draft.size||"").trim();
    if(!desired)throw Error("Größe fehlt im Entwurf");
    const control=await until(()=>{const el=q("#size");return shown(el)&&el},4000);
    if(!control)throw Error("Größenfeld fehlt oder wurde noch nicht gerendert");
    await bringIntoView(control,"size",log);
    if(!await openSizeMenu(control,log))
      throw Error("Vinted-Größenraster nach Eingabe, Container-Klick und Scrollen nicht geöffnet");
    const options=sizeOptions();
    if(options.some(o=>/fruhchen|neugeboren|1-3 monate/i.test(o.label)))
      throw Error("Vinted zeigt Babygrößen – falsche Kategorie");
    const result=catalog.sizeChoice(desired,options.map(o=>o.label),draft);
    if(!result.ok && !result.needsReview) {
      log("[SIZE OPTIONS] "+JSON.stringify(options.map(o=>o.label)));
      throw Error(result.reason||"Größe nicht zuordenbar");
    }
    if(result.needsReview) {
      log("[SIZE REVIEW] "+desired+" → "+result.size.toUpperCase()+
        " ("+result.source+"). Nur Richtwert – vor Veröffentlichung Etikett prüfen.");
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
    log("[SIZE SELECTED] "+result.size.toUpperCase()+(result.needsReview?" (bitte überprüfen)":""));
    return {success:true,needsReview:!!result.needsReview};
  }
  function nameAlternatives(field,requested) {
    const val=norm(requested);
    const dict=field==="color"?COLORS:CONDITIONS;
    const pair=Object.entries(dict).find(([k,arr])=>[k,...arr].map(norm).includes(val));
    return pair?[...new Set([pair[0],...pair[1]].map(norm))]:[val];
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
      return fieldOptions(field,control).find(el=>aliases.includes(optionText(el)))||null;
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
  async function price(draft){
    const amount=String(draft.price??"").replace(/[€\s]/g,"").replace(",",".");
    if(!Number.isFinite(Number(amount))||Number(amount)<=0)
      throw Error("Preis ungültig oder fehlt");
    const el=await until(()=>{const inp=q('#price, input[name="price"]');return shown(inp)&&inp;},4400);
    if(!el)throw Error("Preisfeld nicht sichtbar");
    await bringIntoView(el,"price");
    setReactValue(el,String(draft.price).replace(/[€\s]/g,""));
    const confirmed=await until(()=>{
      const actual=(q("#price, input[name=price]")?.value||"").replace(",",".");
      return Number(actual)===Number(amount);
    },1700);
    if(!confirmed)throw Error("Preiswert nicht bestätigt");
    el.blur();
    return {success:true};
  }
  async function imageFile(image,index){
    if(image instanceof File)return image;
    const url=typeof image==="string"?image:(image?.dataUrl||image?.url);
    if(typeof url!=="string")return null;
    const name=image?.name||("jeans_"+(index+1)+".jpg");
    if(!url.startsWith("data:")&&!url.startsWith("https://"))return null;
    try{
      const response=await fetch(url);
      if(!response.ok)throw Error("Bilddatei HTTP "+response.status);
      const blob=await response.blob();
      return new File([blob],name,{type:blob.type||"image/jpeg"});
    }catch(_){return null;}
  }
  async function images(draft){
    if(!Array.isArray(draft.images)||!draft.images.length)throw Error("Keine Entwurfsbilder");
    const input=q('main input[type="file"]')||q('input[type="file"]');
    if(!input)throw Error("Bilder-Uploadelement nicht gefunden");
    // File inputs are often hidden: scroll to the surrounding upload area instead.
    await bringIntoView(input.parentElement||input,"images");
    const files=await Promise.all(draft.images.map(imageFile));
    if(files.some(file=>!file))throw Error("Mindestens ein Bild konnte nicht geladen werden");
    const transfer=new DataTransfer();
    for(const file of files)transfer.items.add(file);
    input.files=transfer.files;
    input.dispatchEvent(new Event("change",{bubbles:true}));
    input.dispatchEvent(new Event("input",{bubbles:true}));
    if(input.files.length!==files.length)throw Error("Bildanzahl nicht übernommen");
    return {success:true};
  }
  async function run(draft,log){
    const steps=[
      ["title",()=>textField("Titel","#title",articleTitle(draft))],
      ["description",()=>textField("Beschreibung","#description",draft.description)],
      ["category",()=>chooseCategory(draft,log)],
      ["brand",()=>brand(draft,log)],
      ["size",()=>size(draft,log)],
      ["color",()=>choiceField("color",draft,log)],
      ["condition",()=>choiceField("condition",draft,log)],
      ["price",()=>price(draft)],
      ["images",()=>images(draft)]
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
        log("[OK] "+NAMES[key]+" bestätigt");
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
    log(stoppedAt?"[FERTIG] Vorzeitig gestoppt, keine Veröffentlichung":
      "[FERTIG] Felder bestätigt; bitte vor Speichern alles prüfen");
    return {results,stoppedAt};
  }
  let running=false;
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
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
    run(message.draft||{},log).then(result=>sendResponse({success:true,...result,logs}))
      .catch(err=>sendResponse({success:false,error:err.message}))
      .finally(()=>{running=false;});
    return true;
  });
  // Available only for local, isolated automated tests (not an API for Vinted).
  if(window.__SASCHA_TEST__)window.__SASCHA_ENGINE_TEST__={
    articleTitle,liveCatalogRows,optionText,nameAlternatives,run,chooseCategory,size,
    sizeOptions,sizeMenuDiagnostic,openSizeMenu
  };
})();
