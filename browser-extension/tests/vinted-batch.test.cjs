// node --test browser-extension/tests/vinted-batch.test.cjs
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"..","vinted-batch.js"),"utf8");

function batchApi(overrides={}){
  const module={exports:{}},listener=[],alarmCalls=[];
  const store={vintedBatchState:overrides.state||null,
    ...(overrides.store||{})};
  const chrome={
    runtime:{onMessage:{addListener(fn){listener.push(fn)}}},
    alarms:{onAlarm:{addListener(fn){listener.push(fn)}},
      clear:async name=>{alarmCalls.push(["clear",name]);return true;},
      create:async(name,options)=>{alarmCalls.push(["create",name,options]);}},
    storage:{local:{
      get:async key=>Array.isArray(key)?
        Object.fromEntries(key.map(k=>[k,store[k]])):{[key]:store[key]},
      set:async patch=>Object.assign(store,patch)
    }},
    tabs:{get:overrides.getTab,sendMessage:overrides.sendMessage,
      query:overrides.queryTabs,
      create:overrides.createTab}
  };
  vm.runInNewContext(code,{chrome,module,URL,console,setTimeout,clearTimeout});
  return {api:module.exports,listener,store,alarmCalls,
    dispatch:async message=>new Promise(resolve=>{
      const fn=listener.at(-1);
      const ret=fn(message,{},resolve);
      if(ret===false)resolve({ignored:true});
    })};
}
const pant=(nr,id)=>({artikelnummer:String(nr),id,title:"Diesel Jeans "+nr});

test("starts selected and includes smaller numbers before wrapping to larger",()=>{
  const {api}=batchApi();
  const q=api.orderedQueue([pant(30,"c"),pant(9,"a"),pant(11,"b"),pant(10,"x")],"x");
  assert.deepEqual(Array.from(q,x=>x.artikelnummer),[10,9,30,11]);
  assert.deepEqual(Array.from(q,x=>x.id),["x","a","c","b"]);
});
test("starting at #67 must include #66, #65 and even other larger eligible pants",()=>{
  const {api}=batchApi();
  const q=api.orderedQueue([
    pant(60,"a"),pant(66,"b"),pant(67,"c"),pant(70,"d"),pant(65,"e")
  ],"c");
  assert.deepEqual(Array.from(q,x=>x.artikelnummer),[67,66,65,60,70]);
});
test("missing or duplicate article numbers stop the batch before any post",()=>{
  const {api}=batchApi();
  assert.throws(()=>api.orderedQueue([pant(1,"a"),pant(1,"b")],"a"),/Doppelte Artikelnummer/);
  assert.throws(()=>api.orderedQueue([{id:"a",title:"Jeans ohne Nummer"}],"a"),/ohne gültige Artikelnummer/);
  assert.throws(()=>api.orderedQueue([pant(1,"a"),pant(2,"a")],"a"),/doppelte Entwurf-ID/);
  assert.throws(()=>api.orderedQueue([pant(1,"a")],"missing"),/nicht in der Entwurfsliste/);
});
test("only Vinted URL from official sites is allowed",()=>{
  const {api}=batchApi();
  assert.equal(api.validVintedUrl("https://www.vinted.de/items/new"),true);
  assert.equal(api.validVintedUrl("https://www.vinted.at/items/new"),true);
  assert.equal(api.validVintedUrl("https://vinted.de.evil.example/items/new"),false);
  assert.equal(api.validVintedUrl("http://www.vinted.de/items/new"),false);
  assert.equal(api.saschaUrl("https://sascha-sage.vercel.app/"),true);
  assert.equal(api.saschaUrl("https://vercel.app.evil.example/"),false);
});
test("accepts only explicit saved-drafts URL after save, not normal listings",()=>{
  const {api}=batchApi();
  assert.equal(api.savedUrl("https://www.vinted.de/items/drafts"),true);
  assert.equal(api.savedUrl("https://www.vinted.de/member/42?tab=drafts"),true);
  assert.equal(api.savedUrl("https://www.vinted.de/member/42?type=drafts"),true);
  assert.equal(api.savedUrl("https://www.vinted.de/items/new"),false);
  assert.equal(api.savedUrl("https://www.vinted.de/items/12345"),false);
  assert.equal(api.savedUrl("https://www.vinted.de/member/42?tab=uploaded"),false);
});
test("batch workflow is draft-only; never makes publishing call",()=>{
  const txt=code.toLowerCase();
  assert.ok(txt.includes('type:"save_vinted_draft"'));
  assert.ok(txt.includes('type:"check_vinted_draft_save"'));
  assert.ok(!txt.includes('type:"publish_vinted"'));
  assert.ok(!txt.includes("type:'publish_vinted'"));
  assert.ok(txt.includes("await verifysave("));
});


