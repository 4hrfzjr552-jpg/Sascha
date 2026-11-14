import { test } from "node:test";
import assert from "node:assert/strict";
import { approvesProductEdit, shouldRetryProductEdit } from "../api/optimize-flatlay.ts";

const correct = {
  approved: true, confidence:0.92, sameGarment:true,
  sameSide:true, correctComposition:true, expectedView:"front", generatedView:"front", issues:[],
};
test("image edits pass only when independent reviewer is confident and every requirement is met",()=>{
  assert.equal(approvesProductEdit(correct),true);
  assert.equal(approvesProductEdit({...correct,sameGarment:false}),false);
  assert.equal(approvesProductEdit({...correct,sameSide:false}),false);
  assert.equal(approvesProductEdit({...correct,generatedView:"back"}),false);
  assert.equal(approvesProductEdit({...correct,generatedView:"unknown"}),false);
  assert.equal(approvesProductEdit({...correct,expectedView:"back",generatedView:"front"}),false);
  assert.equal(approvesProductEdit({...correct,expectedView:"back",generatedView:"back"}),true);
  assert.equal(approvesProductEdit({...correct,expectedView:"detail",generatedView:"detail"}),true);
  assert.equal(approvesProductEdit({...correct,expectedView:"unknown",generatedView:"unknown"}),false);
  assert.equal(approvesProductEdit({...correct,generatedView:undefined}),false);
  assert.equal(approvesProductEdit({...correct,correctComposition:false}),false);
  assert.equal(approvesProductEdit({...correct,confidence:0.83}),false);
  assert.equal(approvesProductEdit({...correct,confidence:Infinity}),false);
  assert.equal(approvesProductEdit({...correct,confidence:1.4}),false);
  assert.equal(approvesProductEdit({...correct,issues:["Waist patch differs"]}),false);
  assert.equal(approvesProductEdit({...correct,issues:[42]}),false);
  assert.equal(approvesProductEdit({...correct,issues:undefined}),false);
  assert.equal(approvesProductEdit({...correct,approved:"true"}),false);
  assert.equal(approvesProductEdit({}),false);
  assert.equal(approvesProductEdit(null),false);
});

test("allow at most one corrective edit when original view is recognized and time is available",()=>{
  assert.equal(shouldRetryProductEdit("flatlay",0,24_000,true),true);
  assert.equal(shouldRetryProductEdit("detail",0,11_000,true),true);
  assert.equal(shouldRetryProductEdit("background",0,10_000,true),false);
  assert.equal(shouldRetryProductEdit("flatlay",1,10_000,true),false);
  assert.equal(shouldRetryProductEdit("flatlay",0,70_000,true),false);
  assert.equal(shouldRetryProductEdit("flatlay",0,10_000,false),false);
  assert.equal(shouldRetryProductEdit("flatlay",0,Number.NaN,true),false);
});
