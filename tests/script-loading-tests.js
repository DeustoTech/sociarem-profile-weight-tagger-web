'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const localScripts = [...html.matchAll(/<script src="([^"]+)"/g)]
  .map(match => match[1])
  .filter(src => !/^https?:/.test(src));

for (const src of localScripts) assert.equal(fs.existsSync(path.join(root, src)), true, `Missing script: ${src}`);

const localStorageData = new Map();
const context = vm.createContext({
  console,
  document:{
    getElementById:()=>({innerHTML:'',style:{},setAttribute(){},removeAttribute(){},classList:{add(){},remove(){},toggle(){}},focus(){}}),
    addEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    createElement(){ return {click(){},style:{}}; },
    body:{appendChild(){}},
    documentElement:{lang:'es'},
  },
  localStorage:{getItem:key=>localStorageData.get(key) ?? null,setItem:(key,value)=>localStorageData.set(key,String(value))},
  setTimeout, clearTimeout,
});
context.window = context;

for (const src of localScripts) vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, {filename:src});

const exposed = vm.runInContext(`({
  renderProfileBuilder:typeof renderProfileBuilder,
  validateProfileDefinition:typeof validateProfileDefinition,
  evaluateExpression:typeof evaluateExpression,
  validateExpression:typeof validateExpression,
  findDependencyCycle:typeof findDependencyCycle,
  serializeIndicatorDefinition:typeof serializeIndicatorDefinition,
  renderPhase1:typeof renderPhase1,
  renderExpertConsensus:typeof renderExpertConsensus
})`, context);

for (const [name, type] of Object.entries(exposed)) assert.equal(type, 'function', `${name} must load as a function`);
const renderedProfileBuilder = vm.runInContext(`(() => {
  state.role = 'methodology';
  const area = {innerHTML:''};
  renderProfileBuilder(area);
  return area.innerHTML;
})()`, context);
assert.match(renderedProfileBuilder, /Construcción de perfiles/);
assert.match(renderedProfileBuilder, /Regla activadora/);
assert.match(renderedProfileBuilder, /Variables que ponderarán/);
assert.equal(vm.runInContext(`Object.keys(I18N_MESSAGES.es).every(key => key in I18N_MESSAGES.it && key in I18N_MESSAGES.en)`, context), true);
assert.equal(vm.runInContext(`(setLanguage('it'), tr('builder.title'))`, context), 'Costruzione dei profili');
assert.equal(vm.runInContext(`(setLanguage('en'), tr('builder.title'))`, context), 'Profile construction');
assert.deepEqual(localScripts, [
  'i18n.js','data.js','indicator-units.js','indicator-expression.js','indicator-evaluator.js',
  'indicator-dependencies.js','indicator-serialization.js','profile-definitions.js','app.js','profile-builder.js',
]);

console.log('✓ Script order, references and phase entry points are consistent');
