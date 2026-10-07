'use strict';

const indicatorBuilderState = {
  loadedIndicatorId:null,
  definition:null,
  selectedPath:[],
  testValues:{},
  evaluation:null,
  diagnostics:null,
};

function getIndicatorDrafts() {
  return loadIndicatorDefinitions();
}

function loadBuilderIndicator(indicatorId, force = false) {
  if (!force && indicatorBuilderState.loadedIndicatorId === indicatorId && indicatorBuilderState.definition) return;
  const catalog = INDICATOR_CATALOG.find(item => item.id === indicatorId) || INDICATOR_CATALOG[0];
  const stored = loadIndicatorDefinitions()[indicatorId];
  indicatorBuilderState.loadedIndicatorId = indicatorId;
  indicatorBuilderState.definition = cloneExpression(stored || createIndicatorDefinition(catalog));
  indicatorBuilderState.selectedPath = [];
  indicatorBuilderState.testValues = {};
  indicatorBuilderState.evaluation = null;
  indicatorBuilderState.diagnostics = null;
}

function selectIndicator(id) {
  state.selectedIndicatorId = id;
  loadBuilderIndicator(id, true);
  renderSidebar();
  renderContentArea();
}

function currentBuilderDefinition() {
  loadBuilderIndicator(state.selectedIndicatorId);
  return indicatorBuilderState.definition;
}

function pathAttribute(path) {
  return escHtml(JSON.stringify(path));
}

