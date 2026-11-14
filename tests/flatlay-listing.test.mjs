import { test } from "node:test";
import assert from "node:assert/strict";
import { vintedListingPhotos } from "../src/lib/listingPhotos.ts";

const src = n => ({ id: "original-" + n, dataUrl: "data:image/jpeg;base64,b3JpZ2luYWw=", name: "original" + n + ".jpg", size: 8 });
const ai = n => ({ id: "flatlay-original-" + n, dataUrl: "data:image/jpeg;base64,ZmxhdGxheQ==", name: "flatlay" + n + ".jpg", size: 6 });
const originals = [src(1),src(2),src(3),src(4),src(5)];
function create(flatlays=[],fitpic=null,fitpicApproved=false) {
  return {images:structuredClone(originals),flatlays,fitpic,fitpicApproved};
}
test("five originals are retained while bag photo 5 is never exported",()=>{
  const pant=create();
  const gallery=vintedListingPhotos(pant);
  assert.deepEqual(gallery.map(x=>x.id),["original-1","original-2","original-3","original-4"]);
  assert.equal(pant.images.length,5);
});
test("approved flatlay is preferred, but its real source remains in buyer-visible gallery",()=>{
  const pant=create([{sourceImageId:"original-1",image:ai(1),approved:true}]);
  const gallery=vintedListingPhotos(pant);
  assert.deepEqual(gallery.map(x=>x.id),["flatlay-original-1","original-2","original-3","original-1"]);
  assert.equal(pant.images[0].id,"original-1");
  assert.notEqual(pant.images[0].dataUrl,pant.flatlays[0].image.dataUrl);
});
test("unapproved flatlays cannot be exported or counted as originals",()=>{
  const pant=create([{sourceImageId:"original-1",image:ai(1),approved:false}]);
  assert.deepEqual(vintedListingPhotos(pant).map(x=>x.id),
    ["original-1","original-2","original-3","original-4"]);
});
test("multiple approved flatlays never hide all original condition evidence",()=>{
  const pant=create([1,2,3,4].map(n=>({sourceImageId:"original-"+n,image:ai(n),approved:true})));
  const selected=vintedListingPhotos(pant);
  assert.equal(selected.length,4);
  assert.deepEqual(selected.map(x=>x.id),["flatlay-original-1","flatlay-original-2","flatlay-original-3","original-1"]);
});
test("fitpic plus flatlays still have one genuine original and at most four images",()=>{
  const pant=create([1,2].map(n=>({sourceImageId:"original-"+n,image:ai(n),approved:true})),{
    id:"fitpic-1",dataUrl:"data:image/jpeg;base64,QQ==",name:"fitpic.jpg",size:1,
  },true);
  const selected=vintedListingPhotos(pant);
  assert.deepEqual(selected.map(x=>x.id),["fitpic-1","flatlay-original-1","flatlay-original-2","original-1"]);
});
test("flatlays attached to removed sources are always ignored",()=>{
  const pant=create([{sourceImageId:"removed-id",image:ai(1),approved:true}]);
  assert.deepEqual(vintedListingPhotos(pant).map(x=>x.id),
    ["original-1","original-2","original-3","original-4"]);
});
