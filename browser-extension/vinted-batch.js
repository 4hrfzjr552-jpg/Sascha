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
  const RECEIPT_KEY="vintedDraftSaveReceipt";
  const CONFIRMED_KEY="vintedConfirmedArticleNumbers";
  const UNVERIFIED_KEY="vintedUnverifiedDraftArticles";
  const CORRECTIONS_KEY="vintedArticleCorrections";
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
    const selected=rows.find(r=>r.id===selectedId);
    if(!selected)throw Error("Ausgewählte Hose nicht in der Entwurfsliste");
    // Start with the item the seller selected, then the lower article
    // numbers (newest -> oldest) and finally wrap to higher numbers.
    // The old rows.slice(selectedIndex) silently dropped #66/#65 if the
    // seller began at #67. Never drop valid pants by numeric position.
    return [selected,
      ...rows.filter(r=>r.artikelnummer<selected.artikelnummer).reverse(),
      ...rows.filter(r=>r.artikelnummer>selected.artikelnummer).reverse()];
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
  // Never re-use a receipt for another pant, tab or old save attempt.
  // A generic profile redirect alone is NOT a successful draft receipt.
  function validSaveReceipt(receipt,token,articleNumber,now=Date.now()){
    if(!receipt||typeof receipt!=="object"||
       !token||receipt.token!==token||
       Number(receipt.articleNumber)!==Number(articleNumber))return false;
    const age=now-Number(receipt.savedAt);
    if(!Number.isFinite(age)||age<0||age>120000)return false;
    const e=String(receipt.evidence||"");
    return /(?:entw[uü]rf.{0,75}gespeichert|als\s+entwurf.{0,60}gespeichert|draft.{0,75}saved|saved.{0,55}draft)/i.test(e)&&
      !/(?:nicht\s+gespeichert|not\s+saved|fehler|error|failed)/i.test(e);
  }
  async function storedSaveReceipt(token,articleNumber){
    try{
      const stored=(await chrome.storage.local.get(RECEIPT_KEY))[RECEIPT_KEY];
      return validSaveReceipt(stored,token,articleNumber)?
        {ok:true,evidence:"Vinted-Speicherhinweis (vor Profilweiterleitung): "+
          String(stored.evidence).slice(0,110)}:null;
    }catch(_){return null;}
  }
  async function verifySave(tabId,originalUrl,articleNumber,attemptToken){
    const started=Date.now();
    let last={};
    // Vinted may redirect after showing a short-lived success message.
    // Give it additional time, without clicking Save a second time.
    while(Date.now()-started<35000){
      const receipt=await storedSaveReceipt(attemptToken,articleNumber);
      if(receipt)return receipt;
      let tab;
      try{tab=await chrome.tabs.get(tabId);}
      catch(e){throw Error("Speichern unklar: Vinted-Tab ist nicht mehr erreichbar; Entwürfe prüfen, nicht erneut senden.");}
      const url=tab.url||"";
      // A generic /drafts URL does NOT prove this exact article was saved.
      // Only a matching receipt or an identifiable draft card is sufficient.
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
  function recoverablePreSaveFormFailure(current){
    if(current?.status!=="error"||current.phase!=="failed"||
       !Array.isArray(current.queue))return false;
    const row=current.queue[current.index];
    if(!row||row.id!==current.currentId)return false;
    const reason=String(current.error||"");
    if(!/^(?:Formular nicht vollständig:|Feld (?:[a-z]+) (?:wurde nicht bestätigt|muss noch manuell geprüft werden))/.test(reason))
      return false;
    // Legacy v3.22 state only kept "failed", not the previous phase.
    // Require positive evidence that filling actually began, and reject
    // anything that ever reached the SAVE button for this exact item.
    const logs=Array.isArray(current.logs)?current.logs:[];
    const start=logs.findLastIndex(line=>String(line).endsWith(
      ": Artikel #"+row.artikelnummer));
    if(start<0)return false;
    const own=logs.slice(start);
    return own.some(line=>String(line).startsWith("Fülle #"+row.artikelnummer)) &&
      !own.some(line=>String(line).startsWith(
        "Speichere #"+row.artikelnummer+" ausdrücklich als Entwurf"));
  }
  function skippableUnfilledForm(phase,reason){
    const text=String(reason||"");
    if(phase==="preflight")return /^Formular nicht vollständig: category:/.test(text);
    return phase==="filling"&&
      /^(?:Formular nicht vollständig:|Feld [a-z]+ (?:wurde nicht bestätigt|muss noch manuell geprüft werden))/.test(text);
  }
  async function retryPreSaveFormFailure(){
    if(busy)throw Error("Stapel läuft bereits");
    const old=await getState();
    if(!recoverablePreSaveFormFailure(old))
      throw Error("Hose kann nicht sicher neu gestartet werden: Speicher-Klick "+
        "möglicherweise bereits erfolgt oder kein reiner Formularfehler");
    const row=old.queue[old.index];
    stopRequested=false;
    await chrome.alarms.clear(GUARD_ALARM);
    await chrome.alarms.clear(NEXT_ALARM);
    const next={...old,status:"running",phase:"ready",currentId:null,
      error:null,stopRequested:false,
      logs:[...(old.logs||[]),"Versuche #"+row.artikelnummer+
        " nach Formularfehler erneut (kein Speicher-Klick beim letzten Versuch); "+
        "zuvor bestätigte Entwürfe werden nicht wiederholt"].slice(-75)};
    await put(next);
    if(typeof chrome.tabs.query==="function"&&
        typeof chrome.tabs.create==="function")void run();
    return {success:true,currentArticle:row.artikelnummer,state:next};
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

  // An uncertain save is NOT a confirmed Vinted draft. Keep it in a
  // separate persistent ledger so subsequent batches NEVER send it again
  // automatically until the seller reconciles the account manually.
  function unverifiedArticleNumbers(records){
    return (Array.isArray(records)?records:[])
      .map(r=>articleNumber(r?.artikelnummer))
      .filter(n=>n!==null);
  }
  async function rememberUnverified(record){
    const box=await chrome.storage.local.get(UNVERIFIED_KEY);
    const previous=Array.isArray(box[UNVERIFIED_KEY])?box[UNVERIFIED_KEY]:[];
    const items=previous.filter(p=>articleNumber(p?.artikelnummer)!==record.artikelnummer);
    await chrome.storage.local.set({
      [UNVERIFIED_KEY]:[...items,record].slice(-500)
    });
  }
  async function forgetUnverified(article){
    const box=await chrome.storage.local.get(UNVERIFIED_KEY);
    const old=Array.isArray(box[UNVERIFIED_KEY])?box[UNVERIFIED_KEY]:[];
    await chrome.storage.local.set({[UNVERIFIED_KEY]:old.filter(
      r=>articleNumber(r?.artikelnummer)!==articleNumber(article))});
  }
  function ambiguousSaveAtVerification(phase,reason){
    return phase==="verifying" &&
      /(?:Speichern nicht eindeutig bestätigt|Speichern unklar)/i.test(
        String(reason||""));
  }
  async function markUnverified(current,reason){
    const row=current?.queue?.[current.index];
    if(!row||current.currentId!==row.id)
      throw Error("Falsche Hose zum Fortsetzen einer unklaren Speicherung");
    const valid=ambiguousSaveAtVerification(current.phase,reason) ||
      recoverableSave(current);
    if(!valid)throw Error("Speicherung nicht nachweislich unklar – "+
      "Fortsetzen ohne Bestätigung nicht erlaubt");
    const record={
      id:row.id,artikelnummer:row.artikelnummer,
      reason:String(reason||"Vinted-Speicherung nicht überprüfbar").slice(0,400),
      at:Date.now(),
      reviewWarnings:[...(current.pendingReviewWarnings||[])]
    };
    // Write BEFORE advancing. If interrupted, this row remains excluded
    // from later attempts and can be reconciled against Vinted's drafts.
    await rememberUnverified(record);
    await chrome.alarms.clear(GUARD_ALARM);
    await chrome.alarms.clear(NEXT_ALARM);
    const index=current.index+1;
    const finished=index>=current.queue.length;
    const unverified=[...(current.unverified||[]).filter(x=>
      articleNumber(x.artikelnummer)!==row.artikelnummer),record].slice(-100);
    const logs=[...(current.logs||[]),
      "Speicherung von #"+row.artikelnummer+
      " NICHT bestätigt. Nicht erneut senden, auf Vinted prüfen. "+
      (finished?"Stapelende.":"Nächste Hose folgt.")].slice(-75);
    await put({...current,index,unverified,logs,
      status:finished?"done":"running",phase:finished?"done":"ready",
      currentId:null,error:null,pendingReviewWarnings:[],saveAttempt:null});
    if(!finished)
      await chrome.alarms.create(NEXT_ALARM,{when:Date.now()+30000});
    return {success:true,finished,nextArticle:current.queue[index]?.artikelnummer||null,
      unverifiedArticle:row.artikelnummer,confirmed:(current.completed||[]).length};
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
  // For a saved one-item (old 1/1) batch, append other eligible pants
  // without touching any confirmed one. Works with both lower AND higher
  // article numbers, ordered relative to the last confirmed item.
  function continuationRows(previous,live,confirmedNumbers=[]){
    if(!previous||!Array.isArray(previous.queue)||!previous.queue.length)
      throw Error("Keine frühere Warteschlange vorhanden");
    if(!Array.isArray(live)||!live.length)return [];
    const checked=orderedQueue(live,live[0].id);
    const existing=new Set(previous.queue.map(r=>r.artikelnummer));
    const confirmed=new Set(confirmedNumbers.map(Number));
    const anchor=previous.queue[Math.min(previous.index,previous.queue.length-1)].artikelnummer;
    const remaining=checked.filter(r=>!existing.has(r.artikelnummer)&&
      !confirmed.has(r.artikelnummer));
    return [
      ...remaining.filter(r=>r.artikelnummer<anchor).sort((a,b)=>b.artikelnummer-a.artikelnummer),
      ...remaining.filter(r=>r.artikelnummer>anchor).sort((a,b)=>b.artikelnummer-a.artikelnummer)
    ].slice(0,MAX_BATCH-previous.queue.length);
  }

  async function extendOldSingleQueue(current){
    state=current;
    if(current.index<current.queue.length-1)return current;
    try{
      const live=await refreshReadyDraftList();
      const confirmedRes=await chrome.storage.local.get([CONFIRMED_KEY,UNVERIFIED_KEY]);
      const confirmed=[
        ...(Array.isArray(confirmedRes[CONFIRMED_KEY])?confirmedRes[CONFIRMED_KEY]:[]),
        ...unverifiedArticleNumbers(confirmedRes[UNVERIFIED_KEY])
      ];
      const nextItems=continuationRows(current,live,confirmed);
      if(!nextItems.length){
        await log("Keine weiteren geeigneten, unbestätigten Hosen in Sascha AI "+
          "(Import: "+live.length+" Hosen). "+
          "Status und Bereitstellung der Web-App prüfen.");
        return state;
      }
      await log("Warteschlange um "+nextItems.length+
        " Hosen erweitert; nächste #"+nextItems[0].artikelnummer);
      return await put({...state,queue:[...state.queue,...nextItems]});
    }catch(e){
      await log("Weitere Hosen konnten nicht geladen werden: "+
        String(e?.message||e));
      return state||current;
    }
  }
  async function resumeCompletedBatch(){
    if(busy)throw Error("Ein anderer Stapel läuft");
    const previous=await getState();
    if(previous?.status!=="done"||!Array.isArray(previous.queue)||
        previous.queue.length===0||!Array.isArray(previous.completed)||
        !previous.completed.length)
      throw Error("Kein abgeschlossener Stapel zum Fortsetzen vorhanden");
    const live=await refreshReadyDraftList();
    const saved=await chrome.storage.local.get([CONFIRMED_KEY,UNVERIFIED_KEY]);
    const confirmed=[
      ...(Array.isArray(saved[CONFIRMED_KEY])?saved[CONFIRMED_KEY]:[]),
      ...unverifiedArticleNumbers(saved[UNVERIFIED_KEY])
    ];
    const nextItems=continuationRows(previous,live,confirmed);
    if(!nextItems.length)
      throw Error("Sascha AI liefert "+live.length+
        " geeignete Hosen, aber keine weitere unbestätigte Hose "+
        "neben den bereits erledigten. Prüfe in Sascha AI, ob die übrigen "+
        "Hosen fertig generiert, nicht verkauft und mit Artikelnummer versehen sind; "+
        "prüfe auch, ob die neue Web-App auf Vercel bereitgestellt wurde.");
    stopRequested=false;
    await chrome.alarms.clear(GUARD_ALARM);
    await chrome.alarms.clear(NEXT_ALARM);
    await chrome.storage.local.set({savedDrafts:live});
    const next={...previous,queue:[...previous.queue,...nextItems],
      status:"running",phase:"ready",error:null,stopRequested:false,
      currentId:null,logs:[...(previous.logs||[]),
        "Stapel mit "+nextItems.length+" weiteren Hosen fortgesetzt, "+
        "ab #"+nextItems[0].artikelnummer+"; bestätigte Artikel bleiben erledigt"
      ].slice(-75)};
    await put(next);
    if(typeof chrome.tabs.query==="function" &&
       typeof chrome.tabs.create==="function")void run();
    return {success:true,count:nextItems.length,
      nextArticle:nextItems[0].artikelnummer,state:next};
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
    await forgetUnverified(row.artikelnummer);
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
      ["measured-waist","ambiguous-label-waist","w-label","us-label","eu-label"].includes(source);
  }

  function preflightCategory(draft,api=globalThis.SaschaVintedCatalogV3){
    if(!api?.intentForDraft)
      throw Error("Vinted-Katalog für Vorabprüfung fehlt; Extension vollständig aktualisieren");
    const resolved=api.intentForDraft(draft);
    if(!resolved.ok)return {ok:false,reason:resolved.reason,source:resolved.intent?.source||"unresolved"};
    return {ok:true,id:resolved.category.id,source:resolved.intent.source};
  }

  const VALID_FITS=new Set(["straight","slim","skinny","bootcut","boyfriend","ripped","cropped","high-waist"]);
  const VALID_COLORS=new Set(["blau","grau","schwarz","weiß","grün","rot","beige","braun","gelb","rosa","lila","orange","dunkelblau","hellblau","marineblau"]);
  async function correctedDraft(original,article){
    const stored=(await chrome.storage.local.get(CORRECTIONS_KEY))[CORRECTIONS_KEY];
    const correction=stored&&typeof stored==="object"?stored[String(article)]:null;
    if(!correction||typeof correction!=="object")return original;
    const updated={...original};
    if(correction.fit){
      if(!VALID_FITS.has(correction.fit))throw Error("Ungültige manuelle Jeans-Schnittangabe für #"+article);
      updated.fit=correction.fit;
    }
    if(correction.brand){
      const brand=String(correction.brand).trim().slice(0,80);
      if(/^(?:unbekannt|nicht erkennbar|unknown)$/i.test(brand))
        throw Error("Manuelle Marke von #"+article+" ist nicht eindeutig");
      updated.brand=brand;
    }
    if(correction.color){
      const color=String(correction.color).trim().toLowerCase();
      if(!VALID_COLORS.has(color))throw Error("Ungültige manuelle Vinted-Farbe für #"+article);
      updated.color=color;
    }
    return updated;
  }

  async function single(row,source){
    // The category (especially the JEANS CUT) can be resolved without
    // touching Vinted. Validate BEFORE opening a Vinted sales tab so that
    // unresolved SEO-heavy jeans are not left half filled with title and
    // description when the batch skips their unsaved form.
    await log("Lade Sascha-AI-Entwurf #"+row.artikelnummer,{phase:"fetching"});
    const data=await tabMessage(source.id,{
      type:"REQUEST_VINTED_DRAFT_FROM_SASCHA",draftId:row.id
    },85000);
    if(!data?.success||!data.payload||data.draftId&&data.draftId!==row.id)
      throw Error("Sascha AI konnte Entwurf #"+row.artikelnummer+
        " nicht eindeutig laden: "+(data?.error||"Keine Daten"));
    if(data.payload.id!==row.id)
      throw Error("Sascha AI hat den falschen Entwurf zurückgegeben");
    const draft=await correctedDraft(data.payload,row.artikelnummer);
    if(draft!==data.payload)await log("Manuelle Feldkorrekturen für #"+row.artikelnummer+" angewendet");
    if(stopRequested)throw Error("Stapel wurde angehalten");
    await log("Prüfe Jeans-Kategorie vor Öffnen von Vinted für #"+
      row.artikelnummer,{phase:"preflight"});
    const category=preflightCategory(draft);
    if(!category.ok)
      throw Error("Formular nicht vollständig: category: "+category.reason+
        " (Quelle: "+category.source+"; Vinted-Tab nicht geöffnet)");
    await log("Kategorie #"+category.id+" aus "+
      category.source+" erkannt; öffne Vinted für #"+row.artikelnummer);
    const tab=await chrome.tabs.create({
      url:"https://www.vinted.de"+NEW_ITEM_PATH,
      active:true
    });
    if(!tab.id)throw Error("Neuer Vinted-Tab konnte nicht erstellt werden");
    await log("Öffne Vinted für #"+row.artikelnummer,{phase:"loading",vintedTabId:tab.id});
    await waitForEditor(tab.id);
    if(stopRequested)throw Error("Stapel wurde angehalten");
    await log("Größen-Daten für #"+row.artikelnummer+": "+draftSizeSummary(draft));
    await log("Fülle #"+row.artikelnummer,{phase:"filling"});
    const filled=await tabMessage(tab.id,{
      type:"FILL_VINTED_FORM",draft,debugMode:false,
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
    const attemptToken=String(state.startedAt||"")+":"+
      row.id+":"+Date.now();
    await rememberUnverified({id:row.id,artikelnummer:row.artikelnummer,
      reason:"Speichern begonnen; Bestätigung steht aus",at:Date.now(),pending:true});
    await log("Speichere #"+row.artikelnummer+" ausdrücklich als Entwurf",{
      phase:"saving",saveAttempt:{token:attemptToken,articleNumber:row.artikelnummer}
    });
    const click=await tabMessage(tab.id,{
      type:"SAVE_VINTED_DRAFT",attemptToken,articleNumber:row.artikelnummer
    },8500)
      .catch(e=>({uncertain:true,error:e.message}));
    if(click?.clicked===false){
      await forgetUnverified(row.artikelnummer);
      throw Error("Speichern nicht gestartet: "+(click.error||"Button fehlt")+
      (Array.isArray(click.available)?" · Buttons: "+JSON.stringify(click.available):""));
    }
    if(click?.uncertain){
      await log("Speicher-Klick: Rückmeldung wegen möglichem Seitenwechsel unklar. "+
        "Prüfe nur den Erfolg; klicke NICHT erneut.");
    }
    // After navigation, a reply may be lost; still check state, but NEVER
    // click again because this could produce duplicate listings.
    await log("Prüfe Vinted-Speicherbestätigung für #"+row.artikelnummer,{
      phase:"verifying"
    });
    const saved=await verifySave(tab.id,tab.url||"",row.artikelnummer,attemptToken);
    await log("Entwurf #"+row.artikelnummer+" bestätigt: "+saved.evidence+
      (pendingReviewWarnings.length?" · GRÖSSE/FOTOS VOR VERÖFFENTLICHUNG PRÜFEN":""),
      {phase:"saved",
       warnings:[...(state?.warnings||[]),...pendingReviewWarnings].slice(-100),
       pendingReviewWarnings:[]});
    await rememberConfirmed(row);
    await forgetUnverified(row.artikelnummer);
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
          const failedPhase=state.phase;
          if(!stopRequested&&skippableUnfilledForm(failedPhase,reason)){
            // The Save-draft step has NOT been reached. No draft could have
            // been created by this attempt. Skip instead of aborting 22 pants.
            // Never mark this row confirmed or add it to the saved ledger.
            const skipped=[...(state.skipped||[]),{
              id:row.id,artikelnummer:row.artikelnummer,reason
            }].slice(-100);
            await chrome.alarms.clear(GUARD_ALARM);
            await log("ÜBERSPRUNGEN #"+row.artikelnummer+
              " – Formular unvollständig, NICHT gespeichert: "+reason+
              " · nächste Hose wird bearbeitet",{
              skipped,index:state.index+1,currentId:null,phase:"ready",
              error:null,pendingReviewWarnings:[]});
            continue;
          }
          if(!stopRequested&&ambiguousSaveAtVerification(failedPhase,reason)){
            if(state.continueOnUnverifiedSave===true){
              await log("Speicherung für #"+row.artikelnummer+
                " konnte nicht bestätigt werden; Fortsetzen ohne Bestätigung "+
                "wurde ausdrücklich gewählt. NICHT erneut senden.");
              // log() keeps state.phase, which is verifying.
              const result=await markUnverified(state,reason);
              if(result.finished)return;
              await delay(1400);
              continue;
            }
            await log("PAUSE bei #"+row.artikelnummer+": "+reason+
              " · Entwurf gegebenenfalls vorhanden; einmal bei Vinted prüfen "+
              "und anschließend in der Extension bestätigen ODER "+
              "als unbestätigt markieren und mit der nächsten Hose fortfahren.",{
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
      const skippedCount=state.skipped?.length||0;
      await log("Stapel abgeschlossen: "+state.completed.length+
        " Entwürfe bestätigt, "+skippedCount+" Hose(n) wegen Formularfehler "+
        "NICHT gespeichert. Übersprungene Artikel separat prüfen.",{
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
    if(msg?.type==="VINTED_DRAFT_SAVE_RECEIPT"){
      (async()=>{
        const current=await getState();
        const row=current?.queue?.[current.index];
        if(current?.status!=="running"||
           !["saving","verifying"].includes(current.phase)||
           !row||row.id!==current.currentId||
           current.vintedTabId!==_sender?.tab?.id||
           current.saveAttempt?.token!==msg.token||
           Number(current.saveAttempt?.articleNumber)!==Number(msg.articleNumber)||
           !validSaveReceipt(msg,msg.token,msg.articleNumber))
          throw Error("Speicherhinweis gehört nicht zum aktuellen Entwurf");
        await chrome.storage.local.set({[RECEIPT_KEY]:{
          token:msg.token,articleNumber:row.artikelnummer,
          evidence:String(msg.evidence).slice(0,110),savedAt:msg.savedAt
        }});
        sendResponse({success:true});
      })().catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type==="MARK_UNVERIFIED_DRAFT_FOUND"){
      (async()=>{
        if(busy)throw Error("Während laufendem Stapel keine nachträgliche Bestätigung");
        const number=articleNumber(msg.articleNumber);
        const id=msg.draftId;
        if(!number||!validId(id))throw Error("Artikelnummer oder Entwurf-ID fehlt");
        const stored=await chrome.storage.local.get(UNVERIFIED_KEY);
        const records=Array.isArray(stored[UNVERIFIED_KEY])?stored[UNVERIFIED_KEY]:[];
        const candidate=records.find(row=>articleNumber(row.artikelnummer)===number&&row.id===id);
        if(!candidate)throw Error("Dieser Artikel ist nicht mehr als unbestätigt vorgemerkt");
        const latest=await getState();
        if(latest?.status==="running")throw Error("Stapel läuft noch");
        // User has explicitly inspected this exact Vinted draft. No upload.
        await rememberConfirmed(candidate);
        await forgetUnverified(number);
        if(latest){
          const matching=latest.queue?.find(row=>row.id===id&&row.artikelnummer===number);
          const completed=matching&&!(latest.completed||[]).includes(id)?
            [...(latest.completed||[]),id]:(latest.completed||[]);
          const unverified=(latest.unverified||[]).filter(row=>
            articleNumber(row.artikelnummer)!==number);
          const warnings=[...(latest.warnings||[]),...(candidate.reviewWarnings||[])].slice(-100);
          await put({...latest,completed,unverified,warnings,
            logs:[...(latest.logs||[]),"Entwurf #"+number+
              " vom Verkäufer auf Vinted nachträglich als vorhanden bestätigt"].slice(-75)});
        }
        sendResponse({success:true,articleNumber:number});
      })().catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type==="GET_VINTED_BATCH_STATUS"){
      getState().then(s=>sendResponse({success:true,state:s}))
        .catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type==="RETRY_VINTED_FAILED_FORM"){
      retryPreSaveFormFailure().then(sendResponse)
        .catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type==="RESUME_REMAINING_VINTED_BATCH"){
      resumeCompletedBatch().then(sendResponse)
        .catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type==="CONTINUE_VINTED_UNVERIFIED_SAVE"){
      (async()=>{
        if(busy)throw Error("Bitte auf das Ende der aktuellen Prüfung warten");
        const current=await getState();
        if(!recoverableSave(current))
          throw Error("Keine unklar gespeicherte Hose zum Überspringen vorhanden");
        const row=current.queue[current.index];
        if(row.id!==msg.draftId||row.artikelnummer!==msg.articleNumber)
          throw Error("Falsche Artikelnummer, Fortsetzen nicht erlaubt");
        const expanded=await extendOldSingleQueue(current);
        expanded.continueOnUnverifiedSave=msg.continueOnUnverifiedSave===true;
        const result=await markUnverified(expanded,current.error);
        sendResponse(result);
        if(!result.finished&&typeof chrome.tabs.query==="function"&&
            typeof chrome.tabs.create==="function")
          void run();
      })().catch(e=>sendResponse({success:false,error:e.message}));
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
        if(!result.finished && typeof chrome.tabs.query==="function" &&
            typeof chrome.tabs.create==="function")
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
            logs:[...(current.logs||[]),
              "Stopp über Extension angefordert – Artikel #"+
              (current.queue?.[current.index]?.artikelnummer||"?")+
              ", bisheriger Schritt: "+(current.phase||"unbekannt")].slice(-75),
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
      const stored=await chrome.storage.local.get(["savedDrafts",CONFIRMED_KEY,UNVERIFIED_KEY]);
      // Always refresh the full eligible pants list instead of relying on
      // an old popup import which may have contained only one prepared draft.
      const saved=await refreshReadyDraftList();
      await chrome.storage.local.set({savedDrafts:saved});
      const ordered=orderedQueue(saved,msg.selectedDraftId);
      const known=new Set([
        ...(Array.isArray(stored[CONFIRMED_KEY])?stored[CONFIRMED_KEY]:[]),
        ...unverifiedArticleNumbers(stored[UNVERIFIED_KEY])
      ]);
      // Recover confirmed rows from the previous batch state as well,
      // including users who upgraded from older extension versions.
      const pending=prior?.queue?.[prior?.index];
      if(pending&&(prior?.saveAttempt ||
        ["saving","verifying","awaiting_confirmation","interrupted"].includes(prior?.phase)))
        known.add(Number(pending.artikelnummer));
      for(const item of prior?.unverified||[])if(item?.artikelnummer)
        known.add(Number(item.artikelnummer));
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
        continueOnUnverifiedSave:msg.continueOnUnverifiedSave===true,
        index:0,currentId:null,completed:[],skipped:[],unverified:[],
        warnings:[],pendingReviewWarnings:[],logs:[
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
      formFailureMessage,draftSizeSummary,reviewableEstimatedSize,
      continuationRows,recoverablePreSaveFormFailure,skippableUnfilledForm,
      validSaveReceipt,storedSaveReceipt,
      ambiguousSaveAtVerification,unverifiedArticleNumbers,preflightCategory,correctedDraft};
})();