function renderIndicatorBuilder(area) {
  const definition = currentBuilderDefinition();
  const editable = canEditIndicators() && definition.metadata.active;
  const validation = validateIndicatorDefinitionForBuilder(definition);
  const definitions = loadIndicatorDefinitions();
  const usedBy = getIndicatorUsedBy(definition.indicatorId, definitions);
  const dependencies = extractIndicatorDependencies(definition.expression);
  const tree = definition.expression
    ? renderAstNode(definition.expression, [], editable)
    : `<div class="builder-empty"><b>Formalización computacional pendiente.</b><br>Selecciona un bloque de INPUT para iniciar la raíz del árbol.</div>`;
  const inputs = collectExpressionInputs(definition.expression);

  area.innerHTML = `<div class="ast-builder">
    <div class="phase-intro">
      <div><div class="phase-intro-title">Construcción de indicadores · AST schema v${EXPRESSION_SCHEMA_VERSION}</div>
      <div class="phase-intro-text">Datos institucionales → cálculo del indicador → I1… I25. Los pesos de P1–P6 pertenecen a fases posteriores.</div></div>
      <span class="model-version">${escHtml(MODEL_INFO.indicatorCatalog)}</span>
    </div>
    <div class="demo-note"><strong>Definición autoritativa:</strong> el árbol JSON ejecutable. Las expresiones matemática y natural se generan desde él y no se guardan como fórmula opaca.</div>

    <section class="builder-card metadata-section">
      <div class="builder-section-heading"><div><span class="builder-step">1</span><b>Metadata y OUTPUT</b></div><span class="status-pill">${escHtml(definition.status)}</span></div>
      <div class="form-grid">
        ${builderField('Nombre','metadata.name',definition.metadata.name,editable)}
        ${builderField('Tipo metodológico','metadata.type',definition.metadata.type,editable)}
        ${builderField('Unidad','metadata.unit',definition.metadata.unit,editable)}
        ${builderSelect('Sensibilidad','metadata.sensitivity',definition.metadata.sensitivity,['Baja','Media','Alta'],editable)}
        ${builderField('Fuentes / institución','metadata.sources',definition.metadata.sources,editable)}
        ${builderField('Descripción','metadata.description',definition.metadata.description,editable,true)}
        ${builderField('Criterio metodológico','metadata.methodologicalCriterion',definition.metadata.methodologicalCriterion,editable,true)}
      </div>
      <div class="output-spec">
        <b>OUTPUT</b>
        ${builderSelect('Tipo','output.type',definition.output.type,['number','integer','boolean','ordinal','category','vector'],editable)}
        ${builderField('Unidad','output.unit',definition.output.unit,editable)}
        ${builderField('Categorías (separadas por coma)','output.categories',(definition.output.categories || []).join(', '),editable)}
        <label class="nullable-check"><input type="checkbox" ${definition.output.nullable ? 'checked' : ''} ${editable ? '' : 'disabled'} onchange="builderUpdateOutput('nullable',this.checked)"> Nullable</label>
      </div>
    </section>

    <section class="builder-card">
      <div class="builder-section-heading"><div><span class="builder-step">2</span><b>Building blocks</b></div><span class="field-help">Selecciona un bloque del árbol y añade o envuelve</span></div>
      ${renderBlockPalette(editable)}
    </section>

    <div class="ast-main-grid">
      <section class="builder-card workspace-card">
        <div class="builder-section-heading"><div><span class="builder-step">3</span><b>Workspace · árbol computable</b></div><span class="field-help">Raíz arriba; operandos anidados debajo</span></div>
        <div class="ast-tree">${tree}</div>
      </section>
      <aside class="preview-column">
        <section class="builder-card"><h3>Mathematical expression</h3><div class="expression-preview">${escHtml(expressionToMath(definition.expression))}</div></section>
        <section class="builder-card"><h3>Natural language</h3><div class="natural-preview">${escHtml(expressionToNaturalLanguage(definition.expression))}</div></section>
        <section class="builder-card"><h3>Dependencias</h3>
          <div class="dependency-line"><b>Depends on:</b> ${dependencies.length ? dependencies.join(', ') : '—'}</div>
          <div class="dependency-line"><b>Used by:</b> ${usedBy.length ? usedBy.join(', ') : '—'}</div>
          ${validation.cycle ? `<div class="diagnostic error">Ciclo: ${validation.cycle.join(' → ')}</div>` : ''}
        </section>
      </aside>
    </div>

    <section class="builder-card sandbox-card">
      <div class="builder-section-heading"><div><span class="builder-step">4</span><b>Test sandbox</b></div><button class="btn btn-accent2 btn-sm" ${definition.expression ? '' : 'disabled'} onclick="runIndicatorSandbox()">▶ Ejecutar</button></div>
      ${renderSandboxInputs(inputs)}
      ${renderSandboxResult(definition)}
    </section>

    <section class="builder-card validation-card-ast">
      <div class="builder-section-heading"><div><span class="builder-step">5</span><b>Validación y persistencia</b></div><span>${definition.formalizationStatus === 'pending' ? 'Pendiente de formalización' : escHtml(definition.formalizationStatus)}</span></div>
      ${renderDiagnostics(validation)}
      <div class="builder-actions">
        <button class="btn btn-secondary" ${editable ? '' : 'disabled'} onclick="resetBuilderDefinition()">Restaurar guardado</button>
        <button class="btn btn-secondary" onclick="exportIndicatorDefinition()">↓ Exportar JSON</button>
        <button class="btn btn-secondary" ${editable ? '' : 'disabled'} onclick="document.getElementById('indicator-definition-import').click()">↑ Importar JSON</button>
        <button class="btn btn-primary" ${editable ? '' : 'disabled'} onclick="persistBuilderDefinition('DRAFT')">Guardar DRAFT</button>
        <button class="btn btn-accent2" ${editable ? '' : 'disabled'} onclick="persistBuilderDefinition('REVIEW')">Enviar a REVIEW</button>
        <button class="btn btn-secondary" ${editable && definition.status === 'REVIEW' ? '' : 'disabled'} onclick="persistBuilderDefinition('APPROVED')">Aprobar</button>
      </div>
      <input type="file" id="indicator-definition-import" accept="application/json,.json" hidden onchange="importIndicatorDefinition(event)">
    </section>
    ${definition.metadata.active ? '' : '<div class="permission-note warning">Este indicador está retirado en V3.0. Se conserva para trazabilidad y no puede modificarse ni aprobarse.</div>'}
    ${editable ? '' : '<div class="permission-note">Vista de consulta. El rol Diseño metodológico habilita la edición.</div>'}
  </div>`;
}

function builderField(label, path, value, editable, textarea = false) {
  const control = textarea
    ? `<textarea class="form-control" ${editable ? '' : 'disabled'} onchange="builderUpdateDefinition('${path}',this.value)">${escHtml(String(value ?? ''))}</textarea>`
    : `<input class="form-control" value="${escHtml(String(value ?? ''))}" ${editable ? '' : 'disabled'} onchange="builderUpdateDefinition('${path}',this.value)">`;
  return `<div class="form-field ${textarea ? 'full' : ''}"><label>${label}</label>${control}</div>`;
}

