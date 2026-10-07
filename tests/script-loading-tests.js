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
    createElement(){ return {click(){},style:{}}; },
    body:{appendChild(){}},
  },
  localStorage:{getItem:key=>localStorageData.get(key) ?? null,setItem:(key,value)=>localStorageData.set(key,String(value))},
  setTimeout, clearTimeout,
});
context.window = context;

for (const src of localScripts) vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, {filename:src});

const exposed = vm.runInContext(`({
  renderIndicatorBuilder:typeof renderIndicatorBuilder,
  evaluateExpression:typeof evaluateExpression,
  validateExpression:typeof validateExpression,
  findDependencyCycle:typeof findDependencyCycle,
  serializeIndicatorDefinition:typeof serializeIndicatorDefinition,
  renderPhase1:typeof renderPhase1,
  renderExpertConsensus:typeof renderExpertConsensus
})`, context);

for (const [name, type] of Object.entries(exposed)) assert.equal(type, 'function', `${name} must load as a function`);
assert.deepEqual(localScripts, [
  'data.js','indicator-units.js','indicator-expression.js','indicator-evaluator.js',
  'indicator-dependencies.js','indicator-serialization.js','app.js','indicator-builder.js',
]);

console.log('✓ Script order, references and phase entry points are consistent');
