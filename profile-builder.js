'use strict';

const profileBuilderState = {
  loadedProfileId:null,
  definition:null,
  selectedActivationPath:[],
  diagnostics:null,
  activeTab:'design',
};

function loadProfileBuilderDefinition(profileId, force = false) {
  if (!force && profileBuilderState.loadedProfileId === profileId && profileBuilderState.definition) return;
  const definitions = readProfileDefinitions();
  const definition = definitions[profileId] || Object.values(definitions)[0];
  profileBuilderState.loadedProfileId = definition.profileId;
  profileBuilderState.definition = cloneExpression(definition);
  profileBuilderState.selectedActivationPath = [];
  profileBuilderState.diagnostics = null;
}

function selectProfileDefinition(profileId) {
  state.selectedProfileDefinitionId = profileId;
  loadProfileBuilderDefinition(profileId, true);
  renderSidebar();
  renderContentArea();
}

function currentProfileDefinition() {
  loadProfileBuilderDefinition(state.selectedProfileDefinitionId);
  return profileBuilderState.definition;
}

function profilePathAttribute(path) { return escHtml(JSON.stringify(path)); }

function renderProfileBuilder(area) {
  const definition = currentProfileDefinition();
  const editable = canEditProfiles();
  const validation = validateProfileDefinition(definition);
  const weights = initialProfileWeights(definition.prioritizationExpression);
  const activationDiagram = renderActivationDiagram(definition.activationExpression, [], editable, true);
  const design = `<div class="profile-dashboard-grid">
    <section class="builder-card compact-card">
      <div class="builder-section-heading"><b>${tr('builder.identity')}</b><span class="status-pill">${escHtml(translatedLifecycleStatus(definition.status))}</span></div>
      <div class="profile-identity-grid">
        ${profileTextField(tr('builder.name'),'name',translatedProfileField(definition.profileId,'name',definition.metadata.name),editable)}
        ${profileTextField(tr('builder.short'),'short',translatedProfileField(definition.profileId,'short',definition.metadata.short),editable)}
        ${profileTextField(tr('builder.color'),'color',definition.metadata.color,editable)}
        ${profileTextField(tr('builder.question'),'question',translatedProfileContent(definition.profileId,'question',definition.metadata.question),editable)}
        ${profileTextField(tr('builder.description'),'description',translatedProfileContent(definition.profileId,'description',definition.metadata.description),editable,true)}
      </div>
    </section>

    <section class="builder-card compact-card">
      <div class="builder-section-heading"><b>${tr('builder.composition')}</b><span>${validation.dependencies.length}</span></div>
      <div class="profile-composition-stack">
        ${profileIndicatorGroup(tr('builder.primary'),definition.methodology.primaryIndicators,'primary')}
        ${profileIndicatorGroup(tr('builder.secondary'),definition.methodology.secondaryIndicators,'secondary')}
        ${profileIndicatorGroup(tr('builder.pending'),definition.methodology.pendingIndicators,'pending')}
      </div>
    </section>

    <section class="builder-card compact-card profile-activation-card">
      <div class="builder-section-heading"><b>${tr('builder.activation')}</b><span class="status-pill preliminary">${escHtml(translatedMethodStatus(definition.methodology.activationStatus))}</span></div>
      <p class="compact-help">${tr('builder.activationHelp')}</p>
      <div class="profile-rule-toolbar">
        <select id="profile-activation-indicator" class="form-control" ${editable ? '' : 'disabled'}>${executableIndicatorOptions()}</select>
        <button class="btn btn-secondary btn-sm ${profileBuilderState.selectedActivationPath.length ? '' : 'active'}" onclick="profileSelectActivationNode([])">${tr('builder.wholeRule')}</button>
        <button class="btn btn-secondary btn-sm" ${editable ? '' : 'disabled'} onclick="profileReplaceActivationWithIndicator()">${tr('builder.replaceCondition')}</button>
        <button class="btn btn-secondary btn-sm" ${editable ? '' : 'disabled'} onclick="profileAddActivationCondition()">${tr('builder.addCondition')}</button>
        <div class="logic-buttons"><button class="block-button logic" ${editable ? '' : 'disabled'} onclick="profileWrapActivation('and')">AND</button><button class="block-button logic" ${editable ? '' : 'disabled'} onclick="profileWrapActivation('or')">OR</button><button class="block-button logic" ${editable ? '' : 'disabled'} onclick="profileWrapActivation('not')">NOT</button></div>
      </div>
      <div class="profile-rule-console"><span>${tr('builder.logicFormula')}</span><code>${escHtml(profileActivationFormula(definition.activationExpression))}</code></div>
      <div class="profile-logic-diagram">${activationDiagram}</div>
    </section>

    <section class="builder-card compact-card profile-variables-card">
      <div class="builder-section-heading"><b>${tr('builder.variables')}</b></div>
      <p class="compact-help">${tr('builder.weightsHint')}</p>
      <div class="profile-variable-table">${renderProfileVariables(definition, weights, editable)}</div>
      <div class="profile-variable-add"><select id="profile-priority-indicator" class="form-control" ${editable ? '' : 'disabled'}>${executableIndicatorOptions()}</select><button class="btn btn-secondary btn-sm" ${editable ? '' : 'disabled'} onclick="profileAddPriorityIndicator()">${tr('builder.addVariable')}</button></div>
    </section>

    <section class="builder-card compact-card profile-preview-card">
      <div class="builder-section-heading"><b>${tr('builder.preview')}</b><span class="field-help">${tr('builder.previewHint')}</span></div>
      ${renderProfilePreview(definition, weights)}
    </section>

    <section class="builder-card compact-card profile-validation-card">
      <div class="builder-section-heading"><b>${tr('builder.validation')}</b></div>
      ${renderProfileDiagnostics(validation)}
      <div class="builder-actions compact-actions">
        <button class="btn btn-secondary" onclick="resetProfileBuilder()">${tr('builder.restore')}</button><button class="btn btn-secondary" onclick="exportProfileDefinition()">${tr('builder.export')}</button><button class="btn btn-secondary" ${editable ? '' : 'disabled'} onclick="document.getElementById('profile-definition-import').click()">${tr('builder.import')}</button><button class="btn btn-primary" ${editable ? '' : 'disabled'} onclick="persistProfileBuilder('DRAFT')">${tr('builder.saveDraft')}</button><button class="btn btn-accent2" ${editable ? '' : 'disabled'} onclick="persistProfileBuilder('REVIEW')">${tr('builder.review')}</button><button class="btn btn-secondary" ${editable && definition.status === 'REVIEW' ? '' : 'disabled'} onclick="persistProfileBuilder('APPROVED')">${tr('builder.publish')}</button>
      </div>
      <input type="file" id="profile-definition-import" accept="application/json,.json" hidden onchange="importProfileDefinition(event)">
    </section>
  </div>`;

  const methodology = renderProfileMethodology(definition,validation);
  area.innerHTML = `<div class="profile-builder compact-profile-builder">
    <div class="profile-builder-header"><div><h2>${tr('builder.title')}</h2><p>${tr('builder.subtitle')}</p></div><span class="model-version">${definition.profileId}</span></div>
    <div class="profile-builder-tabs"><button class="${profileBuilderState.activeTab === 'design' ? 'active' : ''}" onclick="switchProfileBuilderTab('design')">${tr('builder.design')}</button><button class="${profileBuilderState.activeTab === 'method' ? 'active' : ''}" onclick="switchProfileBuilderTab('method')">${tr('builder.method')}</button></div>
    ${profileBuilderState.activeTab === 'method' ? methodology : design}
    ${editable ? '' : `<div class="permission-note">${tr('builder.viewOnly')}</div>`}
  </div>`;
}