function builderSelect(label, path, value, values, editable) {
  return `<div class="form-field"><label>${label}</label><select class="form-control" ${editable ? '' : 'disabled'} onchange="builderUpdateDefinition('${path}',this.value)">${values.map(item => `<option value="${escHtml(item)}" ${item === value ? 'selected' : ''}>${escHtml(item)}</option>`).join('')}</select></div>`;
}

function renderBlockPalette(editable) {
  const groups = [
    ['INPUT',['rawInput','indicatorRef','constant','parameter']],
    ['MATH',['add','subtract','multiply','divide','sum','average','min','max','abs','power','percent']],
    ['COMPARISON',['lt','lte','gt','gte','eq','neq','between','notBetween']],
    ['LOGIC',['and','or','not']],
    ['FLOW',['if']],
    ['TRANSFORM',['clamp','normalize','mapCategory','round','scale']],
  ];
  return `<div class="block-palette">${groups.map(([name, types]) => `<div class="palette-group"><div class="palette-title">${name}</div><div class="palette-buttons">${types.map(type => {
    const def = BLOCK_DEFINITIONS[type];
    const handler = def.family === 'input' ? `builderAddInputBlock('${type}')` : `builderWrapSelected('${type}')`;
    return `<button class="block-button ${def.family}" ${editable ? '' : 'disabled'} onclick="${handler}">${escHtml(def.label)}</button>`;
  }).join('')}</div></div>`).join('')}</div>`;
}

function renderAstNode(node, path, editable) {
  const selected = JSON.stringify(path) === JSON.stringify(indicatorBuilderState.selectedPath);
  const def = BLOCK_DEFINITIONS[node.type] || {label:node.type, family:'unknown'};
  const options = Object.entries(BLOCK_DEFINITIONS).map(([type, block]) => `<option value="${type}" ${node.type === type ? 'selected' : ''}>${block.label}</option>`).join('');
  const children = (node.operands || []).map((child, index) => renderAstNode(child, [...path,index], editable)).join('');
  const canAddOperand = !!def.nary;
  return `<div class="ast-node ${selected ? 'selected' : ''} family-${def.family}" data-path="${pathAttribute(path)}">
    <div class="ast-node-header" onclick="builderSelectNode(${pathAttribute(path)})">
      <span class="ast-branch">${path.length ? '└─' : 'ROOT'}</span>
      <select class="ast-type" ${editable ? '' : 'disabled'} onclick="event.stopPropagation()" onchange="builderChangeNodeType(${pathAttribute(path)},this.value)">${options}</select>
      <span class="ast-inferred">${nodeDataType(node)} · ${escHtml(inferExpressionUnit(node).unit || '?')}</span>
      <div class="ast-node-actions">
        <button ${editable && path.length ? '' : 'disabled'} onclick="event.stopPropagation();builderMoveNode(${pathAttribute(path)},-1)" title="Mover arriba">↑</button>
        <button ${editable && path.length ? '' : 'disabled'} onclick="event.stopPropagation();builderMoveNode(${pathAttribute(path)},1)" title="Mover abajo">↓</button>
        <button ${editable ? '' : 'disabled'} onclick="event.stopPropagation();builderRemoveNode(${pathAttribute(path)})" title="Eliminar">×</button>
      </div>
    </div>
    ${renderAstNodeEditor(node, path, editable)}
    ${canAddOperand ? `<button class="add-operand" ${editable ? '' : 'disabled'} onclick="builderAddOperand(${pathAttribute(path)})">＋ Add operand</button>` : ''}
    ${children ? `<div class="ast-children">${children}</div>` : ''}
  </div>`;
}

