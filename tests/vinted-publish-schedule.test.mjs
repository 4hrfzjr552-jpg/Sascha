import { test } from "node:test";
import assert from "node:assert/strict";
import {
  berlinTimeNow, buildVintedPublishingPlan, eligibleVintedDrafts,
  markVintedSlot, readVintedPublishingPlan, VINTED_SLOT_TIMES,
} from "../src/lib/vintedPublishSchedule.ts";

function jeans(number, status = "prepared") {
  return {
    id: "jeans-" + number, pantId: "pant-" + number, artikelnummer: String(number),
    status, title: "Jeans #" + number, description: "Gebrauchte Jeans in gutem Zustand",
    price: 32, imageIds: ["front-" + number], createdAt: number, updatedAt: number,
  };
}

test("four fixed daily Berlin slots", () => {
  assert.deepEqual([...VINTED_SLOT_TIMES], ["10:00","14:00","16:00","18:00"]);
  assert.deepEqual(berlinTimeNow(new Date("2026-11-13T22:15:00Z")),
    {date:"2026-11-13",time:"23:15"});
  const plan=buildVintedPublishingPlan([jeans(60),jeans(59),jeans(58),jeans(57),jeans(56)],
    new Date("2026-11-13T22:15:00Z"));
  assert.deepEqual(plan.slots.map(x => x.id),[
    "2026-11-14T10:00","2026-11-14T14:00",
    "2026-11-14T16:00","2026-11-14T18:00","2026-11-15T10:00",
  ]);
  assert.deepEqual(plan.slots.map(x=>x.articleNumber),["60","59","58","57","56"]);
});

test("never allocate already passed slot", () => {
  const plan=buildVintedPublishingPlan([jeans(3),jeans(2),jeans(1)],
    new Date("2026-11-14T09:00:00Z")); // Berlin: 10:00
  assert.deepEqual(plan.slots.map(x=>x.time),["14:00","16:00","18:00"]);
});

test("Berlin scheduling remains at local clock times across DST", () => {
  const plan=buildVintedPublishingPlan([jeans(3),jeans(2),jeans(1)],
    new Date("2027-03-27T20:00:00Z"));
  assert.deepEqual(plan.slots.map(x=>x.id),[
    "2027-03-28T10:00","2027-03-28T14:00","2027-03-28T16:00"
  ]);
});

test("only eligible drafts; stable numeric order and no duplicated article numbers", () => {
  const changed={...jeans(80), id:"another-80"};
  const noImage={...jeans(78),imageIds:[]};
  const noPrice={...jeans(77),price:undefined};
  const drafts=[jeans(80),jeans(79,"saved"),jeans(76),changed,noImage,noPrice,jeans(74,"error")];
  assert.deepEqual(eligibleVintedDrafts(drafts).map(x=>x.artikelnummer),["80","76"]);
});

test("manually confirmed publications remain excluded after plan recalculation", () => {
  const drafts=[jeans(80),jeans(79),jeans(78)];
  const first=buildVintedPublishingPlan(drafts,new Date("2026-11-13T22:15:00Z"));
  const marked=markVintedSlot(first,first.slots[0].id,"published");
  assert.deepEqual(marked.publishedArticleNumbers,["80"]);
  const refreshed=buildVintedPublishingPlan(drafts,new Date("2026-11-14T08:15:00Z"),marked);
  assert.deepEqual(refreshed.slots.map(x=>x.articleNumber),["79","78"]);
  const restored=readVintedPublishingPlan(JSON.stringify(refreshed));
  assert.equal(restored?.publishedArticleNumbers[0],"80");
});

test("bad saved state never silently creates a scheduled publication",()=>{
  assert.equal(readVintedPublishingPlan("not json"),null);
  assert.equal(readVintedPublishingPlan('{"enabled":true,"createdAt":1,"slots":[{"id":"bad","status":"published"}]}'),null);
});
