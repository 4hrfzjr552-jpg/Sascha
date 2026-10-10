// node --test browser-extension/tests/vinted-size-estimate.test.cjs
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const code=fs.readFileSync(path.join(__dirname,"..","vinted-size-estimate.js"),"utf8");
const moduleForTest={exports:{}};
vm.runInNewContext(code,{module:moduleForTest,window:{}});
const {isMissingSize,parseFlatWaistCm,estimate}=moduleForTest.exports;
const men={kind:"jeans",gender:"men"};
const women={kind:"jeans",gender:"women"};

test("only treats actual missing-size markers as unlabeled",()=>{
  for(const label of ["","  ","-","Unbekannt","keine Angabe","N/A"]){
    assert.equal(isMissingSize(label),true,label);
  }
  for(const label of ["W36","36","32/34","XL","EU 40"]){
    assert.equal(isMissingSize(label),false,label);
  }
});
test("accepts measured flat cm only; rejects waist circumference or ambiguous text",()=>{
  assert.equal(parseFlatWaistCm("39"),39);
  assert.equal(parseFlatWaistCm("39 cm"),39);
  assert.equal(parseFlatWaistCm("40,5 cm"),40.5);
  assert.equal(parseFlatWaistCm(41),41);
  for(const val of ["",null,"90 cm","39 - 40","40 mm","waist 40",27,65,"40in"]){
    assert.equal(parseFlatWaistCm(val),null,String(val));
  }
});
test("39 cm flat Bundweite produces transparent approximate W31",()=>{
  const found=estimate({size:"",measurements:{waist:"39 cm"}},men);
  assert.equal(found.ok,true);
  assert.equal(found.size,"W31");
  assert.equal(found.waistCm,39);
  assert.equal(found.circumferenceCm,78);
  assert.equal(found.estimated,true);
  assert.match(found.reason,/kein Etikett/);
});
test("length or leg opening alone never guess the waist size",()=>{
  const result=estimate({size:"",measurements:{
    waist:"",totalLength:"110",inseam:"80",legOpening:"20"
  }},men);
  assert.equal(result.ok,false);
  assert.match(result.reason,/Bundweite/);
});
test("an existing labeled W36 always takes precedence over 39 cm measurement",()=>{
  const result=estimate({size:"W36",measurements:{waist:"39"}},men);
  assert.equal(result.ok,false);
  assert.match(result.reason,/Etikettgröße ist vorhanden/);
});
test("does not infer sizes for children, jackets, or unidentified gender",()=>{
  for(const kind of [{kind:"jeans",gender:"children"},
      {kind:"jeans",gender:""}, {kind:"unsupported",gender:"men"}]){
    assert.equal(estimate({size:"",measurements:{waist:"40"}},kind).ok,false);
  }
});
test("women's jeans propose a letter, never a W size, when waist is measured",()=>{
  const result=estimate({size:"Unbekannt",measurements:{waist:"41"}},women);
  assert.equal(result.ok,true);
  assert.equal(result.size,"L");
  assert.equal(result.source,"measured-waist");
  assert.equal(result.estimated,true);
  const borderline=estimate({size:"",measurements:{waist:"39"}},women);
  assert.equal(borderline.size,"M");
});


test("women's approximate size chart uses XS-3XL with cm ranges",()=>{
  const {womenLetterFromCircumference}=moduleForTest.exports;
  assert.equal(womenLetterFromCircumference(62),"XS");
  assert.equal(womenLetterFromCircumference(70),"S");
  assert.equal(womenLetterFromCircumference(75),"M");
  assert.equal(womenLetterFromCircumference(81),"L");
  assert.equal(womenLetterFromCircumference(88),"XL");
  assert.equal(womenLetterFromCircumference(93),"XXL");
  assert.equal(womenLetterFromCircumference(100),"3XL");
  assert.equal(womenLetterFromCircumference(110),null);
});
test("women's labeled W36 converts only provisionally to letter XXL",()=>{
  const {convertWomenLabel}=moduleForTest.exports;
  const converted=convertWomenLabel("W36",women);
  assert.equal(converted.ok,true);
  assert.equal(converted.size,"XXL");
  assert.equal(converted.estimated,true);
  assert.equal(converted.converted,true);
  assert.equal(converted.originalLabel,"W36");
  assert.match(converted.reason,/vorläufig/);
});
test("explicit US and EU women size conversions are reviewable",()=>{
  const {convertWomenLabel}=moduleForTest.exports;
  assert.equal(convertWomenLabel("US 8",women).size,"M");
  assert.equal(convertWomenLabel("EU 40",women).size,"L");
  assert.equal(convertWomenLabel("DE 38",women).size,"M");
  assert.equal(convertWomenLabel("US 99",women).ok,false);
});
test("bare numeric size is ambiguous EU versus W; never guess",()=>{
  const {convertWomenLabel}=moduleForTest.exports;
  assert.equal(convertWomenLabel("36",women).ok,false);
  assert.equal(convertWomenLabel("W36",men).ok,false);
  assert.equal(convertWomenLabel("S",women).ok,false);
});
test("women's XXL/2XL aliases are narrow and deterministic",()=>{
  const {letterAliases}=moduleForTest.exports;
  assert.deepEqual(Array.from(letterAliases("XXL")),["XXL","2XL"]);
  assert.deepEqual(Array.from(letterAliases("M")),["M"]);
});


