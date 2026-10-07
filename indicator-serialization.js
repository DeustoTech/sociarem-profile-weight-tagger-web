'use strict';

const INDICATOR_DEFINITIONS_KEY = 'sociarem_indicator_definitions_v2';
const LEGACY_INDICATOR_DRAFTS_KEY = 'sociarem_indicator_drafts_v1';

function indicatorMetadataFromCatalog(indicator) {
  return {
    name:indicator.name,
    description:indicator.formula,
    methodologicalCriterion:indicator.formula,
    type:indicator.type,
    unit:indicator.unit,
    sensitivity:indicator.sensitivity,
    sources:indicator.sources,
    direction:indicator.direction,
    catalogStatus:indicator.status,
    active:indicator.active,
  };
}

function outputTypeFromCatalog(indicator) {
  const type = indicator.type.toLowerCase();
  if (type.includes('boolean')) return 'boolean';
  if (type.includes('ordinal')) return 'ordinal';
  if (type.includes('categó')) return 'category';
  if (type.includes('serie')) return 'vector';
  if (type.includes('contador')) return 'integer';
  return 'number';
}

function collectExpressionParameters(expression) {
  const parameters = [];
  walkExpression(expression, node => {
    if (node.type === 'parameter' && !parameters.some(item => item.parameterId === node.parameterId)) {
      parameters.push({parameterId:node.parameterId, name:node.name, defaultValue:node.defaultValue, unit:node.unit, description:node.description, dataType:node.dataType});
    }
  });
  return parameters;
}

function createIndicatorDefinition(indicator, expression = null, overrides = {}) {
  const output = {type:outputTypeFromCatalog(indicator), unit:indicator.unit, categories:[], nullable:false, name:indicator.name};
  return {
    schemaVersion:EXPRESSION_SCHEMA_VERSION,
    indicatorId:indicator.id,
    metadata:indicatorMetadataFromCatalog(indicator),
    expression:cloneExpression(expression),
    parameters:collectExpressionParameters(expression),
    dependencies:extractIndicatorDependencies(expression),
    output,
    status:'DRAFT',
    formalizationStatus:expression ? 'formalized' : 'pending',
    updatedAt:null,
    author:null,
    ...overrides,
  };
}

function seededIndicatorDefinitions() {
  const byId = Object.fromEntries(INDICATOR_CATALOG.map(indicator => [indicator.id, indicator]));
  const parameter = (parameterId, name, defaultValue, unit, description) => ({type:'parameter', parameterId, name, defaultValue, unit, description, dataType:'number'});
  const ref = (indicatorId, unit = UNIT_DIMENSIONLESS, dataType = 'number') => ({type:'indicatorRef', indicatorId, label:indicatorId, unit, dataType, sampleValue:0});
  const comparison = (type, left, right) => ({type, operands:[left, right]});

  const i2 = createIndicatorDefinition(byId.I2,
    comparison('lt', ref('I1','€/mes equivalente'), parameter('povertyThreshold','Umbral de pobreza relativa',DEFAULT_THRESHOLDS.pobreza,'€/mes equivalente','Referencia territorial y temporal aprobada.')),
    {status:'DRAFT', formalizationStatus:'formalized-from-existing-method'}
  );

  const i8 = createIndicatorDefinition(byId.I8, {
    type:'and', operands:[
      {type:'and', operands:[
        comparison('lt', ref('I5','kWh'), parameter('hiddenElectricityThreshold','Umbral de infraconsumo eléctrico',DEFAULT_THRESHOLDS.infra_elec,'kWh','Umbral provisional ya usado por la demo.')),
        comparison('lt', ref('I6','kWh equivalente'), parameter('hiddenNonElectricThreshold','Umbral de infraconsumo no eléctrico',DEFAULT_THRESHOLDS.infra_gas,'kWh equivalente','Umbral provisional ya usado por la demo.')),
      ]},
      {type:'or', operands:[
        comparison('lt', ref('I1','€/mes equivalente'), parameter('povertyThreshold','Umbral de pobreza',DEFAULT_THRESHOLDS.pobreza,'€/mes equivalente','Umbral provisional ya usado por la demo.')),
        comparison('gt', ref('I3','%'), parameter('energyBurdenThreshold','Umbral de esfuerzo energético',DEFAULT_THRESHOLDS.carga,'%','Umbral provisional ya usado por la demo.')),
      ]},
      {type:'or', operands:[
        comparison('gte', ref('I9','nivel','ordinal'), {type:'constant', dataType:'ordinal', value:1, unit:'nivel', label:'Habitabilidad deficiente'}),
        comparison('gte', ref('I10','nivel','ordinal'), {type:'constant', dataType:'ordinal', value:1, unit:'nivel', label:'Sistema inadecuado'}),
      ]},
    ],
  }, {status:'DRAFT', formalizationStatus:'formalized-from-existing-code'});
  i8.output = {...i8.output, type:'boolean', unit:UNIT_DIMENSIONLESS};
  return {I2:i2, I8:i8};
}

