// GitHub Actions: node --experimental-strip-types --test browser-extension/tests/vinted-image-transfer.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  freshVintedImageSource,prepareVintedImageDataUrl
} from '../../src/lib/vintedImageTransfer.ts';

const cached='https://example.invalid/storage/signed/image.jpg?token=expired';
const renewed='https://example.invalid/storage/signed/image.jpg?token=fresh';
class Reader {
  result=null;
  onload=null;
  onerror=null;
  readAsDataURL(blob){
    this.result='data:image/jpeg;base64,'+Buffer.from('new-jpeg-bytes').toString('base64');
    this.onload?.();
  }
}
test('always refreshes Supabase storagePath URL despite valid-looking cached https URL',async()=>{
  let called=0;
  const url=await freshVintedImageSource(cached,'user/pant/photo.jpg',async(path)=>{
    assert.equal(path,'user/pant/photo.jpg');
    called++;return renewed;
  });
  assert.equal(url,renewed);
  assert.equal(called,1);
});
test('never falls back to expired cached link when signer fails',async()=>{
  const url=await freshVintedImageSource(cached,'user/pant/photo.jpg',async()=>null);
  assert.equal(url,'');
});
test('preserves local dataUrl when there is no storagePath',async()=>{
  const data='data:image/jpeg;base64,abc';
  assert.equal(await freshVintedImageSource(data,undefined,async()=>{
    throw Error('signer should not run');
  }),data);
});
test('does not re-fetch existing portable data:image URL',async()=>{
  const data='data:image/jpeg;base64,ZmFrZQ==';
  const result=await prepareVintedImageDataUrl(data,async()=>{throw Error('fetch should not run')},Reader);
  assert.equal(result,data);
});
test('fetches renewed URL in Sascha tab and sends data:image bytes to Vinted',async()=>{
  const urls=[];
  const portable=await prepareVintedImageDataUrl(renewed,async(url,options)=>{
    urls.push(url);
    assert.equal(options.cache,'no-store');
    return {ok:true,blob:async()=>({size:20,type:'image/jpeg'})};
  },Reader);
  assert.deepEqual(urls,[renewed]);
  assert.equal(portable,'data:image/jpeg;base64,'+Buffer.from('new-jpeg-bytes').toString('base64'));
});
test('reports an expired/forbidden image URL with HTTP 403',async()=>{
  await assert.rejects(()=>prepareVintedImageDataUrl(cached,async()=>({
    ok:false,status:403
  }),Reader),/HTTP 403/);
});
test('rejects empty or non-image responses',async()=>{
  await assert.rejects(()=>prepareVintedImageDataUrl(renewed,async()=>({
    ok:true,blob:async()=>({size:100,type:'text/html'})
  }),Reader),/keine gültige Bilddatei/);
  await assert.rejects(()=>prepareVintedImageDataUrl(renewed,async()=>({
    ok:true,blob:async()=>({size:0,type:'image/jpeg'})
  }),Reader),/keine gültige Bilddatei/);
});