function switchProfileBuilderTab(tab) {
  profileBuilderState.activeTab = tab === 'method' ? 'method' : 'design';
  renderContentArea();
}

function renderProfileMethodology(definition, validation) {
  const cautions = translatedProfileContent(definition.profileId,'cautions',definition.methodology.cautions || []);
  const rationale = translatedProfileContent(definition.profileId,'rationale',definition.methodology.activationRationale);
  return `<div class="profile-methodology-view">
    <p class="methodology-intro">${tr('builder.methodHint')}</p>
    <div class="profile-methodology-grid">
      <section class="builder-card"><div class="builder-section-heading"><b>${tr('builder.source')}</b></div><p>${escHtml(translatedMethodologySource(definition.methodology.source))}</p></section>
      <section class="builder-card"><div class="builder-section-heading"><b>${tr('builder.version')}</b></div><p>${definition.profileId} · schema v${PROFILE_SCHEMA_VERSION}</p><p>${escHtml(translatedMethodStatus(definition.methodology.activationStatus))} · ${escHtml(translatedMethodStatus(definition.methodology.prioritizationStatus))}</p></section>
      <section class="builder-card"><div class="builder-section-heading"><b>${tr('builder.activationRationale')}</b></div>${profileMethodField(tr('builder.activationRationale'),'activationRationale',rationale,canEditProfiles(),true)}</section>
      <section class="builder-card"><div class="builder-section-heading"><b>${tr('builder.cautions')}</b></div>${cautions.length ? cautions.map(item => `<div class="diagnostic warning">⚠ ${escHtml(item)}</div>`).join('') : '<p>—</p>'}</section>
    </div>
    ${renderProfileDiagnostics(validation)}
  </div>`;
}

