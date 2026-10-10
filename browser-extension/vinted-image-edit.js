/* Sascha AI -> Vinted local image preparation (Chrome classic content script).
   Keeps garment details untouched. Removes clearly electric-blue hand-written
   marks from neutral outer background (as in user's sample), then exports an
   actual new JPEG. No promise that any marketplace will accept the result.
   Images never leave the browser for processing. */
((root) => {
  "use strict";
  const MAX_EDGE=2048;
  const JPEG_QUALITY=0.94;
  const norm=v=>String(v??"").toLowerCase();

  function blueMarkupPixel(r,g,b){
    // Original sample: blue pen is highly saturated; denim/background is muted.
    return b-r>50 && b-g>20 && g-r>8 && b>120;
  }
  function inOuterBackground(x,y,w,h){
    return x<w*0.23 || x>w*0.77 || y<h*0.10 || y>h*0.92;
  }
  function isNeutral(r,g,b){
    return Math.max(r,g,b)-Math.min(r,g,b)<40 &&
      r>65&&g>65&&b>65&&r<250&&g<250&&b<250;
  }
  function makeMask(pixels,width,height) {
    const src=pixels.data||pixels;
    const original=new Uint8Array(width*height);
    let marked=0;
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        if(!inOuterBackground(x,y,width,height))continue;
        const pos=(y*width+x)*4;
        if(!blueMarkupPixel(src[pos],src[pos+1],src[pos+2]))continue;
        // Protect product fabric: cleanup only near a neutral surrounding.
        let neutralNeighbors=0;
        for(const [dx,dy] of [[22,0],[-22,0],[36,0],[-36,0],[0,22],[0,-22],[0,36],[0,-36]]){
          const sx=x+dx,sy=y+dy;
          if(sx<0||sy<0||sx>=width||sy>=height)continue;
          const q=(sy*width+sx)*4;
          if(isNeutral(src[q],src[q+1],src[q+2]))neutralNeighbors++;
        }
        if(neutralNeighbors<2)continue;
        original[y*width+x]=1;
        marked++;
      }
    }
    if(marked<8)return {mask:new Uint8Array(width*height),count:0};
    // Include anti-aliased edges of blue ink; keep coverage narrowly confined
    // to avoid replacing garment pixels with background.
    const mask=original.slice(),rad=2;
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        if(!original[y*width+x])continue;
        for(let oy=-rad;oy<=rad;oy++)for(let ox=-rad;ox<=rad;ox++){
          if(ox*ox+oy*oy>rad*rad)continue;
          const xx=x+ox,yy=y+oy;
          if(xx<0||yy<0||xx>=width||yy>=height)continue;
          if(inOuterBackground(xx,yy,width,height))mask[yy*width+xx]=1;
        }
      }
    }
    return {mask,count:marked};
  }

  function cleanupBackground(imageData){
    const {width,height}=imageData;
    const src=imageData.data;
    if(!src||!width||!height)return {data:imageData,marked:0,replaced:0};
    const {mask,count}=makeMask(src,width,height);
    if(!count)return {data:imageData,marked:0,replaced:0};
    const old=new Uint8ClampedArray(src);
    let replaced=0;
    // Source-patch inpainting: clone neutral background from a nearby offset.
    // Do not blur/repaint the jeans or touch fabric texture.
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        if(!mask[y*width+x])continue;
        const attempts=[
          [20,12],[-20,12],[20,-12],[-20,-12],
          [32,4],[-32,4],[4,32],[4,-32],
          [40,20],[-40,-20],[54,0],[-54,0]
        ];
        const shift=(x*17+y*31)%attempts.length;
        let donor=-1;
        for(let step=0;step<attempts.length;step++){
          const [dx,dy]=attempts[(step+shift)%attempts.length];
          const xx=x+dx,yy=y+dy;
          if(xx<0||yy<0||xx>=width||yy>=height ||
              mask[yy*width+xx])continue;
          const pos=(yy*width+xx)*4;
          if(!isNeutral(old[pos],old[pos+1],old[pos+2]))continue;
          donor=pos;break;
        }
        if(donor===-1)continue;
        const dest=(y*width+x)*4;
        src[dest]=old[donor];
        src[dest+1]=old[donor+1];
        src[dest+2]=old[donor+2];
        replaced++;
      }
    }
    return {data:imageData,marked:count,replaced};
  }

  async function toJpegBlob(canvas){
    if(typeof canvas.toBlob!=="function")
      throw Error("JPEG-Export im Browser nicht verfügbar");
    return new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>blob && blob.size?resolve(blob):
        reject(Error("Bild konnte nicht als JPG gespeichert werden")),
        "image/jpeg",JPEG_QUALITY);
    });
  }

  async function processImage(file,index){
    if(!(file instanceof File))throw Error("Ungültige Bilddatei");
    if(typeof createImageBitmap!=="function")
      throw Error("Bildbearbeitung im Browser nicht verfügbar");
    const bitmap=await createImageBitmap(file);
    try{
      const scale=Math.min(1,MAX_EDGE/Math.max(bitmap.width,bitmap.height));
      const width=Math.max(1,Math.round(bitmap.width*scale));
      const height=Math.max(1,Math.round(bitmap.height*scale));
      const canvas=document.createElement("canvas");
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});
      if(!ctx)throw Error("Canvas-Bildbearbeitung nicht verfügbar");
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(bitmap,0,0,width,height);
      const pixels=ctx.getImageData(0,0,width,height);
      const result=cleanupBackground(pixels);
      if(result.replaced)ctx.putImageData(pixels,0,0);
      const blob=await toJpegBlob(canvas);
      return {file:new File([blob],
          "sascha_vinted_"+String(index+1).padStart(2,"0")+"_clean.jpg",
          {type:"image/jpeg"}),
        originalName:file.name,marked:result.marked,replaced:result.replaced,
        width,height};
    }finally{
      bitmap.close?.();
    }
  }

  const api=Object.freeze({blueMarkupPixel,inOuterBackground,isNeutral,
    makeMask,cleanupBackground,processImage});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.SaschaVintedImageEdit=api;
})(typeof window!=="undefined"?window:globalThis);