test("initial about:blank is pending, not a false site-leave error",()=>{
  const {api}=batchApi();
  const nav=api.tabNavigationState({
    url:"about:blank",pendingUrl:"https://www.vinted.de/items/new",
    status:"loading"
  },300);
  assert.equal(nav.kind,"pending");
  assert.equal(nav.where,"https://www.vinted.de/items/new");
});
test("new blank tab without a pending URL gets a short grace, but not forever",()=>{
  const {api}=batchApi();
  assert.equal(api.tabNavigationState({url:"",status:"loading"},100).kind,"pending");
  assert.equal(api.tabNavigationState({url:"chrome://newtab/",status:"loading"},500).kind,"pending");
  assert.equal(api.tabNavigationState({url:"about:blank",status:"complete"},9000).kind,"blocked");
});
test("foreign committed URL is blocked even if pending URL looks Vinted",()=>{
  const {api}=batchApi();
  const check=api.tabNavigationState({
    url:"https://login.evil.example/phishing?secret=something",
    pendingUrl:"https://www.vinted.de/items/new",status:"complete"
  },100);
  assert.equal(check.kind,"blocked");
  assert.equal(check.where,"https://login.evil.example/phishing");
  assert.equal(check.where.includes("secret"),false);
});
test("safe Vinted URLs proceed to engine-ready polling",()=>{
  const {api}=batchApi();
  assert.equal(api.tabNavigationState({
    url:"https://www.vinted.de/items/new?foo=bar",
    status:"loading"
  },100).kind,"vinted");
});
test("waitForEditor survives about:blank and loading without misdiagnosing redirect",async()=>{
  const frames=[
    {url:"",pendingUrl:"https://www.vinted.de/items/new",status:"loading"},
    {url:"about:blank",pendingUrl:"https://www.vinted.de/items/new",status:"loading"},
    {url:"https://www.vinted.de/items/new",status:"loading"},
    {url:"https://www.vinted.de/items/new",status:"complete"}
  ];
  let read=0,pings=0;
  const {api}=batchApi({
    getTab:async()=>frames[Math.min(read++,frames.length-1)],
    sendMessage:async(tabId,message)=>{
      assert.equal(tabId,42);
      assert.equal(message.type,"PING_VINTED_ENGINE");
      pings++;
      return {ready:pings>=2};
    }
  });
  await api.waitForEditor(42,2000,1);
  assert.equal(read,4);
  assert.equal(pings,2);
});
test("waitForEditor stops with safe URL diagnostics on genuine off-site redirect",async()=>{
  const {api}=batchApi({
    getTab:async()=>({url:"https://example.org/auth?token=dont-log-me",
      status:"complete"}),
    sendMessage:async()=>{throw Error("No extension should run here");}
  });
  await assert.rejects(api.waitForEditor(10,500,1),e=>{
    assert.match(e.message,/https:\/\/example.org\/auth/);
    assert.doesNotMatch(e.message,/dont-log-me/);
    assert.match(e.message,/Weiterleitung|Anmeldung|umgeleitet/);
    return true;
  });
});
test("waitForEditor keeps waiting for Vinted login/form instead of reporting redirect",async()=>{
  const {api}=batchApi({
    getTab:async()=>({url:"https://www.vinted.de/member/login",status:"complete"}),
    sendMessage:async()=>({ready:false})
  });
  await assert.rejects(api.waitForEditor(10,25,1),
    /Verkaufsformular nach 0 Sekunden nicht bereit/);
});


