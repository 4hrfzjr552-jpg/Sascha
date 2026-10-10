// Run: node --test browser-extension/tests/engine-v3.test.cjs
// Deterministic simulated Vinted DOM. This is NOT a live Vinted test.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const catalogContext={window:{},module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","vinted-catalog-v3.js"),"utf8"),catalogContext);
const catalog=catalogContext.module.exports;
const sizeEstimateContext={window:{},module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","vinted-size-estimate.js"),"utf8"),sizeEstimateContext);
const waistEstimate=sizeEstimateContext.module.exports;
const src=fs.readFileSync(path.join(__dirname,"..","content-vinted-v3.js"),"utf8");
class FakeInput{
  constructor(id,value=""){this.id=id;this._value=value;this.isConnected=true;}
  get value(){return this._value;}
  set value(v){this._value=String(v);}
  getClientRects(){return [1];}
  closest(){return null;}
  getAttribute(){return null;}
  focus(){}
  blur(){}
  dispatchEvent(){}
}
class FakeEvent{constructor(name){this.type=name;}}
function createEngine(document,extra={}){
  const window={
    SaschaVintedCatalogV3:catalog,
    SaschaVintedWaistEstimate:waistEstimate,
    SaschaVintedImageEdit:extra.imageEditor===null?null:(extra.imageEditor||{
      processImage:async(file,i)=>({
        file:new (extra.File||File)([file],
          "sascha_vinted_"+String(i+1).padStart(2,"0")+"_edited.jpg",
          {type:"image/jpeg"}),
        colorLook:"soft-reference-look-v2",gradedPixels:500
      })
    }),
    __SASCHA_TEST__:true
  };
  let tick=0;
  class ClockDate extends Date{static now(){tick+=250;return tick;}}
  const sandbox={
    window,document,HTMLInputElement:FakeInput,
    HTMLTextAreaElement:class extends FakeInput{},
    Event:FakeEvent,KeyboardEvent:FakeEvent,
    getComputedStyle:()=>({display:"block",visibility:"visible"}),
    setTimeout:fn=>fn(),
    Date:ClockDate,
    File:extra.File||class{},
    MutationObserver:extra.MutationObserver,
    DataTransfer:extra.DataTransfer||class{},
    fetch:extra.fetch||undefined,
    atob:extra.atob||(value=>Buffer.from(value,"base64").toString("binary")),
    chrome:{runtime:{onMessage:{addListener(){}}}},
    console
  };
  vm.runInNewContext(src,sandbox,{filename:"content-vinted-v3.js"});
  return window.__SASCHA_ENGINE_TEST__;
}
function mockCategory({id=1819,label="Gerade geschnittene Jeans Herren > Kleidung > Jeans"}={}){
  const category=new FakeInput("category");
  const search=new FakeInput("catalog-search-input");
  let open=false,clicked=false;
  category.click=()=>{open=true;};
  const row={
    innerText:label,textContent:label,isConnected:true,
    getClientRects:()=>[1],closest:()=>null
  };
  const radio={
    id:"catalog-search-"+id+"-radio",
    closest(){return row;},
    click(){clicked=true;category.value="Gerade geschnittene Jeans";open=false;}
  };
  const document={
    querySelector(selector){
      if(selector.startsWith("#category"))return category;
      if(selector==="#catalog-search-input")return open?search:null;
      return null;
    },
    querySelectorAll(selector){
      if(selector==='input[id^="catalog-search-"][id$="-radio"]')
        return open&&search.value?[radio]:[];
      return [];
    }
  };
  return {document,category,wasClicked:()=>clicked};
}
test("Vinted live catalog radio 1819 is selected and confirmed for straight men's jeans",async()=>{
  const fixture=mockCategory();
  const engine=createEngine(fixture.document);
  const logs=[];
  const output=await engine.chooseCategory({gender:"Herren",fit:"straight",category:"Jeans"},x=>logs.push(x));
  assert.equal(output.success,true);
  assert.equal(fixture.wasClicked(),true);
  assert.equal(fixture.category.value,"Gerade geschnittene Jeans");
  assert.ok(logs.some(x=>x.includes("CATEGORY SELECTED")));
});
test("child-category radio cannot be clicked as men's straight jeans",async()=>{
  const fixture=mockCategory({id:1559,label:"Jeans Kinder > Mädchen > Hosen & Shorts"});
  const engine=createEngine(fixture.document);
  const logs=[];
  await assert.rejects(()=>engine.chooseCategory({
    gender:"Herren",fit:"straight",category:"Jeans"},x=>logs.push(x)),/nicht an/);
  assert.equal(fixture.wasClicked(),false);
});
test("W36 switches from XS–7XL to the Taillenumfang submenu and selects W36",async()=>{
  const input=new FakeInput("size");let opened=false,mode="letters",selected="";
  input.click=()=>{opened=true;};
  const choices=()=>mode==="letters"?["XS","S","M","L","XL","XXL"]:["W32","W34","W36","W38"];
  const mkOption=label=>({
    isConnected:true,innerText:label,textContent:label,
    getClientRects:()=>[1],closest:()=>null,getAttribute:()=>null,
    click(){selected=label;input.value=label;opened=false;}
  });
  const tab={
    innerText:"Taillenumfang",textContent:"Taillenumfang",
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    getAttribute:()=>null,click(){mode="waist";}
  };
  const grid={
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    querySelectorAll(selector){
      return selector.includes('[role="tab"]')?[tab]:choices().map(mkOption);
    }
  };
  const body={querySelectorAll:()=>[]};
  const document={
    body,
    querySelector(selector){return selector==="#size"?input:null;},
    querySelectorAll(selector){
      if(selector.includes("size-single-grid-content")&&opened)return [grid];
      return [];
    }
  };
  const logs=[];
  const output=await createEngine(document).size(
    {gender:"Herren",category:"Jeans",brand:"Diesel",size:"W36"},x=>logs.push(x));
  assert.equal(output.success,true);
  assert.equal(output.needsReview,undefined);
  assert.equal(selected,"W36");
  assert.equal(input.value,"W36");
  assert.ok(logs.some(x=>x.includes("[SIZE WAIST] öffne Untermenü")));
  assert.ok(logs.some(x=>x.includes("[SIZE SELECTED] W36")));
});


test("missing label plus 39 cm flat waist selects W31 but requires user review",async()=>{
  const input=new FakeInput("size");let opened=false,mode="letters",selected="";
  input.click=()=>{opened=true;};
  const choices=()=>mode==="letters"?["XS","M","L","XL"]:["W30","W31","W32","W34"];
  const option=label=>({
    isConnected:true,innerText:label,textContent:label,
    getClientRects:()=>[1],closest:()=>null,getAttribute:()=>null,
    click(){selected=label;input.value=label;opened=false;}
  });
  const tab={
    innerText:"Taillenumfang",textContent:"Taillenumfang",
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    getAttribute:()=>null,click(){mode="waist";}
  };
  const grid={
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    querySelectorAll(selector){
      return selector.includes('[role="tab"]')?[tab]:choices().map(option);
    }
  };
  const doc={
    querySelector(selector){return selector==="#size"?input:null;},
    querySelectorAll(selector){
      return selector.includes("size-single-grid-content")&&opened?[grid]:[];
    }
  };
  const logs=[];
  const result=await createEngine(doc).size({
    gender:"Herren",category:"Jeans",fit:"straight",
    size:"",measurements:{waist:"39 cm",totalLength:"109"}
  },line=>logs.push(line));
  assert.equal(result.success,true);
  assert.equal(result.needsReview,true);
  assert.equal(result.reviewType,"estimated-size");
  assert.equal(result.selectedSize,"W31");
  assert.equal(result.estimateSource,"measured-waist");
  assert.equal(selected,"W31");
  assert.match(result.reason,/39 cm geschätzt/);
  assert.ok(logs.some(x=>x.includes("[SIZE ESTIMATE]")));
  assert.ok(logs.some(x=>x.includes("[SIZE REVIEW]")));
});
test("when Sascha AI shows a waist but draft payload omits it, explain stale website transfer",async()=>{
  const doc={querySelector(){return null;},querySelectorAll(){return [];}};
  const logs=[];
  await assert.rejects(()=>createEngine(doc).size({
    size:"",gender:"Herren",category:"Jeans",fit:"straight",
    measurements:{}
  },x=>logs.push(x)),/werden aber nicht im Vinted-Entwurf mitgesendet/);
  assert.ok(logs.some(x=>x.includes("[SIZE INPUT]")));
  assert.ok(logs.some(x=>x.includes("waistCm=(nicht übertragen)")));
});
test("38 cm flat Bundweite calculates intended estimated size but does not assert label authenticity",()=>{
  const result=waistEstimate.estimate({
    size:"",measurements:{waist:"38"}
  },{gender:"men",kind:"jeans"});
  assert.equal(result.size,"W30");
  assert.equal(result.estimated,true);
  assert.match(result.reason,/kein Etikett/);
});

test("unknown size without measured waist cannot select arbitrary Vinted size",async()=>{
  const doc={querySelector(){return null;},querySelectorAll(){return [];}};
  const logs=[];
  await assert.rejects(()=>createEngine(doc).size({
    size:"Unbekannt",gender:"Herren",category:"Jeans",
    measurements:{totalLength:"110"}
  },x=>logs.push(x)),/Keine gültige flach gemessene Bundweite/);
  assert.equal(logs.some(x=>x.includes("[SIZE SELECTED]")),false);
});

test("size dropdown is scrolled into view before the click (lazy content)",async()=>{
  const input=new FakeInput("size");
  let scrolled=false,opened=false,selected="";
  input.getBoundingClientRect=()=>({top:900,bottom:930,y:900});
  input.scrollIntoView=()=>{scrolled=true;};
  input.click=()=>{opened=scrolled;};
  const grid={isConnected:true,getClientRects:()=>[1],closest:()=>null,
    querySelectorAll:()=>[{
      isConnected:true,innerText:"W36",getClientRects:()=>[1],closest:()=>null,
      click(){selected="W36";input.value="W36";opened=false;}
    }]};
  const document={
    querySelector(selector){
      if(selector==="#size")return input;
      return null;
    },
    querySelectorAll(selector){
      if(selector.includes("category-size-single-grid-content")&&opened)return [grid];
      return [];
    }
  };
  const engine=createEngine(document);
  const logs=[];
  const result=await engine.size({size:"W36",brand:"Diesel",gender:"Herren",category:"Jeans"},x=>logs.push(x));
  assert.equal(result.success,true);
  assert.equal(scrolled,true);
  assert.equal(selected,"W36");
  assert.ok(logs.some(x=>x.includes("[SIZE OPEN] click input")));
});
test("if the input click does nothing, click the field wrapper once",async()=>{
  const input=new FakeInput("size");
  let opened=false,wrapperClicks=0;
  const wrapper={
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    click(){opened=true;wrapperClicks++;}
  };
  input.parentElement=wrapper;
  input.click=()=>{};
  const grid={isConnected:true,getClientRects:()=>[1],closest:()=>null,
    querySelectorAll:()=>[{
      isConnected:true,innerText:"W36",getClientRects:()=>[1],closest:()=>null,
      click(){input.value="W36";opened=false;}
    }]};
  const document={
    querySelector(selector){return selector==="#size"?input:null;},
    querySelectorAll(selector){
      return selector.includes("category-size-single-grid-content")&&opened?[grid]:[];
    }
  };
  const engine=createEngine(document);
  const logs=[];
  const result=await engine.size({size:"W36",gender:"Herren",category:"Jeans"},x=>logs.push(x));
  assert.equal(result.success,true);
  assert.equal(wrapperClicks,1);
  assert.ok(logs.some(x=>x.includes("[SIZE OPEN] click wrapper")));
});
test("if no size menu appears, report diagnostics instead of guessing",async()=>{
  const input=new FakeInput("size");
  input.click=()=>{};
  const document={
    querySelector(selector){return selector==="#size"?input:null;},
    querySelectorAll(){return [];}
  };
  const logs=[];
  await assert.rejects(()=>createEngine(document).size(
    {size:"W36",gender:"Herren",category:"Jeans"},x=>logs.push(x)),/nicht geöffnet/);
  assert.ok(logs.some(x=>x.includes("[SIZE DIAG]")));
});


test("chips picker offering only XXL is rejected for W36 when waist submenu is absent",async()=>{
  const input=new FakeInput("size");
  input.getAttribute=attr=>attr==="data-testid"?"category-size-single-grid_chips-input":null;
  let opened=false,chosen="",inputClicks=0;
  input.click=()=>{opened=true;inputClicks++;};
  const labels=["XS","S","M","L","XL","XXL"];
  const opts=labels.map(label=>({
    innerText:label,textContent:label,isConnected:true,getClientRects:()=>[1],
    closest:()=>null,getAttribute:()=>null,
    click(){chosen=label;input.value=label;opened=false;}
  }));
  const listbox={
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    contains:()=>false,
    querySelector:()=>null,
    querySelectorAll:()=>opts
  };
  const document={
    querySelector(selector){if(selector==="#size")return input;return null;},
    querySelectorAll(selector){
      if(selector.includes('[role="listbox"]')&&opened)return [listbox];
      return [];
    }
  };
  const engine=createEngine(document),logs=[];
  await assert.rejects(()=>engine.size({
    gender:"Herren",category:"Jeans",brand:"Diesel",size:"W36"
  },x=>logs.push(x)),/Taillenumfang-Untermenü nicht erkannt/);
  assert.equal(chosen,"");
  assert.equal(inputClicks,1);
  assert.ok(logs.some(x=>x.includes("[SIZE OPEN] choices=6 via=input")));
  assert.ok(logs.some(x=>x.includes("[SIZE GROUPS]")));
});
test("chips field does not click the dropdown arrow again when chevron is already up",async()=>{
  const input=new FakeInput("size");
  input.getAttribute=attr=>attr==="data-testid"?"category-size-single-grid_chips-input":null;
  let clicks=0,menuOpen=false;
  input.click=()=>{clicks++;menuOpen=true;};
  const up={
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    getAttribute:()=>null
  };
  const document={
    querySelector(selector){return selector==="#size"?input:null;},
    querySelectorAll(selector){
      if(selector.includes("chevron-up")&&menuOpen)return [up];
      return [];
    }
  };
  const engine=createEngine(document),logs=[];
  await assert.rejects(()=>engine.size({gender:"Herren",category:"Jeans",brand:"Diesel",size:"W36"},
    x=>logs.push(x)),/nicht geöffnet/);
  assert.equal(clicks,1);
  assert.ok(logs.some(x=>x.includes('"opened":true')));
  assert.ok(logs.some(x=>x.includes("[SIZE DIAG]")));
});

test("condition Sehr gut matches the heading before its descriptive text",()=>{
  const engine=createEngine({querySelector(){return null;},querySelectorAll(){return [];}});
  const option={
    innerText:"Sehr gut Ein nur selten benutzter Artikel mit möglichen Unvollkommenheiten.",
    textContent:"Sehr gut Ein nur selten benutzter Artikel",
  };
  assert.equal(engine.isCorrectFieldOption("condition",option,["sehr gut","very good"]),true);
  assert.equal(engine.isCorrectFieldOption("condition",option,["gut","good"]),false);
});


test("price parser handles comma, dot, euros, and thousands formatting",()=>{
  const engine=createEngine({querySelectorAll(){return [];}});
  const examples=[
    ["25",2500],["25,00",2500],["25.00 €",2500],
    ["25,50 €",2550],["€ 25,50",2550],["25.5",2550],
    ["1.234,50 €",123450],["1,234.50",123450],
    ["1.234",123400],["25 EUR",2500],["",null],["abc",null]
  ];
  for(const [label,cents] of examples)
    assert.equal(engine.priceCents(label),cents,"Money parser: "+label);
});
test("price is accepted after Vinted formats input on blur",async()=>{
  const input=new FakeInput("price");
  input.tagName="INPUT";
  input.getAttribute=name=>name==="type"?"text":null;
  input.blur=()=>{input.value="25,00 €";};
  const document={
    querySelectorAll(selector){
      return selector.includes("#price")?[input]:[];
    },
    querySelector(){return null;}
  };
  const logs=[];
  const result=await createEngine(document).price({price:"25,00"},x=>logs.push(x));
  assert.equal(result.success,true);
  assert.ok(logs.some(x=>x.includes("confirmed=true")));
});
test("a number input accepts decimal dot and confirms correct amount",async()=>{
  const input=new FakeInput("price");
  input.tagName="INPUT";
  input.getAttribute=name=>name==="type"?"number":null;
  input.blur=()=>{};
  const document={querySelectorAll(selector){
    return selector.includes("#price")?[input]:[];
  }};
  const logs=[];
  const result=await createEngine(document).price({price:"19,50 €"},x=>logs.push(x));
  assert.equal(result.success,true);
  assert.equal(input.value,"19.5");
});
test("if Vinted overwrites the input with a different price, stop",async()=>{
  const input=new FakeInput("price");
  input.tagName="INPUT";
  input.getAttribute=name=>name==="type"?"text":null;
  input.blur=()=>{input.value="20,00 €";};
  const document={querySelectorAll(selector){
    return selector.includes("#price")?[input]:[];
  }};
  const logs=[];
  await assert.rejects(()=>createEngine(document).price({price:"25,00"},x=>logs.push(x)),
    /nicht sicher bestätigt/);
  assert.ok(logs.some(x=>x.includes("confirmed=false")));
});


function imageTestEnv({sourceCount=5,resetAfterChange=true,withPreview=false,assignCount=null}={}){
  let sent=[];
  class FakeFile{constructor(chunks,name,opts){this.name=name;this.type=opts.type;this.chunks=chunks;}}
  class FakeTransfer{
    constructor(){
      const entries=[];
      this.items={add:file=>entries.push(file)};
      Object.defineProperty(this,"files",{get:()=>entries});
    }
  }
  const upload={isConnected:true,
    getBoundingClientRect:()=>({top:10,bottom:30,y:10}),
    scrollIntoView(){},
    getClientRects:()=>[1],closest(){return null;}};
  let count=0;
  let selected=[];
  Object.defineProperty(upload,"files",{
    get:()=>selected,
    set:files=>{selected=assignCount===null?[...files]:[...files].slice(0,assignCount);}
  });
  upload.dispatchEvent=event=>{
    if(event.type!=="change")return;
    sent=[...upload.files];
    if(withPreview)count=sent.length;
    if(resetAfterChange)selected=[];
  };
  const area={isConnected:true,contains:el=>el===upload,
    getClientRects:()=>[1],closest:()=>null,querySelectorAll(selector){
      if(selector.includes("photo-preview")){
        return Array.from({length:count},(_,i)=>({
          isConnected:true,getClientRects:()=>[1],closest:()=>null,
          getAttribute:()=>null,id:"preview-"+i
        }));
      }
      return [];
    }};
  upload.closest=selector=>selector.includes("photo-upload")?area:null;
  const document={
    querySelector(sel){return sel.includes('input[type="file"]')?upload:null;},
    querySelectorAll(sel){return sel.includes("photo-upload")?[area]:[];}
  };
  const extra={
    File:FakeFile,DataTransfer:FakeTransfer,
    fetch:async url=>({ok:true,blob:async()=>({type:"image/jpeg",url})})
  };
  const images=Array.from({length:sourceCount},(_,i)=>({
    dataUrl:"data:image/jpeg;base64,"+Buffer.from("fake-jpeg-"+(i+1)).toString("base64"),name:"image"+(i+1)+".jpg"
  }));
  return {document,extra,draft:{images},sent:()=>sent,visiblePreviews:()=>count};
}

test("when draft has five images, Vinted receives only first four in order",async()=>{
  const mock=imageTestEnv({sourceCount:5,resetAfterChange:true,withPreview:false});
  const logs=[];
  const result=await createEngine(mock.document,mock.extra).images(mock.draft,line=>logs.push(line));
  assert.equal(mock.sent().length,4);
  assert.ok(mock.sent().every(file=>file.name.endsWith("_edited.jpg")));
  assert.deepEqual(mock.sent().map(f=>f.name),[
    "sascha_vinted_01_edited.jpg","sascha_vinted_02_edited.jpg",
    "sascha_vinted_03_edited.jpg","sascha_vinted_04_edited.jpg"]);
  assert.equal(result.success,true);
  assert.equal(result.needsReview,true);
  assert.ok(logs.some(l=>l.includes("[IMAGES SUBMIT] first=4 total=5 skipped=1")));
  assert.ok(logs.some(l=>l.includes("[IMAGES REVIEW]")));
  assert.ok(logs.some(l=>l.includes("colorLook=soft-reference-look-v2")));
});
test("explicit draft-only batch may save after all four edited files transferred without readable thumbnails",async()=>{
  const mock=imageTestEnv({sourceCount:5,resetAfterChange:true,withPreview:false});
  const logs=[];
  const result=await createEngine(mock.document,mock.extra).images(
    mock.draft,line=>logs.push(line),{draftOnlyBatch:true});
  assert.equal(result.success,true);
  assert.equal(result.count,4);
  assert.equal(result.needsReview,false);
  assert.equal(result.previewVerified,false);
  assert.equal(result.reviewAfterSave,true);
  assert.equal(mock.sent().length,4);
  assert.ok(logs.some(l=>l.includes("[IMAGES DRAFT-ONLY]")));
  assert.ok(logs.some(l=>l.includes("[IMAGES DIAG]")));
});
test("single mode still requires manual review if thumbnails cannot be inspected",async()=>{
  const mock=imageTestEnv({sourceCount:5,withPreview:false,resetAfterChange:true});
  const result=await createEngine(mock.document,mock.extra).images(
    mock.draft,()=>{},{draftOnlyBatch:false});
  assert.equal(result.needsReview,true);
  assert.equal(result.previewVerified,false);
  assert.equal(result.reviewAfterSave,undefined);
});
test("draft-only mode never accepts incomplete file transfer",async()=>{
  const mock=imageTestEnv({sourceCount:5,assignCount:3,withPreview:false});
  await assert.rejects(()=>createEngine(mock.document,mock.extra).images(
    mock.draft,()=>{},{draftOnlyBatch:true}),/nur 3\/4 Bilddateien angenommen/);
});
test("true Vinted gallery confirmation takes precedence over draft-only fallback",async()=>{
  const mock=imageTestEnv({sourceCount:5,withPreview:true,resetAfterChange:true});
  const logs=[];
  const result=await createEngine(mock.document,mock.extra).images(
    mock.draft,line=>logs.push(line),{draftOnlyBatch:true});
  assert.equal(result.success,true);
  assert.equal(result.previewVerified,true);
  assert.equal(result.needsReview,false);
  assert.equal(result.reviewAfterSave,undefined);
  assert.equal(logs.some(l=>l.includes("[IMAGES DRAFT-ONLY]")),false);
});

test("four Vinted preview thumbnails confirm the upload even after input reset",async()=>{
  const mock=imageTestEnv({sourceCount:5,resetAfterChange:true,withPreview:true});
  const logs=[];
  const result=await createEngine(mock.document,mock.extra).images(mock.draft,line=>logs.push(line));
  assert.equal(mock.sent().length,4);
  assert.equal(mock.visiblePreviews(),4);
  assert.equal(result.needsReview,false);
  assert.equal(result.success,true);
  assert.ok(logs.some(l=>l.includes("verified=true")));
});
test("Vinted photo gallery without photo-upload testid is detected in enclosing section",()=>{
  const input={closest(selector){
    if(selector.includes("fieldset,section"))return section;
    return null;
  }};
  const photos=Array.from({length:4},(_,i)=>({
    isConnected:true,currentSrc:"https://other-photo-cdn.example/img-"+i+".jpg",
    getClientRects:()=>[1],closest:()=>null,
    getBoundingClientRect:()=>({width:120,height:165})
  }));
  const section={contains:el=>el===input,tagName:"SECTION",
    querySelectorAll(selector){return selector==="img"?photos:[];},
    getAttribute:()=>null};
  const document={body:{},querySelectorAll(){return []}};
  const e=createEngine(document);
  assert.equal(e.uploadPreviewArea(input),section);
  assert.equal(e.uploadPreviewCount(input),4);
});
test("Vinted gallery with CSS background-image thumbnails is detected",()=>{
  const input={closest(selector){
    return selector.includes("fieldset,section")?section:null;
  }};
  const thumbs=Array.from({length:4},(_,i)=>({
    isConnected:true,
    style:{backgroundImage:'url("https://cdn.example/p-'+i+'.jpg")'},
    getClientRects:()=>[1],
    getBoundingClientRect:()=>({width:100,height:140}),
    closest:()=>null
  }));
  const section={tagName:"SECTION",contains:el=>el===input,
    querySelectorAll(selector){
      return selector.includes("background-image")?thumbs:[];
    }};
  const e=createEngine({body:{},querySelectorAll(){return []}});
  assert.equal(e.uploadPreviewCount(input),4);
});
test("browser accepting fewer than four files is a genuine upload error",async()=>{
  const mock=imageTestEnv({sourceCount:5,assignCount:3});
  await assert.rejects(()=>createEngine(mock.document,mock.extra).images(mock.draft,()=>{}),
    /nur 3\/4 Bilddateien angenommen/);
  assert.equal(mock.sent().length,0);
});
test("a two-image draft transfers both and does not invent extra photos",async()=>{
  const mock=imageTestEnv({sourceCount:2,resetAfterChange:false,withPreview:true});
  const result=await createEngine(mock.document,mock.extra).images(mock.draft,()=>{});
  assert.equal(mock.sent().length,2);
  assert.equal(result.count,2);
  assert.equal(result.success,true);
});


test("unavailable editor stops upload instead of silently using original files",async()=>{
  const mock=imageTestEnv({sourceCount:5});
  mock.extra.imageEditor=null;
  await assert.rejects(()=>createEngine(mock.document,mock.extra).images(mock.draft,()=>{}),
    /Bildbearbeitung fehlt/);
  assert.equal(mock.sent().length,0);
});
test("failed image rendering stops upload before any image is submitted",async()=>{
  const mock=imageTestEnv({sourceCount:5});
  mock.extra.imageEditor={
    processImage:async(file,i)=>{
      if(i===2)throw Error("Canvas konnte Bild 3 nicht bearbeiten");
      return {file:new mock.extra.File([file],
        "vinted_"+i+".jpg",{type:"image/jpeg"}),colorLook:"soft-reference-look-v2",gradedPixels:500};
    }
  };
  await assert.rejects(()=>createEngine(mock.document,mock.extra).images(mock.draft,()=>{}),
    /Canvas konnte Bild 3 nicht bearbeiten/);
  assert.equal(mock.sent().length,0);
});


test("Vinted image loader decodes Sascha AI portable data:image payload without remote fetch",async()=>{
  const mock=imageTestEnv({sourceCount:4});
  const engine=createEngine(mock.document,mock.extra);
  const image=mock.draft.images[0];
  const file=await engine.imageFile(image,0);
  assert.equal(file.type,"image/jpeg");
  assert.equal(file.name,"image1.jpg");
  assert.equal(file.chunks[0].length,11);
  assert.equal(engine.imageSourceKind(image),"data-image");
});
test("unavailable source reports explicit error rather than generic Bild 1 not loaded",async()=>{
  const mock=imageTestEnv({sourceCount:4});
  mock.draft.images[0].dataUrl="";
  const logs=[];
  await assert.rejects(()=>createEngine(mock.document,mock.extra).images(mock.draft,l=>logs.push(l)),
    /Bildquelle fehlt/);
  assert.ok(logs.some(x=>x.includes("[IMAGE LOAD ERROR]")));
});
test("expired HTTP image reports status instead of silently returning null",async()=>{
  const mock=imageTestEnv({sourceCount:4});
  mock.draft.images[0].dataUrl="https://storage.example.invalid/signed/image.jpg?token=expired";
  mock.extra.fetch=async()=>({ok:false,status:403});
  const logs=[];
  await assert.rejects(()=>createEngine(mock.document,mock.extra).images(mock.draft,l=>logs.push(l)),
    /HTTP 403/);
  assert.equal(mock.sent().length,0);
  assert.ok(logs.some(x=>x.includes("kind=remote-https")));
});


function buttonTestDocument(buttons,toast=[]){
  return {
    querySelector(){return null;},
    querySelectorAll(selector){
      if(selector.includes('button')||selector.includes('input[type="submit"]'))
        return buttons;
      if(selector.includes('[role="alert"]'))return toast;
      return [];
    }
  };
}
function fakeButton(label,testid){
  return {
    tagName:"BUTTON",innerText:label,textContent:label,isConnected:true,
    disabled:false,clicks:0,scrollIntoView(){},
    click(){this.clicks++;},closest(){return null;},
    getClientRects(){return [1];},
    getAttribute(key){return key==="data-testid"?testid||"":null;}
  };
}
test("draft-only save clicks exactly Entwurf speichern, never Veröffentlichen",()=>{
  const save=fakeButton("Entwurf speichern","upload-form-save-draft-button");
  const publish=fakeButton("Veröffentlichen","upload-form-upload-button");
  const e=createEngine(buttonTestDocument([save,publish]));
  const result=e.trySaveAsDraft();
  assert.equal(result.clicked,true);
  assert.equal(save.clicks,1);
  assert.equal(publish.clicks,0);
});
test("publish button alone never becomes a draft save fallback",()=>{
  const publish=fakeButton("Veröffentlichen","upload-form-upload-button");
  const e=createEngine(buttonTestDocument([publish]));
  const result=e.trySaveAsDraft();
  assert.equal(result.clicked,false);
  assert.equal(publish.clicks,0);
});
test("ambiguous multiple save-draft buttons stop rather than click arbitrarily",()=>{
  const first=fakeButton("Entwurf speichern"),second=fakeButton("Save draft");
  const e=createEngine(buttonTestDocument([first,second]));
  assert.equal(e.trySaveAsDraft().clicked,false);
  assert.equal(first.clicks+second.clicks,0);
});
test("reject a publish-labeled button even when its testid is misleading",()=>{
  const suspicious=fakeButton("Artikel veröffentlichen","upload-form-save-draft-button");
  const e=createEngine(buttonTestDocument([suspicious]));
  assert.equal(e.trySaveAsDraft().clicked,false);
  assert.equal(suspicious.clicks,0);
});
test("saving is confirmed by visible alert, not by presence of a save button",()=>{
  const btn=fakeButton("Entwurf speichern");
  const toast=fakeButton("Dein Entwurf wurde gespeichert!");
  const e=createEngine(buttonTestDocument([btn],[toast]));
  const confirmed=e.draftSaveStatus();
  assert.equal(confirmed.saved,true);
  const unconfirmed=createEngine(buttonTestDocument([btn])).draftSaveStatus();
  assert.equal(unconfirmed.saved,false);
});


function mockWomenSizes(labels=["XS","S","M","L","XL","XXL","3XL"]){
  const input=new FakeInput("size");
  let opened=false,chosen=null;
  input.click=()=>{opened=true;};
  const item=label=>({
    isConnected:true,innerText:label,textContent:label,
    getClientRects:()=>[1],closest:()=>null,getAttribute:()=>null,
    click(){chosen=label;input.value=label;opened=false;}
  });
  const grid={
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    querySelectorAll:()=>labels.map(item)
  };
  const doc={
    querySelector(selector){return selector==="#size"?input:null;},
    querySelectorAll(selector){
      if(selector.includes("category-size-single-grid-content")&&opened)return [grid];
      return [];
    }
  };
  return {doc,input,chosen:()=>chosen};
}
test("women with 39 cm flat waist get M, flagged for review, no men's W submenu",async()=>{
  const ui=mockWomenSizes(),logs=[];
  const result=await createEngine(ui.doc).size({
    size:"",gender:"Damen",fit:"straight",category:"Jeans",
    measurements:{waist:"39 cm"}
  },x=>logs.push(x));
  assert.equal(result.success,true);
  assert.equal(result.needsReview,true);
  assert.equal(ui.chosen(),"M");
  assert.ok(logs.some(x=>x.includes("Damen-Buchstabengröße M")));
  assert.equal(logs.some(x=>x.includes("SIZE WAIST")),false);
});
test("women W36 is converted to XXL only for letter-only Vinted category, review mandatory",async()=>{
  const ui=mockWomenSizes(),logs=[];
  const result=await createEngine(ui.doc).size({
    size:"W36",gender:"Damen",fit:"straight",category:"Jeans"
  },x=>logs.push(x));
  assert.equal(result.success,true);
  assert.equal(result.needsReview,true);
  assert.equal(result.reviewType,"estimated-size");
  assert.equal(result.selectedSize,"XXL");
  assert.equal(result.estimateSource,"w-label");
  assert.equal(ui.chosen(),"XXL");
  assert.ok(logs.some(x=>x.includes("[SIZE WOMEN CONVERT] W36 → XXL")));
  assert.ok(logs.some(x=>x.includes("[SIZE REVIEW]")));
});
test("women US8 converts to M and must be reviewed",async()=>{
  const ui=mockWomenSizes(),logs=[];
  const result=await createEngine(ui.doc).size({
    size:"US 8",gender:"Damen",fit:"straight",category:"Jeans"
  },x=>logs.push(x));
  assert.equal(result.needsReview,true);
  assert.equal(ui.chosen(),"M");
  assert.ok(logs.some(x=>x.includes("US 8 → M")));
});
test("women direct letter label is kept exactly, with no review",async()=>{
  const ui=mockWomenSizes(),logs=[];
  const result=await createEngine(ui.doc).size({
    size:"L",gender:"Damen",fit:"straight",category:"Jeans",
    measurements:{waist:"39"}
  },x=>logs.push(x));
  assert.equal(result.needsReview,undefined);
  assert.equal(ui.chosen(),"L");
  assert.equal(logs.some(x=>x.includes("[SIZE WOMEN CONVERT]")),false);
});
test("women's ambiguous numeric 36 cannot silently convert without waist measurement",async()=>{
  const ui=mockWomenSizes(),logs=[];
  await assert.rejects(()=>createEngine(ui.doc).size({
    size:"36",gender:"Damen",fit:"straight",category:"Jeans"
  },x=>logs.push(x)),/keine gültige flach gemessene Bundweite/);
  assert.equal(ui.chosen(),null);
});
test("bare Damen size 6 with waist 39 cm selects provisional M, not numeric 6",async()=>{
  const ui=mockWomenSizes(),logs=[];
  const result=await createEngine(ui.doc).size({
    size:"6",gender:"Damen",fit:"straight",category:"Jeans",
    measurements:{waist:"39 cm"}
  },x=>logs.push(x));
  assert.equal(result.success,true);
  assert.equal(result.needsReview,true);
  assert.equal(result.reviewType,"estimated-size");
  assert.equal(result.selectedSize,"M");
  assert.equal(result.estimateSource,"ambiguous-label-waist");
  assert.equal(ui.chosen(),"M");
  assert.ok(logs.some(x=>x.includes("[SIZE WOMEN NUMERIC WAIST] Etikett 6 → M")));
  assert.match(result.reason,/Etikettgröße 6/);
});
test("bare Damen size 36 with waist 40 cm proposes L, not assumed EU 36",async()=>{
  const ui=mockWomenSizes(),logs=[];
  const result=await createEngine(ui.doc).size({
    size:"36",gender:"Damen",fit:"straight",category:"Jeans",
    measurements:{waist:"40"}
  },x=>logs.push(x));
  assert.equal(result.needsReview,true);
  assert.equal(result.estimateSource,"ambiguous-label-waist");
  assert.equal(result.selectedSize,"L");
  assert.equal(ui.chosen(),"L");
  assert.ok(logs.some(x=>x.includes("Etikett 36 → L")));
});
test("bare Damen size 6 without waist never guesses US 6 or auto-saves",async()=>{
  const ui=mockWomenSizes();
  await assert.rejects(()=>createEngine(ui.doc).size({
    size:"6",gender:"Damen",fit:"straight",category:"Jeans"
  },()=>{}),/keine gültige flach gemessene Bundweite/);
  assert.equal(ui.chosen(),null);
});
test("women conversion respects Vinted 2XL alias of XXL",async()=>{
  const ui=mockWomenSizes(["S","M","L","XL","2XL"]),logs=[];
  const result=await createEngine(ui.doc).size({
    size:"W36",gender:"Damen",fit:"straight",category:"Jeans"
  },x=>logs.push(x));
  assert.equal(result.needsReview,true);
  assert.equal(ui.chosen(),"2XL");
});


test("draft save acknowledges Entwurf erfolgreich gespeichert, not just fixed old phrase",()=>{
  const e=createEngine(buttonTestDocument([]));
  for(const label of [
    "Dein Entwurf wurde gespeichert!",
    "Entwurf erfolgreich gespeichert",
    "Dein Entwurf ist jetzt gespeichert",
    "Your draft was saved",
    "Saved as draft",
    "Saved to drafts"
  ])assert.ok(e.saveFeedbackText(label).length>0,label);
});
test("draft save cannot confirm failure, publish, or merely an unsaved button",()=>{
  const e=createEngine(buttonTestDocument([]));
  for(const text of [
    "Entwurf speichern",
    "Entwurf nicht gespeichert",
    "Draft not saved",
    "Saved listing published",
    "Fehler: Entwurf konnte nicht gespeichert werden",
    "Unable to save draft",
    "Veröffentlichen"
  ])assert.equal(e.saveFeedbackText(text),"",text);
});
test("short-lived save toast is remembered by mutation observer after it disappears",()=>{
  let observer;
  class FakeMutationObserver{
    constructor(callback){this.callback=callback;observer=this;}
    observe(root,options){this.watching=true;}
    disconnect(){this.watching=false;}
  }
  const toasts=[],save=fakeButton("Entwurf speichern");
  const doc=buttonTestDocument([save],toasts);
  doc.body={};
  const e=createEngine(doc,{MutationObserver:FakeMutationObserver});
  assert.equal(e.trySaveAsDraft().clicked,true);
  assert.equal(save.clicks,1);
  assert.equal(observer.watching,true);
  toasts.push(fakeButton("Entwurf erfolgreich gespeichert!"));
  observer.callback();
  toasts.length=0;
  assert.equal(e.draftSaveStatus().saved,true);
  assert.match(e.draftSaveStatus().evidence,/Entwurf erfolgreich gespeichert/);
});


test("Vinted profile receipt only accepts explicitly identified draft card for exact article",()=>{
  const card=(label)=>({
    isConnected:true,innerText:label,textContent:label,
    getClientRects:()=>[1],closest:()=>null
  });
  const draftCard=card("Diesel Jeans #71 - Entwurf");
  const document={
    querySelector:()=>null,
    querySelectorAll(selector){
      return selector.includes("draft-card")?[draftCard]:[];
    }
  };
  const e=createEngine(document);
  assert.equal(e.profileDraftReceipt(71)?.saved,true);
  assert.equal(e.profileDraftReceipt(7),null);
  assert.equal(e.profileDraftReceipt(72),null);
});
test("generic Vinted profile redirect without draft card is not save evidence",()=>{
  const document={querySelector:()=>null,querySelectorAll:()=>[]};
  const e=createEngine(document);
  assert.equal(e.profileDraftReceipt(71),null);
  assert.equal(e.draftSaveStatus(71).saved,false);
});