function renderAstNodeEditor(node, path, editable) {
  const disabled = editable ? '' : 'disabled';
  const update = (field, valueExpression = 'this.value') => `builderUpdateNode(${pathAttribute(path)},'${field}',${valueExpression})`;
  if (node.type === 'rawInput') return `<div class="ast-node-editor six-cols">
    <label>ID<input value="${escHtml(node.inputId || '')}" ${disabled} onchange="${update('inputId')}"></label>
    <label>Fuente<input value="${escHtml(node.source || '')}" ${disabled} onchange="${update('source')}"></label>
    <label>Campo<input value="${escHtml(node.field || '')}" ${disabled} onchange="${update('field')}"></label>
    <label>Etiqueta<input value="${escHtml(node.label || '')}" ${disabled} onchange="${update('label')}"></label>
    <label>Tipo${dataTypeSelect(node.dataType, disabled, update('dataType'))}</label>
    <label>Unidad<input value="${escHtml(node.unit || '')}" ${disabled} onchange="${update('unit')}"></label>
  </div>`;
  if (node.type === 'indicatorRef') return `<div class="ast-node-editor"><label>Indicador<select ${disabled} onchange="builderUpdateIndicatorReference(${pathAttribute(path)},this.value)">${INDICATOR_CATALOG.map(ind => `<option value="${ind.id}" ${node.indicatorId === ind.id ? 'selected' : ''}>${ind.id} · ${escHtml(ind.name)}</option>`).join('')}</select></label><label>Valor de prueba<input type="number" value="${Number(node.sampleValue) || 0}" ${disabled} onchange="${update('sampleValue','Number(this.value)')}"></label></div>`;
  if (node.type === 'constant') return `<div class="ast-node-editor"><label>Tipo${dataTypeSelect(node.dataType, disabled, update('dataType'))}</label><label>Valor<input value="${escHtml(String(node.value ?? ''))}" ${disabled} onchange="builderUpdateConstant(${pathAttribute(path)},this.value)"></label><label>Unidad<input value="${escHtml(node.unit || '')}" ${disabled} onchange="${update('unit')}"></label></div>`;
  if (node.type === 'parameter') return `<div class="ast-node-editor six-cols"><label>ID<input value="${escHtml(node.parameterId || '')}" ${disabled} onchange="${update('parameterId')}"></label><label>Nombre<input value="${escHtml(node.name || '')}" ${disabled} onchange="${update('name')}"></label><label>Default<input value="${escHtml(String(node.defaultValue ?? ''))}" ${disabled} onchange="builderUpdateParameterDefault(${pathAttribute(path)},this.value)"></label><label>Tipo${dataTypeSelect(node.dataType, disabled, update('dataType'))}</label><label>Unidad<input value="${escHtml(node.unit || '')}" ${disabled} onchange="${update('unit')}"></label><label>Descripción<input value="${escHtml(node.description || '')}" ${disabled} onchange="${update('description')}"></label></div>`;
  if (node.type === 'round') return `<div class="ast-node-editor"><label>Decimales<input type="number" min="0" value="${Number(node.decimals) || 0}" ${disabled} onchange="${update('decimals','Number(this.value)')}"></label></div>`;
  if (node.type === 'mapCategory') return `<div class="ast-node-editor"><label>Mapa JSON<input value="${escHtml(JSON.stringify(node.mapping || {}))}" ${disabled} onchange="builderUpdateMapping(${pathAttribute(path)},this.value)"></label><label>Default<input value="${escHtml(String(node.defaultValue ?? ''))}" ${disabled} onchange="${update('defaultValue')}"></label></div>`;
  return `<div class="ast-operation-help">${defOperandLabels(node.type).join(' · ')}</div>`;
}

function dataTypeSelect(current, disabled, onchange) {
  return `<select ${disabled} onchange="${onchange}">${EXPRESSION_TYPES.filter(type => type !== 'unknown').map(type => `<option ${type === current ? 'selected' : ''}>${type}</option>`).join('')}</select>`;
}

function defOperandLabels(type) {
  if (type === 'if') return ['1 condición booleana','2 THEN','3 ELSE'];
  if (['between','notBetween','clamp','normalize'].includes(type)) return ['1 valor','2 mínimo','3 máximo'];
  return (BLOCK_DEFINITIONS[type]?.arity || 0) === 1 ? ['1 valor'] : ['Operandos anidados'];
}

function builderSelectNode(path) {
  indicatorBuilderState.selectedPath = path;
  renderContentArea();
}

function builderUpdateDefinition(path, value) {
  if (!canEditIndicators()) return;
  const [group, field] = path.split('.');
  indicatorBuilderState.definition[group][field] = path === 'output.categories'
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : value;
  if (path === 'metadata.name') indicatorBuilderState.definition.output.name = value;
  renderContentArea();
}

