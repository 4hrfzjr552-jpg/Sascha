import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLUX_BASE_COST_USD, FLUX_RESERVED_USD, FLUX_MODELS,
  isFluxProvider, serverPreflightCost, capCanReserve, utcMonthKey,
} from "../src/lib/fluxBudget.ts";
import {
  acceptableBflPollUrl, acceptableBflDownloadUrl, priceAllowed,
  makePrompt, isUnchargedBflModeration,
} from "../api/flux-edit.ts";

test("FLUX models use exact officially documented endpoints",()=>{
  assert.equal(FLUX_MODELS["flux-klein"],"flux-2-klein-4b");
  assert.equal(FLUX_MODELS["flux-pro"],"flux-2-pro");
  assert.equal(FLUX_BASE_COST_USD["flux-klein"],0.015);
  assert.equal(FLUX_BASE_COST_USD["flux-pro"],0.045);
  assert.ok(FLUX_RESERVED_USD["flux-pro"]>FLUX_BASE_COST_USD["flux-pro"]);
  assert.equal(isFluxProvider("gemini"),false);
});
test("per-image hard preflight does not allow pro with klein budget",()=>{
  assert.equal(priceAllowed("flux-pro",0.025,0.060),false);
  assert.equal(priceAllowed("flux-klein",0.025,0.060),true);
  assert.equal(priceAllowed("flux-pro",0.060,0.060),true);
  assert.equal(priceAllowed("flux-pro",0.060,0.030),false);
  assert.equal(priceAllowed("unknown",10,10),false);
  assert.equal(priceAllowed("flux-klein",Infinity,10),false);
  assert.equal(serverPreflightCost("flux-pro",0.025,0.060),null);
  assert.equal(serverPreflightCost("flux-pro",0.060,0.060)?.reservedUsd,0.060);
});
test("browser-local budget reserves conservative estimate and rolls monthly",()=>{
  assert.equal(capCanReserve(0.975,1,0.025),true);
  assert.equal(capCanReserve(0.98,1,0.025),false);
  assert.equal(capCanReserve(0,1,0.060),true);
  assert.equal(capCanReserve(NaN,1,0.015),false);
  assert.equal(utcMonthKey(new Date("2026-11-30T22:59:59Z")),"2026-11");
  assert.equal(utcMonthKey(new Date("2026-12-01T00:00:00Z")),"2026-12");
});
test("poll URLs never allow arbitrary hosts, credentials, http or other paths",()=>{
  assert.equal(acceptableBflPollUrl("https://api.bfl.ai/v1/get_result?id=abc"),true);
  assert.equal(acceptableBflPollUrl("https://api.us.bfl.ai/v1/get_result?id=abc"),true);
  assert.equal(acceptableBflPollUrl("https://api.eu.bfl.ai/v1/get_result?id=abc"),true);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai/v1/get_result?id=abc"),true);
  assert.equal(acceptableBflPollUrl("https://api.eu10.bfl.ai/v1/get_result?id=abc"),true);
  assert.equal(acceptableBflPollUrl("https://api.us2.bfl.ai/v1/get_result?id=abc"),true);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai/v1/get_result?request_id=abc"),false);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai/v1/get_result"),false);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai/v1/get_result?id="),false);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai/v1/get_result?id=abc&redirect=https://evil.example"),false);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai.evil.example/v1/get_result?id=abc"),false);
  assert.equal(acceptableBflPollUrl("https://api.evil.bfl.ai/v1/get_result?id=abc"),false);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai@evil.example/v1/get_result?id=abc"),false);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai:8443/v1/get_result?id=abc"),false);
  assert.equal(acceptableBflPollUrl("http://api.eu2.bfl.ai/v1/get_result?id=abc"),false);
  assert.equal(acceptableBflPollUrl("https://api.eu2.bfl.ai/v1/get_result?id=abc#frag"),false);
  assert.equal(acceptableBflPollUrl("https://evil.example/v1/get_result?id=abc"),false);
  assert.equal(acceptableBflPollUrl("https://api.bfl.ai.evil.example/v1/get_result?id=x"),false);
  assert.equal(acceptableBflPollUrl("http://api.bfl.ai/v1/get_result?id=x"),false);
  assert.equal(acceptableBflPollUrl("https://api.bfl.ai/v1/delete?id=x"),false);
});
test("result image URLs are restricted to documented BFL delivery origins",()=>{
  assert.equal(acceptableBflDownloadUrl("https://bfldeliveryprod.blob.core.windows.net/results/example.jpg?sig=abc"),true);
  assert.equal(acceptableBflDownloadUrl("https://api.bfl.ai/images/example.jpg"),true);
  assert.equal(acceptableBflDownloadUrl("https://api.bfl.ai.evil.example/"),false);
  assert.equal(acceptableBflDownloadUrl("http://localhost:3000"),false);
  assert.equal(acceptableBflDownloadUrl("https://127.0.0.1/x"),false);
});

test("request moderation is no-charge while content moderation may already have incurred costs",()=>{
  assert.equal(isUnchargedBflModeration("Request Moderated"),true);
  assert.equal(isUnchargedBflModeration("Content Moderated"),false);
  assert.equal(isUnchargedBflModeration("Ready"),false);
  assert.equal(isUnchargedBflModeration(undefined),false);
});
test("resale flatlay prompt works with and without second guide image",()=>{
  const core={mode:"flatlay",sourceView:"front",background:"rug",details:{
    title:"Dark Blue Levi's 501 jeans",description:"Original vintage jeans",brand:"Levi's"
  }};
  const withGuide=makePrompt({...core,poseGuide:"image"});
  const withoutGuide=makePrompt(core);
  assert.match(withGuide,/second image is a simplified shape guide/i);
  assert.doesNotMatch(withoutGuide,/second image is a simplified shape guide/i);
  for (const prompt of [withGuide,withoutGuide]) {
    assert.match(prompt,/same zipper\/fly and front pockets/i);
    assert.match(prompt,/two visible gentle direction changes in EACH leg/i);
    assert.match(prompt,/two lower leg openings touching/i);
    assert.doesNotMatch(prompt,/Original vintage jeans/); // listing text must not corrupt real image
    assert.ok(prompt.length<1800,"Use a concise, factual edit instruction");
  }
});