function profileTextField(label, field, value, editable, textarea = false) {
  const control = textarea
    ? `<textarea class="form-control" ${editable ? '' : 'disabled'} onchange="profileUpdateMetadata('${field}',this.value)">${escHtml(String(value || ''))}</textarea>`
    : `<input class="form-control" value="${escHtml(String(value || ''))}" ${editable ? '' : 'disabled'} onchange="profileUpdateMetadata('${field}',this.value)">`;
  return `<div class="form-field ${textarea ? 'full' : ''}"><label>${label}</label>${control}</div>`;
}

function profileMethodField(label, field, value, editable, textarea = false) {
  const control = textarea
    ? `<textarea class="form-control" ${editable ? '' : 'disabled'} onchange="profileUpdateMethodology('${field}',this.value)">${escHtml(String(value || ''))}</textarea>`
    : `<input class="form-control" value="${escHtml(String(value || ''))}" ${editable ? '' : 'disabled'} onchange="profileUpdateMethodology('${field}',this.value)">`;
  return `<div class="form-field full"><label>${label}</label>${control}</div>`;
}

function profileIndicatorGroup(label, ids = [], kind) {
  return `<div class="profile-indicator-group"><b>${label}</b><div>${ids.length ? ids.map(id => `<span class="profile-chip ${kind}">${id}</span>`).join('') : '<span class="text-muted">Ninguno</span>'}</div></div>`;
}

function executableIndicatorOptions() {
  return INDICATOR_CATALOG.filter(item => INDICATOR_DEFS[item.id]).map(item => `<option value="${item.id}">${item.id} · ${escHtml(translatedIndicatorName(item.id,item.name))}</option>`).join('');
}

function profileActivationNatural(node) {
  if (!node) return '—';
  if (node.type === 'indicatorRef') return `${node.indicatorId} · ${translatedIndicatorName(node.indicatorId,node.label)} = TRUE`;
  const values = (node.operands || []).map(profileActivationNatural);
  if (node.type === 'and') return `(${values.join(' AND ')})`;
  if (node.type === 'or') return `(${values.join(' OR ')})`;
  if (node.type === 'not') return `NOT (${values[0] || ''})`;
  return expressionToMath(node);
}