function failedSaveState({two=false}={}){
  const rows=[{id:"pant73",artikelnummer:73,title:"Diesel Jeans #73"},
    ...(two?[{id:"pant74",artikelnummer:74,title:"Diesel Jeans #74"}]:[])];
  return {status:"error",phase:"failed",index:0,currentId:"pant73",
    error:"Vinted hat das Speichern nicht eindeutig bestätigt. Die Hose nicht erneut automatisch senden; Entwürfe zuerst prüfen.",
    queue:rows,completed:[],logs:["Beginne 1/2: Artikel #73",
      "Speichere #73 ausdrücklich als Entwurf",
      "Prüfe Vinted-Speicherbestätigung für #73",
      "STOP bei #73: Vinted hat das Speichern nicht eindeutig bestätigt."]
  };
}
test("legacy #73 ambiguous save is recoverable only after a real save attempt",()=>{
  const state=failedSaveState();
  const {api}=batchApi();
  assert.equal(api.recoverableSave(state),true);
  assert.equal(api.recoverableSave({...state,logs:["Nothing"]}),false);
  assert.equal(api.recoverableSave({...state,error:"No save button"}),false);
  assert.equal(api.recoverableSave({...state,currentId:"other"}),false);
  assert.equal(api.recoverableSave({...state,status:"done"}),false);
});
test("new paused state accepts user confirmation but never retries a save",async()=>{
  const state={...failedSaveState(),status:"awaiting_confirmation",phase:"awaiting_confirmation"};
  const box=batchApi({state});
  assert.equal(box.api.recoverableSave(state),true);
  const response=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant73",articleNumber:73
  });
  assert.equal(response.success,true);
  assert.equal(response.finished,true);
  assert.equal(box.store.vintedBatchState.status,"done");
  assert.equal(box.store.vintedBatchState.index,1);
  assert.deepEqual(Array.from(box.store.vintedBatchState.completed),["pant73"]);
  assert.equal(box.alarmCalls.some(x=>x[0]==="create"),false);
});
test("confirmed old #73 skips to #74 rather than uploading #73 again",async()=>{
  const box=batchApi({state:failedSaveState({two:true})});
  const response=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant73",articleNumber:73
  });
  assert.equal(response.success,true);
  assert.equal(response.nextArticle,74);
  assert.equal(box.store.vintedBatchState.index,1);
  assert.equal(box.store.vintedBatchState.queue[1].artikelnummer,74);
  assert.equal(box.store.vintedBatchState.phase,"ready");
  assert.equal(box.alarmCalls.filter(x=>x[0]==="create").length,1);
});
test("recovery cannot confirm a different item or wrong article number",async()=>{
  const box=batchApi({state:failedSaveState()});
  let result=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant74",articleNumber:73
  });
  assert.equal(result.success,false);
  result=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant73",articleNumber:74
  });
  assert.equal(result.success,false);
  assert.equal(box.store.vintedBatchState.index,0);
});
test("unrelated error is not manually confirmable",async()=>{
  const box=batchApi({state:{...failedSaveState(),error:"Speichern nicht gestartet: Button fehlt"}});
  const response=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant73",articleNumber:73
  });
  assert.equal(response.success,false);
  assert.equal(box.store.vintedBatchState.index,0);
});


test("size error reports the actual Vinted engine reason instead of only 'size'",()=>{
  const {api}=batchApi();
  const msg=api.formFailureMessage({
    success:true,stoppedAt:"size",
    results:{size:{success:false,reason:"Taillenumfang geöffnet, aber W30 nicht als Option gefunden"}},
    logs:["[SIZE INPUT] size=W30 gender=men waistCm=38",
      "[SIZE OPTIONS] [\"W28\",\"W32\"]",
      "[STOP] Größe: Taillenumfang geöffnet, aber W30 nicht als Option gefunden"]
  });
  assert.match(msg,/Größe: Taillenumfang geöffnet, aber W30 nicht als Option gefunden/);
  assert.match(msg,/SIZE OPTIONS/);
});
test("size diagnostic distinguishes missing measurements from real label",()=>{
  const {api}=batchApi();
  assert.match(api.draftSizeSummary({size:"",measurements:{waist:""}}),
    /Bundweite wurde NICHT in den Vinted-Entwurf übertragen/);
  assert.match(api.draftSizeSummary({size:"W30",gender:"Herren",measurements:{waist:"38"}}),
    /Größe in Sascha AI: W30; Bundweite: 38 cm; Bereich: Herren/);
});
test("unknown or empty Vinted fill response gets actionable error",()=>{
  const {api}=batchApi();
  assert.match(api.formFailureMessage(null),/keine Antwort/);
  assert.match(api.formFailureMessage({success:false,error:"content-script crash"}),
    /content-script crash/);
  assert.equal(api.formFailureMessage({success:true,results:{}}),"");
});


