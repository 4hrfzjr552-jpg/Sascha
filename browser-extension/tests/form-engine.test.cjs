// Execute with: node --test browser-extension/tests/form-engine.test.cjs
// Unit tests only: real Vinted DOM still requires an interactive integration test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const file = fs.readFileSync(path.join(__dirname, '..', 'content-vinted.js'), 'utf8');
const register = '  chrome.runtime.onMessage.addListener';
assert.ok(file.includes(register), 'Expected extension message listener');
const instrumented = file.replace(register,
  '  window.__test = { norm, optionAliases, formatTitle, fieldLabelMatches, desiredGender, categoryScore, fieldSearchInput, runSequentialSteps, FIELD_ORDER, classifyDraftCategory, catalogRadioOptions, waitForCatalogChoices, catalogSearchSnapshot };\n' + register);
const sandbox = {
  window: {},
  chrome: { runtime: { onMessage: { addListener() {} } } },
  setTimeout
};
vm.runInNewContext(instrumented, sandbox, { filename: 'content-vinted.js' });
const { norm, optionAliases, formatTitle, fieldLabelMatches, desiredGender, categoryScore, fieldSearchInput, runSequentialSteps, FIELD_ORDER, classifyDraftCategory, catalogRadioOptions, waitForCatalogChoices, catalogSearchSnapshot } = sandbox.window.__test;
const has = (field, desired, candidate, draft = {}) =>
  optionAliases(field, desired, draft).includes(norm(candidate));

test('condition good does not match very good', () => {
  assert.ok(has('condition', 'Gut', 'Good'));
  assert.ok(!has('condition', 'Gut', 'Sehr gut'));
});
test('very good maps to correct alias', () => {
  assert.ok(has('condition', 'Sehr gut', 'Very good'));
});
test('blue does not match light blue', () => {
  assert.ok(has('color', 'Blau', 'Blue'));
  assert.ok(!has('color', 'Blau', 'Hellblau'));
});
test('light blue remains selectable', () => {
  assert.ok(has('color', 'Hellblau', 'Light blue'));
});
test('exact label identification does not match unrelated form text', () => {
  assert.ok(fieldLabelMatches('Größe *', 'size'));
  assert.ok(!fieldLabelMatches('Größe auswählen, Zustand', 'size'));
});
test('women denim waist alternatives include W28', () => {
  assert.ok(has('size', 'W28 L32', 'W28', { gender:'Damen', category:'Jeans' }));
});
test('article number appended once, even if prefixed #', () => {
  assert.equal(formatTitle('Diesel Jeans', '42'), 'Diesel Jeans #42');
  assert.equal(formatTitle('Diesel Jeans #42', '42'), 'Diesel Jeans #42');
  assert.equal(formatTitle('Diesel Jeans', '#42'), 'Diesel Jeans #42');
});


test('adult genders are inferred from explicit gender or title', () => {
  assert.equal(desiredGender({gender:'Herren'}), 'men');
  assert.equal(desiredGender({gender:'Damen'}), 'women');
  assert.equal(desiredGender({title:'Diesel Damen Jeans W28'}), 'women');
});
test('baby-jeans category is rejected for adult denim', () => {
  assert.equal(categoryScore('jeans | kinder | neugeboren', 'men'), -100);
  assert.equal(categoryScore('jeans | fruhchen', 'women'), -100);
});
test('preferred category path follows declared gender', () => {
  assert.ok(categoryScore('jeans | herren | hosen', 'men') >
    categoryScore('jeans | damen | hosen', 'men'));
  assert.ok(categoryScore('jeans | damen | hosen', 'women') >
    categoryScore('jeans | herren | hosen', 'women'));
});
test('brand search cannot be reused by size, condition or color', () => {
  // For all other fields the brand-only search is never returned.
  assert.equal(fieldSearchInput('size'), null);
  assert.equal(fieldSearchInput('color'), null);
  assert.equal(fieldSearchInput('condition'), null);
});


test('fields execute in a strict order, one after the previous resolved', async () => {
  const visited = [];
  let active = 0;
  const steps = ['title','description','category'].map(key => ({
    key, label:key, execute:async () => {
      assert.equal(active,0,'parallel steps are forbidden');
      active++;
      visited.push('begin '+key);
      await Promise.resolve();
      visited.push('done '+key);
      active--;
      return {success:true};
    }
  }));
  const run=await runSequentialSteps(steps,()=>{},0);
  assert.equal(run.stoppedAt,null);
  assert.equal(JSON.stringify(visited),JSON.stringify([
    'begin title','done title','begin description','done description','begin category','done category'
  ]));
});
test('stop immediately after an unconfirmed field and mark the rest as skipped', async () => {
  const visited=[];
  const steps=['title','category','brand','size'].map(key=>({
    key,label:key,execute:async()=>{
      visited.push(key);
      return key==='category'?{success:false,reason:'Not selected'}:{success:true};
    }
  }));
  const run=await runSequentialSteps(steps,()=>{},0);
  assert.equal(run.stoppedAt,'category');
  assert.equal(JSON.stringify(visited),JSON.stringify(['title','category']));
  assert.equal(run.results.brand.success,false);
  assert.match(run.results.brand.reason,/Übersprungen/);
  assert.equal(run.results.size.success,false);
});
test('throws from a field are handled without advancing', async () => {
  let secondCalled=false;
  const steps=[
    {key:'title',label:'Titel',execute:async()=>{throw Error('DOM error');}},
    {key:'description',label:'Beschreibung',execute:async()=>{secondCalled=true;return {success:true};}}
  ];
  const run=await runSequentialSteps(steps,()=>{},0);
  assert.equal(run.stoppedAt,'title');
  assert.equal(secondCalled,false);
  assert.match(run.results.title.reason,/DOM error/);
});
test('expected field sequence keeps the dependent category first', () => {
  assert.equal(JSON.stringify(FIELD_ORDER),
    JSON.stringify(['title','description','category','brand','size','color','condition','price','images']));
});


