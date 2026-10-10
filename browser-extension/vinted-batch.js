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
  async function waitForEditor(tabId,timeout=25000){
    const end=Date.now()+timeout;
    while(Date.now()<end){
      if(stopRequested)throw Error("Stapel wurde gestoppt");
      try {
        const tab=await chrome.tabs.get(tabId);
        if(!validVintedUrl(tab.url||""))throw Error("Vinted-Tab hat die Verkaufsseite verlassen");
        const response=await tabMessage(tabId,{type:"PING_VINTED_ENGINE"},2400);
        if(response?.ready)return;
      }catch(e){
        if(String(e?.message||"").includes("verlassen"))throw e;
      }
      await delay(600);
    }
    throw Error("Vinted-Verkaufsformular nicht bereit – bitte Anmeldung prüfen");
  }
  async function verifySave(tabId,originalUrl){
    const end=Date.now()+18000;
    let last={};
    while(Date.now()<end){
      const tab=await chrome.tabs.get(tabId);
      const url=tab.url||"";
      if(savedUrl(url))return {ok:true,evidence:"Vinted-Entwurfsübersicht"};
      if(!validVintedUrl(url))throw Error("Seite hat Vinted verlassen");
      try{
        const check=await tabMessage(tabId,{type:"CHECK_VINTED_DRAFT_SAVE"},2500);
        if(check?.saved===true)return {ok:true,evidence:check.evidence||"Vinted-Speicherbestätigung"};
        if(check?.error)last={error:check.error};
      }catch(e){last={error:e.message};}
      await delay(650);
    }
    throw Error("Vinted hat das Speichern nicht eindeutig bestätigt. "+
      "Die Hose nicht erneut automatisch senden; Entwürfe zuerst prüfen. "+
      (last.error||""));
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
    await log("Fülle #"+row.artikelnummer,{phase:"filling"});
    const filled=await tabMessage(tab.id,{
      type:"FILL_VINTED_FORM",draft:data.payload,debugMode:false
    },110000);
    if(!filled?.success||filled.stoppedAt)
      throw Error("Formular nicht vollständig: "+(filled?.stoppedAt||filled?.error||"Unbekannter Fehler"));
    const required=["title","description","category","brand","size","color","condition","price","images"];
    for(const key of required){
      if(!filled.results?.[key]?.success)
        throw Error("Feld "+key+" wurde nicht bestätigt");
      if(filled.results[key].needsReview)
        throw Error("Feld "+key+" muss noch manuell geprüft werden. "+
          "Stapel gestoppt, nichts gespeichert.");
    }
    if(stopRequested)throw Error("Stapel wurde vor dem Speichern gestoppt");
    // Explicit draft-only action: safe to retry neither it nor the workflow.
    await log("Speichere #"+row.artikelnummer+" ausdrücklich als Entwurf",{phase:"saving"});
    const click=await tabMessage(tab.id,{type:"SAVE_VINTED_DRAFT"},8500)
      .catch(e=>({clicked:false,error:e.message}));
    if(click?.clicked===false)throw Error("Speichern nicht gestartet: "+(click.error||"Button fehlt"));
    // After navigation, a reply may be lost; still check state, but NEVER
    // click again because this could produce duplicate listings.
    await log("Prüfe Vinted-Speicherbestätigung für #"+row.artikelnummer,{
      phase:"verifying"
    });
    const saved=await verifySave(tab.id,tab.url||"");
    await log("Entwurf #"+row.artikelnummer+" bestätigt: "+saved.evidence,{
      phase:"saved"
    });
    // Close only a positively acknowledged saved listing tab; the next
    // iteration always starts from a clean form.
    try{await chrome.tabs.remove(tab.id);}catch(_){}
  }
  async function run(){
    if(busy)return;
    busy=true;
    try{
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
          await single(row,sascha);
        }catch(e){
          await log("STOP bei #"+row.artikelnummer+": "+(e?.message||String(e)),{
            status:stopRequested?"stopped":"error",phase:"failed",
            error:e?.message||String(e)
          });
          return;
        }
        await put({...state,index:state.index+1,currentId:null,
          completed:[...state.completed,row.id],phase:"ready"});
        await delay(2000);
      }
      await log("Alle "+queue.length+" Vinted-Entwürfe bestätigt",{
        status:"done",phase:"done",currentId:null
      });
    }catch(e){
      await log("STOP: "+(e?.message||String(e)),{
        status:"error",phase:"failed",error:e?.message||String(e)
      });
    }finally{busy=false;stopRequested=false;}
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type==="GET_VINTED_BATCH_STATUS"){
      getState().then(s=>sendResponse({success:true,state:s}))
        .catch(e=>sendResponse({success:false,error:e.message}));
      return true;
    }
    if(msg?.type==="STOP_VINTED_BATCH"){
      stopRequested=true;
      getState().then(async current=>{
        if(current?.status==="running")
          await put({...current,stopRequested:true});
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
      const saved=(await chrome.storage.local.get("savedDrafts")).savedDrafts;
      const queue=orderedQueue(saved,msg.selectedDraftId);
      stopRequested=false;
      await put({status:"running",phase:"ready",startedAt:Date.now(),queue,
        index:0,currentId:null,completed:[],logs:[
          "Stapel gestartet: "+queue.length+" Hosen, nur als Entwurf, keine Veröffentlichung"
        ],error:null,stopRequested:false});
      sendResponse({success:true,count:queue.length,state});
      void run();
    })().catch(e=>sendResponse({success:false,error:e.message}));
    return true;
  });
  // For Node regression tests. No exposed methods in production pages.
  if(typeof module!=="undefined"&&module.exports)
    module.exports={orderedQueue,articleNumber,validVintedUrl,savedUrl,saschaUrl};
})();
