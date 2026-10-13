'use strict';

// ─── Estado global ────────────────────────────────────────────────────────────

const state = {
  username: '',
  role: 'demo',
  workflowStage: 'expert-evaluation',
  selectedIndicatorId: 'I1',
  selectedProfileDefinitionId: 'P1',
  thresholds: {...DEFAULT_THRESHOLDS},
  activeProfile: 'P1',
  activeHouseholdIndex: 0,
  showReferenceLabels: false,
  hasGT: true,
  datasetFile: null,
  searchText: '',
  filteredIndices: HOUSEHOLDS.map((_, i) => i),
  profiles: Object.fromEntries(
    Object.keys(PROFILES).map(p => [p, {
      phase: 1,
      expertLabels: {},
      optimizedWeights: null,
      liveWeights: null,
    }])
  ),
  _autoTimer: null,
};

const ps  = () => state.profiles[state.activeProfile];
const pd  = () => PROFILES[state.activeProfile];
const T   = () => state.thresholds;
const hhA = () => HOUSEHOLDS[state.activeHouseholdIndex];
const roleDef = () => DEMO_ROLES[state.role] || DEMO_ROLES.observer;

const CONSENSUS_SUBMISSIONS_KEY = 'sociarem_consensus_submissions_v1';
const CONSENSUS_CANDIDATES_KEY = 'sociarem_consensus_candidates_v1';

function canEditIndicators() { return !!roleDef().canEditIndicators; }
function canEditProfiles() { return !!roleDef().canEditIndicators; }
function canEvaluate() { return !!roleDef().canEvaluate; }
function canFacilitate() { return !!roleDef().canFacilitate; }

function datasetLabelText() {
  return state.datasetFile
    ? trf('data.fileLabel', {file:state.datasetFile, n:HOUSEHOLDS.length})
    : trf('data.demoLabel', {n:HOUSEHOLDS.length});
}

// ─── Activación del perfil por hogar ─────────────────────────────────────────
// Un hogar solo se etiqueta en los perfiles cuya regla activadora devuelve TRUE.

function isProfileActiveFor(hh, profileId = state.activeProfile) {
  const def = PROFILES[profileId];
  if (!hh || !def?.activation_expression || typeof evaluateExpression !== 'function') return true;
  try {
    return Boolean(evaluateExpression(def.activation_expression, profileEvaluationContext(hh, {}, profileId, T())).value);
  } catch (error) {
    return true;
  }
}

function activeHouseholdsFor(profileId = state.activeProfile) {
  return HOUSEHOLDS.filter(hh => isProfileActiveFor(hh, profileId));
}

// Etiquetas válidas: solo las de hogares que activan el perfil.
function activeExpertLabels(profileId = state.activeProfile) {
  const labels = state.profiles[profileId]?.expertLabels || {};
  const out = {};
  for (const hh of HOUSEHOLDS) if (labels[hh.id] !== undefined && isProfileActiveFor(hh, profileId)) out[hh.id] = labels[hh.id];
  return out;
}

function profileActivationText(profileId) {
  const def = PROFILES[profileId];
  if (!def?.activation_expression || typeof profileActivationFormula !== 'function') return '';
  return profileActivationFormula(def.activation_expression);
}

function ensureProfileState(profileId) {
  if (!state.profiles[profileId]) state.profiles[profileId] = {phase:1,expertLabels:{},optimizedWeights:null,liveWeights:null};
  return state.profiles[profileId];
}

function profileHasReferenceLabels(profileId) {
  return HOUSEHOLDS.some(hh => hh.gt && Number.isInteger(hh.gt[profileId]));
}

function changeLanguage(language) {
  setLanguage(language);
  const main = document.getElementById('main-screen');
  if (main && !main.hasAttribute('hidden')) renderAll();
}

