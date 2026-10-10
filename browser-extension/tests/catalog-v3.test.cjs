// Run: node --test browser-extension/tests/catalog-v3.test.cjs
// Pure catalog tests use the exact Vinted category IDs and breadcrumb labels
// seen in the user's debug logs. Live Vinted remains an integration test.
const { test }=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
// The parent Vite project is ESM, while Chrome MV3 loads this file as
// a classic content script. Evaluate the classic script in an isolated VM.
const context={window:{},module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","vinted-catalog-v3.js"),"utf8"),context);
const catalog=context.module.exports;
const {intentForDraft,selectLiveCategory,matchingRows,sizeChoice,classify}=catalog;
const rows=[
  [1559,"Jeans Kinder > Mädchen > Hosen & Shorts"],
  [1696,"Jeans Kinder > Jungs > Hosen & Shorts"],
  [1842,"Jeans mit hoher Taille Damen > Kleidung > Jeans"],
  [1818,"Jeans mit enger Passform Herren > Kleidung > Jeans"],
  [1816,"Ripped Jeans Herren > Kleidung > Jeans"],
  [1843,"Ripped Jeans Damen > Kleidung > Jeans"],
  [1840,"Cropped Jeans Damen > Kleidung > Jeans"],
  [1839,"Boyfriend Jeans Damen > Kleidung > Jeans"],
  [1819,"Gerade geschnittene Jeans Herren > Kleidung > Jeans"],
  [1845,"Gerade geschnittene Jeans Damen > Kleidung > Jeans"],
  [1824,"Jeansshorts Herren > Kleidung > Shorts"],
  [538,"Jeansshorts Damen > Kleidung > Shorts"],
  [1817,"Röhrenjeans Herren > Kleidung > Jeans"],
  [1844,"Röhrenjeans Damen > Kleidung > Jeans"],
  [1841,"Schlaghosen Damen > Kleidung > Jeans"]
].map(([id,text])=>({id,text}));

function selected(draft){
  const decision=intentForDraft(draft);
  assert.equal(decision.ok,true,decision.reason);
  const result=selectLiveCategory(rows,decision.category);
  assert.equal(result.ok,true,result.reason);
  return result.id;
}
test("Diesel Herren straight goes only to Vinted 1819",()=>{
  assert.equal(selected({gender:"Herren",category:"Jeans",fit:"straight",brand:"Diesel",size:"W36"}),1819);
});
test("women straight has distinct 1845 ID",()=>{
  assert.equal(selected({gender:"Damen",category:"Jeans",fit:"straight"}),1845);
});
test("slim, skinny and women bootcut resolve to their own category",()=>{
  assert.equal(selected({gender:"Herren",category:"Jeans",fit:"slim"}),1818);
  assert.equal(selected({gender:"Herren",category:"Jeans",fit:"skinny"}),1817);
  assert.equal(selected({gender:"Damen",category:"Jeans",fit:"skinny"}),1844);
  assert.equal(selected({gender:"Damen",category:"Jeans",fit:"bootcut"}),1841);
});
test("women's high waist uses explicit category only",()=>{
  assert.equal(selected({gender:"Damen",category:"Jeans",fit:"high waist"}),1842);
  assert.equal(selected({gender:"Damen",category:"Jeans",fit:"cropped"}),1840);
  assert.equal(selected({gender:"Damen",category:"Jeans",fit:"boyfriend"}),1839);
});
test("ripped and denim shorts use their own category",()=>{
  assert.equal(selected({gender:"Herren",category:"Jeans",fit:"ripped"}),1816);
  assert.equal(selected({gender:"Damen",category:"Jeans",fit:"ripped"}),1843);
  assert.equal(selected({gender:"Herren",category:"Jeansshorts"}),1824);
  assert.equal(selected({gender:"Damen",category:"Jeansshorts"}),538);
});
test("children and unknown gender are NEVER assigned adult categories",()=>{
  assert.equal(intentForDraft({gender:"Kinder",category:"Jeans",fit:"straight"}).ok,false);
  assert.equal(intentForDraft({category:"Jeans",fit:"straight"}).ok,false);
});
test("unlisted cuts are handled by user instead of guessing a different fit",()=>{
  assert.equal(intentForDraft({gender:"Herren",category:"Jeans",fit:"wide"}).ok,false);
  assert.equal(intentForDraft({gender:"Herren",category:"Jeans"}).ok,false);
});
test("category is not accepted when gender breadcrumb is missing",()=>{
  const target=intentForDraft({gender:"Herren",category:"Jeans",fit:"straight"}).category;
  const wrong=[{id:1819,text:"Gerade geschnittene Jeans"}];
  assert.equal(selectLiveCategory(wrong,target).ok,false);
  assert.equal(selectLiveCategory([{id:1819,text:"Gerade geschnittene Jeans Kinder"}],target).ok,false);
});
test("category is not accepted when ID or subtype label changes",()=>{
  const target=intentForDraft({gender:"Herren",category:"Jeans",fit:"straight"}).category;
  assert.equal(selectLiveCategory([{id:1559,text:"Gerade geschnittene Jeans Herren"}],target).ok,false);
  assert.equal(selectLiveCategory([{id:1819,text:"Röhrenjeans Herren"}],target).ok,false);
  assert.equal(selectLiveCategory([{id:1819,text:"Gerade geschnittene Jeans Herren"},{id:1819,text:"Gerade geschnittene Jeans Herren"}],target).ok,false);
});
test("wrong-gender variants rejected even if name matches",()=>{
  const result=matchingRows(rows,intentForDraft({gender:"Herren",category:"Jeans",fit:"straight"}).category);
  assert.equal(result.find(x=>x.id===1845).eligible,false);
  assert.equal(result.find(x=>x.id===1559).eligible,false);
});
test("W36 never converts to XXL when the Taillenumfang group is required",()=>{
  const r=sizeChoice("W36",["XS","S","M","L","XL","XXL"],{gender:"Herren",category:"Jeans",brand:"Diesel"});
  assert.equal(r.ok,false);
  assert.equal(r.size,undefined);
  assert.match(r.reason,/Taillenumfang/);
});
test("native Taillenumfang numeric 36 is selected as original W36",()=>{
  const r=sizeChoice("W36 L32",["32","34","36","38","40"],{gender:"Herren",category:"Jeans",brand:"Diesel"});
  assert.equal(r.ok,true);
  assert.equal(r.size,"36");
});
test("W36 is preferred over any inferred letter size",()=>{
  const r=sizeChoice("W36",["W36","XXL"],{gender:"Herren",category:"Jeans",brand:"Diesel"});
  assert.equal(r.ok,true);assert.equal(r.needsReview,undefined);
  assert.equal(r.size,"w36");
});
test("unknown sizes are not guessed",()=>{
  assert.equal(sizeChoice("W36",["S","M","L"],{gender:"Herren",category:"Jeans",brand:"Diesel"}).ok,false);
  assert.equal(sizeChoice("W36",["XS","S","M","L","XL","XXL"],{gender:"Herren",category:"Jeans",brand:"Unbekannt"}).ok,false);
});
test("explicit structured gender dominates keyword in description",()=>{
  const d=classify({gender:"Damen",category:"Jeans",fit:"straight",description:"Herrenjeans"});
  assert.equal(d.gender,"women");
});
test("jeans jacket not categorized as jeans trousers",()=>{
  assert.equal(intentForDraft({gender:"Herren",category:"Jeansjacke",fit:"straight"}).ok,false);
});


test("structured cut wins over 25 unrelated SEO cut keywords in description",()=>{
  const draft={
    gender:"Damen",category:"Jeans",fit:"straight",
    title:"Diesel Damen Jeans Regular Fit W30",
    description:"Keywords: skinny, bootcut, slim, boyfriend, straight, baggy"
  };
  const choice=intentForDraft(draft);
  assert.equal(choice.ok,true);
  assert.equal(choice.intent.fit,"straight");
  assert.equal(choice.intent.source,"structured");
  assert.equal(choice.category.id,1845);
});
test("explicit cut in title wins over conflicting fit keywords in description",()=>{
  const d={
    gender:"Herren",category:"Jeans",title:"Diesel Safado Straight Fit Jeans W32",
    description:"SEO: skinny jeans, slim fit, bootcut, boyfriend, baggy"
  };
  const decision=intentForDraft(d);
  assert.equal(decision.ok,true);
  assert.equal(decision.intent.source,"title");
  assert.equal(decision.intent.fit,"straight");
  assert.equal(decision.category.id,1819);
});
test("if title does not declare fit, description may supply one clear fit",()=>{
  const d={gender:"Herren",category:"Jeans",title:"Diesel Jeans Herren W32",
    description:"Modell mit schmal geschnittenem Slim Fit"};
  const found=intentForDraft(d);
  assert.equal(found.ok,true);
  assert.equal(found.intent.source,"description");
  assert.equal(found.category.id,1818);
});
test("unsupported structured Tapered jeans never inherit SEO skinny keyword",()=>{
  const d={gender:"Herren",category:"Jeans",fit:"tapered",
    title:"Diesel Jeans",description:"SEO skinny slim straight"};
  const result=intentForDraft(d);
  assert.equal(result.ok,false);
  assert.equal(result.intent.fit,"");
  assert.equal(result.intent.source,"structured-unsupported");
});
test("genuinely ambiguous title and SEO-only cuts remain unresolved, not guessed",()=>{
  const badTitle={gender:"Damen",category:"Jeans",title:"Skinny Slim Damen Jeans",
    description:"Straight Fit Jeans"};
  const first=intentForDraft(badTitle);
  assert.equal(first.ok,false);
  assert.equal(first.intent.source,"title-ambiguous");
  const ambiguousDescription={gender:"Herren",category:"Jeans",
    title:"Diesel Jeans",description:"skinny slim straight bootcut"};
  const second=intentForDraft(ambiguousDescription);
  assert.equal(second.ok,false);
  assert.equal(second.intent.source,"description-ambiguous");
});
test("regular or straight fit from structured Sascha AI field is recognized",()=>{
  for(const fit of ["regular","regular fit","straight fit","straight-fit"]){
    const d={gender:"Herren",category:"Jeans",fit,title:"Diesel Jeans",
      description:"skinny slim bootcut keywords"};
    const result=intentForDraft(d);
    assert.equal(result.ok,true,fit);
    assert.equal(result.category.id,1819,fit);
  }
});
