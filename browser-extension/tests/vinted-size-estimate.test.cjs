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
test("girls/women adult jeans use same W proposal with review required",()=>{
  const result=estimate({size:"Unbekannt",measurements:{waist:"41"}},women);
  assert.equal(result.ok,true);
  assert.equal(result.size,"W32");
});