function currentWeights() {
  const s   = ps();
  const base = s.liveWeights || s.optimizedWeights || {...pd().init_weights};
  return normalizeWeights(base, pd().weight_keys);
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const tipEl = document.getElementById('tooltip');
function showTip(anchor, html) {
  tipEl.innerHTML = html;
  tipEl.removeAttribute('hidden');
  const r = anchor.getBoundingClientRect();
  let left = r.right + 8, top = r.top;
  tipEl.style.left = left + 'px';
  tipEl.style.top  = top  + 'px';
  requestAnimationFrame(() => {
    const tr = tipEl.getBoundingClientRect();
    if (tr.right  > window.innerWidth  - 8) tipEl.style.left = (r.left - tr.width - 8) + 'px';
    if (tr.bottom > window.innerHeight - 8) tipEl.style.top  = (window.innerHeight - tr.height - 8) + 'px';
  });
}
function hideTip() { tipEl.setAttribute('hidden', ''); }

// ─── Login ────────────────────────────────────────────────────────────────────

function showLoginScreen() {
  document.getElementById('login-screen').removeAttribute('hidden');
  document.getElementById('main-screen').setAttribute('hidden', '');
  const saved = localStorage.getItem('sociarem_username');
  const inp   = document.getElementById('login-username');
  if (saved && inp) inp.value = saved;
  const role = document.getElementById('login-role');
  if (role) role.value = localStorage.getItem('sociarem_role') || state.role;
  if (inp) inp.focus();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute('hidden');
}

function hideLoginError() {
  const el = document.getElementById('login-error');
  if (el) el.setAttribute('hidden', '');
}

function enterApp() {
  const inp      = document.getElementById('login-username');
  const passInp  = document.getElementById('login-password');
  const username = inp ? inp.value.trim() : '';
  const password = passInp ? passInp.value : '';
  const selectedRole = document.getElementById('login-role')?.value || 'demo';

  if (!username) {
    showLoginError(tr('login.errUser'));
    if (inp) inp.focus();
    return;
  }
  if (password !== APP_PASSWORD) {
    showLoginError(tr('login.errPassword'));
    if (passInp) { passInp.focus(); passInp.select(); }
    return;
  }
  hideLoginError();
  state.username = username;
  state.role = DEMO_ROLES[selectedRole] ? selectedRole : 'observer';
  state.workflowStage = ['methodology','demo'].includes(state.role)
    ? 'profile-builder'
    : state.role === 'facilitator' ? 'expert-consensus' : 'expert-evaluation';
  localStorage.setItem('sociarem_username', username);
  localStorage.setItem('sociarem_role', state.role);
  if (passInp) passInp.value = '';
  document.getElementById('login-screen').setAttribute('hidden', '');
  document.getElementById('main-screen').removeAttribute('hidden');
  buildMainScreen();
  runParityTests();
}

function changeUser() {
  document.getElementById('main-screen').setAttribute('hidden', '');
  document.getElementById('login-screen').removeAttribute('hidden');
  hideLoginError();
  const inp = document.getElementById('login-username');
  const passInp = document.getElementById('login-password');
  if (inp) { inp.value = state.username || localStorage.getItem('sociarem_username') || ''; }
  const role = document.getElementById('login-role');
  if (role) role.value = state.role;
  if (passInp) passInp.value = '';
  if (passInp) passInp.focus(); else if (inp) inp.focus();
}

// ─── Construcción principal ───────────────────────────────────────────────────

function buildMainScreen() {
  renderTopbar();
  renderWorkflowBar();
  renderDataPanel();
  renderSidebar();
  renderAll();
}

function renderAll() {
  applySearch();
  renderDataPanel();
  renderTopbar();
  renderWorkflowBar();
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function renderTopbar() {
  const wrap = document.getElementById('profile-buttons');
  if (wrap) {
    wrap.innerHTML = Object.entries(PROFILES).map(([pid, def]) => `
      <button class="profile-btn ${state.activeProfile === pid ? 'active' : ''}"
              style="${state.activeProfile === pid ? `background:${def.color}` : ''}"
              onclick="switchProfile('${pid}')">${pid} · ${escHtml(translatedProfileField(pid,'short',def.short))}</button>
    `).join('');
  }
  const userEl = document.getElementById('topbar-user');
  if (userEl) userEl.textContent = state.username;
  const roleEl = document.getElementById('topbar-role');
  if (roleEl) roleEl.textContent = tr(`role.${state.role}`, roleDef().label);
  const profileWrap = document.getElementById('profile-selector-wrap');
  const profileContext = ['expert-evaluation', 'expert-consensus'].includes(state.workflowStage);
  if (profileWrap) profileWrap.style.display = profileContext ? '' : 'none';
  const refWrap = document.getElementById('ref-toggle-wrap');
  if (refWrap) refWrap.style.display = state.workflowStage === 'expert-evaluation' && profileHasReferenceLabels(state.activeProfile) ? '' : 'none';
  const expertContext = state.workflowStage === 'expert-evaluation';
  const dataPanel = document.getElementById('data-panel');
  const search = document.getElementById('search-input');
  if (dataPanel) dataPanel.style.display = expertContext ? '' : 'none';
  if (search?.parentElement) search.parentElement.style.display = expertContext ? '' : 'none';
  const searchHint = document.querySelector('.sidebar-search-hint');
  if (searchHint) searchHint.style.display = expertContext ? '' : 'none';
}

function renderWorkflowBar() {
  const bar = document.getElementById('workflow-bar');
  if (!bar) return;
  bar.innerHTML = WORKFLOW_STAGES.map((stage, index) => {
    const active = stage.id === state.workflowStage;
    const future = !stage.implemented;
    const status = translatedWorkflowField(stage,'state');
    return `<button class="workflow-step ${active ? 'active' : ''} ${future ? 'future' : ''}"
      onclick="switchWorkflowStage('${stage.id}')" title="${escHtml(translatedWorkflowField(stage,'description'))}">
      <span class="workflow-step-number">${index}</span>
      <span class="workflow-step-copy"><span class="workflow-step-title">${escHtml(translatedWorkflowField(stage,'short'))}</span><span class="workflow-step-state">${escHtml(status)}</span></span>
    </button>`;
  }).join('');
}

function switchWorkflowStage(stageId) {
  if (!WORKFLOW_STAGES.some(s => s.id === stageId)) return;
  state.workflowStage = stageId;
  renderAll();
}

function switchProfile(pid) {
  ensureProfileState(pid);
  state.activeProfile = pid;
  renderTopbar();
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
}

function toggleRefLabels() {
  if (!state.hasGT || !profileHasReferenceLabels(state.activeProfile)) {
    document.getElementById('ref-toggle-check').checked = false;
    return;
  }
  state.showReferenceLabels = document.getElementById('ref-toggle-check').checked;
  renderSidebar();
  renderHouseholdHeader();
  if (ps().phase === 1) renderContentArea();
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function applySearch() {
  const q = state.searchText.trim().toLowerCase();
  state.filteredIndices = HOUSEHOLDS.reduce((arr, hh, i) => {
    if (!q || hh.nombre.toLowerCase().includes(q) || translatedHouseholdName(hh.nombre).toLowerCase().includes(q) || hh.id.toLowerCase().includes(q)) arr.push(i);
    return arr;
  }, []);
}

function onSearch(val) {
  state.searchText = val;
  applySearch();
  renderSidebar();
}

function renderSidebar() {
  const el = document.getElementById('sidebar-profile-info');
  if (state.workflowStage !== 'expert-evaluation') {
    renderWorkflowSidebar();
    return;
  }
  if (el) { el.style.color = pd().color; el.textContent = `${state.activeProfile} · ${translatedProfileField(state.activeProfile,'short',pd().short)}`; }

  const list = document.getElementById('sidebar-list');
  if (!list) return;
  const labeled = ps().expertLabels;

  list.innerHTML = state.filteredIndices.map(i => {
    const hh  = HOUSEHOLDS[i];
    const activeProfile = isProfileActiveFor(hh);
    const lbl = activeProfile ? labeled[hh.id] : undefined;
    const lvl = lbl !== undefined ? VULNERABILITY_LEVELS[lbl] : null;
    const dotColor = lvl ? lvl.color : '#D1D5DB';
    const levelTag = !activeProfile
      ? `<span class="sidebar-level-tag sidebar-inactive-tag">${escHtml(tr('builder.inactive'))}</span>`
      : lvl
        ? `<span class="sidebar-level-tag" style="background:${lvl.color}20;color:${lvl.color}">${escHtml(levelShort(lvl.value))}</span>`
        : '';

    let refTag = '';
    if (activeProfile && state.showReferenceLabels && hh.gt) {
      const g = hh.gt[state.activeProfile];
      if (g !== undefined) refTag = `<span class="sidebar-ref-tag">(${escHtml(levelShort(g))})</span>`;
    }

    return `<button class="sidebar-item ${i === state.activeHouseholdIndex ? 'active' : ''} ${activeProfile ? '' : 'profile-inactive'}"
                onclick="selectHousehold(${i})">
        <span class="sidebar-dot" style="color:${dotColor}">${activeProfile ? '⬤' : '○'}</span>
        <span class="sidebar-item-name">${escHtml(translatedHouseholdName(hh.nombre))}</span>
        ${levelTag}${refTag}
      </button>`;
  }).join('');

  renderSidebarBottom();
}

function renderSidebarBottom() {
  const el = document.getElementById('sidebar-bottom');
  if (!el) return;
  const nLabeled = Object.keys(activeExpertLabels()).length;
  const nTotal   = activeHouseholdsFor().length;
  const nInactive = HOUSEHOLDS.length - nTotal;
  const pct      = nTotal ? Math.round(nLabeled / nTotal * 100) : 100;
  const canOpt   = canEvaluate() && nLabeled >= 3 && ps().phase === 1;
  const inPhase2 = ps().phase === 2;

  el.innerHTML = `
    <div class="sidebar-progress ${nLabeled === nTotal ? 'ok' : ''}">
      ${trf('sidebar.progress', {n:nLabeled, total:nTotal, pct})}
    </div>
    ${nInactive ? `<div class="sidebar-inactive-note">${trf('sidebar.inactiveCount', {n:nInactive})}</div>` : ''}
    ${inPhase2 ? `
      <button class="btn btn-secondary btn-sm btn-full mb-1" onclick="backToPhase1()">${tr('sidebar.backPhase1')}</button>
    ` : `
      ${state.hasGT && profileHasReferenceLabels(state.activeProfile) ? `
        <button class="btn btn-secondary btn-sm btn-full mb-1" ${canEvaluate() ? '' : 'disabled'} onclick="autoAssign(true)">▷ Auto-demo</button>
        <button class="btn btn-secondary btn-sm btn-full mb-1"
                title="${escHtml(tr('sidebar.assignAllTitle'))}"
                ${canEvaluate() ? '' : 'disabled'} onclick="autoAssignAllProfiles()">${trf('sidebar.assignAll', {n:Object.keys(PROFILES).length})}</button>
      ` : ''}
      ${canOpt
        ? `<button class="btn btn-accent2 btn-sm btn-full" onclick="runOptimization()">${tr('sidebar.optimize')}</button>`
        : `<button class="btn btn-secondary btn-sm btn-full" disabled title="${escHtml(tr('sidebar.needThree'))}">${tr('sidebar.optimize')}</button>`}
    `}
  `;
}

function renderWorkflowSidebar() {
  const info = document.getElementById('sidebar-profile-info');
  const list = document.getElementById('sidebar-list');
  const bottom = document.getElementById('sidebar-bottom');
  const stage = WORKFLOW_STAGES.find(s => s.id === state.workflowStage);
  if (info) {
    info.style.color = 'var(--accent2)';
    info.textContent = stage ? translatedWorkflowField(stage,'short') : tr('role.methodology','Metodología');
  }
  if (!list || !bottom) return;

  if (state.workflowStage === 'profile-builder') {
    const definitions = readProfileDefinitions();
    list.innerHTML = Object.values(definitions).map(def => `
      <button class="sidebar-item ${state.selectedProfileDefinitionId === def.profileId ? 'active' : ''}" onclick="selectProfileDefinition('${def.profileId}')">
        <span class="sidebar-dot" style="color:${def.metadata.color || '#64748B'}">⬤</span>
        <span class="sidebar-item-name">${def.profileId} · ${escHtml(translatedProfileField(def.profileId,'short',def.metadata.short || def.metadata.name))}</span>
        <span class="sidebar-level-tag">${escHtml(translatedLifecycleStatus(def.status))}</span>
      </button>`).join('');
    const approved = Object.values(definitions).filter(def => def.status === 'APPROVED').length;
    bottom.innerHTML = `<div class="catalog-summary"><div class="catalog-kpi"><b>${Object.keys(definitions).length}</b><span>${tr('builder.profiles')}</span></div><div class="catalog-kpi"><b>${approved}</b><span>${tr('builder.published')}</span></div></div>
      <button class="btn btn-secondary btn-sm btn-full mb-1" ${canEditProfiles() ? '' : 'disabled'} onclick="createNewProfile()">${tr('builder.newProfile')}</button>
      <div class="permission-note">${canEditProfiles() ? tr('builder.weightsHint') : tr('builder.viewOnly')}</div>`;
    return;
  }

  if (state.workflowStage === 'expert-consensus') {
    const submissions = getConsensusSubmissions().filter(s => s.profile === state.activeProfile);
    list.innerHTML = Object.entries(PROFILES).map(([pid, def]) => {
      const n = getConsensusSubmissions().filter(s => s.profile === pid).length;
      return `<button class="sidebar-item ${state.activeProfile === pid ? 'active' : ''}" onclick="switchProfile('${pid}')">
        <span class="sidebar-dot" style="color:${def.color}">⬤</span><span class="sidebar-item-name">${pid} · ${escHtml(translatedProfileField(pid,'short',def.short))}</span>
        <span class="sidebar-level-tag">${n}</span>
      </button>`;
    }).join('');
    bottom.innerHTML = `<div class="catalog-summary"><span>${trf('cons.sidebarCount', {n:`<b>${submissions.length}</b>`, profile:state.activeProfile})}</span></div>
      <div class="permission-note">${canFacilitate() ? tr('cons.canSave') : tr('cons.cannotSave')}</div>`;
    return;
  }

  list.innerHTML = (stage ? translatedWorkflowContent(stage, 'outputs') : []).map(output => `<div class="sidebar-item"><span class="sidebar-dot" style="color:#9CA3AF">○</span><span class="sidebar-item-name">${escHtml(output)}</span></div>`).join('');
  bottom.innerHTML = `<div class="permission-note">${tr('future.sidebarNote')}</div>`;
}

function backToPhase1() {
  ps().phase = 1;
  ps().liveWeights = null;
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
}

// ─── Cabecera del hogar ───────────────────────────────────────────────────────

function renderHouseholdHeader() {
  const el  = document.getElementById('household-header');
  if (!el) return;
  if (state.workflowStage !== 'expert-evaluation') {
    const stage = WORKFLOW_STAGES.find(s => s.id === state.workflowStage);
    el.innerHTML = `<div class="stage-header"><div><div class="hh-id">${tr('common.phase')} ${WORKFLOW_STAGES.findIndex(s => s.id === state.workflowStage)}</div>
      <div class="hh-name">${escHtml(stage ? translatedWorkflowField(stage,'title') : '')}</div></div>
      <span class="stage-status ${stage?.implemented ? 'prototype' : 'future'}">${escHtml(stage ? translatedWorkflowField(stage,'state') : '')}</span></div>`;
    return;
  }
  const hh  = hhA();
  const pos   = state.filteredIndices.indexOf(state.activeHouseholdIndex);
  const total = state.filteredIndices.length;

  const activeProfile = isProfileActiveFor(hh);
  let refLine = '';
  if (activeProfile && state.showReferenceLabels && hh.gt) {
    const g = hh.gt[state.activeProfile];
    if (g !== undefined) {
      const gv = VULNERABILITY_LEVELS[g];
      refLine = `<span class="hh-ref-badge" style="color:${gv.color};border-color:${gv.color}">${gv.value} · ${escHtml(levelLabel(gv.value))}</span>`;
    }
  }
  const activationBadge = `<span class="hh-activation-badge ${activeProfile ? 'on' : 'off'}">${state.activeProfile} · ${escHtml(activeProfile ? tr('eval.activeTag') : tr('builder.inactive'))}</span>`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div>
        <div class="hh-id">${hh.id}</div>
        <div class="hh-name">${escHtml(translatedHouseholdName(hh.nombre))}</div>
      </div>
      ${activationBadge}${refLine}
      <div class="hh-nav" style="margin-left:auto">
        <button class="nav-btn" onclick="navHousehold(-1)" ${pos <= 0 ? 'disabled' : ''}>‹</button>
        <span class="nav-counter">${pos >= 0 ? pos+1 : '?'}/${total}</span>
        <button class="nav-btn" onclick="navHousehold(1)" ${pos >= total-1 ? 'disabled' : ''}>›</button>
      </div>
    </div>
  `;
}

function navHousehold(dir) {
  const fi  = state.filteredIndices;
  const pos = fi.indexOf(state.activeHouseholdIndex);
  const nxt = pos + dir;
  if (nxt >= 0 && nxt < fi.length) selectHousehold(fi[nxt]);
}

function selectHousehold(idx) {
  state.activeHouseholdIndex = idx;
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
}

// ─── Zona de contenido ────────────────────────────────────────────────────────

function renderContentArea() {
  const area = document.getElementById('content-area');
  if (!area) return;
  area.className = '';
  if (state.workflowStage === 'profile-builder') { renderProfileBuilder(area); return; }
  if (state.workflowStage === 'expert-consensus') { renderExpertConsensus(area); return; }
  if (state.workflowStage !== 'expert-evaluation') {
    renderFutureStage(area, WORKFLOW_STAGES.find(s => s.id === state.workflowStage));
    return;
  }
  if (ps().phase === 2) renderPhase2(area);
  else                  renderPhase1(area);
}

// ─── Fase 1 ───────────────────────────────────────────────────────────────────

function renderPhase1(area) {
  const hh      = hhA();
  const profDef = pd();

  const progressHtml = Object.entries(PROFILES).map(([pid, def]) => {
    const n = Object.keys(activeExpertLabels(pid)).length;
    const total = activeHouseholdsFor(pid).length;
    return `<div class="profile-progress-cell">
      <div class="profile-progress-count" style="color:${def.color}">${n}<small>/${total}</small></div>
      <div class="profile-progress-label">${pid}</div>
    </div>`;
  }).join('');

  const cards = profDef.display_keys.map(k => indicatorCard(k, hh)).join('');
  const activeProfile = isProfileActiveFor(hh);

  const lbl       = ps().expertLabels[hh.id];
  const lblStatus = lbl !== undefined
    ? `<span style="color:${VULNERABILITY_LEVELS[lbl].color};font-weight:700">✓ ${tr('eval.level')} ${lbl} · ${escHtml(levelLabel(lbl))}</span>`
    : `<span class="text-muted">${tr('eval.unlabeled')}</span>`;

  const ordinalBtns = VULNERABILITY_LEVELS.map(lvl => {
    const isActive = lbl === lvl.value;
    return `<button class="ordinal-btn ${isActive ? 'ordinal-active' : ''}"
                    style="${isActive ? `background:${lvl.color};border-color:${lvl.color};color:#fff` : ''}"
                    ${canEvaluate() ? `onclick="setExpertLabel('${hh.id}',${lvl.value})"` : 'disabled'}>
              <span class="ordinal-num">${lvl.value}</span>
              <span class="ordinal-lbl">${escHtml(levelShort(lvl.value))}</span>
            </button>`;
  }).join('');

  const nextActive = nextActiveHouseholdIndex();
  const labelCard = activeProfile
    ? `<div class="validation-card">
      <div class="validation-question">${escHtml(translatedProfileContent(state.activeProfile,'question',profDef.question))}</div>
      <div class="validation-hint">${tr('eval.hint')}</div>
      <div class="ordinal-buttons">${ordinalBtns}</div>
      <div class="validation-status">${lblStatus}</div>
    </div>`
    : `<div class="validation-card validation-inactive">
      <div class="validation-question">${tr('eval.notActiveTitle')}</div>
      <div class="validation-hint">${escHtml(trf('eval.notActiveBody', {profile:state.activeProfile, rule:profileActivationText(state.activeProfile)}))}</div>
      ${nextActive !== null ? `<div class="builder-actions"><button class="btn btn-accent2 btn-sm" onclick="selectHousehold(${nextActive})">${tr('eval.nextActive')}</button></div>` : ''}
    </div>`;

  // Progreso y etiquetado 0–4 en la misma fila superior, visibles durante el Auto-demo.
  area.innerHTML = `
    ${canEvaluate() ? '' : `<div class="permission-note mb-2">${tr('eval.readOnly')}</div>`}
    <div class="eval-top-row">
      <div class="progress-card">
        <div class="section-heading" style="margin-bottom:6px">${tr('eval.progress')} <span class="text-muted" style="font-weight:400;text-transform:none">· ${tr('eval.progressHint')}</span></div>
        <div class="progress-grid">${progressHtml}</div>
      </div>
      ${labelCard}
    </div>

    <div class="section-heading mb-2">${state.activeProfile} · ${escHtml(translatedProfileField(state.activeProfile,'short',profDef.short))}</div>
    <div class="indicator-grid mb-3">${cards}</div>
  `;
}

// Siguiente hogar (en el orden filtrado, con vuelta al principio) que activa el perfil.
function nextActiveHouseholdIndex(preferUnlabeled = false) {
  const fi = state.filteredIndices;
  const pos = fi.indexOf(state.activeHouseholdIndex);
  for (let step = 1; step < fi.length; step++) {
    // Al etiquetar solo se avanza hacia delante; el botón "siguiente" da la vuelta.
    if (preferUnlabeled && pos + step >= fi.length) break;
    const idx = fi[(pos + step) % fi.length];
    const hh = HOUSEHOLDS[idx];
    if (!isProfileActiveFor(hh)) continue;
    if (preferUnlabeled && ps().expertLabels[hh.id] !== undefined) continue;
    return idx;
  }
  return null;
}

function indicatorCard(k, hh) {
  const def        = INDICATOR_DEFS[k];
  const badgeClass = def.role === 'pri' ? 'badge-pri' : 'badge-sec';
  const roleLabel  = def.role === 'pri' ? 'PRI' : 'SEC';
  const derivedTag = def.derived ? `<span class="derived-tag">${tr('eval.derived')}</span>` : '';
  const details    = translatedIndicatorDetails(k, def.long, def.definition);
  const tipHtml    = `<b>${escHtml(details.long)}</b><br><br>${escHtml(details.definition)}<br><br><i>${escHtml(def.source)}</i>`;

  return `<div class="indicator-card">
    <div class="card-top">
      <span class="badge ${badgeClass}">${k}</span>
      <span class="role-label">${roleLabel}</span>
      ${derivedTag}
      <button class="info-btn" data-tip="${escHtml(tipHtml)}"
              onmouseenter="showTip(this,this.dataset.tip)"
              onmouseleave="hideTip()">ⓘ</button>
    </div>
    <div class="indicator-name">${escHtml(translatedIndicatorName(k,def.name))}</div>
    <div class="indicator-value">${escHtml(translatedIndicatorDisplay(k, hh, T(), def.display(hh, T())))}</div>
    <div class="indicator-note">${escHtml(translatedIndicatorCriterion(k,T(),def.note(T())))}</div>
  </div>`;
}

// ─── Etiquetado ordinal ───────────────────────────────────────────────────────

function setExpertLabel(hhId, level) {
  if (!canEvaluate()) { showNotification(tr('notify.cannotEvaluate')); return; }
  const hh = HOUSEHOLDS.find(item => item.id === hhId);
  if (!isProfileActiveFor(hh)) { showNotification(tr('notify.inactiveNoLabel')); return; }
  const wasUnlabeled = ps().expertLabels[hhId] === undefined;
  ps().expertLabels[hhId] = level;

  if (wasUnlabeled) {
    const next = nextActiveHouseholdIndex(true);
    if (next !== null) { selectHousehold(next); return; }
  }
  renderSidebar();
  renderContentArea();
}

// ─── Auto-asignación ─────────────────────────────────────────────────────────

function autoAssign(animated) {
  if (!canEvaluate()) { showNotification(tr('notify.cannotEvaluate')); return; }
  if (!state.hasGT || !profileHasReferenceLabels(state.activeProfile)) { showNotification(tr('notify.noReference')); return; }
  if (state._autoTimer) { clearTimeout(state._autoTimer); state._autoTimer = null; }
  if (animated) {
    _autoStep(0);
  } else {
    for (const hh of activeHouseholdsFor()) if (Number.isInteger(hh.gt?.[state.activeProfile])) ps().expertLabels[hh.id] = hh.gt[state.activeProfile];
    renderAll();
  }
}

// Asigna las etiquetas de referencia a TODOS los perfiles (P1–P6), no solo
// al perfil activo. Pensado para preparar la demo de un solo golpe.
function autoAssignAllProfiles() {
  if (!canEvaluate()) { showNotification(tr('notify.cannotEvaluate')); return; }
  if (!state.hasGT) { showNotification(tr('notify.noReferenceDataset')); return; }
  if (state._autoTimer) { clearTimeout(state._autoTimer); state._autoTimer = null; }
  const profileIds = Object.keys(PROFILES);
  for (const pid of profileIds) {
    const profileState = ensureProfileState(pid);
    for (const hh of HOUSEHOLDS) {
      if (Number.isInteger(hh.gt?.[pid]) && isProfileActiveFor(hh, pid)) profileState.expertLabels[hh.id] = hh.gt[pid];
    }
  }
  renderAll();
  showNotification(trf('notify.assignedAll', {n:profileIds.length}));
}

function _autoStep(i) {
  if (i >= HOUSEHOLDS.length) { renderAll(); return; }
  const hh = HOUSEHOLDS[i];
  if (!isProfileActiveFor(hh)) { _autoStep(i + 1); return; }
  if (Number.isInteger(hh.gt?.[state.activeProfile])) ps().expertLabels[hh.id] = hh.gt[state.activeProfile];
  state.activeHouseholdIndex = i;
  renderSidebar();
  renderHouseholdHeader();
  renderContentArea();
  state._autoTimer = setTimeout(() => _autoStep(i + 1), 170);
}

// ─── Optimización ─────────────────────────────────────────────────────────────

function runOptimization() {
  if (!canEvaluate()) { showNotification(tr('notify.cannotOptimize')); return; }
  if (Object.keys(activeExpertLabels()).length < 3) {
    showNotification(tr('notify.needThree'));
    return;
  }
  const btn = document.querySelector('[onclick="runOptimization()"]');
  if (btn) { btn.textContent = tr('sidebar.optimizing'); btn.disabled = true; }
  setTimeout(() => {
    const w = optimizeWeights(state.activeProfile, activeExpertLabels(), T());
    ps().optimizedWeights = w;
    ps().liveWeights = Object.fromEntries(pd().weight_keys.map(k => [k, (w[k] || 0) * 100]));
    ps().phase = 2;
    renderSidebar();
    renderHouseholdHeader();
    renderContentArea();
  }, 30);
}

// ─── Fase 2 · Layout compacto 2 columnas ─────────────────────────────────────

function renderPhase2(area) {
  const hh      = hhA();
  const w       = currentWeights();
  const profDef = pd();
  const color   = profDef.color;
  const metrics = computeOrdinalMetrics(w, state.activeProfile, activeExpertLabels(), T());
  const hhActive = isProfileActiveFor(hh);

  // Score del hogar activo
  const sc        = scoreHousehold(hh, w, state.activeProfile, T());
  const predLevel = scoreToLevel(sc);
  const predDef   = VULNERABILITY_LEVELS[predLevel];
  const expLabel  = hhActive ? ps().expertLabels[hh.id] : undefined;

  // Sliders de pesos
  const sliderRows = profDef.weight_keys.map(k => {
    const def      = INDICATOR_DEFS[k];
    const curW     = w[k] || 0;
    const initW    = profDef.init_weights[k];
    const liveRaw  = ps().liveWeights ? ps().liveWeights[k] : curW * 100;
    const sliderVal = Math.max(0, Math.round(liveRaw * 10) / 10);
    const delta    = curW - initW;
    const deltaStr = delta >= 0 ? `+${(delta*100).toFixed(1)}%` : `${(delta*100).toFixed(1)}%`;
    const dColor   = Math.abs(delta) < 0.005 ? '#9CA3AF' : delta > 0 ? '#D97706' : '#6B7280';
    return `<div class="weight-row-c ${curW === 0 ? 'excluded' : ''}" id="wrow-${k}">
      <span class="badge badge-sec wk">${k}</span>
      <span class="wname">${escHtml(translatedIndicatorName(k,def.name))}</span>
      <input type="range" class="weight-slider wslider" data-key="${k}"
             min="0" max="100" step="0.1" value="${sliderVal}" ${canEvaluate() ? 'oninput="onWeightChange()"' : 'disabled'}>
      <span class="wval" id="wval-${k}">${(curW*100).toFixed(1)}%</span>
      <span class="wdelta" id="wdelta-${k}" style="color:${dColor}">${deltaStr}</span>
    </div>`;
  }).join('');

  // Tabla compacta
  const tableRows = HOUSEHOLDS.map(h => compactTableRow(h, w)).join('');

  // Panel de versiones
  const versionsHtml = buildWeightVersionPanel();

  area.innerHTML = `
    <div class="phase-intro">
      <div><b>${tr('p2.title')}</b></div>
      <div>${tr('p2.zeroNote')}</div>
      ${canEvaluate() ? '' : `<div class="permission-note">${tr('p2.readOnly')}</div>`}
    </div>
    <div class="phase2-layout">

      <!-- Panel izquierdo -->
      <div class="phase2-left">

        <!-- Score hogar activo -->
        <div class="score-compact" id="score-compact" style="border-left-color:${predDef.color}">
          <div class="sc-label">${escHtml(translatedHouseholdName(hh.nombre))} · ${state.activeProfile}</div>
          <div class="sc-row">
            <span class="sc-pct" id="sc-pct" style="color:${predDef.color}">${(sc*100).toFixed(1)}%</span>
            <span class="sc-level" id="sc-level" style="color:${predDef.color}">${predLevel} · ${escHtml(levelLabel(predLevel))}</span>
          </div>
          ${!hhActive
            ? `<div class="sc-exp text-muted" id="sc-exp-val">${tr('p2.notActivated')}</div>`
            : expLabel !== undefined
              ? `<div class="sc-exp">${tr('p2.expert')}: <b id="sc-exp-val" style="color:${VULNERABILITY_LEVELS[expLabel].color}">${expLabel} · ${escHtml(levelLabel(expLabel))}</b></div>`
              : `<div class="sc-exp text-muted" id="sc-exp-val">${tr('eval.unlabeled')}</div>`}
        </div>

        <!-- Métricas compactas -->
        <div class="metrics-compact">
          <span class="mc-item">MAE <b id="met-mae">${metrics.mae.toFixed(2)}</b></span>
          <span class="mc-item">RMSE <b id="met-rmse">${metrics.rmse.toFixed(2)}</b></span>
          <span class="mc-item">${tr('p2.exact')} <b id="met-exact">${(metrics.exactAccuracy*100).toFixed(0)}%</b></span>
          <span class="mc-item">±1 <b id="met-within1">${(metrics.withinOneAccuracy*100).toFixed(0)}%</b></span>
          <span class="mc-item text-muted">n=${metrics.n}</span>
        </div>

        <!-- Sliders de pesos -->
        <div class="weights-compact-card">
          <div class="wc-header">
            <span style="font-size:0.82rem;font-weight:700;color:var(--accent2)">${tr('p2.weights')} · ${state.activeProfile}</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-secondary btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="resetToOptimized()">↩ opt</button>
              <button class="btn btn-secondary btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="resetToInit()">↩ ini</button>
              <button class="btn btn-secondary btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="exportWeightsJson()">↓ JSON</button>
              <button class="btn btn-secondary btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="document.getElementById('import-weights-input').click()">↑ JSON</button>
            </div>
          </div>
          <div id="weight-rows-wrap">${sliderRows}</div>
        </div>

        <!-- Versiones de pesos -->
        ${versionsHtml}

        <!-- Exportación -->
        <div class="export-row">
          <button class="btn btn-secondary btn-sm" onclick="exportResults('json')">↓ JSON</button>
          <button class="btn btn-secondary btn-sm" onclick="exportResults('csv')">↓ CSV</button>
          <label class="export-gt-label">
            <input type="checkbox" id="export-gt"> ${tr('p2.includeRef')}
          </label>
          <button class="btn btn-accent2 btn-sm" ${canEvaluate() ? '' : 'disabled'} onclick="submitExpertProposal()">${tr('p2.sendConsensus')}</button>
        </div>

      </div>

      <!-- Panel derecho: tabla de hogares -->
      <div class="phase2-right">
        <div class="ct-header">
          <span style="color:${color};font-weight:700;font-size:0.82rem">${escHtml(translatedProfileField(state.activeProfile,'name',profDef.name))}</span>
        </div>
        <div class="compact-table-header">
          <span>${tr('p2.colHousehold')}</span>
          <span>${tr('p2.colScore')}</span>
          <span>${tr('p2.colLevel')}</span>
          <span>${tr('p2.colExpert')}</span>
          <span>${tr('p2.colError')}</span>
        </div>
        <div class="compact-table" id="compact-table">${tableRows}</div>
      </div>

    </div>
  `;
}

function compactTableRow(hh, w) {
  const sc     = scoreHousehold(hh, w, state.activeProfile, T());
  const pred   = scoreToLevel(sc);
  const pDef   = VULNERABILITY_LEVELS[pred];
  const active = isProfileActiveFor(hh);
  const lbl    = active ? ps().expertLabels[hh.id] : undefined;
  const isCur  = hh.id === hhA().id;

  let lblCell = '<span class="text-muted cr-dash">—</span>';
  let errCell = '<span class="text-muted cr-dash">—</span>';
  if (lbl !== undefined) {
    const lvDef  = VULNERABILITY_LEVELS[lbl];
    lblCell = `<span style="color:${lvDef.color};font-weight:700">${lbl}</span>`;
    const err    = pred - lbl;
    const eColor = err === 0 ? '#16A34A' : Math.abs(err) === 1 ? '#D97706' : '#DC2626';
    errCell = `<span style="color:${eColor};font-weight:700">${err > 0 ? '+' : ''}${err}</span>`;
  }

  if (!active) {
    return `<div class="compact-row profile-inactive ${isCur ? 'current' : ''}" id="trow-${hh.id}" data-inactive="1"
               onclick="selectHousehold(${HOUSEHOLDS.indexOf(hh)})">
    <span class="cr-name">${escHtml(translatedHouseholdName(hh.nombre))}</span>
    <span class="cr-score text-muted">—</span>
    <span class="cr-level text-muted"><span class="cr-lt">${escHtml(tr('builder.inactive'))}</span></span>
    <span class="cr-expert">${lblCell}</span>
    <span class="cr-err">${errCell}</span>
  </div>`;
  }

  return `<div class="compact-row ${isCur ? 'current' : ''}" id="trow-${hh.id}"
               onclick="selectHousehold(${HOUSEHOLDS.indexOf(hh)})">
    <span class="cr-name">${escHtml(translatedHouseholdName(hh.nombre))}</span>
    <span class="cr-score" style="color:${pDef.color}">${(sc*100).toFixed(0)}%</span>
    <span class="cr-level" style="color:${pDef.color}">${pred} <span class="cr-lt">${escHtml(levelShort(pred))}</span></span>
    <span class="cr-expert">${lblCell}</span>
    <span class="cr-err">${errCell}</span>
  </div>`;
}

// ─── Fase 2 · Consenso experto ───────────────────────────────────────────────

function getConsensusSubmissions() {
  try { return JSON.parse(localStorage.getItem(CONSENSUS_SUBMISSIONS_KEY) || '[]'); } catch (e) { return []; }
}

function persistConsensusSubmissions(items) {
  localStorage.setItem(CONSENSUS_SUBMISSIONS_KEY, JSON.stringify(items));
}

function submitExpertProposal() {
  if (!canEvaluate()) { showNotification(tr('cons.cannotSubmit')); return; }
  const weights = currentWeights();
  const metrics = computeOrdinalMetrics(weights, state.activeProfile, activeExpertLabels(), T());
  const items = getConsensusSubmissions().filter(item => !(item.profile === state.activeProfile && item.author === state.username));
  items.push({
    id:`proposal_${Date.now()}`, profile:state.activeProfile, author:state.username,
    createdAt:new Date().toISOString(), weights, metrics, synthetic:false,
  });
  persistConsensusSubmissions(items);
  showNotification(trf('cons.sent', {profile:state.activeProfile}));
  switchWorkflowStage('expert-consensus');
}

function loadSyntheticConsensus() {
  const items = getConsensusSubmissions().filter(item => !(item.profile === state.activeProfile && item.synthetic));
  const keys = pd().weight_keys;
  const names = ['A', 'B', 'C'].map(letter => `${tr('cons.example')} ${letter}`);
  const factors = [
    keys.map((_, i) => i % 3 === 0 ? 1.35 : 0.9),
    keys.map((_, i) => i % 4 === 1 ? 0 : 1.15),
    keys.map((_, i) => i % 2 === 0 ? 0.8 : 1.25),
  ];
  factors.forEach((factor, n) => {
    const raw = Object.fromEntries(keys.map((key, i) => [key, pd().init_weights[key] * factor[i]]));
    items.push({id:`synthetic_${state.activeProfile}_${n}`, profile:state.activeProfile, author:names[n], createdAt:new Date(Date.now() - n * 3600000).toISOString(), weights:normalizeWeights(raw, keys), metrics:null, synthetic:true});
  });
  persistConsensusSubmissions(items);
  showNotification(tr('cons.loaded'));
  renderAll();
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function consensusRows(submissions) {
  return pd().weight_keys.map(key => {
    const values = submissions.map(s => Number(s.weights[key]) || 0);
    const min = Math.min(...values), max = Math.max(...values);
    return {key, min, max, median:median(values), spread:max - min, zeros:values.filter(v => v === 0).length};
  });
}

function renderExpertConsensus(area) {
  const submissions = getConsensusSubmissions().filter(item => item.profile === state.activeProfile);
  if (!submissions.length) {
    area.innerHTML = `<div class="future-stage"><div class="future-hero"><h2>${trf('cons.title', {profile:state.activeProfile})}</h2>
      <p>${tr('cons.empty')}</p>
      <div class="builder-actions"><button class="btn btn-secondary" onclick="switchWorkflowStage('expert-evaluation')">${tr('cons.back')}</button>
      <button class="btn btn-accent2" onclick="loadSyntheticConsensus()">${tr('cons.loadSynthetic')}</button></div></div></div>`;
    return;
  }
  const rows = consensusRows(submissions);
  const candidate = normalizeWeights(Object.fromEntries(rows.map(r => [r.key, r.median])), pd().weight_keys);
  const high = rows.filter(r => r.spread >= 0.15).length;
  const table = rows.map(r => {
    const cls = r.spread >= 0.15 ? 'dispersion-high' : r.spread >= 0.07 ? 'dispersion-medium' : 'dispersion-low';
    return `<tr><td><b>${r.key}</b> · ${escHtml(translatedIndicatorName(r.key, INDICATOR_DEFS[r.key]?.name || r.key))}</td><td>${(r.min*100).toFixed(1)}%</td><td><b>${(candidate[r.key]*100).toFixed(1)}%</b></td><td>${(r.max*100).toFixed(1)}%</td><td class="${cls}">${(r.spread*100).toFixed(1)} pp</td><td>${r.zeros}/${submissions.length}</td></tr>`;
  }).join('');
  const submissionList = submissions.map(s => `<div class="submission-item"><span><b>${escHtml(s.author)}</b>${s.synthetic ? ` · ${tr('cons.syntheticTag')}` : ''}</span><small>${new Date(s.createdAt).toLocaleString()}</small></div>`).join('');

  area.innerHTML = `
    <div class="demo-note">${tr('cons.note')}</div>
    <div class="consensus-overview">
      <div class="consensus-kpi"><span>${tr('cons.proposals')}</span><b>${submissions.length}</b></div>
      <div class="consensus-kpi"><span>${tr('cons.profile')}</span><b>${state.activeProfile}</b></div>
      <div class="consensus-kpi"><span>${tr('cons.highSpread')}</span><b>${high}</b></div>
      <div class="consensus-kpi"><span>${tr('cons.method')}</span><b>${tr('cons.median')}</b></div>
    </div>
    <div class="consensus-grid">
      <section class="consensus-card"><h3>${tr('cons.compare')}</h3>
        <table class="consensus-table"><thead><tr><th>${tr('cons.thIndicator')}</th><th>${tr('cons.thMin')}</th><th>${tr('cons.thCandidate')}</th><th>${tr('cons.thMax')}</th><th>${tr('cons.thSpread')}</th><th>${tr('cons.thZeros')}</th></tr></thead><tbody>${table}</tbody></table>
        <div class="builder-actions"><button class="btn btn-secondary btn-sm" onclick="loadSyntheticConsensus()">${tr('cons.reload')}</button>
        <button class="btn btn-accent2 btn-sm" ${canFacilitate() ? '' : 'disabled'} onclick="saveConsensusCandidate()">${tr('cons.saveCandidate')}</button></div>
      </section>
      <aside><section class="consensus-card"><h3>${tr('cons.received')}</h3><div class="submission-list">${submissionList}</div></section>
        <section class="consensus-card" style="margin-top:12px"><h3>${tr('cons.safeguards')}</h3><ul class="guardrail-list">${['cons.guard1','cons.guard2','cons.guard3','cons.guard4'].map(key => `<li>${tr(key)}</li>`).join('')}</ul></section></aside>
    </div>`;
}

function saveConsensusCandidate() {
  if (!canFacilitate()) { showNotification(tr('cons.onlyFacilitator')); return; }
  const submissions = getConsensusSubmissions().filter(item => item.profile === state.activeProfile);
  if (!submissions.length) return;
  const rows = consensusRows(submissions);
  const candidate = normalizeWeights(Object.fromEntries(rows.map(r => [r.key, r.median])), pd().weight_keys);
  let all = {};
  try { all = JSON.parse(localStorage.getItem(CONSENSUS_CANDIDATES_KEY) || '{}'); } catch (e) { all = {}; }
  all[state.activeProfile] = {weights:candidate, method:'Mediana normalizada', submissionCount:submissions.length, status:'Pendiente de deliberación', savedBy:state.username, createdAt:new Date().toISOString()};
  localStorage.setItem(CONSENSUS_CANDIDATES_KEY, JSON.stringify(all));
  showNotification(trf('cons.savedCandidate', {profile:state.activeProfile}));
}

function renderFutureStage(area, stage) {
  if (!stage) return;
  const cards = [
    [tr('future.expected'), translatedWorkflowContent(stage, 'outputs')],
    [tr('future.who'), translatedWorkflowContent(stage, 'actors')],
    [tr('future.safeguards'), translatedWorkflowContent(stage, 'safeguards')],
  ];
  area.innerHTML = `<div class="future-stage"><div class="future-hero"><span class="stage-status future">${escHtml(translatedWorkflowField(stage, 'state'))}</span><h2>${escHtml(translatedWorkflowField(stage, 'title'))}</h2><p>${escHtml(translatedWorkflowContent(stage, 'description'))}</p></div>
    <div class="future-grid">${cards.map(([title, items]) => `<section class="future-card"><h3>${title}</h3><ul>${items.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul></section>`).join('')}</div>
    <div class="permission-note" style="margin-top:12px">${tr('future.note')}</div></div>`;
}

// ─── Versiones de pesos ───────────────────────────────────────────────────────

const WEIGHT_VERSIONS_KEY = 'sociarem_weight_versions_v1';

function getWeightVersions() {
  try { return JSON.parse(localStorage.getItem(WEIGHT_VERSIONS_KEY) || '{}'); } catch (e) { return {}; }
}
function persistWeightVersions(data) {
  localStorage.setItem(WEIGHT_VERSIONS_KEY, JSON.stringify(data));
}

function buildWeightVersionPanel() {
  const pvs = ((getWeightVersions()[state.username] || {})[state.activeProfile]) || [];
  const opts = pvs.length
    ? pvs.map(v => `<option value="${v.id}">${v.name}</option>`).join('')
    : `<option disabled value="">${tr('ver.none')}</option>`;
  return `<div class="versions-card">
    <div class="vc-header">💾 ${tr('ver.title')} · ${state.activeProfile} · ${escHtml(state.username)}</div>
    <div class="vc-save-row">
      <input type="text" id="version-name-input" class="vc-name-input" placeholder="${escHtml(tr('ver.namePlaceholder'))}">
      <button class="btn btn-accent2 btn-sm" onclick="saveWeightVersion()">${tr('ver.save')}</button>
    </div>
    <div class="vc-load-row">
      <select id="version-select" class="vc-select">${opts}</select>
    </div>
    <div class="vc-actions">
      <button class="btn btn-secondary btn-sm" onclick="loadSelectedVersion()">${tr('ver.load')}</button>
      <button class="btn btn-secondary btn-sm" onclick="deleteSelectedVersion()">${tr('ver.delete')}</button>
      <button class="btn btn-secondary btn-sm" onclick="exportWeightVersions()">${tr('ver.export')}</button>
    </div>
  </div>`;
}

function saveWeightVersion() {
  if (!canEvaluate()) { showNotification(tr('ver.cannotSave')); return; }
  const p       = state.activeProfile;
  const user    = state.username;
  const w       = currentWeights();
  const inp     = document.getElementById('version-name-input');
  const now     = new Date();
  const name    = (inp ? inp.value.trim() : '') ||
    `${p} · ${now.toLocaleDateString()} ${now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
  const id      = `w_${Date.now()}`;

  const all = getWeightVersions();
  if (!all[user])    all[user] = {};
  if (!all[user][p]) all[user][p] = [];
  all[user][p].push({id, name, createdAt: now.toISOString(), datasetLabel: datasetLabelText(), weights: w, levelThresholds: [...LEVEL_THRESHOLDS]});
  persistWeightVersions(all);
  if (inp) inp.value = '';
  showNotification(trf('ver.saved', {name}));
  renderContentArea();
}

function loadSelectedVersion() {
  const sel  = document.getElementById('version-select');
  if (!sel || !sel.value) { showNotification(tr('ver.select')); return; }
  const pvs = ((getWeightVersions()[state.username] || {})[state.activeProfile]) || [];
  const v   = pvs.find(v => v.id === sel.value);
  if (!v) { showNotification(tr('ver.notFound')); return; }
  ps().liveWeights = Object.fromEntries(pd().weight_keys.map(k => [k, (v.weights[k] || 0) * 100]));
  renderContentArea();
  showNotification(trf('ver.loaded', {name:v.name}));
}

function deleteSelectedVersion() {
  if (!canEvaluate()) { showNotification(tr('ver.cannotDelete')); return; }
  const sel  = document.getElementById('version-select');
  if (!sel || !sel.value) { showNotification(tr('ver.select')); return; }
  const user = state.username, p = state.activeProfile;
  const all  = getWeightVersions();
  if (all[user]?.[p]) all[user][p] = all[user][p].filter(v => v.id !== sel.value);
  persistWeightVersions(all);
  showNotification(tr('ver.deleted'));
  renderContentArea();
}

function exportWeightVersions() {
  const pvs = ((getWeightVersions()[state.username] || {})[state.activeProfile]) || [];
  if (!pvs.length) { showNotification(trf('ver.noneFor', {profile:state.activeProfile})); return; }
  download(`sociarem_pesos_${state.username}_${state.activeProfile}.json`, JSON.stringify(pvs, null, 2), 'application/json');
}

// ─── Actualizaciones en vivo (sliders) ───────────────────────────────────────

function onWeightChange() {
  if (!canEvaluate()) return;
  const sliders = document.querySelectorAll('.weight-slider');
  if (!sliders.length) return;
  const raw = {};
  sliders.forEach(s => raw[s.dataset.key] = Math.max(0, Number(s.value) || 0));
  const sum  = Object.values(raw).reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const first = sliders[0];
    first.value = '0.1';
    raw[first.dataset.key] = 0.1;
    showNotification(tr('notify.minOneWeight'));
  }
  const norm = normalizeWeights(raw, pd().weight_keys);
  ps().liveWeights = raw;
  updateLiveElements(norm);
}

function updateLiveElements(w) {
  const hh       = hhA();
  const sc       = scoreHousehold(hh, w, state.activeProfile, T());
  const pred     = scoreToLevel(sc);
  const pDef     = VULNERABILITY_LEVELS[pred];

  // Score compact
  const scEl = document.getElementById('sc-pct');
  if (scEl) { scEl.textContent = (sc*100).toFixed(1) + '%'; scEl.style.color = pDef.color; }
  const slEl = document.getElementById('sc-level');
  if (slEl) { slEl.textContent = `${pred} · ${levelLabel(pred)}`; slEl.style.color = pDef.color; }
  const scCompact = document.getElementById('score-compact');
  if (scCompact) scCompact.style.borderLeftColor = pDef.color;

  // Métricas
  const m = computeOrdinalMetrics(w, state.activeProfile, activeExpertLabels(), T());
  const upd = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  upd('met-mae',    m.mae.toFixed(2));
  upd('met-rmse',   m.rmse.toFixed(2));
  upd('met-exact',  (m.exactAccuracy * 100).toFixed(0) + '%');
  upd('met-within1',(m.withinOneAccuracy * 100).toFixed(0) + '%');

  // Pesos labels
  for (const k of pd().weight_keys) {
    const curW     = w[k] || 0;
    const delta    = curW - pd().init_weights[k];
    const dStr     = delta >= 0 ? `+${(delta*100).toFixed(1)}%` : `${(delta*100).toFixed(1)}%`;
    const dColor   = Math.abs(delta) < 0.005 ? '#9CA3AF' : delta > 0 ? '#D97706' : '#6B7280';
    const wv = document.getElementById(`wval-${k}`);
    if (wv) wv.textContent = (curW * 100).toFixed(1) + '%';
    const wd = document.getElementById(`wdelta-${k}`);
    if (wd) { wd.textContent = dStr; wd.style.color = dColor; }
    const row = document.getElementById(`wrow-${k}`);
    if (row) row.classList.toggle('excluded', curW === 0);
  }

  // Tabla compacta
  for (const h of HOUSEHOLDS) {
    const row = document.getElementById(`trow-${h.id}`);
    if (!row || row.dataset.inactive) continue;
    const hs   = scoreHousehold(h, w, state.activeProfile, T());
    const hp   = scoreToLevel(hs);
    const hpD  = VULNERABILITY_LEVELS[hp];
    const hl   = ps().expertLabels[h.id];

    const sEl  = row.querySelector('.cr-score');
    if (sEl) { sEl.textContent = (hs*100).toFixed(0) + '%'; sEl.style.color = hpD.color; }
    const lEl  = row.querySelector('.cr-level');
    if (lEl) { lEl.style.color = hpD.color; lEl.innerHTML = `${hp} <span class="cr-lt">${escHtml(levelShort(hp))}</span>`; }
    const xEl  = row.querySelector('.cr-expert');
    if (xEl && hl !== undefined) xEl.innerHTML = `<span style="color:${VULNERABILITY_LEVELS[hl].color};font-weight:700">${hl}</span>`;
    const eEl  = row.querySelector('.cr-err');
    if (eEl && hl !== undefined) {
      const err = hp - hl;
      const eC  = err === 0 ? '#16A34A' : Math.abs(err) === 1 ? '#D97706' : '#DC2626';
      eEl.innerHTML = `<span style="color:${eC};font-weight:700">${err > 0 ? '+' : ''}${err}</span>`;
    }
    row.className = `compact-row ${h.id === hhA().id ? 'current' : ''}`;
  }
}

function resetToOptimized() {
  if (!canEvaluate()) return;
  if (ps().optimizedWeights) {
    ps().liveWeights = Object.fromEntries(pd().weight_keys.map(k => [k, (ps().optimizedWeights[k] || 0) * 100]));
    renderContentArea();
  }
}
function resetToInit() {
  if (!canEvaluate()) return;
  ps().liveWeights = Object.fromEntries(pd().weight_keys.map(k => [k, (pd().init_weights[k] || 0) * 100]));
  renderContentArea();
}

// ─── Exportación ──────────────────────────────────────────────────────────────

function exportResults(format) {
  const w         = currentWeights();
  const m         = computeOrdinalMetrics(w, state.activeProfile, activeExpertLabels(), T());
  const includeGt = document.getElementById('export-gt')?.checked || false;

  const households = HOUSEHOLDS.map(hh => {
    const sc   = scoreHousehold(hh, w, state.activeProfile, T());
    const pred = scoreToLevel(sc);
    const profileActive = isProfileActiveFor(hh);
    const lbl  = profileActive ? ps().expertLabels[hh.id] : undefined;
    const entry = {
      id: hh.id, nombre: hh.nombre,
      profile_active:     profileActive,
      expert_label:       lbl !== undefined ? lbl : null,
      expert_label_text:  lbl !== undefined ? levelLabel(lbl) : null,
      score:              parseFloat(sc.toFixed(4)),
      predicted_level:    pred,
      predicted_level_text: levelLabel(pred),
      ordinal_error:      lbl !== undefined ? pred - lbl : null,
    };
    for (const k of pd().display_keys) entry[k] = hh[k] !== undefined ? hh[k] : null;
    if (includeGt && hh.gt) entry.reference_label = hh.gt[state.activeProfile];
    return entry;
  });

  const data = {
    profile: state.activeProfile, profile_name: translatedProfileField(state.activeProfile,'name',pd().name),
    username: state.username, thresholds: {...T()},
    weights: w, init_weights: pd().init_weights,
    metrics: m, households,
    exportedAt: new Date().toISOString(),
  };

  if (format === 'json') {
    download(`sociarem_${state.activeProfile}.json`, JSON.stringify(data, null, 2), 'application/json');
  } else {
    const cols = ['id','nombre','profile_active','expert_label','expert_label_text','score','predicted_level','predicted_level_text','ordinal_error',...pd().display_keys,...(includeGt?['reference_label']:[])];
    const rows = [cols.join(','), ...households.map(h => cols.map(c => JSON.stringify(h[c] ?? '')).join(','))];
    download(`sociarem_${state.activeProfile}.csv`, rows.join('\n'), 'text/csv');
  }
}

function download(filename, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type: mime}));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Gestión del dataset ──────────────────────────────────────────────────────

function renderDataPanel() {
  const el = document.getElementById('data-panel');
  if (!el) return;
  el.innerHTML = `
    <div class="data-panel-header"><span class="data-panel-title">${tr('data.title')}</span></div>
    <div class="data-panel-info">${escHtml(datasetLabelText())}</div>
    ${state.hasGT ? '' : `<div class="data-no-gt">${tr('data.noGt')}</div>`}
    <div class="data-panel-btns">
      <button class="btn btn-secondary btn-sm btn-full mb-1" onclick="useDemoData()">${tr('data.demo')}</button>
      <button class="btn btn-secondary btn-sm btn-full mb-1" onclick="openXlsxDialog()">${tr('data.upload')}</button>
      <button class="btn btn-secondary btn-sm btn-full" onclick="downloadTemplate()">${tr('data.template')}</button>
    </div>
  `;
  const refWrap = document.getElementById('ref-toggle-wrap');
  if (refWrap) {
    refWrap.style.opacity       = state.hasGT ? '1' : '0.4';
    refWrap.style.pointerEvents = state.hasGT ? '' : 'none';
  }
}

function useDemoData() {
  HOUSEHOLDS = JSON.parse(JSON.stringify(DEMO_HOUSEHOLDS));
  state.hasGT = true;
  state.datasetFile = null;
  resetAppForNewDataset();
}

function openXlsxDialog() {
  document.getElementById('xlsx-input').click();
}

function handleXlsxUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb  = XLSX.read(e.target.result, {type: 'array'});
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval: ''});
      const res  = parseHouseholdsFromRows(rows);
      if (res.error) { showNotification(res.error); return; }
      HOUSEHOLDS = res.households;
      state.hasGT = res.hasGT;
      state.datasetFile = file.name;
      if (res.binaryGtWarning) showNotification(res.binaryGtWarning);
      resetAppForNewDataset();
    } catch (err) {
      showNotification(trf('data.readError', {error:err.message}));
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

const REQUIRED_COLUMNS = [
  'id','nombre','edad','composicion','desc',
  'I1','I3','I4','I5','I6','I7','I9','I10',
  'I11','I12','I15','I16','I17','I18','I19',
  'I20','I21','I22','I23','I24','I25',
];
const GT_COLUMNS = ['gt_P1','gt_P2','gt_P3','gt_P4','gt_P5','gt_P6'];

function parseHouseholdsFromRows(rows) {
  if (!rows.length) return {error: tr('data.empty')};
  const cols    = Object.keys(rows[0]);
  const missing = REQUIRED_COLUMNS.filter(c => !cols.includes(c));
  if (missing.length) return {error: trf('data.missing', {cols:missing.join(', ')})};
  const hasGT = GT_COLUMNS.every(c => cols.includes(c));

  let binaryGtWarning = null;
  if (hasGT) {
    const vals = rows.flatMap(r => GT_COLUMNS.map(c => Number(r[c])));
    if (vals.every(v => v === 0 || v === 1) && vals.some(v => v === 1))
      binaryGtWarning = tr('data.binary');
  }

  const mapGt = (v, binary) => {
    const n = Number(v);
    if (binary && n === 1) return 4;
    return Math.min(4, Math.max(0, Math.round(n)));
  };
  const isBinary = !!binaryGtWarning;

  const households = rows.map((row, idx) => ({
    id:          String(row.id   || `HOG-${String(idx+1).padStart(2,'0')}`),
    nombre:      String(row.nombre || `Hogar ${idx+1}`),
    edad:        Number(row.edad) || 0,
    composicion: String(row.composicion || ''),
    desc:        String(row.desc || ''),
    I1:  Number(row.I1),  I3:  Number(row.I3),  I4:  Number(row.I4),
    I5:  Number(row.I5),  I6:  Number(row.I6),  I7:  Number(row.I7),
    I9:  Number(row.I9),  I10: Number(row.I10), I11: Number(row.I11),
    I12: Number(row.I12), I15: Number(row.I15), I16: Number(row.I16),
    I17: Number(row.I17), I18: Number(row.I18), I19: Number(row.I19),
    I20: Number(row.I20), I21: Number(row.I21), I22: Number(row.I22),
    I23: Number(row.I23), I24: Number(row.I24), I25: Number(row.I25),
    gt: hasGT
      ? {P1:mapGt(row.gt_P1,isBinary), P2:mapGt(row.gt_P2,isBinary), P3:mapGt(row.gt_P3,isBinary),
         P4:mapGt(row.gt_P4,isBinary), P5:mapGt(row.gt_P5,isBinary), P6:mapGt(row.gt_P6,isBinary)}
      : {P1:0,P2:0,P3:0,P4:0,P5:0,P6:0},
  }));
  return {households, hasGT, binaryGtWarning};
}

function resetAppForNewDataset() {
  state.activeHouseholdIndex = 0;
  state.searchText = '';
  const si = document.getElementById('search-input');
  if (si) si.value = '';
  state.filteredIndices = HOUSEHOLDS.map((_, i) => i);
  for (const p of Object.keys(state.profiles)) {
    state.profiles[p].expertLabels    = {};
    state.profiles[p].optimizedWeights = null;
    state.profiles[p].liveWeights      = null;
    state.profiles[p].phase            = 1;
  }
  if (!state.hasGT) {
    state.showReferenceLabels = false;
    const cb = document.getElementById('ref-toggle-check');
    if (cb) cb.checked = false;
  }
  renderDataPanel();
  renderAll();
}

function downloadTemplate() {
  const rows = [
    {id:'HOG-01',nombre:'Hogar 1',edad:67,composicion:'Composición 1',desc:'Descripción 1',
     I1:530,I3:18.2,I4:1,I5:145,I6:78,I7:2,I9:2,I10:2,I11:1,I12:0,I15:1,I16:1,
     I17:3,I18:35,I19:12,I20:1,I21:0,I22:1,I23:1,I24:0,I25:12,
     gt_P1:4,gt_P2:3,gt_P3:3,gt_P4:4,gt_P5:1,gt_P6:1},
    {id:'HOG-02',nombre:'Hogar 2',edad:45,composicion:'Composición 2',desc:'Descripción 2',
     I1:1200,I3:6.0,I4:0,I5:280,I6:150,I7:1,I9:0,I10:0,I11:0,I12:1,I15:0,I16:0,
     I17:0,I18:25,I19:10,I20:0,I21:4,I22:0,I23:1,I24:0,I25:8,
     gt_P1:0,gt_P2:0,gt_P3:0,gt_P4:0,gt_P5:0,gt_P6:0},
  ];
  const legendRows = VULNERABILITY_LEVELS.map(l => ({valor: l.value, significado: levelLabel(l.value)}));
  const ws1 = XLSX.utils.json_to_sheet(rows);
  const ws2 = XLSX.utils.json_to_sheet(legendRows);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'hogares');
  XLSX.utils.book_append_sheet(wb, ws2, 'leyenda');
  XLSX.writeFile(wb, 'plantilla_sociarem_hogares.xlsx');
}

