// Run: node --test browser-extension/tests/engine-v3.test.cjs
// Deterministic simulated Vinted DOM. This is NOT a live Vinted test.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const catalog=require("../vinted-catalog-v3.js");
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
function createEngine(document){
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
    File:class{},
    DataTransfer:class{},
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
test("Diesel W36 uses XXL checkbox but flags manual review",async()=>{
  const input=new FakeInput("size");let opened=false,chosen="";
  input.click=()=>{opened=true;};
  const labels=["XS","S","M","L","XL","XXL","XXXL","4XL"];
  const entries=labels.map(label=>({
    innerText:label,isConnected:true,
    getClientRects:()=>[1],closest:()=>null,
    click(){chosen=label;input.value=label;opened=false;}
  }));
  const grid={
    isConnected:true,getClientRects:()=>[1],closest:()=>null,
    querySelectorAll(){return entries;}
  };
  const document={
    querySelector(selector){
      if(selector==="#size")return input;
      if(selector.includes("category-size-single-grid-content"))return opened?grid:null;
      return null;
    },
    querySelectorAll(){return [];}
  };
  const engine=createEngine(document),logs=[];
  const output=await engine.size({
    gender:"Herren",category:"Jeans",brand:"Diesel",size:"W36"
  },x=>logs.push(x));
  assert.equal(output.success,true);
  assert.equal(output.needsReview,true);
  assert.equal(chosen,"XXL");
  assert.ok(logs.some(x=>x.includes("[SIZE REVIEW]")));
});
