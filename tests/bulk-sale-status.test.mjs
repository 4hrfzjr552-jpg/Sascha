import {test} from "node:test";
import assert from "node:assert/strict";
import {planBulkSaleStatusChange} from "../src/lib/bulkSaleStatus.ts";

const p=(id,saleStatus,uploadedAt)=>({
  id,number:Number(id.replace(/\D/g,""))||1, status:"done",saleStatus,
  images:[],flatlays:[],result:{title:"Original Diesel",description:"test"},
  uploadedAt,createdAt:1,updatedAt:100,measurements:{},customNotes:"",
  fitpicApproved:false,
});
const fixtures=[
  p("p1","uploaded",110),p("p2","uploaded",120),
  p("p3","ready"),p("p4","sold",140),p("p5","draft"),
];

test("move all visible uploaded pants to draft without altering originals",()=>{
  const result=planBulkSaleStatusChange(fixtures,new Set(["p1","p2"]),new Set(),"visible","draft",500);
  assert.equal(result.inScope,2);
  assert.equal(result.updates.length,2);
  assert.deepEqual(result.updates.map(x=>x.id),["p1","p2"]);
  assert.ok(result.updates.every(x=>x.saleStatus==="draft"&&x.updatedAt===500));
  assert.deepEqual(result.updates.map(x=>x.uploadedAt),[110,120]);
  assert.equal(result.updates[0].result,fixtures[0].result);
  assert.equal(fixtures[0].saleStatus,"uploaded");
});
test("selected scope can change explicitly selected pants outside active filter",()=>{
  const result=planBulkSaleStatusChange(fixtures,new Set(["p2"]),new Set(["p1","p3"]),"selected","archived",500);
  assert.deepEqual(result.updates.map(x=>x.id),["p1","p3"]);
});
test("skip sold pants and statuses that already match",()=>{
  const result=planBulkSaleStatusChange(fixtures,new Set(fixtures.map(x=>x.id)),new Set(),"visible","draft",200);
  assert.equal(result.skippedSold,1);
  assert.equal(result.unchanged,1);
  assert.equal(result.updates.length,3);
  assert.ok(result.updates.every(x=>x.id!=="p4"&&x.id!=="p5"));
});
test("bulk uploaded timestamp set once and preserved across moves",()=>{
  const first=planBulkSaleStatusChange([p("p6","draft")],new Set(["p6"]),new Set(),"visible","uploaded",300);
  assert.equal(first.updates[0].uploadedAt,300);
  const second=planBulkSaleStatusChange(first.updates,new Set(["p6"]),new Set(),"visible","draft",400);
  assert.equal(second.updates[0].uploadedAt,300);
});
test("cannot mark pants as sold through mass edit",()=>{
  assert.throws(()=>planBulkSaleStatusChange(fixtures,new Set(["p1"]),new Set(),"visible","sold"),/Verkäufe/);
});
test("no matches causes no changes",()=>{
  const result=planBulkSaleStatusChange(fixtures,new Set(),new Set(),"visible","draft");
  assert.equal(result.inScope,0);
  assert.equal(result.updates.length,0);
});