test("confirmed W30 estimate may continue only in explicitly opted-in draft batch",()=>{
  const {api}=batchApi();
  const result={
    success:true,needsReview:true,reviewType:"estimated-size",
    selectedSize:"W30",estimateSource:"measured-waist",
    reason:"Größe W30 aus Bundweite 38 cm geschätzt"
  };
  assert.equal(api.reviewableEstimatedSize(result,true),true);
  assert.equal(api.reviewableEstimatedSize(result,false),false);
  assert.equal(api.reviewableEstimatedSize(result,undefined),false);
});
test("estimated women M and reviewed W36-to-XXL conversion are draft-only",()=>{
  const {api}=batchApi();
  for(const [size,source] of [["M","measured-waist"],
      ["XXL","w-label"],["2XL","eu-label"],["L","us-label"]]){
    const review={success:true,needsReview:true,reviewType:"estimated-size",
      selectedSize:size,estimateSource:source};
    assert.equal(api.reviewableEstimatedSize(review,true),true,size);
  }
});
test("draft allowance NEVER ignores failed picker or non-size manual review",()=>{
  const {api}=batchApi();
  const good={success:true,needsReview:true,reviewType:"estimated-size",
    selectedSize:"W30",estimateSource:"measured-waist"};
  for(const bad of [
    {...good,success:false},
    {...good,needsReview:false},
    {...good,reviewType:"color-review"},
    {...good,selectedSize:""},
    {...good,selectedSize:"W999"},
    {...good,selectedSize:"XXL (nicht bestätigt)"},
    {...good,estimateSource:"unknown"},
    null
  ]){
    assert.equal(api.reviewableEstimatedSize(bad,true),false,
      JSON.stringify(bad));
  }
});
test("manual save confirmation retains pending estimated-size review warning",async()=>{
  const warning="Artikel #73: geschätzte Größe W30 – vor Veröffentlichung prüfen";
  const state={...failedSaveState(),
    status:"awaiting_confirmation",phase:"awaiting_confirmation",
    pendingReviewWarnings:[warning]};
  const box=batchApi({state});
  const result=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant73",articleNumber:73
  });
  assert.equal(result.success,true);
  assert.equal(box.store.vintedBatchState.pendingReviewWarnings.length,0);
  assert.ok(box.store.vintedBatchState.warnings.includes(warning));
});


test("confirmed article numbers are kept across batches after seller verifies save",async()=>{
  const box=batchApi({state:failedSaveState()});
  const result=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant73",articleNumber:73
  });
  assert.equal(result.success,true);
  assert.deepEqual(Array.from(box.store.vintedConfirmedArticleNumbers),[73]);
});
test("an old 0/1 queue can grow to include next ready pants on manual confirmation",async()=>{
  const box=batchApi({
    state:failedSaveState(),
    queryTabs:async()=>[{id:99,url:"https://sascha-sage.vercel.app/"}],
    sendMessage:async(tabId,msg)=>{
      assert.equal(tabId,99);
      assert.equal(msg.type,"FETCH_DRAFT_LIST_FROM_SASCHA");
      assert.equal(msg.includeEligiblePants,true);
      return {success:true,payload:[pant(73,"pant73"),pant(75,"pant75"),pant(74,"pant74")]};
    }
  });
  // Deliberately disable follow-up form execution; the test verifies the
  // queue extension and scheduling without opening real Vinted tabs.
  const original=box.dispatch;
  const response=await original({type:"CONFIRM_VINTED_DRAFT_SAVED",
    draftId:"pant73",articleNumber:73});
  assert.equal(response.success,true);
  assert.equal(response.nextArticle,75);
  assert.equal(box.store.vintedBatchState.index,1);
  assert.deepEqual(Array.from(box.store.vintedBatchState.queue,
    x=>x.artikelnummer),[73,75,74]);
});
test("confirmed article number is not re-enqueued from the refreshed list",async()=>{
  const box=batchApi({state:failedSaveState(),
    store:{vintedConfirmedArticleNumbers:[74]},
    queryTabs:async()=>[{id:99,url:"https://sascha-sage.vercel.app/"}],
    sendMessage:async()=>({success:true,payload:[
      pant(73,"pant73"),pant(74,"pant74"),pant(75,"pant75")
    ]})
  });
  const response=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant73",articleNumber:73});
  assert.equal(response.nextArticle,75);
  assert.deepEqual(Array.from(box.store.vintedBatchState.queue,
    x=>x.artikelnummer),[73,75]);
});


