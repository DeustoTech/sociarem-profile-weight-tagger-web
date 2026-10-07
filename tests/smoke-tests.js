'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({console});
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context, {filename:'data.js'});

const snapshot = vm.runInContext(`(() => {
  const active = INDICATOR_CATALOG.filter(ind => ind.active);
  const zero = normalizeWeights({a:0,b:2}, ['a','b']);
  const allZero = normalizeWeights({a:0,b:0}, ['a','b']);
  const parity = runParityTests();
  const scoreWithZeros = scoreHousehold(HOUSEHOLDS[0], Object.fromEntries(PROFILES.P1.weight_keys.map(k => [k,0])), 'P1', DEFAULT_THRESHOLDS);
  return {
    activeCount: active.length,
    i13Active: INDICATOR_CATALOG.find(ind => ind.id === 'I13').active,
    i14Active: INDICATOR_CATALOG.find(ind => ind.id === 'I14').active,
    i19Active: INDICATOR_CATALOG.find(ind => ind.id === 'I19').active,
    zero, allZero, parity, scoreWithZeros,
  };
})()`, context);

assert.equal(snapshot.activeCount, 24, 'V3.0 must expose 24 active indicators');
assert.equal(snapshot.i13Active, true);
assert.equal(snapshot.i14Active, true);
assert.equal(snapshot.i19Active, false, 'I19 remains only for historical traceability');
assert.equal(snapshot.zero.a, 0, 'an explicit zero weight must remain zero');
assert.equal(snapshot.zero.b, 1);
assert.deepEqual({...snapshot.allZero}, {a:0,b:0});
assert.equal(snapshot.scoreWithZeros, 0);
assert.equal(snapshot.parity.failed, 0, 'existing score parity must remain intact');
assert.equal(snapshot.parity.passed, 60);

console.log('✓ Smoke tests: catalog V3.0, zero weights and 60 parity cases');
