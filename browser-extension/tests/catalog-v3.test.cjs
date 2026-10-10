// Run: node --test browser-extension/tests/catalog-v3.test.cjs
// Pure catalog tests use the exact Vinted category IDs and breadcrumb labels
// seen in the user's debug logs. Live Vinted remains an integration test.
const { test }=require("node:test");
const assert=require("node:assert/strict");
const catalog=require("../vinted-catalog-v3.js");
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
test("waist-to-letter conversion is explicitly marked for seller review",()=>{
  const r=sizeChoice("W36",["XS","S","M","L","XL","XXL"],{gender:"Herren",category:"Jeans",brand:"Diesel"});
  assert.equal(r.needsReview,true);
  assert.equal(r.size,"xxl");
  assert.equal(r.ok,false);
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