test("a numeric women's label 6 estimated from actual waist can be saved as DRAFT only with opt-in",()=>{
  const {api}=batchApi();
  const result={success:true,needsReview:true,reviewType:"estimated-size",
    selectedSize:"M",estimateSource:"ambiguous-label-waist",
    reason:"Etikettgröße 6 unklar; M nur aus Bundweite geschätzt"};
  assert.equal(api.reviewableEstimatedSize(result,true),true);
  assert.equal(api.reviewableEstimatedSize(result,false),false);
  assert.equal(api.reviewableEstimatedSize({...result,success:false},true),false);
  assert.equal(api.reviewableEstimatedSize({...result,reviewType:"unknown"},true),false);
  assert.equal(api.reviewableEstimatedSize({...result,selectedSize:"6"},true),false);
});

test("legacy one-item #67 completion appends lower unconfirmed #66 #65 (never #67 twice)",async()=>{
  const box=batchApi({
    state:{...failedSaveState(),status:"awaiting_confirmation",
      phase:"awaiting_confirmation",queue:[pant(67,"pant67")],
      currentId:"pant67"},
    queryTabs:async()=>[{id:90,url:"https://sascha-sage.vercel.app/"}],
    sendMessage:async()=>({success:true,payload:[
      pant(64,"p64"),pant(67,"pant67"),pant(66,"p66"),pant(65,"p65")
    ]})
  });
  const response=await box.dispatch({
    type:"CONFIRM_VINTED_DRAFT_SAVED",draftId:"pant67",articleNumber:67
  });
  assert.equal(response.success,true);
  assert.equal(response.nextArticle,66);
  assert.deepEqual(Array.from(box.store.vintedBatchState.queue,
    x=>x.artikelnummer),[67,66,65,64]);
  assert.equal(box.store.vintedBatchState.index,1);
  assert.deepEqual(Array.from(box.store.vintedConfirmedArticleNumbers),[67]);
});
test("completed 1/1 #67 can resume from #66 without uploading #67",async()=>{
  const previous={...failedSaveState(),status:"done",phase:"done",index:1,
    queue:[pant(67,"pant67")],completed:["pant67"],currentId:null,error:null,
    warnings:["Artikel #67: Größe XS geschätzt"]};
  const box=batchApi({state:previous,store:{vintedConfirmedArticleNumbers:[67]},
    queryTabs:async()=>[{id:90,url:"https://sascha-sage.vercel.app/"}],
    sendMessage:async()=>({success:true,payload:[
      pant(63,"p63"),pant(65,"p65"),pant(66,"p66"),pant(67,"pant67")
    ]})
  });
  const response=await box.dispatch({type:"RESUME_REMAINING_VINTED_BATCH"});
  assert.equal(response.success,true);
  assert.equal(response.count,3);
  assert.equal(response.nextArticle,66);
  assert.deepEqual(Array.from(box.store.vintedBatchState.queue,
    x=>x.artikelnummer),[67,66,65,63]);
  assert.equal(box.store.vintedBatchState.index,1);
  assert.deepEqual(Array.from(box.store.vintedBatchState.completed),["pant67"]);
  assert.equal(box.store.vintedBatchState.warnings[0],"Artikel #67: Größe XS geschätzt");
  assert.equal(box.store.vintedBatchState.status,"running");
});
test("completed queue resume stops without new eligible items and never repeats completed",async()=>{
  const previous={...failedSaveState(),status:"done",phase:"done",index:1,
    queue:[pant(67,"pant67")],completed:["pant67"],currentId:null,error:null};
  const box=batchApi({state:previous,
    store:{vintedConfirmedArticleNumbers:[67]},
    queryTabs:async()=>[{id:90,url:"https://sascha-sage.vercel.app/"}],
    sendMessage:async()=>({success:true,payload:[pant(67,"pant67")]})
  });
  const response=await box.dispatch({type:"RESUME_REMAINING_VINTED_BATCH"});
  assert.equal(response.success,false);
  assert.match(response.error,/keine weitere unbestätigte Hose/);
  assert.equal(box.store.vintedBatchState.status,"done");
});
test("continuation will not requeue any article already confirmed in another batch",()=>{
  const {api}=batchApi();
  const previous={queue:[{id:"p67",artikelnummer:67}],index:1};
  const next=api.continuationRows(previous,[
    pant(67,"p67"),pant(65,"p65"),pant(66,"p66"),pant(64,"p64")
  ],[66]);
  assert.deepEqual(Array.from(next,x=>x.artikelnummer),[65,64]);
});