test("ambiguous Damen label 6 uses real waist only; 39 cm => estimated M",()=>{
  const {estimateWomenNumericByWaist}=moduleForTest.exports;
  const found=estimateWomenNumericByWaist({size:"6",measurements:{waist:"39 cm"}},women);
  assert.equal(found.ok,true);
  assert.equal(found.size,"M");
  assert.equal(found.waistCm,39);
  assert.equal(found.originalLabel,"6");
  assert.equal(found.source,"ambiguous-label-waist");
  assert.equal(found.estimated,true);
  assert.match(found.reason,/Etikettgröße 6/);
  assert.match(found.reason,/nur aus Bundweite 39 cm/);
});
test("bare numeric 36 is not assumed EU or W; 40 cm measurements drive L",()=>{
  const {estimateWomenNumericByWaist}=moduleForTest.exports;
  const found=estimateWomenNumericByWaist({size:"36",measurements:{waist:"40"}},women);
  assert.equal(found.size,"L");
  assert.match(found.reason,/ohne Größenformat/);
  assert.equal(found.source,"ambiguous-label-waist");
});
test("numeric label without valid waist must stop rather than guess US size",()=>{
  const {estimateWomenNumericByWaist}=moduleForTest.exports;
  for(const waist of ["",undefined,"waist unknown","99"]){
    const found=estimateWomenNumericByWaist({size:"6",measurements:{waist}},women);
    assert.equal(found.ok,false);
    assert.match(found.reason,/keine gültige/);
  }
});
test("numeric waist fallback never applies to men or nonnumeric labels",()=>{
  const {estimateWomenNumericByWaist}=moduleForTest.exports;
  assert.equal(estimateWomenNumericByWaist({size:"6",measurements:{waist:"39"}},men).ok,false);
  assert.equal(estimateWomenNumericByWaist({size:"US 6",measurements:{waist:"39"}},women).ok,false);
  assert.equal(estimateWomenNumericByWaist({size:"W36",measurements:{waist:"39"}},women).ok,false);
  assert.equal(estimateWomenNumericByWaist({size:"L",measurements:{waist:"39"}},women).ok,false);
});


test("unreadable size labels count as missing, not as literal Vinted sizes",()=>{
  for(const label of ["Nicht lesbar","  nicht lesbar  ","NICHT LESBAR",
    "unleserlich","Unlesbar","Nicht erkennbar","Größe nicht lesbar",
    "nicht zu erkennen","size unreadable","illegible","not readable"]){
    assert.equal(isMissingSize(label),true,label);
  }
  for(const label of ["6","W30","EU 40","M","4XL","nicht standard"]){
    assert.equal(isMissingSize(label),false,label);
  }
});
test("unreadable women's jeans size uses 33cm flat waistband to suggest XS",()=>{
  const found=estimate({size:"Nicht lesbar",
    measurements:{waist:"33"}},women);
  assert.equal(found.ok,true);
  assert.equal(found.size,"XS");
  assert.equal(found.source,"measured-waist");
  assert.equal(found.waistCm,33);
  assert.equal(found.estimated,true);
});
test("unreadable size with no measured waist is never guessed",()=>{
  const found=estimate({size:"Nicht lesbar",
    measurements:{waist:""}},women);
  assert.equal(found.ok,false);
  assert.match(found.reason,/Bundweite/);
});
