import { test } from "node:test";
import assert from "node:assert/strict";
import {flatlayPoseGuideSvg} from "../src/lib/flatlayPoseGuide.ts";

test("FLUX layout guide conveys pose only and never a second pair of branded jeans",()=>{
  const svg=flatlayPoseGuideSvg();
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.match(svg,/width="512" height="512"/);
  assert.match(svg,/<path d="M 210 143 L 171 228 L 204 309 L 172 387 L 221 463"/);
  assert.match(svg,/<path d="M 302 143 L 341 228 L 308 309 L 340 387 L 291 463"/);
  assert.ok(svg.includes('M256 466 L327 466'));
  assert.equal(/(?:Levi|Diesel|brand|pocket|text|image href|foreignObject|script)/i.test(svg),false);
  assert.ok(svg.length<7000,"The pose guide should remain a tiny extra reference.");
});