function builderUpdateOutput(field, value) {
  if (!canEditIndicators()) return;
  indicatorBuilderState.definition.output[field] = value;
  renderContentArea();
}

function builderAddInputBlock(type) {
  if (!canEditIndicators()) return;
  const definition = currentBuilderDefinition();
  const node = createExpressionNode(type);
  if (!definition.expression) definition.expression = node;
  else {
    const selected = getNodeAtPath(definition.expression, indicatorBuilderState.selectedPath);
    const selectedDef = BLOCK_DEFINITIONS[selected?.type];
    if (selectedDef?.nary && selectedDef.family !== 'input') selected.operands.push(node);
    else definition.expression = replaceNodeAtPath(definition.expression, indicatorBuilderState.selectedPath, node);
  }
  indicatorBuilderState.evaluation = null;
  renderContentArea();
}

function builderWrapSelected(type) {
  if (!canEditIndicators()) return;
  const definition = currentBuilderDefinition();
  const wrapper = createExpressionNode(type);
  if (!definition.expression) definition.expression = wrapper;
  else {
    const current = cloneExpression(getNodeAtPath(definition.expression, indicatorBuilderState.selectedPath));
    if (type === 'if') {
      wrapper.operands[1] = current;
      wrapper.operands[2] = makePlaceholder(nodeDataType(current), 'ELSE');
    } else wrapper.operands[0] = current;
    definition.expression = replaceNodeAtPath(definition.expression, indicatorBuilderState.selectedPath, wrapper);
  }
  indicatorBuilderState.evaluation = null;
  renderContentArea();
}

function builderChangeNodeType(path, type) {
  if (!canEditIndicators()) return;
  indicatorBuilderState.definition.expression = replaceNodeAtPath(indicatorBuilderState.definition.expression, path, createExpressionNode(type));
  indicatorBuilderState.selectedPath = path;
  indicatorBuilderState.evaluation = null;
  renderContentArea();
}

function builderUpdateNode(path, field, value) {
  if (!canEditIndicators()) return;
  const node = getNodeAtPath(indicatorBuilderState.definition.expression, path);
  if (node) node[field] = value;
  indicatorBuilderState.evaluation = null;
  renderContentArea();
}

function builderUpdateIndicatorReference(path, indicatorId) {
  const catalog = INDICATOR_CATALOG.find(item => item.id === indicatorId);
  const node = getNodeAtPath(indicatorBuilderState.definition.expression, path);
  if (!node || !catalog) return;
  node.indicatorId = indicatorId; node.label = indicatorId; node.dataType = outputTypeFromCatalog(catalog); node.unit = catalog.unit;
  renderContentArea();
}

function builderUpdateConstant(path, value) {
  const node = getNodeAtPath(indicatorBuilderState.definition.expression, path);
  if (!node) return;
  node.value = NUMERIC_TYPES.has(node.dataType) ? Number(value) : node.dataType === 'boolean' ? value === 'true' : value;
  renderContentArea();
}

function builderUpdateParameterDefault(path, value) {
  const node = getNodeAtPath(indicatorBuilderState.definition.expression, path);
  if (!node) return;
  node.defaultValue = NUMERIC_TYPES.has(node.dataType) ? Number(value) : node.dataType === 'boolean' ? value === 'true' : value;
  renderContentArea();
}

function builderUpdateMapping(path, value) {
  const node = getNodeAtPath(indicatorBuilderState.definition.expression, path);
  if (!node) return;
  try { node.mapping = JSON.parse(value); indicatorBuilderState.diagnostics = null; }
  catch (error) { indicatorBuilderState.diagnostics = {errors:['El mapa de categorías no es JSON válido.'], warnings:[]}; }
  renderContentArea();
}

function builderAddOperand(path) {
  if (!canEditIndicators()) return;
  const node = getNodeAtPath(indicatorBuilderState.definition.expression, path);
  if (node && BLOCK_DEFINITIONS[node.type]?.nary) node.operands.push(makePlaceholder(['and','or'].includes(node.type) ? 'boolean' : 'number', 'Nuevo operando'));
  renderContentArea();
}