test('category inference uses the AI-generated description and title', () => {
  const slim=classifyDraftCategory({
    title:'Diesel Safado',description:'Herrenjeans Slim Fit W36 L32',category:'Jeans'
  });
  assert.equal(slim.gender,'men');
  assert.equal(slim.fit,'slim');
  const straight=classifyDraftCategory({
    title:'Zara Jeans',description:'Damenjeans, Straight Leg',category:'Jeans'
  });
  assert.equal(straight.gender,'women');
  assert.equal(straight.fit,'straight');
});
test('W36 alone does not determine gender', () => {
  assert.equal(classifyDraftCategory({title:'Jeans W36 L32',category:'Jeans'}).gender,'');
});
test('AI-generated jeans jacket text is not pants', () => {
  assert.equal(classifyDraftCategory({title:'Damen Jeansjacke',category:'Jeansjacke'}).isJeans,false);
});
test('explicit structured gender overrides inconsistent title', () => {
  assert.equal(classifyDraftCategory({gender:'Damen',title:'Herrenjeans',category:'Jeans'}).gender,'women');
});
test('radio category IDs are used only for verified gender and fit', () => {
  const items=[{id:1817,text:'Röhrenjeans Herren'},
    {id:1818,text:'Jeans mit enger Passform Herren'},
    {id:1819,text:'Gerade geschnittene Jeans Herren'},
    {id:1844,text:'Röhrenjeans Damen'},
    {id:1845,text:'Gerade geschnittene Jeans Damen'},
    {id:1559,text:'Jeans Kinder'},
    {id:1696,text:'Jeans Jungen'}];
  const body={};
  const radios=items.map(item=>{
    const row={id:'',tagName:'LI',isConnected:true,textContent:item.text,
      innerText:item.text,parentElement:body,getClientRects:()=>[1],
      getAttribute:()=>'',closest:()=>null};
    return {id:'catalog-search-'+item.id+'-radio',closest:()=>row};
  });
  sandbox.document={
    body,
    querySelectorAll(selector){
      return selector.startsWith('input[id^=')?radios:[];
    },
    querySelector:()=>null
  };
  sandbox.getComputedStyle=()=>({display:'block',visibility:'visible'});
  const options=(gender,fit)=>catalogRadioOptions('jeans',{gender,fit,isJeans:true});
  const menSlim=options('men','slim');
  assert.equal(menSlim.find(x=>x.id===1818)?.eligible,true);
  assert.equal(menSlim.find(x=>x.id===1845)?.eligible,false);
  assert.equal(menSlim.find(x=>x.id===1559)?.eligible,false);
  assert.equal(options('men','straight').find(x=>x.id===1819)?.eligible,true);
  assert.equal(options('women','straight').find(x=>x.id===1845)?.eligible,true);
  assert.equal(options('men','skinny').find(x=>x.id===1817)?.eligible,true);
  assert.equal(options('women','skinny').find(x=>x.id===1844)?.eligible,true);
  assert.ok(!options('men','').some(x=>x.eligible && x.id===1559));
});


test('asynchronous radio results are awaited instead of checking once at 470ms', async () => {
  const body={};
  const row={id:'',tagName:'LI',isConnected:true,innerText:'Gerade geschnittene Jeans Herren',
    textContent:'Gerade geschnittene Jeans Herren',parentElement:body,
    getClientRects:()=>[1],getAttribute:()=>'',closest:()=>null};
  const radio={id:'catalog-search-1819-radio',closest:()=>row};
  let calls=0;
  sandbox.document={body,querySelectorAll(selector){
    return selector.startsWith('input[id^=') && calls>=3 ? [radio]:[];
  },querySelector(){return null;}};
  sandbox.getComputedStyle=()=>({display:'block',visibility:'visible'});
  // The first two polling attempts see an empty catalog; a later React render
  // supplies the adult/straight category.
  sandbox.setTimeout=fn=>{calls++;fn();};
  const results=await waitForCatalogChoices('jeans',
    {gender:'men',fit:'straight',isJeans:true},4600);
  assert.ok(calls>=3);
  assert.ok(results.find(item=>item.id===1819)?.eligible);
});
test('catalog snapshot reports empty results without guessing IDs', () => {
  sandbox.document={body:{},querySelectorAll:()=>[],querySelector:()=>null};
  const info=catalogSearchSnapshot();
  assert.equal(info.rawRadios,0);
  assert.equal(info.searchOpen,false);
});
