import {test} from "node:test";
import assert from "node:assert/strict";
import {cleanBagNumber,generateWithFallback,FIT_VALUES,GENDER_VALUES,LISTING_RULES,getCandidateModels} from "../api/_listingRules.ts";
test("Tütennummer wird nur aus eindeutigen Ziffern gelesen",()=>{
 assert.equal(cleanBagNumber("109"),"109");
 assert.equal(cleanBagNumber(" #0109 "),"0109");
 assert.equal(cleanBagNumber("1O9"),"");
 assert.equal(cleanBagNumber("123456789"),"");
});
test("ein überlastetes oder limitiertes Modell wird übersprungen",async()=>{
 const used=[];
 const ai={models:{async generateContent({model}){
  used.push(model);
  if(used.length===1) throw {status:429,message:"quota"};
  return {text:"{}"};
 }}};
 const result=await generateWithFallback(ai,{contents:[],config:{}});
 assert.equal(result.text,"{}");assert.equal(used.length,2);
});
test("Schnitt- und Geschlechtswerte sind in der API beschränkt",()=>{
 assert.ok(GENDER_VALUES.includes("Damen"));
 assert.ok(GENDER_VALUES.includes("Herren"));
 assert.ok(FIT_VALUES.includes("Bootcut"));
 assert.ok(FIT_VALUES.includes("Straight"));
 assert.match(LISTING_RULES,/TITEL-REGELN/);
});