function builderRemoveNode(path) {
  if (!canEditIndicators()) return;
  if (!path.length) indicatorBuilderState.definition.expression = null;
  else {
    const parentPath = path.slice(0,-1), index = path[path.length-1];
    const parent = getNodeAtPath(indicatorBuilderState.definition.expression, parentPath);
    const required = BLOCK_DEFINITIONS[parent.type]?.arity || 0;
    if (BLOCK_DEFINITIONS[parent.type]?.nary && parent.operands.length > required) parent.operands.splice(index,1);
    else parent.operands[index] = makePlaceholder(['and','or','not'].includes(parent.type) || (parent.type === 'if' && index === 0) ? 'boolean' : 'number', 'Operando pendiente');
  }
  indicatorBuilderState.selectedPath = [];
  indicatorBuilderState.evaluation = null;
  renderContentArea();
}

function builderMoveNode(path, direction) {
  if (!canEditIndicators() || !path.length) return;
  const parent = getNodeAtPath(indicatorBuilderState.definition.expression, path.slice(0,-1));
  const index = path[path.length-1], target = index + direction;
  if (!parent?.operands || target < 0 || target >= parent.operands.length) return;
  [parent.operands[index], parent.operands[target]] = [parent.operands[target], parent.operands[index]];
  indicatorBuilderState.selectedPath = [...path.slice(0,-1), target];
  renderContentArea();
}

function renderSandboxInputs(inputs) {
  if (!inputs.length) return '<div class="builder-empty">Añade Raw field, Indicator o Parameter para generar inputs de prueba.</div>';
  return `<div class="sandbox-inputs">${inputs.map(({key,node}) => {
    const fallback = node.type === 'parameter' ? node.defaultValue : node.sampleValue ?? '';
    if (!(key in indicatorBuilderState.testValues)) indicatorBuilderState.testValues[key] = fallback;
    const label = node.type === 'rawInput' ? node.label || node.field : node.type === 'indicatorRef' ? node.indicatorId : node.name;
    const input = node.dataType === 'boolean'
      ? `<select onchange="builderSetTestValue('${key}',this.value)"><option value="true" ${String(indicatorBuilderState.testValues[key]) === 'true' ? 'selected' : ''}>true</option><option value="false" ${String(indicatorBuilderState.testValues[key]) === 'false' ? 'selected' : ''}>false</option></select>`
      : `<input value="${escHtml(String(indicatorBuilderState.testValues[key] ?? ''))}" onchange="builderSetTestValue('${key}',this.value)">`;
    return `<label><span>${escHtml(label)}</span>${input}<small>${escHtml(node.unit || UNIT_DIMENSIONLESS)} · ${node.type}</small></label>`;
  }).join('')}</div>`;
}

function builderSetTestValue(key, value) {
  indicatorBuilderState.testValues[key] = value;
  indicatorBuilderState.evaluation = null;
}

function sandboxContext() {
  const context = {raw:{}, indicators:{}, parameters:{}};
  for (const {key,node} of collectExpressionInputs(indicatorBuilderState.definition.expression)) {
    const value = indicatorBuilderState.testValues[key];
    if (node.type === 'rawInput') context.raw[node.inputId] = value;
    if (node.type === 'indicatorRef') context.indicators[node.indicatorId] = value;
    if (node.type === 'parameter') context.parameters[node.parameterId] = value;
  }
  return context;
}

function runIndicatorSandbox() {
  const validation = validateIndicatorDefinitionForBuilder(indicatorBuilderState.definition);
  if (!validation.valid) {
    indicatorBuilderState.evaluation = {error:'Corrige los errores de validación antes de ejecutar.', trace:[]};
  } else {
    try { indicatorBuilderState.evaluation = evaluateExpression(indicatorBuilderState.definition.expression, sandboxContext()); }
    catch (error) { indicatorBuilderState.evaluation = {error:error.message, code:error.code, trace:[]}; }
  }
  renderContentArea();
}

