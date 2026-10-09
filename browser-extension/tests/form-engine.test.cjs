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
  '  window.__test = { norm, optionAliases, formatTitle, fieldLabelMatches, desiredGender, categoryScore, fieldSearchInput, runSequentialSteps, FIELD_ORDER };\n' + register);
const sandbox = {
  window: {},
  chrome: { runtime: { onMessage: { addListener() {} } } }
};
vm.runInNewContext(instrumented, sandbox, { filename: 'content-vinted.js' });
const { norm, optionAliases, formatTitle, fieldLabelMatches, desiredGender, categoryScore, fieldSearchInput, runSequentialSteps, FIELD_ORDER } = sandbox.window.__test;
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
