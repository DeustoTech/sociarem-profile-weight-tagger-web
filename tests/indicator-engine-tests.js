'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({console});
for (const file of ['data.js','indicator-units.js','indicator-expression.js','indicator-evaluator.js','indicator-dependencies.js','indicator-serialization.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
}

const result = vm.runInContext(`(() => {
  const constant = (value, unit = '1', dataType = 'number') => ({type:'constant', value, unit, dataType});
  const raw = (id, label, unit = '1') => ({type:'rawInput', inputId:id, field:id, label, source:'test', dataType:'number', unit});
  const add = {type:'add', operands:[constant(2),constant(3)]};
  const nested = {type:'percent', operands:[{type:'divide', operands:[
    {type:'add', operands:[raw('electricity','Electricity cost','EUR'),raw('gas','Gas cost','EUR')]},
    raw('income','Income','EUR'),
  ]}]};
  const comparison = {type:'and', operands:[
    {type:'gt', operands:[constant(8),constant(5)]},
    {type:'or', operands:[{type:'constant',dataType:'boolean',value:false,unit:'1'},{type:'constant',dataType:'boolean',value:true,unit:'1'}]},
  ]};
  const conditional = {type:'if', operands:[comparison,constant(1),constant(0)]};
  const lazyConditional = {type:'if', operands:[{type:'constant',dataType:'boolean',value:true,unit:'1'},constant(7),{type:'divide',operands:[constant(1),constant(0)]}]};
  const invalidLogic = {type:'and', operands:[constant(1),constant(2)]};
  const invalidUnits = {type:'add', operands:[constant(1,'EUR'),constant(2,'kWh')]};
  const dependencyExpression = {type:'sum',operands:[
    {type:'indicatorRef',indicatorId:'I1',dataType:'number',unit:'EUR'},
    {type:'indicatorRef',indicatorId:'I5',dataType:'number',unit:'EUR'},
  ]};
  const definitions = {
    I1:createIndicatorDefinition(INDICATOR_CATALOG.find(i=>i.id==='I1'), {type:'indicatorRef',indicatorId:'I3',dataType:'number',unit:'%'}),
    I3:createIndicatorDefinition(INDICATOR_CATALOG.find(i=>i.id==='I3'), {type:'indicatorRef',indicatorId:'I8',dataType:'boolean',unit:'1'}),
    I8:createIndicatorDefinition(INDICATOR_CATALOG.find(i=>i.id==='I8'), {type:'indicatorRef',indicatorId:'I1',dataType:'number',unit:'EUR'}),
  };
  const resolvableDefinitions = {
    I1:createIndicatorDefinition(INDICATOR_CATALOG.find(i=>i.id==='I1'), constant(10,'EUR')),
    I3:createIndicatorDefinition(INDICATOR_CATALOG.find(i=>i.id==='I3'), {type:'add',operands:[{type:'indicatorRef',indicatorId:'I1',dataType:'number',unit:'EUR'},constant(2,'EUR')]}),
  };
  const definition = createIndicatorDefinition(INDICATOR_CATALOG.find(i=>i.id==='I3'), nested, {author:'test'});
  const serialized = serializeIndicatorDefinition(definition);
  const deserialized = deserializeIndicatorDefinition(serialized);
  const legacy = migrateLegacyRules({id:'I3',name:'Legacy',type:'Booleano',unit:'1',sensitivity:'Media',sources:'test',formula:'legacy',rules:[
    {connector:'AND',field:'I1',operator:'lt',threshold:1000,sample:800},
    {connector:'OR',field:'I3',operator:'gt',threshold:10,sample:12},
  ]});
  let divideByZero;
  try { evaluateExpression({type:'divide',operands:[constant(1),constant(0)]}); } catch (error) { divideByZero = error.code; }
  return {
    addition:evaluateExpression(add).value,
    nested:evaluateExpression(nested,{raw:{electricity:1200,gas:600,income:18000}}),
    comparison:evaluateExpression(comparison).value,
    conditional:evaluateExpression(conditional).value,
    lazyConditional:evaluateExpression(lazyConditional).value,
    resolvedDependency:evaluateIndicatorDefinition('I3',resolvableDefinitions).value,
    dependencies:extractIndicatorDependencies(dependencyExpression),
    cycle:findDependencyCycle(buildIndicatorDependencyGraph(definitions)),
    invalidLogic:validateExpression(invalidLogic,{indicatorCatalog:INDICATOR_CATALOG}).valid,
    invalidUnits:validateExpression(invalidUnits,{indicatorCatalog:INDICATOR_CATALOG}),
    divideByZero,
    roundTripEqual:JSON.stringify(definition) === JSON.stringify(deserialized),
    roundTripValue:evaluateExpression(deserialized.expression,{raw:{electricity:1200,gas:600,income:18000}}).value,
    legacyRoot:legacy.expression.type,
    legacyPreserved:!!legacy.legacyDefinition,
    seedIds:Object.keys(seededIndicatorDefinitions()).sort(),
    seedValidation:Object.values(seededIndicatorDefinitions()).map(def => validateExpression(def.expression,{indicatorCatalog:INDICATOR_CATALOG,output:def.output}).valid),
  };
})()`, context);

assert.equal(result.addition, 5);
assert.equal(result.nested.value, 10);
assert.equal(result.nested.trace.length, 4);
assert.equal(result.comparison, true);
assert.equal(result.conditional, 1);
assert.equal(result.lazyConditional, 7);
assert.equal(result.resolvedDependency, 12);
assert.deepEqual([...result.dependencies], ['I1','I5']);
assert.deepEqual([...result.cycle], ['I1','I3','I8','I1']);
assert.equal(result.invalidLogic, false);
assert.equal(result.invalidUnits.valid, false);
assert.equal(result.divideByZero, 'DIVIDE_BY_ZERO');
assert.equal(result.roundTripEqual, true);
assert.equal(result.roundTripValue, 10);
assert.equal(result.legacyRoot, 'or');
assert.equal(result.legacyPreserved, true);
assert.deepEqual([...result.seedIds], ['I2','I8']);
assert.deepEqual([...result.seedValidation], [true,true]);

console.log('✓ Indicator engine: arithmetic, logic, IF, units, dependencies, cycles, errors and JSON round-trip');