function profileActivationFormula(node, isRoot = true) {
  if (!node) return '—';
  if (node.type === 'indicatorRef') return node.indicatorId;
  const values = (node.operands || []).map(child => profileActivationFormula(child, false));
  if (node.type === 'and' || node.type === 'or') {
    const formula = values.join(node.type === 'and' ? ' AND ' : ' OR ');
    return isRoot ? formula : `(${formula})`;
  }
  if (node.type === 'not') return isRoot ? `NOT ${values[0] || ''}` : `(NOT ${values[0] || ''})`;
  return expressionToMath(node);
}

function renderActivationDiagram(node, path, editable, isRoot = false) {
  if (!node) return '';
  const selected = JSON.stringify(path) === JSON.stringify(profileBuilderState.selectedActivationPath);
  if (node.type !== 'indicatorRef') {
    const operator = node.type === 'and' ? 'AND' : node.type === 'or' ? 'OR' : node.type === 'not' ? 'NOT' : node.type.toUpperCase();
    const children = (node.operands || []).map((child,index) => `<div class="profile-logic-branch">${renderActivationDiagram(child,[...path,index],editable,false)}</div>`).join('');
    return `<div class="profile-logic-subtree">
      <div class="profile-logic-operator ${selected ? 'selected' : ''}" onclick="profileSelectActivationNode(${profilePathAttribute(path)})">
        ${isRoot ? '<span>ROOT</span>' : ''}<b>${operator}</b>
        ${editable && path.length ? `<button onclick="event.stopPropagation();profileRemoveActivationNode(${profilePathAttribute(path)})">×</button>` : ''}
      </div>
      <div class="profile-logic-children">${children}</div>
    </div>`;
  }
  const indicator = INDICATOR_DEFS[node.indicatorId];
  const name = translatedIndicatorName(node.indicatorId,indicator?.name || node.label || node.indicatorId);
  const criterion = translatedIndicatorCriterion(node.indicatorId,T(),indicator?.note(T()) || '');
  return `<div class="profile-logic-indicator ${selected ? 'selected' : ''}" onclick="profileSelectActivationNode(${profilePathAttribute(path)})">
    <span class="badge badge-pri">${node.indicatorId}</span>
    <span class="profile-condition-copy"><b>${escHtml(name)}</b><small>${escHtml(criterion)}</small></span>
    <span class="profile-condition-true">TRUE</span>
    <span class="profile-condition-remove ${editable && path.length ? '' : 'disabled'}" onclick="event.stopPropagation();profileRemoveActivationNode(${profilePathAttribute(path)})">×</span>
  </div>`;
}

function renderProfileVariables(definition, weights, editable) {
  const primary = new Set(definition.methodology.primaryIndicators || []);
  const secondary = new Set(definition.methodology.secondaryIndicators || []);
  return definition.prioritizationExpression.operands.map((node,index) => {
    const id = definition.prioritizationExpression.weightKeys[index];
  const role = primary.has(id) ? tr('builder.primaryRole') : secondary.has(id) ? tr('builder.secondaryRole') : tr('builder.addedRole');
    return `<div class="profile-variable-row ${weights[id] === 0 ? 'zero' : ''}">
      <span class="badge ${primary.has(id) ? 'badge-pri' : 'badge-sec'}">${id}</span>
      <span class="profile-variable-name">${escHtml(translatedIndicatorName(id,INDICATOR_DEFS[id]?.name || node.label || id))}</span>
      <span class="profile-variable-role">${role}</span>
      <span class="profile-variable-weight">${(weights[id] * 100).toFixed(1)}% ${tr('builder.initial')}</span>
      <button class="btn btn-secondary btn-sm" ${editable && definition.prioritizationExpression.operands.length > 1 ? '' : 'disabled'} onclick="profileRemovePriorityIndicator('${id}')">${tr('builder.remove')}</button>
    </div>`;
  }).join('');
}

