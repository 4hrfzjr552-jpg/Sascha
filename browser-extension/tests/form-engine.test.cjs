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
  '  window.__test = { norm, optionAliases, formatTitle, fieldLabelMatches };\n' + register);
const sandbox = {
  window: {},
  chrome: { runtime: { onMessage: { addListener() {} } } }
};
vm.runInNewContext(instrumented, sandbox, { filename: 'content-vinted.js' });
const { norm, optionAliases, formatTitle, fieldLabelMatches } = sandbox.window.__test;
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
