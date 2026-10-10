// node --test browser-extension/tests/image-edit-v3.test.cjs
// Compare our seven named adjustment controls with the user's Apple Photos
// screenshots. No precise values were readable, so the preset is approximate.
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
const pixel=(r,g,b,a=255)=>({
  width:1,height:1,data:new Uint8ClampedArray([r,g,b,a])
});
const neutral=Object.freeze({
  id:"test",brilliance:0,highlights:0,shadows:0,contrast:0,
  blackPoint:0,brightness:0,warmth:0
});
function adjusted(r,g,b,settings,alpha=255){
  const x=pixel(r,g,b,alpha);
  editor().applyIphoneAdjustments(x,{...neutral,...settings});
  return [...x.data];
}
const luminance=channels=>(
  0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2]
);

test("seven explicit Apple Photos controls are present with approximate orientations",()=>{
  const {IPHONE_LOOK:look}=editor();
  assert.equal(look.id,"iphone-photo-adjustments-v2-visible");
  assert.ok(look.intensity>1.5,"The correction must be visibly stronger");
  assert.ok(look.brilliance>0);
  assert.ok(look.highlights<0);
  assert.ok(look.shadows>0);
  assert.ok(look.contrast>0);
  assert.ok(look.blackPoint>0);
  assert.ok(look.brightness<0);
  assert.ok(Math.abs(look.warmth)<=10);
  assert.deepEqual(Object.keys({...look}).sort(),[
    "id","intensity","brilliance","highlights","shadows","contrast",
    "blackPoint","brightness","warmth"
  ].sort());
});
test("zero adjustment is pixel-identical and preserves transparency",()=>{
  const source=pixel(120,147,171,120);
  const original=[...source.data];
  const result=editor().applyIphoneAdjustments(source,neutral);
  assert.deepEqual([...source.data],original);
  assert.equal(result.pixels,0);
});
test("Brillanz lifts midtones but does not overexpose near-white carpet",()=>{
  const mid=adjusted(125,125,125,{brilliance:45});
  const white=adjusted(248,248,248,{brilliance:45});
  assert.ok(mid[0]>125);
  assert.ok(mid[0]-125>white[0]-248);
});
test("Glanzlichter reduces bright-area intensity",()=>{
  const brighter=adjusted(230,230,230,{highlights:40});
  const darker=adjusted(230,230,230,{highlights:-40});
  assert.ok(luminance(darker)<luminance(brighter));
});
test("Schatten lifts dark areas without boosting highlights equally",()=>{
  const shadow=adjusted(35,35,35,{shadows:50});
  const high=adjusted(240,240,240,{shadows:50});
  assert.ok(shadow[0]>35);
  assert.ok(shadow[0]-35>high[0]-240);
});
test("Kontrast separates dark and light midtones",()=>{
  const dark=adjusted(65,65,65,{contrast:30});
  const light=adjusted(190,190,190,{contrast:30});
  assert.ok(dark[0]<65);
  assert.ok(light[0]>190);
});
test("Schwarzpunkt makes very dark areas deeper without wiping bright texture",()=>{
  const dark=adjusted(25,25,25,{blackPoint:40});
  const light=adjusted(225,225,225,{blackPoint:40});
  assert.ok(dark[0]<25);
  assert.ok(Math.abs(light[0]-225)<=1);
});
test("Helligkeit control shifts overall luminance in the intended direction",()=>{
  const down=adjusted(140,140,140,{brightness:-30});
  const up=adjusted(140,140,140,{brightness:30});
  assert.ok(down[0]<140);
  assert.ok(up[0]>140);
});
test("Wärme nudges R and B in opposite directions without changing alpha",()=>{
  const warm=adjusted(120,135,150,{warmth:40},90);
  const cool=adjusted(120,135,150,{warmth:-40},90);
  assert.ok(warm[0]>cool[0]);
  assert.ok(warm[2]<cool[2]);
  assert.equal(warm[3],90);
});
test("the chosen combined look is visible, but the denim stays blue",()=>{
  const api=editor(),cloth=pixel(115,145,178),before=[...cloth.data];
  const result=api.applyIphoneAdjustments(cloth);
  assert.ok(result.pixels>0);
  assert.equal(result.look,"iphone-photo-adjustments-v2-visible");
  assert.ok(cloth.data[2]>cloth.data[1] && cloth.data[1]>cloth.data[0]);
  assert.ok(cloth.data.slice(0,3).every((v,i)=>Math.abs(v-before[i])<35));
});
test("the same look is applied deterministically to every photo",()=>{
  const a=pixel(120,150,175),b=pixel(120,150,175);
  const e=editor();
  e.applyIphoneAdjustments(a); e.applyIphoneAdjustments(b);
  assert.deepEqual([...a.data],[...b.data]);
});
test("there is no blue-mark removal or background replacement",()=>{
  const api=editor(),mark=pixel(10,105,255);
  api.applyIphoneAdjustments(mark);
  assert.ok(mark.data[2]-mark.data[1]>75);
  assert.equal(typeof api.cleanupBackground,"undefined");
  assert.equal(typeof api.blueMarkupPixel,"undefined");
});
test("fresh JPEG preserves crop and aspect ratio without zoom",async()=>{
  const recorded={};
  const data=pixel(130,145,165);
  const ctx={
    drawImage(...args){recorded.args=args;},
    getImageData:()=>data,
    putImageData(){recorded.updated=true;}
  };
  const canvas={
    getContext:()=>ctx,
    toBlob(cb,type,quality){
      recorded.type=type;recorded.quality=quality;
      cb({size:1200,type:"image/jpeg"});
    }
  };
  let bitmapClosed=false;
  class FakeFile{
    constructor(bytes,name,options){this.name=name;this.type=options.type;this.bytes=bytes;}
  }
  const api=editor({
    File:FakeFile,
    createImageBitmap:async()=>({width:1600,height:1200,close(){bitmapClosed=true;}}),
    document:{createElement:()=>canvas}
  });
  const source=new FakeFile([1],"original.png",{type:"image/png"});
  const output=await api.processImage(source,0);
  assert.equal(output.file.name,"sascha_vinted_01_edited.jpg");
  assert.equal(output.file.type,"image/jpeg");
  assert.equal(output.width,1600);
  assert.equal(output.height,1200);
  assert.deepEqual(recorded.args.slice(1),[0,0,1600,1200]);
  assert.equal(recorded.type,"image/jpeg");
  assert.ok(recorded.quality>=0.9);
  assert.equal(output.colorLook,"iphone-photo-adjustments-v2-visible");
  assert.equal(bitmapClosed,true);
});
test("large images keep their aspect ratio when scaled to max edge",async()=>{
  const draw=[];
  class FakeFile{constructor(bytes,name,o){this.name=name;this.type=o.type;}}
  const ctx={drawImage(...args){draw.push(args.slice(1));},
    getImageData:()=>pixel(140,145,165),putImageData(){}};
  const canvas={getContext:()=>ctx,
    toBlob(cb){cb({size:1000,type:"image/jpeg"});}};
  const api=editor({
    File:FakeFile,
    createImageBitmap:async()=>({width:4000,height:2000,close(){}}),
    document:{createElement:()=>canvas}
  });
  const out=await api.processImage(new FakeFile([1],"photo.jpg",{type:"image/jpeg"}),2);
  assert.equal(out.width,2048);
  assert.equal(out.height,1024);
  assert.deepEqual(draw[0],[0,0,2048,1024]);
});
test("edit failure never sends the original as fallback",async()=>{
  class FakeFile{constructor(bytes,name,opts){this.name=name;this.type=opts.type;}}
  const api=editor({File:FakeFile});
  await assert.rejects(()=>api.processImage(
    new FakeFile([1],"original.jpg",{type:"image/jpeg"}),0),/nicht verfügbar/);
});


