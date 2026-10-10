// node --test browser-extension/tests/image-edit-v3.test.cjs
// Unit tests for subtle whole-image color and contrast, without number or
// blue-mark detection. Source photos remain user's own, not in the repo.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const code=fs.readFileSync(path.join(__dirname,"..","vinted-image-edit.js"),"utf8");
function editor(extras={}){
  const window={},module={exports:{}};
  vm.runInNewContext(code,{window,module,...extras},{filename:"vinted-image-edit.js"});
  return module.exports;
}
const image=(r,g,b,a=255)=>({
  width:1,height:1,data:new Uint8ClampedArray([r,g,b,a])
});

test("reference preset contains brightness, contrast, color, and gamma corrections",()=>{
  const {REFERENCE_LOOK:look}=editor();
  assert.equal(look.id,"soft-reference-look-v2");
  assert.ok(look.brightness>1);
  assert.ok(look.contrast<1);
  assert.ok(look.saturation<1);
  assert.ok(look.gamma<1);
});

test("corrects neutral midtone and preserves alpha",()=>{
  const api=editor(),img=image(170,167,161,111);
  const result=api.applyReferenceLook(img);
  assert.equal(result.look,"soft-reference-look-v2");
  assert.equal(result.pixels,1);
  assert.equal(img.data[3],111);
  assert.ok(img.data[0]>170,"midtone red should lift");
  assert.ok(img.data[1]>167,"midtone green should lift");
  assert.ok(img.data[2]>161,"midtone blue should lift");
});

test("reduces denim saturation a little without destroying blue shade",()=>{
  const api=editor(),img=image(120,150,178);
  const originalGap=img.data[2]-img.data[0];
  api.applyReferenceLook(img);
  assert.ok(img.data[2]>img.data[1]&&img.data[1]>img.data[0]);
  assert.ok(img.data[2]-img.data[0]<originalGap);
});

test("no special detection or removal for blue hand-written numbers",()=>{
  const api=editor(),img=image(12,120,240);
  api.applyReferenceLook(img);
  assert.ok(img.data[2]>img.data[1]+60,
    "a blue marker must not be erased; only normal grade applies");
  assert.equal(typeof api.cleanupBackground,"undefined");
  assert.equal(typeof api.blueMarkupPixel,"undefined");
  assert.equal(typeof api.makeMask,"undefined");
});

test("all pixels receive same consistent preset, never per-photo random changes",()=>{
  const api=editor();
  const a=image(130,148,173),b=image(130,148,173);
  const resultA=api.applyReferenceLook(a);
  const resultB=api.applyReferenceLook(b);
  assert.deepEqual(Array.from(a.data),Array.from(b.data));
  assert.equal(resultA.look,resultB.look);
});

test("new JPG is rendered from canvas without crop or zoom",async()=>{
  const captured={};
  const pixels=image(138,148,170);
  const ctx={
    drawImage(...args){captured.drawArgs=args;},
    getImageData:()=>pixels,
    putImageData(data,x,y){captured.pixels=data;captured.position=[x,y];}
  };
  const canvas={
    getContext:()=>ctx,
    toBlob(cb,type,quality){
      captured.type=type;captured.quality=quality;
      cb({size:2000,type:"image/jpeg"});
    }
  };
  let closed=false;
  class MockFile{
    constructor(bytes,name,options){this.name=name;this.type=options.type;this.bytes=bytes;}
  }
  const api=editor({
    File:MockFile,
    createImageBitmap:async()=>({width:1200,height:1200,close(){closed=true;}}),
    document:{createElement:t=>{assert.equal(t,"canvas");return canvas;}}
  });
  const original=new MockFile([1],"original.png",{type:"image/png"});
  const processed=await api.processImage(original,0);
  assert.equal(canvas.width,1200);
  assert.equal(canvas.height,1200);
  assert.deepEqual(captured.drawArgs.slice(1),[0,0,1200,1200]);
  assert.deepEqual(captured.position,[0,0]);
  assert.equal(captured.type,"image/jpeg");
  assert.ok(captured.quality>=0.90);
  assert.equal(processed.file.name,"sascha_vinted_01_edited.jpg");
  assert.equal(processed.file.type,"image/jpeg");
  assert.equal(processed.colorLook,"soft-reference-look-v2");
  assert.equal(closed,true);
});

test("source larger than max edge is resized preserving aspect ratio",async()=>{
  const dimensions={};
  class MockFile{constructor(bytes,name,options){this.name=name;this.type=options.type;}}
  const ctx={
    drawImage(...args){dimensions.draw=args.slice(1);},
    getImageData:()=>image(140,150,170),
    putImageData(){}
  };
  const canvas={getContext:()=>ctx,
    toBlob(cb){cb({size:500,type:"image/jpeg"});}};
  const api=editor({
    File:MockFile,
    document:{createElement:()=>canvas},
    createImageBitmap:async()=>({width:4000,height:2000,close(){}})
  });
  const result=await api.processImage(new MockFile([1],"source.jpg",{type:"image/jpeg"}),1);
  assert.equal(result.width,2048);
  assert.equal(result.height,1024);
  assert.deepEqual(dimensions.draw,[0,0,2048,1024]);
  assert.equal(result.file.name,"sascha_vinted_02_edited.jpg");
});

test("refuses to pass through original if editing unavailable",async()=>{
  class MockFile{constructor(bytes,name,options){this.name=name;this.type=options.type;}}
  const api=editor({File:MockFile});
  await assert.rejects(
    ()=>api.processImage(new MockFile([1],"original.jpg",{type:"image/jpeg"}),0),
    /nicht verfügbar/
  );
});