function renderSandboxResult(definition) {
  const evaluation = indicatorBuilderState.evaluation;
  if (!evaluation) return '<div class="sandbox-result muted">Introduce valores y pulsa Ejecutar.</div>';
  if (evaluation.error) return `<div class="sandbox-result error"><b>Error:</b> ${escHtml(evaluation.error)}</div>`;
  const unit = definition.output.unit === UNIT_DIMENSIONLESS ? '' : ` ${definition.output.unit}`;
  return `<div class="sandbox-output"><div class="sandbox-value"><span>RESULT</span><b>${escHtml(String(evaluation.value))}${escHtml(unit)}</b></div>
    <ol class="execution-trace">${evaluation.trace.map(item => `<li>${escHtml(item.text)}</li>`).join('')}</ol></div>`;
}

function validateIndicatorDefinitionForBuilder(definition) {
  const result = validateExpression(definition.expression, {indicatorCatalog:INDICATOR_CATALOG, output:definition.output});
  const definitions = loadIndicatorDefinitions();
  const candidate = {...definition, dependencies:extractIndicatorDependencies(definition.expression)};
  const cycle = findDependencyCycle(buildIndicatorDependencyGraph(definitions, candidate));
  const extra = indicatorBuilderState.diagnostics || {errors:[],warnings:[]};
  const errors = [...result.errors, ...(cycle ? [`Dependencia circular: ${cycle.join(' → ')}.`] : []), ...(extra.errors || [])];
  return {...result, valid:errors.length === 0, errors:[...new Set(errors)], warnings:[...new Set([...result.warnings, ...(extra.warnings || [])])], cycle};
}

function renderDiagnostics(validation) {
  const success = validation.valid ? `<div class="diagnostic ok">✓ AST válido · tipo ${validation.inferredType} · unidad inferida ${escHtml(validation.inferredUnit || '?')}</div>` : '';
  const errors = validation.errors.map(message => `<div class="diagnostic error">✕ ${escHtml(message)}</div>`).join('');
  const warnings = validation.warnings.map(message => `<div class="diagnostic warning">⚠ ${escHtml(message)}</div>`).join('');
  return `<div class="diagnostics">${success}${errors}${warnings}</div>`;
}

function persistBuilderDefinition(status) {
  if (!canEditIndicators()) return;
  const definition = indicatorBuilderState.definition;
  const validation = validateIndicatorDefinitionForBuilder(definition);
  if (!validation.valid) { indicatorBuilderState.diagnostics = {errors:validation.errors,warnings:validation.warnings}; renderContentArea(); showNotification('No se ha guardado: corrige los errores del AST.'); return; }
  definition.status = status;
  definition.formalizationStatus = status === 'APPROVED' ? 'approved' : 'formalized';
  definition.parameters = collectExpressionParameters(definition.expression);
  definition.dependencies = extractIndicatorDependencies(definition.expression);
  definition.updatedAt = new Date().toISOString();
  definition.author = state.username;
  definition.output.name = definition.metadata.name;
  saveIndicatorDefinition(definition);
  indicatorBuilderState.diagnostics = null;
  showNotification(`${definition.indicatorId} guardado como ${status}.`);
  renderAll();
}

function resetBuilderDefinition() {
  loadBuilderIndicator(state.selectedIndicatorId, true);
  renderContentArea();
}

function exportIndicatorDefinition() {
  const definition = cloneExpression(indicatorBuilderState.definition);
  definition.parameters = collectExpressionParameters(definition.expression);
  definition.dependencies = extractIndicatorDependencies(definition.expression);
  download(`sociarem_indicator_${definition.indicatorId}.json`, serializeIndicatorDefinition(definition), 'application/json');
}

function importIndicatorDefinition(event) {
  if (!canEditIndicators()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const definition = deserializeIndicatorDefinition(reader.result);
      if (!INDICATOR_CATALOG.some(item => item.id === definition.indicatorId)) throw new Error(`El indicador ${definition.indicatorId} no existe en el catálogo.`);
      state.selectedIndicatorId = definition.indicatorId;
      indicatorBuilderState.loadedIndicatorId = definition.indicatorId;
      indicatorBuilderState.definition = cloneExpression(definition);
      indicatorBuilderState.selectedPath = [];
      indicatorBuilderState.evaluation = null;
      indicatorBuilderState.diagnostics = null;
      showNotification(`${definition.indicatorId}: JSON importado; revisa y guarda el borrador.`);
      renderAll();
    } catch (error) {
      indicatorBuilderState.diagnostics = {errors:[error.message],warnings:[]};
      showNotification('No se pudo importar la definición.');
      renderContentArea();
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
