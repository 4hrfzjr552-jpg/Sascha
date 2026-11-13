import {test} from "node:test";
import assert from "node:assert/strict";
import {isValidArticleNumber} from "../src/lib/articleNumberUtils.ts";
test("Artikelnummer 109 und andere 1-8 Ziffern werden erkannt",()=>{
 for (const number of ["1","109","0009","12345678"]) assert.equal(isValidArticleNumber(number),true);
 for (const number of ["","109a","123456789","#109"," 109 "]) assert.equal(isValidArticleNumber(number),false);
});
