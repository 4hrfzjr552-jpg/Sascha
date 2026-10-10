// node --test browser-extension/tests/vinted-batch.test.cjs
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const code=fs.readFileSync(path.join(__dirname,"..","vinted-batch.js"),"utf8");

function batchApi(){
  const module={exports:{}},listener=[];
  const chrome={
    runtime:{onMessage:{addListener(fn){listener.push(fn)}}},
    alarms:{onAlarm:{addListener(fn){listener.push(fn)}},
      clear:async()=>true,create:async()=>{}},
    storage:{local:{}},
    tabs:{}
  };
  vm.runInNewContext(code,{chrome,module,URL,console,setTimeout,clearTimeout});
  return {api:module.exports,listener};
}
const pant=(nr,id)=>({artikelnummer:String(nr),id,title:"Diesel Jeans "+nr});

test("starts at selected pant; remaining items sorted by numeric article number",()=>{
  const {api}=batchApi();
  const q=api.orderedQueue([pant(30,"c"),pant(9,"a"),pant(11,"b"),pant(10,"x")],"x");
  assert.deepEqual(Array.from(q,x=>x.artikelnummer),[10,11,30]);
  assert.deepEqual(Array.from(q,x=>x.id),["x","b","c"]);
});
test("missing or duplicate article numbers stop the batch before any post",()=>{
  const {api}=batchApi();
  assert.throws(()=>api.orderedQueue([pant(1,"a"),pant(1,"b")],"a"),/Doppelte Artikelnummer/);
  assert.throws(()=>api.orderedQueue([{id:"a",title:"Jeans ohne Nummer"}],"a"),/ohne gültige Artikelnummer/);
  assert.throws(()=>api.orderedQueue([pant(1,"a"),pant(2,"a")],"a"),/doppelte Entwurf-ID/);
  assert.throws(()=>api.orderedQueue([pant(1,"a")],"missing"),/nicht in der Entwurfsliste/);
});
test("only Vinted URL from official sites is allowed",()=>{
  const {api}=batchApi();
  assert.equal(api.validVintedUrl("https://www.vinted.de/items/new"),true);
  assert.equal(api.validVintedUrl("https://www.vinted.at/items/new"),true);
  assert.equal(api.validVintedUrl("https://vinted.de.evil.example/items/new"),false);
  assert.equal(api.validVintedUrl("http://www.vinted.de/items/new"),false);
  assert.equal(api.saschaUrl("https://sascha-sage.vercel.app/"),true);
  assert.equal(api.saschaUrl("https://vercel.app.evil.example/"),false);
});
test("accepts only explicit saved-drafts URL after save, not normal listings",()=>{
  const {api}=batchApi();
  assert.equal(api.savedUrl("https://www.vinted.de/items/drafts"),true);
  assert.equal(api.savedUrl("https://www.vinted.de/member/42?tab=drafts"),true);
  assert.equal(api.savedUrl("https://www.vinted.de/member/42?type=drafts"),true);
  assert.equal(api.savedUrl("https://www.vinted.de/items/new"),false);
  assert.equal(api.savedUrl("https://www.vinted.de/items/12345"),false);
  assert.equal(api.savedUrl("https://www.vinted.de/member/42?tab=uploaded"),false);
});
test("batch workflow is draft-only; never makes publishing call",()=>{
  const txt=code.toLowerCase();
  assert.ok(txt.includes('type:"save_vinted_draft"'));
  assert.ok(txt.includes('type:"check_vinted_draft_save"'));
  assert.ok(!txt.includes('type:"publish_vinted"'));
  assert.ok(!txt.includes("type:'publish_vinted'"));
  assert.ok(txt.includes("await verifysave("));
});
