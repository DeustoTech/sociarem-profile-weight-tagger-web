'use strict';

// Comprueba que las vistas operativas se traducen por completo y que los
// hogares que no activan un perfil no se pueden etiquetar.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const localScripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(src => !/^https?:/.test(src));

const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {id,innerHTML:'',textContent:'',value:'',checked:false,style:{},dataset:{},className:'',setAttribute(){},removeAttribute(){},hasAttribute(){ return false; },classList:{add(){},remove(){},toggle(){}},focus(){},select(){},parentElement:{style:{}}});
  return elements.get(id);
};
const storage = new Map();
const context = vm.createContext({
  console,
  document:{getElementById:element,addEventListener(){},querySelector(){ return null; },querySelectorAll(){ return []; },createElement(){ return {click(){},style:{}}; },body:{appendChild(){}},documentElement:{lang:'es'},title:''},
  localStorage:{getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,String(value))},
  setTimeout:fn=>{ fn(); return 0; }, clearTimeout(){}, requestAnimationFrame(){},
});
context.window = context;
for (const src of localScripts) vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, {filename:src});

// 1. Todas las claves existen en los tres idiomas.
assert.equal(vm.runInContext(`['it','en'].every(l => Object.keys(I18N_MESSAGES.es).every(k => k in I18N_MESSAGES[l]))`, context), true);

// 2. Rol demo con todos los permisos.
assert.deepEqual(vm.runInContext(`(() => { const r = DEMO_ROLES.demo; return [r.canEditIndicators, r.canEvaluate, r.canFacilitate].join(); })()`, context), "true,true,true");

// 3. 20 hogares sintéticos con etiquetas de referencia para P1–P6.
assert.equal(vm.runInContext('HOUSEHOLDS.length', context), 20);
assert.equal(vm.runInContext(`HOUSEHOLDS.every(h => ['P1','P2','P3','P4','P5','P6'].every(p => Number.isInteger(h.gt[p])))`, context), true);

// 4. Los hogares no activados no se etiquetan.
const activation = vm.runInContext(`(() => {
  state.username = 'test'; state.role = 'demo'; state.workflowStage = 'expert-evaluation'; state.activeProfile = 'P5';
  const inactive = HOUSEHOLDS.find(h => !isProfileActiveFor(h, 'P5'));
  const active = HOUSEHOLDS.find(h => isProfileActiveFor(h, 'P5'));
  state.activeHouseholdIndex = HOUSEHOLDS.indexOf(inactive);
  setExpertLabel(inactive.id, 3);
  autoAssignAllProfiles();
  const leaked = Object.keys(PROFILES).some(pid => HOUSEHOLDS.some(h => !isProfileActiveFor(h, pid) && state.profiles[pid].expertLabels[h.id] !== undefined));
  const area = {innerHTML:''};
  renderPhase1(area);
  return {inactiveLabel: state.profiles.P5.expertLabels[inactive.id], activeLabelled: state.profiles.P5.expertLabels[active.id] !== undefined, leaked, html: area.innerHTML, activeCounts: Object.fromEntries(Object.keys(PROFILES).map(p => [p, activeHouseholdsFor(p).length]))};
})()`, context);
assert.equal(activation.inactiveLabel, undefined);
assert.equal(activation.activeLabelled, true);
assert.equal(activation.leaked, false);
assert.match(activation.html, /validation-inactive/);
assert.doesNotMatch(activation.html, /ordinal-btn/);
for (const [profile, count] of Object.entries(activation.activeCounts)) assert.ok(count >= 7, `${profile} needs enough activated households (${count})`);

// 5. Ninguna vista operativa muestra castellano en IT/EN.
const spanish = /\b(Hogar|hogares|Evaluación|Progreso|Etiquet|Propuestas|Salvaguardas|Resultado esperado|Quién participa|Pesos|Versiones|Guardar|Cargar|Datos demo|Subir|Descargar|Sin etiquetar|Nivel|Experto|Volver|Optimizar|Dispersión|Comparación|Ninguno|Vulnerabilidad|Adecuada|Aislamiento|mes\b|año)/;
const renderViews = language => vm.runInContext(`(() => {
  setLanguage('${language}');
  const out = [];
  const area = {innerHTML:''};
  state.activeProfile = 'P1';
  state.activeHouseholdIndex = HOUSEHOLDS.findIndex(h => isProfileActiveFor(h, 'P1'));
  state.workflowStage = 'expert-evaluation';
  ps().phase = 1; renderPhase1(area); out.push(area.innerHTML);
  state.activeHouseholdIndex = HOUSEHOLDS.findIndex(h => !isProfileActiveFor(h, 'P1'));
  renderPhase1(area); out.push(area.innerHTML);
  renderSidebar(); out.push(document.getElementById('sidebar-list').innerHTML, document.getElementById('sidebar-bottom').innerHTML);
  renderHouseholdHeader(); out.push(document.getElementById('household-header').innerHTML);
  renderDataPanel(); out.push(document.getElementById('data-panel').innerHTML);
  ps().phase = 2; renderPhase2(area); out.push(area.innerHTML); ps().phase = 1;
  loadSyntheticConsensus(); renderExpertConsensus(area); out.push(area.innerHTML);
  for (const stage of WORKFLOW_STAGES.filter(s => !s.implemented)) { renderFutureStage(area, stage); out.push(area.innerHTML); state.workflowStage = stage.id; renderWorkflowSidebar(); out.push(document.getElementById('sidebar-list').innerHTML); }
  state.workflowStage = 'expert-evaluation';
  for (const key of Object.keys(INDICATOR_DEFS)) out.push(translatedIndicatorDisplay(key, HOUSEHOLDS[0], DEFAULT_THRESHOLDS, '?'), translatedIndicatorDetails(key, '', '').definition);
  return out.join('\\n');
})()`, context);
for (const language of ['it','en']) {
  const rendered = renderViews(language).replace(/HOG-\d+/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const match = rendered.match(spanish);
  assert.equal(match, null, `${language}: Spanish text found → "${match && rendered.slice(Math.max(0, match.index - 60), match.index + 60)}"`);
}

console.log('✓ i18n of operational views, demo role, 20 households and activation-gated labelling');
