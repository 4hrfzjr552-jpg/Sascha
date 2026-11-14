import { test } from "node:test";
import assert from "node:assert/strict";
import { neutralPhotoCorrection, adjustPhotoChannel } from "../src/lib/photoEnhance.ts";

test("photo adjustment remains gentle over realistic photo luminance", () => {
  for (const mean of [0,20,80,100,120,150,190,220,255]) {
    const {gain,contrast}=neutralPhotoCorrection(mean);
    assert.ok(gain >= 0.98 && gain <= 1.04);
    assert.ok(contrast >= 1 && contrast <= 1.025);
  }
});
test("neutral enhancement never alters original pixels' spatial positions or counts",()=>{
  const rgb=[15,32,65,110,150,200,250];
  const {gain,contrast}=neutralPhotoCorrection(132);
  const adjusted=rgb.map(v=>adjustPhotoChannel(v,gain,contrast));
  assert.equal(adjusted.length,rgb.length);
  for(let i=0;i<rgb.length;i++){
    assert.equal(Number.isInteger(adjusted[i]),true);
    assert.ok(adjusted[i]>=0&&adjusted[i]<=255);
    assert.ok(Math.abs(adjusted[i]-rgb[i])<=7,`excessive tone shift for ${rgb[i]}`);
  }
});
test("clamps extreme channels and handles bad inputs safely",()=>{
  assert.equal(adjustPhotoChannel(255,2,2),255);
  assert.equal(adjustPhotoChannel(-100,2,2),0);
  assert.equal(adjustPhotoChannel(NaN,1,1),0);
  assert.deepEqual(neutralPhotoCorrection(NaN),{gain:1,contrast:1});
});