function migrateLegacyRules(legacyDraft) {
  if (!legacyDraft?.rules?.length) return null;
  const operatorMap = {lt:'lt',lte:'lte',gt:'gt',gte:'gte',eq:'eq',neq:'neq'};
  const conditions = legacyDraft.rules.map(rule => ({
    type:operatorMap[rule.operator] || 'eq',
    operands:[
      {type:'rawInput', inputId:`legacy_${rule.field}`, source:'Legacy rule builder', field:rule.field, label:rule.field, dataType:'number', unit:UNIT_DIMENSIONLESS, sensitivity:'Sin clasificar', sampleValue:rule.sample ?? 0},
      {type:'constant', dataType:'number', value:Number(rule.threshold), unit:UNIT_DIMENSIONLESS, label:'Umbral legado'},
    ],
  }));
  let expression = conditions[0];
  for (let index = 1; index < conditions.length; index++) {
    expression = {type:String(legacyDraft.rules[index].connector || 'AND').toLowerCase() === 'or' ? 'or' : 'and', operands:[expression, conditions[index]]};
  }
  const catalog = INDICATOR_CATALOG.find(item => item.id === legacyDraft.id);
  if (!catalog) return null;
  return createIndicatorDefinition(catalog, expression, {
    metadata:{...indicatorMetadataFromCatalog(catalog), name:legacyDraft.name || catalog.name, type:legacyDraft.type || catalog.type, unit:legacyDraft.unit || catalog.unit, sensitivity:legacyDraft.sensitivity || catalog.sensitivity, sources:legacyDraft.sources || catalog.sources, methodologicalCriterion:legacyDraft.formula || catalog.formula},
    status:legacyDraft.reviewState === 'Pendiente de revisión' ? 'REVIEW' : 'DRAFT',
    formalizationStatus:'migrated-needs-review',
    updatedAt:legacyDraft.updatedAt || new Date().toISOString(),
    legacyDefinition:cloneExpression(legacyDraft),
  });
}

function readStorageJson(key, fallback) {
  if (typeof localStorage === 'undefined') return cloneExpression(fallback);
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (e) { return cloneExpression(fallback); }
}

function loadIndicatorDefinitions() {
  const stored = readStorageJson(INDICATOR_DEFINITIONS_KEY, {});
  const legacy = readStorageJson(LEGACY_INDICATOR_DRAFTS_KEY, {});
  let changed = false;
  for (const [id, draft] of Object.entries(legacy)) {
    if (!stored[id]) {
      const migrated = migrateLegacyRules(draft);
      if (migrated) { stored[id] = migrated; changed = true; }
    }
  }
  const seeds = seededIndicatorDefinitions();
  for (const [id, definition] of Object.entries(seeds)) if (!stored[id]) stored[id] = definition;
  if (changed && typeof localStorage !== 'undefined') localStorage.setItem(INDICATOR_DEFINITIONS_KEY, JSON.stringify(stored));
  return stored;
}

function saveIndicatorDefinition(definition) {
  const definitions = loadIndicatorDefinitions();
  definitions[definition.indicatorId] = cloneExpression(definition);
  if (typeof localStorage !== 'undefined') localStorage.setItem(INDICATOR_DEFINITIONS_KEY, JSON.stringify(definitions));
  return definition;
}

function serializeIndicatorDefinition(definition) {
  return JSON.stringify(definition, null, 2);
}

function deserializeIndicatorDefinition(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : cloneExpression(json);
  if (!parsed || parsed.schemaVersion !== EXPRESSION_SCHEMA_VERSION || !parsed.indicatorId || !('expression' in parsed) || !parsed.output) {
    throw new Error('El JSON no es una definición de indicador compatible con schemaVersion 1.');
  }
  return parsed;
}