function profileDefinitionContext(definition, household, weights) {
  const indicators = {}, riskIndicators = {}, rawIndicators = {};
  for (const id of profileDependencies(definition)) {
    const indicator = INDICATOR_DEFS[id];
    if (!indicator) continue;
    indicators[id] = indicator.norm(household, T());
    riskIndicators[id] = Boolean(indicator.risk(household, T()));
    rawIndicators[id] = household[id];
  }
  return {indicators,riskIndicators,rawIndicators,weights,parameters:T()};
}

function renderProfilePreview(definition, weights) {
  const expression = profileDefinitionExpression(definition);
  return `<div class="profile-preview-grid">${HOUSEHOLDS.map(household => {
    try {
      const context = profileDefinitionContext(definition, household, weights);
      const active = evaluateExpression(definition.activationExpression, context).value;
      const score = Number(evaluateExpression(expression, context).value) || 0;
      return `<div class="profile-preview-household ${active ? 'active' : ''}"><b>${escHtml(translatedHouseholdName(household.nombre))}</b><span>${active ? tr('builder.active') : tr('builder.inactive')}</span><strong>${(score * 100).toFixed(0)}%</strong></div>`;
    } catch (error) {
      return `<div class="profile-preview-household error"><b>${escHtml(translatedHouseholdName(household.nombre))}</b><span>Error</span><strong>—</strong></div>`;
    }
  }).join('')}</div>`;
}

function renderProfileDiagnostics(validation) {
  const success = validation.valid ? `<div class="diagnostic ok">✓ ${tr('builder.valid')}</div>` : '';
  return `<div class="diagnostics">${success}${validation.errors.map(message => `<div class="diagnostic error">✕ ${escHtml(message)}</div>`).join('')}${validation.warnings.map(message => `<div class="diagnostic warning">⚠ ${escHtml(message)}</div>`).join('')}</div>`;
}

function profileUpdateMetadata(field, value) {
  if (!canEditProfiles()) return;
  profileBuilderState.definition.metadata[field] = value;
  if (field === 'name') profileBuilderState.definition.output.name = value;
  renderContentArea();
}

function profileUpdateMethodology(field, value) {
  if (!canEditProfiles()) return;
  profileBuilderState.definition.methodology[field] = value;
  renderContentArea();
}

function profileSelectActivationNode(path) {
  profileBuilderState.selectedActivationPath = path;
  renderContentArea();
}

function selectedActivationIndicator() { return document.getElementById('profile-activation-indicator')?.value || 'I1'; }

function profileReplaceActivationWithIndicator() {
  if (!canEditProfiles()) return;
  profileBuilderState.definition.activationExpression = replaceNodeAtPath(profileBuilderState.definition.activationExpression, profileBuilderState.selectedActivationPath, riskRef(selectedActivationIndicator()));
  renderContentArea();
}

function profileWrapActivation(type) {
  if (!canEditProfiles()) return;
  const current = cloneExpression(getNodeAtPath(profileBuilderState.definition.activationExpression, profileBuilderState.selectedActivationPath));
  const wrapper = type === 'not' ? {type,operands:[current]} : {type,operands:[current,riskRef(selectedActivationIndicator())]};
  profileBuilderState.definition.activationExpression = replaceNodeAtPath(profileBuilderState.definition.activationExpression, profileBuilderState.selectedActivationPath, wrapper);
  renderContentArea();
}

function profileAddActivationCondition() {
  if (!canEditProfiles()) return;
  const root = profileBuilderState.definition.activationExpression;
  const selected = getNodeAtPath(root, profileBuilderState.selectedActivationPath);
  if (['and','or'].includes(selected?.type)) selected.operands.push(riskRef(selectedActivationIndicator()));
  else profileBuilderState.definition.activationExpression = replaceNodeAtPath(root, profileBuilderState.selectedActivationPath, {type:'and',operands:[cloneExpression(selected),riskRef(selectedActivationIndicator())]});
  renderContentArea();
}

