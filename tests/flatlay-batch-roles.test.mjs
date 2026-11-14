import {test} from "node:test";
import assert from "node:assert/strict";
import {defaultListingPhotoRole,modeForListingRole,summarizeListingRoles} from "../src/lib/flatlayBatchRoles.ts";

test("standard four-photo listing creates front flatlay, two detail edits, back flatlay",()=>{
  assert.deepEqual([0,1,2,3].map(i=>defaultListingPhotoRole(i,4)),["front","detail","detail","back"]);
  assert.deepEqual([0,1,2,3,4].map(i=>defaultListingPhotoRole(i,5)),["front","detail","detail","back","skip"]);
});
test("never treats fifth inventory photo as product or flatlay",()=>{
  assert.equal(defaultListingPhotoRole(4,5),"skip");
  assert.equal(defaultListingPhotoRole(5,5),"skip");
  assert.equal(modeForListingRole("skip"),null);
});
test("user may select front/back/detail and these map to the correct generation modes",()=>{
  assert.equal(modeForListingRole("front"),"flatlay");
  assert.equal(modeForListingRole("back"),"flatlay");
  assert.equal(modeForListingRole("detail"),"detail");
  assert.equal(defaultListingPhotoRole(0,1),"front");
});
test("cost estimate counts only selected photos and excludes inventory and skips",()=>{
  assert.deepEqual(summarizeListingRoles(["front","detail","detail","back","skip"]),
    {front:1,back:1,detail:2,skip:1,paid:4});
  assert.equal(summarizeListingRoles(["front","skip","skip","back"]).paid,2);
});