// ─── Importar pesos JSON (legacy) ────────────────────────────────────────────

function exportWeightsJson() {
  const data = {};
  for (const pid of Object.keys(PROFILES)) {
    const pS = state.profiles[pid], pD = PROFILES[pid];
    const base = pS.liveWeights || pS.optimizedWeights || {...pD.init_weights};
    const wn = normalizeWeights(base, pD.weight_keys);
    data[pid] = {weights: wn, createdAt: new Date().toISOString()};
  }
  download('sociarem_pesos_todos.json', JSON.stringify(data, null, 2), 'application/json');
}

function importWeightsJson(event) {
  if (!canEvaluate()) { showNotification(tr('weights.cannotImport')); event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const apply = (pid, entry) => {
        if (!PROFILES[pid] || !entry.weights) return;
        state.profiles[pid].liveWeights = Object.fromEntries(
          PROFILES[pid].weight_keys.map(k => [k, (entry.weights[k] || 0) * 100])
        );
      };
      if (Array.isArray(data)) {
        if (data.length) apply(state.activeProfile, data[data.length - 1]);
      } else {
        for (const pid of Object.keys(data)) apply(pid, data[pid]);
      }
      if (ps().phase === 2) renderContentArea();
      showNotification(tr('weights.imported'));
    } catch (err) {
      showNotification(trf('weights.importError', {error:err.message}));
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showNotification(msg) {
  let el = document.getElementById('notification');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notification';
    el.className = 'notification';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── Inicialización ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setLanguage(currentLanguage);
  state.thresholds = {...DEFAULT_THRESHOLDS};
  const savedUser = localStorage.getItem('sociarem_username') || '';
  const inp = document.getElementById('login-username');
  if (inp) inp.value = savedUser;
  document.getElementById('login-screen').removeAttribute('hidden');
  document.getElementById('main-screen').setAttribute('hidden', '');
  if (inp) inp.focus();
});
