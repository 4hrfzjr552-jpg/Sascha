// node --test browser-extension/tests/image-edit-v3.test.cjs
// Pure synthetic pixels: no user product photographs are bundled with the repo.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const file=fs.readFileSync(path.join(__dirname,"..","vinted-image-edit.js"),"utf8");
function loadAPI(extras={}){
  const window={},module={exports:{}};
  vm.runInNewContext(file,{window,module,...extras},{filename:"vinted-image-edit.js"});
  return module.exports;
}
function fixture(width=128,height=128){
  const data=new Uint8ClampedArray(width*height*4);
  const pixel=(x,y,rgb)=>{
    const i=(y*width+x)*4;
    data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    pixel(x,y,[183+((x+y)%3),180+(y%3),170+((x*5+y)%4)]);
  for(let y=25;y<118;y++)for(let x=45;x<108;x++)
    pixel(x,y,[123,147,165]); // jeans must not change
  for(let y=10;y<43;y++)for(let x=8;x<16;x++)
    pixel(x,y,[20,130,240]); // visible bright blue mark on background
  return {width,height,data,pixel};
}
test("recognizes vivid blue pen but not light blue denim",()=>{
  const api=loadAPI();
  assert.equal(api.blueMarkupPixel(20,130,240),true);
  assert.equal(api.blueMarkupPixel(130,145,170),false);
});
test("blue mark on neutral outer background is removed without editing the jeans",()=>{
  const api=loadAPI(),img=fixture();
  const garment=(60+60*img.width)*4;
  const original=Array.from(img.data.slice(garment,garment+4));
  const {marked,replaced}=api.cleanupBackground(img);
  assert.ok(marked>150,"Expected visible blue mark detection");
  assert.ok(replaced>150,"Expected neutral texture donor inpainting");
  let blueLeft=0;
  for(let y=10;y<43;y++)for(let x=8;x<16;x++){
    const at=(y*img.width+x)*4;
    if(api.blueMarkupPixel(img.data[at],img.data[at+1],img.data[at+2]))
      blueLeft++;
  }
  assert.equal(blueLeft,0,"No bright blue pixels should remain inside annotation");
  assert.deepEqual(Array.from(img.data.slice(garment,garment+4)),original,
    "Denim pixels must remain byte-for-byte unchanged");
});
test("do not edit saturated blue garment pixels in the center of the image",()=>{
  const api=loadAPI(),img=fixture();
  for(let y=54;y<72;y++)for(let x=70;x<85;x++)img.pixel(x,y,[20,130,240]);
  const idx=(60*img.width+75)*4;
  const before=Array.from(img.data.slice(idx,idx+4));
  api.cleanupBackground(img);
  assert.deepEqual(Array.from(img.data.slice(idx,idx+4)),before);
});
test("ordinary photo without blue handwriting is left untouched before JPEG export",()=>{
  const api=loadAPI(),img=fixture();
  for(let y=10;y<43;y++)for(let x=8;x<16;x++)
    img.pixel(x,y,[184,178,171]);
  const before=Array.from(img.data);
  const result=api.cleanupBackground(img);
  assert.equal(result.marked,0);
  assert.deepEqual(Array.from(img.data),before);
});
test("creates new JPEG file, not a renamed original, and releases bitmap",async()=>{
  const pixels=fixture();
  const ctx={
    imageSmoothingEnabled:false,
    imageSmoothingQuality:"low",
    drawImage(){},
    getImageData:()=>pixels,
    putImageData(){},
  };
  const canvas={getContext:()=>ctx,
    toBlob(cb,type,quality){
      assert.equal(type,"image/jpeg");
      assert.ok(quality>=0.9);
      cb({size:3000,type:"image/jpeg",distinct:true});
    }
  };
  let bitmapClosed=false;
  class FakeFile{
    constructor(bytes,name,metadata){
      this.name=name;this.type=metadata.type;this.bytes=bytes;
    }
  }
  const api=loadAPI({
    File:FakeFile,
    createImageBitmap:async()=>({width:128,height:128,close(){bitmapClosed=true;}}),
    document:{createElement:tag=>{assert.equal(tag,"canvas");return canvas;}}
  });
  const source=new FakeFile([{size:1024}],"my_original.png",{type:"image/png"});
  const edited=await api.processImage(source,0);
  assert.notEqual(edited.file,source);
  assert.equal(edited.file.name,"sascha_vinted_01_clean.jpg");
  assert.equal(edited.file.type,"image/jpeg");
  assert.equal(edited.file.bytes[0].distinct,true);
  assert.equal(bitmapClosed,true);
});
test("no silent fallback to originals when browser cannot edit",async()=>{
  class FakeFile{constructor(bytes,name,opts){this.name=name;this.type=opts.type;}}
  const api=loadAPI({File:FakeFile});
  await assert.rejects(()=>api.processImage(
    new FakeFile([1],"original.jpg",{type:"image/jpeg"}),0),/nicht verfügbar/);
});
