'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const storage = new Map();
const context = vm.createContext({
  console,
  localStorage:{getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,String(value))},
});

for (const file of ['data.js','indicator-units.js','indicator-expression.js','indicator-evaluator.js','indicator-dependencies.js','profile-definitions.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
}

const result = vm.runInContext(`(() => {
  const definitions = seedProfileDefinitions();
  const scores = {
    safeEconomic:scoreHousehold(HOUSEHOLDS[7],PROFILES.P1.init_weights,'P1',DEFAULT_THRESHOLDS),
    hiddenPoverty:scoreHousehold(HOUSEHOLDS[2],PROFILES.P3.init_weights,'P3',DEFAULT_THRESHOLDS),
    housing:scoreHousehold(HOUSEHOLDS[5],PROFILES.P2.init_weights,'P2',DEFAULT_THRESHOLDS),
    fragility:scoreHousehold(HOUSEHOLDS[3],PROFILES.P4.init_weights,'P4',DEFAULT_THRESHOLDS),
    territorial:scoreHousehold(HOUSEHOLDS[1],PROFILES.P5.init_weights,'P5',DEFAULT_THRESHOLDS),
    community:scoreHousehold(HOUSEHOLDS[8],PROFILES.P6.init_weights,'P6',DEFAULT_THRESHOLDS),
  };
  const roundTrip = deserializeProfileDefinition(serializeProfileDefinition(definitions.P3));
  return {
    ids:Object.keys(definitions),
    validations:Object.values(definitions).map(validateProfileDefinition),
    p1Primary:definitions.P1.methodology.primaryIndicators,
    p1ZeroWeights:{I2:PROFILES.P1.init_weights.I2,I22:PROFILES.P1.init_weights.I22},
    p6Pending:definitions.P6.methodology.pendingIndicators,
    p5Cautions:definitions.P5.methodology.cautions,
    p3ActivationRoot:definitions.P3.activationExpression.type,
    roundTripEqual:JSON.stringify(definitions.P3) === JSON.stringify(roundTrip),
    scores,
  };
})()`, context);

assert.deepEqual([...result.ids], ['P1','P2','P3','P4','P5','P6']);
assert.equal(result.validations.every(item => item.valid), true);
assert.deepEqual([...result.p1Primary], ['I1','I2']);
assert.deepEqual({...result.p1ZeroWeights}, {I2:0,I22:0});
assert.deepEqual([...result.p6Pending], ['I13','I14']);
assert.equal(result.p5Cautions.some(text => text.includes('I19')), true);
assert.equal(result.p3ActivationRoot, 'and');
assert.equal(result.roundTripEqual, true);
assert.equal(result.scores.safeEconomic, 0);
assert.ok(result.scores.hiddenPoverty > 0);
assert.ok(result.scores.housing > 0);
assert.ok(result.scores.fragility > 0);
assert.ok(result.scores.territorial > 0);
assert.ok(result.scores.community > 0);

console.log('✓ Profile engine: six documented defaults, activation gates, expert weights and JSON round-trip');
