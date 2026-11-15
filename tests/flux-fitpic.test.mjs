import {test} from "node:test";
import assert from "node:assert/strict";
import {selectFitpicReferenceIndices,suggestedFitpicRole} from "../src/lib/fitpicReferences.ts";
import {makePrompt,priceAllowed} from "../api/flux-edit.ts";
import {FLUX_FITPIC_RESERVED_USD,capCanReserve} from "../src/lib/fluxBudget.ts";

test("front try-on prioritizes seller-confirmed front and excludes bag",()=>{
  const ids=["one","two","three","four","inventory"];
  const roles={one:"front",two:"detail",three:"detail",four:"back",inventory:"skip"};
  assert.deepEqual(selectFitpicReferenceIndices(ids,roles,"front"),
    [{index:0,role:"front"},{index:1,role:"detail"},{index:2,role:"detail"},{index:3,role:"back"}]);
});
test("back try-on prioritizes true back, never flips it to front",()=>{
  const ids=["front","detail","label","back","bag"];
  const selection=selectFitpicReferenceIndices(ids,{front:"front",detail:"detail",label:"detail",back:"back",bag:"skip"},"back");
  assert.equal(selection[0].index,3);
  assert.equal(selection[0].role,"back");
  assert.ok(selection.every(x=>x.index!==4));
});
test("inventory bag at arbitrary position must be explicitly skipped",()=>{
  const ids=["bag","front","back","label"];
  const roles={bag:"skip",front:"front",back:"back",label:"detail"};
  assert.deepEqual(selectFitpicReferenceIndices(ids,roles,"front").map(x=>x.index),[1,3,2]);
});
test("missing requested back view fails before any paid generation",()=>{
  assert.throws(()=>selectFitpicReferenceIndices(["front","detail"],{front:"front",detail:"detail"},"back"),/Rückseite/);
  assert.throws(()=>selectFitpicReferenceIndices(["only"],{only:"front"},"front"),/mindestens zwei/);
  assert.equal(suggestedFitpicRole(4,5),"skip");
});
test("FLUX side prompts describe genuine front/back worn photos distinctly",()=>{
  const front=makePrompt({mode:"fitpic",view:"front",gender:"men",background:"original"});
  const back=makePrompt({mode:"fitpic",view:"back",gender:"men",background:"original"});
  assert.match(front,/mirror selfie/i);
  assert.match(front,/FRONT/);
  assert.match(back,/from behind/i);
  assert.match(back,/BACK/);
  for(const p of [front,back]){
    assert.match(p,/real secondhand jeans/i);
    assert.match(p,/true denim COLOR/);
    assert.match(p,/3:4 vertical/i);
    assert.doesNotMatch(p,/gemini/i);
  }
});
test("one 1MP fitpic with four references fits conservative capped rates",()=>{
  assert.equal(FLUX_FITPIC_RESERVED_USD["flux-klein"],0.03);
  assert.equal(FLUX_FITPIC_RESERVED_USD["flux-pro"],0.11);
  assert.ok(capCanReserve(0.89,1,FLUX_FITPIC_RESERVED_USD["flux-pro"]));
  assert.equal(capCanReserve(0.90,1,FLUX_FITPIC_RESERVED_USD["flux-pro"]),false);
  assert.equal(priceAllowed("flux-pro",0.11,0.11),true);
  assert.equal(priceAllowed("flux-klein",0.03,0.11),true);
});

test("a real jeans back photo in fifth slot remains usable if bag is first",()=>{
  const ids=["bag","front","detail1","detail2","realback"];
  const roles={bag:"skip",front:"front",detail1:"detail",detail2:"detail",realback:"back"};
  const rear=selectFitpicReferenceIndices(ids,roles,"back");
  assert.equal(rear[0].index,4);
  assert.equal(rear[0].role,"back");
  assert.ok(rear.every(x=>x.index!==0));
});
test("last-slot bag remains skipped by default without manual override",()=>{
  const ids=["front","waist","label","back","bag"];
  const refs=selectFitpicReferenceIndices(ids,{},"front");
  assert.ok(refs.every(x=>x.index!==4));
});