function profileRemoveActivationNode(path) {
  if (!canEditProfiles() || !path.length) return;
  const parent = getNodeAtPath(profileBuilderState.definition.activationExpression, path.slice(0,-1));
  const index = path[path.length - 1];
  if (['and','or'].includes(parent?.type) && parent.operands.length > 2) parent.operands.splice(index,1);
  else if (['and','or'].includes(parent?.type)) {
    const sibling = cloneExpression(parent.operands[index === 0 ? 1 : 0]);
    profileBuilderState.definition.activationExpression = replaceNodeAtPath(profileBuilderState.definition.activationExpression,path.slice(0,-1),sibling);
  } else if (parent?.type === 'not') profileBuilderState.definition.activationExpression = replaceNodeAtPath(profileBuilderState.definition.activationExpression,path.slice(0,-1),riskRef('I1'));
  profileBuilderState.selectedActivationPath = [];
  renderContentArea();
}

function profileAddPriorityIndicator() {
  if (!canEditProfiles()) return;
  const id = document.getElementById('profile-priority-indicator')?.value;
  const expression = profileBuilderState.definition.prioritizationExpression;
  if (!id || expression.weightKeys.includes(id)) { showNotification('Ese indicador ya está incluido.'); return; }
  expression.operands.push(profileIndicatorRef(id));
  expression.weightKeys.push(id);
  expression.initialWeights[id] = 0;
  renderContentArea();
}

function profileRemovePriorityIndicator(id) {
  if (!canEditProfiles()) return;
  const expression = profileBuilderState.definition.prioritizationExpression;
  const index = expression.weightKeys.indexOf(id);
  if (index < 0 || expression.operands.length <= 1) return;
  expression.weightKeys.splice(index,1);
  expression.operands.splice(index,1);
  delete expression.initialWeights[id];
  renderContentArea();
}

function persistProfileBuilder(status) {
  if (!canEditProfiles()) return;
  const definition = profileBuilderState.definition;
  const validation = validateProfileDefinition(definition);
  if (!validation.valid) { profileBuilderState.diagnostics = validation; showNotification('Corrige los errores antes de guardar.'); renderContentArea(); return; }
  definition.status = status;
  definition.updatedAt = new Date().toISOString();
  definition.author = state.username;
  saveProfileDefinition(definition);
  if (status === 'APPROVED') ensureProfileState(definition.profileId);
  showNotification(`${definition.profileId} guardado como ${status}.`);
  renderAll();
}

function resetProfileBuilder() {
  loadProfileBuilderDefinition(state.selectedProfileDefinitionId, true);
  renderContentArea();
}

function createNewProfile() {
  if (!canEditProfiles()) return;
  const ids = Object.keys(readProfileDefinitions()).map(id => Number(id.replace(/^P/,''))).filter(Number.isFinite);
  const profileId = `P${Math.max(6,...ids) + 1}`;
  const definition = createProfileDraft(profileId);
  definition.author = state.username;
  saveProfileDefinition(definition);
  state.selectedProfileDefinitionId = profileId;
  loadProfileBuilderDefinition(profileId, true);
  renderAll();
}

function exportProfileDefinition() {
  const definition = currentProfileDefinition();
  download(`sociarem_profile_${definition.profileId}.json`, serializeProfileDefinition(definition), 'application/json');
}

function importProfileDefinition(event) {
  if (!canEditProfiles()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const definition = deserializeProfileDefinition(reader.result);
      profileBuilderState.loadedProfileId = definition.profileId;
      profileBuilderState.definition = cloneExpression(definition);
      profileBuilderState.selectedActivationPath = [];
      state.selectedProfileDefinitionId = definition.profileId;
      showNotification(`${definition.profileId}: JSON importado; revisa y guarda.`);
      renderAll();
    } catch (error) {
      showNotification(`No se pudo importar: ${error.message}`);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
