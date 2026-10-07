'use strict';

const profileBuilderState = {
  loadedProfileId:null,
  definition:null,
  selectedActivationPath:[],
  diagnostics:null,
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
  const activationTree = renderProfileRuleNode(definition.activationExpression, [], editable);
  const cautions = definition.methodology.cautions || [];

  area.innerHTML = `<div class="ast-builder profile-builder">
    <div class="phase-intro">
      <div><div class="phase-intro-title">Construcción de perfiles · schema v${PROFILE_SCHEMA_VERSION}</div>
      <div class="phase-intro-text">Indicadores ya calculados → regla de activación → perfil → variables que las personas expertas ponderan después.</div></div>
      <span class="model-version">${escHtml(MODEL_INFO.profileModel)}</span>
    </div>
    <div class="demo-note"><strong>Separación metodológica:</strong> la regla activadora decide si el perfil aplica. La priorización calcula su intensidad únicamente cuando está activo. Los pesos no se fijan aquí: se ajustan en la fase experta.</div>

    <section class="builder-card metadata-section">
      <div class="builder-section-heading"><div><span class="builder-step">1</span><b>Identidad del perfil</b></div><span class="status-pill">${escHtml(definition.status)}</span></div>
      <div class="form-grid">
        ${profileTextField('Nombre','name',definition.metadata.name,editable)}
        ${profileTextField('Nombre corto','short',definition.metadata.short,editable)}
        ${profileTextField('Color','color',definition.metadata.color,editable)}
        ${profileTextField('Pregunta experta','question',definition.metadata.question,editable)}
        ${profileTextField('Descripción','description',definition.metadata.description,editable,true)}
        ${profileMethodField('Justificación de activación','activationRationale',definition.methodology.activationRationale,editable,true)}
      </div>
    </section>

    <section class="builder-card">
      <div class="builder-section-heading"><div><span class="builder-step">2</span><b>Propuesta documental precargada</b></div><span class="status-pill preliminary">${escHtml(definition.methodology.activationStatus)}</span></div>
      <div class="profile-source">${escHtml(definition.methodology.source)}</div>
      <div class="profile-method-grid">
        ${profileIndicatorGroup('Indicadores primarios',definition.methodology.primaryIndicators,'primary')}
        ${profileIndicatorGroup('Indicadores secundarios',definition.methodology.secondaryIndicators,'secondary')}
        ${profileIndicatorGroup('Pendientes de integración',definition.methodology.pendingIndicators,'pending')}
      </div>
      ${cautions.map(item => `<div class="diagnostic warning">⚠ ${escHtml(item)}</div>`).join('')}
    </section>

    <section class="builder-card">
      <div class="builder-section-heading"><div><span class="builder-step">3</span><b>Regla activadora</b></div><span class="field-help">Bloques booleanos, sin pesos</span></div>
      <div class="profile-rule-palette">
        <select id="profile-activation-indicator" class="form-control" ${editable ? '' : 'disabled'}>${executableIndicatorOptions()}</select>
        <button class="block-button input" ${editable ? '' : 'disabled'} onclick="profileReplaceActivationWithIndicator()">Indicador de riesgo</button>
        <button class="block-button logic" ${editable ? '' : 'disabled'} onclick="profileWrapActivation('and')">AND</button>
        <button class="block-button logic" ${editable ? '' : 'disabled'} onclick="profileWrapActivation('or')">OR</button>
        <button class="block-button logic" ${editable ? '' : 'disabled'} onclick="profileWrapActivation('not')">NOT</button>
        <button class="block-button input" ${editable ? '' : 'disabled'} onclick="profileAddActivationCondition()">＋ Condición</button>
      </div>
      <div class="profile-rule-layout">
        <div class="ast-tree">${activationTree}</div>
        <div class="profile-rule-readable"><b>Lectura humana</b><p>${escHtml(expressionToNaturalLanguage(definition.activationExpression))}.</p><b>Expresión lógica</b><code>${escHtml(expressionToMath(definition.activationExpression))}</code></div>
      </div>
    </section>

    <section class="builder-card">
      <div class="builder-section-heading"><div><span class="builder-step">4</span><b>Variables ponderables</b></div><span class="field-help">Los porcentajes son solo el punto de partida actual</span></div>
      <div class="profile-variable-table">${renderProfileVariables(definition, weights, editable)}</div>
      <div class="profile-variable-add">
        <select id="profile-priority-indicator" class="form-control" ${editable ? '' : 'disabled'}>${executableIndicatorOptions()}</select>
        <button class="btn btn-secondary btn-sm" ${editable ? '' : 'disabled'} onclick="profileAddPriorityIndicator()">＋ Añadir variable</button>
      </div>
      <div class="permission-note">Un peso inicial de 0 conserva la variable como candidata sin influir en el score. En la fase 1 los expertos pueden asignarle peso o excluirla.</div>
    </section>

    <section class="builder-card sandbox-card">
      <div class="builder-section-heading"><div><span class="builder-step">5</span><b>Vista previa con hogares sintéticos</b></div><span class="field-help">Regla + pesos iniciales</span></div>
      ${renderProfilePreview(definition, weights)}
    </section>

    <section class="builder-card validation-card-ast">
      <div class="builder-section-heading"><div><span class="builder-step">6</span><b>Validación y publicación</b></div><span>${validation.dependencies.length} indicadores conectados</span></div>
      ${renderProfileDiagnostics(validation)}
      <div class="builder-actions">
        <button class="btn btn-secondary" onclick="resetProfileBuilder()">Restaurar guardado</button>
        <button class="btn btn-secondary" onclick="exportProfileDefinition()">↓ Exportar JSON</button>
        <button class="btn btn-secondary" ${editable ? '' : 'disabled'} onclick="document.getElementById('profile-definition-import').click()">↑ Importar JSON</button>
        <button class="btn btn-primary" ${editable ? '' : 'disabled'} onclick="persistProfileBuilder('DRAFT')">Guardar DRAFT</button>
        <button class="btn btn-accent2" ${editable ? '' : 'disabled'} onclick="persistProfileBuilder('REVIEW')">Enviar a REVIEW</button>
        <button class="btn btn-secondary" ${editable && definition.status === 'REVIEW' ? '' : 'disabled'} onclick="persistProfileBuilder('APPROVED')">Publicar para expertos</button>
      </div>
      <input type="file" id="profile-definition-import" accept="application/json,.json" hidden onchange="importProfileDefinition(event)">
    </section>
    ${editable ? '' : '<div class="permission-note">Vista de consulta. El rol Diseño metodológico habilita la edición.</div>'}
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
  return INDICATOR_CATALOG.filter(item => INDICATOR_DEFS[item.id]).map(item => `<option value="${item.id}">${item.id} · ${escHtml(item.name)}</option>`).join('');
}

function renderProfileRuleNode(node, path, editable) {
  const selected = JSON.stringify(path) === JSON.stringify(profileBuilderState.selectedActivationPath);
  const children = (node.operands || []).map((child,index) => renderProfileRuleNode(child,[...path,index],editable)).join('');
  const label = node.type === 'indicatorRef'
    ? `${node.indicatorId} · ${INDICATOR_DEFS[node.indicatorId]?.name || node.label || 'Indicador'}`
    : BLOCK_DEFINITIONS[node.type]?.label || node.type;
  return `<div class="profile-rule-node ${selected ? 'selected' : ''} family-${BLOCK_DEFINITIONS[node.type]?.family || 'input'}">
    <div class="profile-rule-node-head" onclick="profileSelectActivationNode(${profilePathAttribute(path)})">
      <span class="ast-branch">${path.length ? '└─' : 'ROOT'}</span><b>${escHtml(label)}</b>
      ${node.type === 'indicatorRef' ? '<span class="profile-value-mode">RIESGO SÍ/NO</span>' : ''}
      <button ${editable && path.length ? '' : 'disabled'} onclick="event.stopPropagation();profileRemoveActivationNode(${profilePathAttribute(path)})" title="Eliminar">×</button>
    </div>
    ${children ? `<div class="ast-children">${children}</div>` : ''}
  </div>`;
}

function renderProfileVariables(definition, weights, editable) {
  const primary = new Set(definition.methodology.primaryIndicators || []);
  const secondary = new Set(definition.methodology.secondaryIndicators || []);
  return definition.prioritizationExpression.operands.map((node,index) => {
    const id = definition.prioritizationExpression.weightKeys[index];
    const role = primary.has(id) ? 'Primario' : secondary.has(id) ? 'Secundario' : 'Añadido';
    return `<div class="profile-variable-row ${weights[id] === 0 ? 'zero' : ''}">
      <span class="badge ${primary.has(id) ? 'badge-pri' : 'badge-sec'}">${id}</span>
      <span class="profile-variable-name">${escHtml(INDICATOR_DEFS[id]?.name || node.label || id)}</span>
      <span class="profile-variable-role">${role}</span>
      <span class="profile-variable-weight">${(weights[id] * 100).toFixed(1)}% inicial</span>
      <button class="btn btn-secondary btn-sm" ${editable && definition.prioritizationExpression.operands.length > 1 ? '' : 'disabled'} onclick="profileRemovePriorityIndicator('${id}')">Quitar</button>
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
      return `<div class="profile-preview-household ${active ? 'active' : ''}"><b>${escHtml(household.nombre)}</b><span>${active ? 'ACTIVO' : 'No activo'}</span><strong>${(score * 100).toFixed(0)}%</strong></div>`;
    } catch (error) {
      return `<div class="profile-preview-household error"><b>${escHtml(household.nombre)}</b><span>Error</span><strong>—</strong></div>`;
    }
  }).join('')}</div>`;
}

function renderProfileDiagnostics(validation) {
  const success = validation.valid ? '<div class="diagnostic ok">✓ Regla activadora booleana y priorización ponderable válidas.</div>' : '';
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
