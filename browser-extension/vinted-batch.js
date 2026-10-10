/* Sascha AI → Vinted batch draft saver.
 * Deliberately ONLY saves as drafts; does not publish listings.
 * Runs in the MV3 background service worker (not in the popup), so closing
 * the popup does not end a currently running series.
 * A save must be verifiably acknowledged before advancing to the next item.
 * Never retry a save automatically; ambiguous results stop for inspection.
 */
(() => {
  "use strict";
  const KEY="vintedBatchState";
  const CONFIRMED_KEY="vintedConfirmedArticleNumbers";
  const NEXT_ALARM="saschaVintedBatchNext";
  const GUARD_ALARM="saschaVintedBatchGuard";
  const MAX_BATCH=100;
  const NEW_ITEM_PATH="/items/new";
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let busy=false,stopRequested=false;
  let state=null;

  function validId(v){return typeof v==="string"&&v.length>0&&v.length<256;}
  function articleNumber(v){
    const value=String(v??"").trim().replace(/^#/,"");
    return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value)>0 ?
      Number(value):null;
  }
  function orderedQueue(drafts,selectedId){
    if(!Array.isArray(drafts)||drafts.length===0||drafts.length>MAX_BATCH)
      throw Error("Keine gültige Entwurfsliste oder mehr als "+MAX_BATCH+" Hosen.");
    const uniq=new Set(),numbers=new Set();
    const rows=drafts.map((d,index)=>{
      if(!validId(d?.id)||uniq.has(d.id))
        throw Error("Ungültige oder doppelte Entwurf-ID");
      uniq.add(d.id);
      const nr=articleNumber(d.artikelnummer);
      if(nr===null)throw Error("Hose ohne gültige Artikelnummer: "+(d.title||d.id));
      if(numbers.has(nr))throw Error("Doppelte Artikelnummer #"+nr);
      numbers.add(nr);
      return {id:d.id,artikelnummer:nr,title:String(d.title||"").slice(0,90),index};
    }).sort((a,b)=>a.artikelnummer-b.artikelnummer || a.index-b.index);
    const selected=rows.findIndex(r=>r.id===selectedId);
    if(selected<0)throw Error("Ausgewählte Hose nicht in der Entwurfsliste");
    return rows.slice(selected);
  }
  function validVintedUrl(url){
    try{
      const u=new URL(url);
      return u.protocol==="https:"&&["www.vinted.de","www.vinted.at"].includes(u.hostname);
    }catch(_){return false;}
  }
  function savedUrl(url){
    if(!validVintedUrl(url))return false;
    const u=new URL(url);
    return /\/drafts(?:\/|$)/i.test(u.pathname) ||
      /^(?:drafts?|saved-drafts)$/i.test(u.searchParams.get("tab")||"") ||
      /^(?:drafts?|saved-drafts)$/i.test(u.searchParams.get("type")||"");
  }
  function saschaUrl(url){
    try{
      const u=new URL(url);
      return ["http:","https:"].includes(u.protocol) &&
        (u.hostname.endsWith(".vercel.app") ||
          u.hostname==="localhost" || u.hostname==="127.0.0.1");
    }catch(_){return false;}
  }
  async function put(next){
    state={...next,updatedAt:Date.now()};
    await chrome.storage.local.set({[KEY]:state});
    return state;
  }
  async function log(message,patch={}){
    const history=[...(state?.logs||[]),String(message)].slice(-75);
    await put({...state,...patch,logs:history});
    console.info("[Sascha Draft Batch]",message);
  }
  async function getState(){
    return (await chrome.storage.local.get(KEY))[KEY]||null;
  }
  async function tabMessage(tabId,message,timeout=90000){
    let timer;
    try {
      return await Promise.race([
        chrome.tabs.sendMessage(tabId,message),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(
          Error("Zeitlimit beim Datenaustausch überschritten")),timeout);})
      ]);
    }finally{clearTimeout(timer);}
  }
  async function findSascha(){
    const tabs=await chrome.tabs.query({});
    const tab=tabs.find(t=>saschaUrl(t.url||""));
    if(!tab?.id)throw Error("Kein geöffneter Sascha-AI-Tab gefunden");
    return tab;
  }
  // chrome.tabs.create() may resolve BEFORE Chrome has committed the
  // requested URL. During the first navigation, tab.url may still be
  // empty/about:blank/chrome://newtab even though tab.pendingUrl points to
  // Vinted. Never confuse this temporary startup state with a redirect.
  // Once the committed URL is foreign, stop; do not follow arbitrary sites.
  function safeTabLocation(url){
    if(!url)return "(noch keine URL)";
    try{
      const u=new URL(url);
      if(["http:","https:"].includes(u.protocol))
        return u.origin+u.pathname; // never leak signed query params/tokens
    }catch(_){}
    return String(url).split("?")[0].slice(0,120);
  }
  function tabNavigationState(tab,elapsedMs=0){
    const current=String(tab?.url||"");
    const pending=String(tab?.pendingUrl||"");
    if(validVintedUrl(current))return {kind:"vinted",where:safeTabLocation(current)};
    const initial=!current||current==="about:blank"||
      /^chrome:\/\/(?:newtab|new-tab-page)(?:\/|$)/i.test(current);
    if(initial&&(validVintedUrl(pending)||elapsedMs<8000))
      return {kind:"pending",where:safeTabLocation(pending||current),
        status:tab?.status||"unbekannt"};
    return {kind:"blocked",where:safeTabLocation(current),
      pending:safeTabLocation(pending),status:tab?.status||"unbekannt"};
  }
  async function waitForEditor(tabId,timeout=35000,pollMs=600){
    const started=Date.now();
    let lastWhere="(noch keine URL)",lastError="";
    while(Date.now()-started<timeout){
      if(stopRequested)throw Error("Stapel wurde gestoppt");
      let tab;
      try{tab=await chrome.tabs.get(tabId);}
      catch(e){throw Error("Vinted-Tab wurde geschlossen oder ist nicht erreichbar: "+(e?.message||e));}
      const navigation=tabNavigationState(tab,Date.now()-started);
      lastWhere=navigation.where;
      if(navigation.kind==="blocked"){
        throw Error("Vinted-Verkaufsformular nicht erreichbar: Tab ist auf "+
          navigation.where+" (Status: "+navigation.status+
          ", nächstes Ziel: "+navigation.pending+"). "+
          "Prüfe, ob Vinted dich umgeleitet hat oder eine Anmeldung verlangt.");
      }
      if(navigation.kind==="vinted"){
        try{
          const response=await tabMessage(tabId,{type:"PING_VINTED_ENGINE"},2400);
          if(response?.ready)return;
          lastError="Formularfelder noch nicht sichtbar";
        }catch(e){
          lastError="Extension-Formularskript noch nicht bereit: "+(e?.message||String(e));
        }
      }else{
        lastError="Tab lädt noch (Status: "+navigation.status+")";
      }
      await delay(pollMs);
    }
    throw Error("Vinted-Verkaufsformular nach "+Math.round(timeout/1000)+
      " Sekunden nicht bereit auf "+lastWhere+". "+
      (lastError||"Bitte Vinted-Anmeldung und die geöffnete Seite prüfen.")+
      " – Tab bleibt zur Prüfung offen.");
  }
  async function verifySave(tabId,originalUrl,articleNumber){
    const started=Date.now();
    let last={};
    while(Date.now()-started<18000){
      const tab=await chrome.tabs.get(tabId);
      const url=tab.url||"";
      if(savedUrl(url))return {ok:true,evidence:"Vinted-Entwurfsübersicht"};
      const navigation=tabNavigationState(tab,Date.now()-started);
      if(navigation.kind==="blocked")
        throw Error("Speichern unklar: Vinted-Tab wurde nach "+
          navigation.where+" umgeleitet. Keine Wiederholung – Entwürfe prüfen.");
      if(navigation.kind==="pending"){
        await delay(650);
        continue;
      }
      try{
        const check=await tabMessage(tabId,{
          type:"CHECK_VINTED_DRAFT_SAVE",articleNumber
        },2500);
        if(check?.saved===true)return {ok:true,evidence:check.evidence||"Vinted-Speicherbestätigung"};
        if(check?.error)last={error:check.error};
      }catch(e){last={error:e.message};}
      await delay(650);
    }
    throw Error("Vinted hat das Speichern nicht eindeutig bestätigt. "+
      "Die Hose nicht erneut automatisch senden; Entwürfe zuerst prüfen. "+
      (last.error||""));
  }
  // A positive manual confirmation is required if Vinted saved the draft
  // without a URL/toast the extension can recognise. Supports the v3.16
  // failed state too, without ever clicking Save draft a second time.
  function recoverableSave(state){
    if(!state||!Array.isArray(state.queue))return false;
    const row=state.queue[state.index];
    if(!row||row.id!==state.currentId)return false;
    if(state.status==="awaiting_confirmation"&&state.phase==="awaiting_confirmation")return true;
    if(state.status!=="error"||state.phase!=="failed")return false;
    if(!/^Vinted hat das Speichern nicht eindeutig bestätigt\./.test(state.error||""))return false;
    // Only treat as recoverable if a save was actually attempted.
    return (state.logs||[]).some(line=>/Prüfe Vinted-Speicherbestätigung für #/.test(line));
  }
  // Keep an item-confirmation ledger across separate batches. A successful
  // save (or explicit confirmation of an existing Vinted draft) should never
  // be uploaded again merely because the user imported the queue afresh.
  async function rememberConfirmed(row){
    const res=await chrome.storage.local.get(CONFIRMED_KEY);
    const previous=Array.isArray(res[CONFIRMED_KEY])?res[CONFIRMED_KEY]:[];
    const value=Number(row?.artikelnummer);
    if(!Number.isSafeInteger(value)||value<=0)return;
    await chrome.storage.local.set({[CONFIRMED_KEY]:
      [...new Set([...previous,value])].slice(-500)});
  }

  async function refreshReadyDraftList(){
    const sascha=await findSascha();
    const response=await tabMessage(sascha.id,{
      type:"FETCH_DRAFT_LIST_FROM_SASCHA",includeEligiblePants:true
    },15000);
    if(!response?.success||!Array.isArray(response.payload))
      throw Error("Aktuelle Hosenliste aus Sascha AI nicht verfügbar: "+
        (response?.error||"Keine gültige Antwort"));
    return response.payload;
  }
  // An earlier version stored a one-item queue (0/1). After the user
  // confirms that existing draft in Vinted, discover the subsequent
  // eligible pants instead of declaring that old batch finished.
  async function extendOldSingleQueue(current){
    state=current;
    if(current.index<current.queue.length-1)return current;
    const row=current.queue[current.index];
    if(!row)return current;
    try{
      const live=await refreshReadyDraftList();
      const future=live.filter(d=>articleNumber(d.artikelnummer)>row.artikelnummer);
      if(!future.length)return current;
      const candidates=orderedQueue(future,
        future.reduce((a,b)=>articleNumber(a.artikelnummer)<articleNumber(b.artikelnummer)?a:b).id);
      const confirmedRes=await chrome.storage.local.get(CONFIRMED_KEY);
      const known=new Set(Array.isArray(confirmedRes[CONFIRMED_KEY])?
        confirmedRes[CONFIRMED_KEY]:[]);
      const before=new Set(current.queue.map(r=>r.artikelnummer));
      const nextItems=candidates.filter(r=>!known.has(r.artikelnummer)&&
        !before.has(r.artikelnummer)).slice(0,100-current.queue.length);
      if(!nextItems.length)return current;
      await log("Warteschlange aus Sascha AI erweitert: "+
        nextItems.length+" weitere Hosen ab #"+nextItems[0].artikelnummer);
      return await put({...state,queue:[...state.queue,...nextItems]});
    }catch(e){
      await log("Weitere Hosen konnten nicht automatisch geladen werden: "+
        String(e?.message||e));
      return state||current;
    }
  }

  async function markConfirmed(next,evidence){
    const row=next.queue[next.index];
    if(!row||next.currentId!==row.id)
      throw Error("Falscher Entwurf – keine Bestätigung möglich");
    const index=next.index+1;
    const completed=[...(next.completed||[]),row.id];
    const logs=[...(next.logs||[]),
      "Entwurf #"+row.artikelnummer+" "+evidence+
      ". Keine erneute Übertragung."].slice(-75);
    const warnings=[...(next.warnings||[]),
      ...(next.pendingReviewWarnings||[])].slice(-100);
    await rememberConfirmed(row);
    await chrome.alarms.clear(GUARD_ALARM);
    await chrome.alarms.clear(NEXT_ALARM);
    if(index>=next.queue.length){
      await put({...next,status:"done",phase:"done",index,
        currentId:null,completed,error:null,logs,warnings,pendingReviewWarnings:[]});
    }else{
      await put({...next,status:"running",phase:"ready",index,
        currentId:null,completed,error:null,logs,warnings,pendingReviewWarnings:[]});
      await chrome.alarms.create(NEXT_ALARM,{when:Date.now()+30000});
    }
    return {success:true,finished:index>=next.queue.length,
      completed:completed.length,nextArticle:next.queue[index]?.artikelnummer||null};
  }

  // Preserve the REAL error returned by the field engine. The old batch
  // reported only "size", discarding precisely the data needed to debug it.
  function formFailureMessage(filled){
    if(!filled||typeof filled!=="object")
      return "Vinted-Formular hat keine Antwort geliefert";
    const failed=String(filled.stoppedAt||"").trim();
    if(!filled.success&&!failed)
      return "Vinted-Formular konnte nicht ausgefüllt werden: "+
        String(filled.error||"Unbekannter Fehler").slice(0,280);
    if(!failed)return "";
    const reason=String(filled.results?.[failed]?.reason||
      filled.error||"Kein Fehlergrund gemeldet").slice(0,350);
    const diag=(Array.isArray(filled.logs)?filled.logs:[])
      .filter(line=>/^\[(?:SIZE|STOP)(?:\s|\])/.test(String(line)))
      .slice(-2).map(line=>String(line).slice(0,220)).join(" / ");
    const field=failed==="size"?"Größe":failed;
    return field+": "+reason+(diag?" (Details: "+diag+")":"");
  }
  function draftSizeSummary(draft){
    const size=String(draft?.size||"").trim();
    const waist=String(draft?.measurements?.waist||"").trim();
    const gender=String(draft?.gender||"").trim();
    const status=size?"Größe in Sascha AI: "+size:
      "Größe fehlt in Sascha AI";
    const measure=waist?"Bundweite: "+waist+" cm":
      "Bundweite wurde NICHT in den Vinted-Entwurf übertragen";
    return [status,measure,gender?"Bereich: "+gender:"Bereich nicht angegeben"].join("; ");
  }

  // The engine must have confirmed the real Vinted size field. The
  // uncertainty refers ONLY to whether the estimated size matches a
  // manufacturer's label. Only a user-opted-in draft batch may proceed.
  function reviewableEstimatedSize(result,allowEstimatedSizes){
    if(allowEstimatedSizes!==true||!result?.success||result?.needsReview!==true||
        result.reviewType!=="estimated-size")return false;
    const picked=String(result.selectedSize||"").toUpperCase().trim();
    const source=String(result.estimateSource||"");
    return /^(?:W\d{2}|(?:X{0,6}S|[SML]|X{1,6}L|[2-7]XL))$/.test(picked) &&
      ["measured-waist","w-label","us-label","eu-label"].includes(source);
  }

  async function single(row,source){
    const tab=await chrome.tabs.create({
      url:"https://www.vinted.de"+NEW_ITEM_PATH,
      active:true
    });
    if(!tab.id)throw Error("Neuer Vinted-Tab konnte nicht erstellt werden");
    await log("Öffne Vinted für #"+row.artikelnummer,{phase:"loading",vintedTabId:tab.id});
    await waitForEditor(tab.id);
    if(stopRequested)throw Error("Stapel wurde gestoppt");
    await log("Lade Sascha-AI-Entwurf #"+row.artikelnummer,{phase:"fetching"});
    const data=await tabMessage(source.id,{
      type:"REQUEST_VINTED_DRAFT_FROM_SASCHA",draftId:row.id
    },85000);
    if(!data?.success||!data.payload||data.draftId&&data.draftId!==row.id)
      throw Error("Sascha AI konnte Entwurf #"+row.artikelnummer+
        " nicht eindeutig laden: "+(data?.error||"Keine Daten"));
    if(data.payload.id!==row.id)
      throw Error("Sascha AI hat den falschen Entwurf zurückgegeben");
    await log("Größen-Daten für #"+row.artikelnummer+": "+draftSizeSummary(data.payload));
    await log("Fülle #"+row.artikelnummer,{phase:"filling"});
    const filled=await tabMessage(tab.id,{
      type:"FILL_VINTED_FORM",draft:data.payload,debugMode:false,
      // Only this expressly draft-saving queue may tolerate a photo gallery
      // that Vinted does not expose to the extension. Never for publishing.
      draftOnlyBatch:true
    },110000);
    if(!filled?.success||filled.stoppedAt){
      const message=formFailureMessage(filled);
      await log("Vinted-Feldfehler bei #"+row.artikelnummer+": "+message);
      throw Error("Formular nicht vollständig: "+message);
    }
    const required=["title","description","category","brand","size","color","condition","price","images"];
    const pendingReviewWarnings=[];
    for(const key of required){
      const result=filled.results?.[key];
      if(!result?.success)
        throw Error("Feld "+key+" wurde nicht bestätigt");
      if(result.needsReview){
        if(key==="size"&&reviewableEstimatedSize(result,state?.allowEstimatedSizes)){
          const warning="Artikel #"+row.artikelnummer+": geschätzte/umgerechnete Größe "+
            result.selectedSize+" – "+String(result.reason||"Herstellergröße nicht bestätigt")+
            ". Unbedingt vor Veröffentlichung prüfen.";
          pendingReviewWarnings.push(warning);
          await log("[SIZE DRAFT-ONLY] "+warning);
        }else{
          throw Error("Feld "+key+" muss noch manuell geprüft werden. "+
            "Stapel gestoppt, nichts gespeichert.");
        }
      }
    }
    const photoReview=filled.results?.images?.reviewAfterSave===true;
    if(photoReview){
      const warning="Artikel #"+row.artikelnummer+
        ": Bildvorschau nicht verifiziert, erste vier Fotos im gespeicherten "+
        "Entwurf kontrollieren";
      pendingReviewWarnings.push(warning);
      await log("[IMAGES REVIEW] "+warning);
    }
    // Keep warnings when save confirmation is lost: a later manual
    // acknowledgement will move them to the saved review checklist.
    await put({...state,pendingReviewWarnings});
    if(stopRequested)throw Error("Stapel wurde vor dem Speichern gestoppt");
    // Explicit draft-only action: safe to retry neither it nor the workflow.
    await log("Speichere #"+row.artikelnummer+" ausdrücklich als Entwurf",{phase:"saving"});
    const click=await tabMessage(tab.id,{type:"SAVE_VINTED_DRAFT"},8500)
      .catch(e=>({uncertain:true,error:e.message}));
    if(click?.clicked===false)throw Error("Speichern nicht gestartet: "+(click.error||"Button fehlt")+
      (Array.isArray(click.available)?" · Buttons: "+JSON.stringify(click.available):""));
    if(click?.uncertain){
      await log("Speicher-Klick: Rückmeldung wegen möglichem Seitenwechsel unklar. "+
        "Prüfe nur den Erfolg; klicke NICHT erneut.");
    }
    // After navigation, a reply may be lost; still check state, but NEVER
    // click again because this could produce duplicate listings.
    await log("Prüfe Vinted-Speicherbestätigung für #"+row.artikelnummer,{
      phase:"verifying"
    });
    const saved=await verifySave(tab.id,tab.url||"",row.artikelnummer);
    await log("Entwurf #"+row.artikelnummer+" bestätigt: "+saved.evidence+
      (pendingReviewWarnings.length?" · GRÖSSE/FOTOS VOR VERÖFFENTLICHUNG PRÜFEN":""),
      {phase:"saved",
       warnings:[...(state?.warnings||[]),...pendingReviewWarnings].slice(-100),
       pendingReviewWarnings:[]});
    await rememberConfirmed(row);
    // Close only a positively acknowledged saved listing tab; the next
    // iteration always starts from a clean form.
    try{await chrome.tabs.remove(tab.id);}catch(_){}
  }
  async function run(){
    if(busy)return;
    busy=true;
    try{
      state=await getState();
      if(!state||state.status!=="running"||state.phase!=="ready")return;
      const sascha=await findSascha();
      const queue=state.queue;
      while(state.index<queue.length){
        if(stopRequested){
          await log("Stapel auf Wunsch gestoppt",{phase:"stopped",status:"stopped"});
          return;
        }
        const row=queue[state.index];
        await log("Beginne "+(state.index+1)+"/"+queue.length+
          ": Artikel #"+row.artikelnummer,{currentId:row.id,phase:"starting"});
        try{
          // If Chrome suspends the service worker DURING a save, never
          // automatically repeat that possibly successful operation.
          await chrome.alarms.create(GUARD_ALARM,{when:Date.now()+180000});
          await single(row,sascha);
        }catch(e){
          const reason=e?.message||String(e);
          if(!stopRequested && state.phase==="verifying" &&
              /(?:Speichern nicht eindeutig bestätigt|Speichern unklar)/i.test(reason)){
            await log("PAUSE bei #"+row.artikelnummer+": "+reason+
              " · Entwurf gegebenenfalls vorhanden; einmal bei Vinted prüfen "+
              "und anschließend in der Extension bestätigen.",{
              status:"awaiting_confirmation",phase:"awaiting_confirmation",
              error:reason
            });
          }else{
            await log("STOP bei #"+row.artikelnummer+": "+reason,{
              status:stopRequested?"stopped":"error",phase:"failed",error:reason
            });
          }
          await chrome.alarms.clear(GUARD_ALARM);
          return;
        }
        await put({...state,index:state.index+1,currentId:null,
          completed:[...state.completed,row.id],phase:"ready"});
        if(stopRequested){
          await chrome.alarms.clear(GUARD_ALARM);
          await log("Stapel nach bestätigtem Entwurf angehalten",{
            status:"stopped",phase:"stopped"
          });
          return;
        }
        if(state.index<queue.length){
          await log("Nächste Hose folgt automatisch nach kurzer Wartezeit",{
            phase:"ready"
          });
          await chrome.alarms.clear(GUARD_ALARM);
          await chrome.alarms.create(NEXT_ALARM,{when:Date.now()+30000});
          await delay(1400);
          continue; // Avoid waiting for a minimum 30s Chrome alarm
        }
      }
      await chrome.alarms.clear(GUARD_ALARM);
      await log("Alle "+queue.length+" Vinted-Entwürfe bestätigt",{
        status:"done",phase:"done",currentId:null
      });
    }catch(e){
      await log("STOP: "+(e?.message||String(e)),{
        status:"error",phase:"failed",error:e?.message||String(e)
      });
    }finally{busy=false;stopRequested=false;}
  }

  chrome.alarms.onAlarm.addListener(async alarm=>{
    if(![NEXT_ALARM,GUARD_ALARM].includes(alarm?.name))return;
    const current=await getState();
    if(!current||current.status!=="running")return;
    if(busy)return; // Current item is actively being processed.
    if(alarm.name===NEXT_ALARM&&current.phase==="ready"){
      state=current;
      void run();return;
    }
    if(alarm.name===GUARD_ALARM && current.phase==="ready")return;
    if(current.phase!=="ready"){
      await put({...current,status:"error",phase:"interrupted",
        error:"Chrome hat den Stapel während der aktuellen Hose unterbrochen. "+
        "Vinted-Entwürfe kontrollieren und erst danach neu starten.",
        logs:[...(current.logs||[]),
          "Sicherheitsstopp: Unterbrochenen Speichervorgang nicht automatisch wiederholen."
        ].slice(-75)});
    }
  });

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type==="GET_VINTED_BATCH_STATUS"){
      getState().then(s=>sendResponse({success:true,state:s}))
        .catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type==="CONFIRM_VINTED_DRAFT_SAVED"){
      (async()=>{
        if(busy)throw Error("Bitte warten, bis der aktuelle Ablauf gestoppt hat");
        const current=await getState();
        if(!recoverableSave(current))
          throw Error("Kein Entwurf mit unklarer Speicherung zum Bestätigen vorhanden");
        const row=current.queue[current.index];
        if(msg.draftId!==row.id || msg.articleNumber!==row.artikelnummer)
          throw Error("Artikelnummer oder Entwurf-ID stimmt nicht überein");
        // Old one-item batches can discover newly eligible pants after an
        // explicit human confirmation, without posting the old item again.
        const expanded=await extendOldSingleQueue(current);
        // This is the seller's explicit statement after opening the Vinted
        // drafts list; it is NOT an automatic Vinted receipt.
        const result=await markConfirmed(expanded,
          "vom Verkäufer im Vinted-Profil bestätigt");
        sendResponse(result);
        if(!result.finished && typeof chrome.tabs.query==="function")
          void run(); // next immediately; 30s alarm remains fallback
      })().catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type==="STOP_VINTED_BATCH"){
      stopRequested=true;
      void chrome.alarms.clear(NEXT_ALARM);
      void chrome.alarms.clear(GUARD_ALARM);
      getState().then(async current=>{
        if(current?.status==="running")
          await put({...current,stopRequested:true,
            ...(busy?{}:{status:"stopped",phase:"stopped",
              error:"Stapel war nicht mehr aktiv. Vor Neustart Vinted-Entwürfe kontrollieren."})});
        sendResponse({success:true});
      }).catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type!=="START_VINTED_BATCH")return false;
    (async()=>{
      if(busy)throw Error("Es läuft bereits ein Stapel");
      const prior=await getState();
      if(prior?.status==="running")
        throw Error("Ein früherer Stapel ist möglicherweise noch aktiv. "+
          "Bitte Vinted-Entwürfe prüfen, bevor ein neuer Stapel gestartet wird.");
      const stored=await chrome.storage.local.get(["savedDrafts",CONFIRMED_KEY]);
      // Always refresh the full eligible pants list instead of relying on
      // an old popup import which may have contained only one prepared draft.
      const saved=await refreshReadyDraftList();
      await chrome.storage.local.set({savedDrafts:saved});
      const ordered=orderedQueue(saved,msg.selectedDraftId);
      const known=new Set(Array.isArray(stored[CONFIRMED_KEY])?
        stored[CONFIRMED_KEY]:[]);
      // Recover confirmed rows from the previous batch state as well,
      // including users who upgraded from older extension versions.
      for(const id of prior?.completed||[]){
        const row=(prior.queue||[]).find(item=>item.id===id);
        if(row?.artikelnummer)known.add(Number(row.artikelnummer));
      }
      const queue=ordered.filter(row=>!known.has(row.artikelnummer));
      if(!queue.length)throw Error("Keine unbestätigten Hosen mehr in diesem Stapel. "+
        "Bereits bestätigte Artikel werden nicht doppelt angelegt.");
      stopRequested=false;
      await chrome.alarms.clear(NEXT_ALARM);
      await chrome.alarms.clear(GUARD_ALARM);
      await put({status:"running",phase:"ready",startedAt:Date.now(),queue,
        allowEstimatedSizes:msg.allowEstimatedSizes===true,
        index:0,currentId:null,completed:[],warnings:[],pendingReviewWarnings:[],logs:[
          "Stapel gestartet: "+queue.length+" Hosen ab #"+
            queue[0].artikelnummer+" (bereits bestätigte übersprungen), "+
            "nur als Entwurf, keine Veröffentlichung"
        ],error:null,stopRequested:false});
      sendResponse({success:true,count:queue.length,state});
      void run();
    })().catch(e=>sendResponse({success:false,error:e.message}));
    return true;
  });
  // For Node regression tests. No exposed methods in production pages.
  if(typeof module!=="undefined"&&module.exports)
    module.exports={orderedQueue,articleNumber,validVintedUrl,savedUrl,saschaUrl,
      safeTabLocation,tabNavigationState,waitForEditor,recoverableSave,
      formFailureMessage,draftSizeSummary,reviewableEstimatedSize};
})();