test("realistic blue denim midtone differs visibly after the stronger preset",()=>{
  const e=editor();
  const denim=pixel(120,147,174);
  const outcome=e.applyIphoneAdjustments(denim);
  assert.ok(outcome.averageRgbDelta>=18,
    "Vinted images must differ visibly from originals; got "+outcome.averageRgbDelta);
  assert.equal(outcome.intensity,1.85);
  assert.ok(outcome.noticeablePercent>=95);
  assert.ok(denim.data[2]>denim.data[1]&&denim.data[1]>denim.data[0]);
});
test("neutral photo background also receives perceptible correction",()=>{
  const img=pixel(185,180,171);
  const result=editor().applyIphoneAdjustments(img);
  assert.ok(result.averageRgbDelta>=15);
  assert.ok(img.data[0]>img.data[1]&&img.data[1]>img.data[2]);
});
test("black and white pixels stay within range and are never retouched",()=>{
  const e=editor();
  for(const input of [[0,0,0],[255,255,255],[4,8,18],[252,250,244]]){
    const img=pixel(...input);
    e.applyIphoneAdjustments(img);
    assert.ok([...img.data].every(x=>x>=0&&x<=255));
    assert.equal(img.data[3],255);
  }
  assert.equal(typeof e.cleanupBackground,"undefined");
});
