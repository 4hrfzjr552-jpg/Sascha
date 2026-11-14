import { test } from "node:test";
import assert from "node:assert/strict";
import { approvesProductEdit } from "../api/optimize-flatlay.ts";

const correct = {
  approved: true, confidence:0.92, sameGarment:true,
  sameSide:true, correctComposition:true, issues:[],
};
test("image edits pass only when independent reviewer is confident and every requirement is met",()=>{
  assert.equal(approvesProductEdit(correct),true);
  assert.equal(approvesProductEdit({...correct,sameGarment:false}),false);
  assert.equal(approvesProductEdit({...correct,sameSide:false}),false);
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
