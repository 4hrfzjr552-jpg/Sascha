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
  const window={SaschaVintedCatalogV3:catalog,__SASCHA_TEST__:true};
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
    DataTransfer:extra.DataTransfer||class{},
    fetch:extra.fetch||undefined,
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
    dataUrl:"data:image/jpeg;base64,"+(i+1),name:"image"+(i+1)+".jpg"
  }));
  return {document,extra,draft:{images},sent:()=>sent,visiblePreviews:()=>count};
}

test("when draft has five images, Vinted receives only first four in order",async()=>{
  const mock=imageTestEnv({sourceCount:5,resetAfterChange:true,withPreview:false});
  const logs=[];
  const result=await createEngine(mock.document,mock.extra).images(mock.draft,line=>logs.push(line));
  assert.equal(mock.sent().length,4);
  assert.deepEqual(mock.sent().map(f=>f.name),[
    "image1.jpg","image2.jpg","image3.jpg","image4.jpg"]);
  assert.equal(result.success,true);
  assert.equal(result.needsReview,true);
  assert.ok(logs.some(l=>l.includes("[IMAGES SUBMIT] first=4 total=5 skipped=1")));
  assert.ok(logs.some(l=>l.includes("[IMAGES REVIEW]")));
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
