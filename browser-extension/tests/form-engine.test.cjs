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
  '  window.__test = { norm, optionAliases, formatTitle, fieldLabelMatches, desiredGender, categoryScore, fieldSearchInput, catalogRadioOptions };\n' + register);
const sandbox = {
  window: {},
  chrome: { runtime: { onMessage: { addListener() {} } } }
};
vm.runInNewContext(instrumented, sandbox, { filename: 'content-vinted.js' });
const { norm, optionAliases, formatTitle, fieldLabelMatches, desiredGender, categoryScore, fieldSearchInput } = sandbox.window.__test;
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


test('catalog radios resolve adult categories, not baby or unrelated subtypes', () => {
  const build=(id,name,trail)=>{
    const row={
      id:'',tagName:'LI',isConnected:true,
      innerText:name+' '+trail,parentElement:null,
      getClientRects(){return [1];},closest(){return null;},
      getAttribute(){return '';}
    };
    return {
      radio:{id:'catalog-search-'+id+'-radio',closest(){return row;}},
      label:{innerText:name,textContent:name}
    };
  };
  const items=[
    build(1559,'Jeans','Kinder Mädchen'),
    build(1696,'Jeans','Kinder Jungen'),
    build(1818,'Jeans mit enger Passform','Herren'),
    build(257,'Jeans','Herren Hosen'),
    build(183,'Jeans','Damen Hosen')
  ];
  sandbox.document={
    body:{},
    querySelectorAll(selector){
      return selector.startsWith('input[id^=')?items.map(item=>item.radio):[];
    },
    querySelector(selector){
      const match=selector.match(/catalog-search-(\d+)-radio/);
      return match ? items.find(item=>item.radio.id==='catalog-search-'+match[1]+'-radio')?.label||null : null;
    }
  };
  sandbox.getComputedStyle=()=>({display:'block',visibility:'visible'});
  const men=sandbox.window.__test.catalogRadioOptions('jeans','men');
  const women=sandbox.window.__test.catalogRadioOptions('jeans','women');
  assert.ok(men.find(item=>item.id===257)?.eligible);
  assert.ok(women.find(item=>item.id===183)?.eligible);
  assert.equal(men.find(item=>item.id===1559)?.eligible,false);
  assert.equal(men.find(item=>item.id===1696)?.eligible,false);
  assert.equal(men.find(item=>item.id===1818)?.eligible,false);
});
