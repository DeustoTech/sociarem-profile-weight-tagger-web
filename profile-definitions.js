'use strict';

const PROFILE_DEFINITIONS_KEY = 'sociarem_profile_definitions_v2';
const PROFILE_DELETED_KEY = 'sociarem_deleted_profile_ids_v1';
const PROFILE_SCHEMA_VERSION = 2;

function profileIndicatorRef(indicatorId, valueMode = 'normalized') {
  const catalog = INDICATOR_CATALOG.find(item => item.id === indicatorId);
  return {
    type:'indicatorRef', indicatorId, label:catalog?.name || indicatorId,
    dataType:valueMode === 'risk' ? 'boolean' : 'number', unit:UNIT_DIMENSIONLESS,
    valueMode, sampleValue:valueMode === 'risk' ? false : 0.5,
  };
}

function riskRef(indicatorId) { return profileIndicatorRef(indicatorId, 'risk'); }
function riskAnd(...indicatorIds) { return {type:'and', operands:indicatorIds.map(riskRef)}; }
function riskOr(...indicatorIds) { return {type:'or', operands:indicatorIds.map(riskRef)}; }

function createWeightedProfileExpression(indicatorIds, initialWeights = {}) {
  return {
    type:'weightedSum',
    operands:indicatorIds.map(id => profileIndicatorRef(id, 'normalized')),
    weightKeys:[...indicatorIds],
    initialWeights:Object.fromEntries(indicatorIds.map(id => {
      const value = Number(initialWeights[id]);
      return [id, Number.isFinite(value) ? value : 0];
    })),
    expertAdjustable:true,
  };
}

function documentedProfileSeeds() {
  const base = PROFILES;
  const commonSource = 'D1.5 v2, secciones 4.2.1–4.2.6 y tabla 39; propuesta contrastada con Energy Vulnerability Profiles v1.1.';
  const make = (profileId, primaryIndicators, secondaryIndicators, activationExpression, options = {}) => {
    const legacy = base[profileId];
    const weightedIndicators = options.weightedIndicators || [...new Set([...primaryIndicators, ...secondaryIndicators])]
      .filter(id => !!INDICATOR_DEFS[id]);
    const initialWeights = {...legacy.init_weights, ...(options.initialWeights || {})};
    return {
      schemaVersion:PROFILE_SCHEMA_VERSION,
      profileId,
      metadata:{
        name:legacy.name, short:legacy.short, color:legacy.color, question:legacy.question,
        description:options.description || '',
      },
      methodology:{
        source:commonSource,
        primaryIndicators,
        secondaryIndicators,
        pendingIndicators:options.pendingIndicators || [],
        activationStatus:'PRELIMINAR',
        prioritizationStatus:'PESOS INICIALES DE LA DEMO',
        activationRationale:options.activationRationale || '',
        cautions:options.cautions || [],
      },
      activationExpression,
      prioritizationExpression:createWeightedProfileExpression(weightedIndicators, initialWeights),
      output:{type:'number', unit:'score 0–1', nullable:false, name:legacy.name},
      status:'APPROVED',
      updatedAt:null,
      author:'Propuesta documental SOCIAREM',
    };
  };

  return {
    P1:make('P1', ['I1','I2'], ['I3','I4','I11','I12','I21','I22','I25'], {
      type:'or', operands:[riskRef('I2'), riskAnd('I1','I3'), riskAnd('I1','I4')],
    }, {
      description:'Insuficiencia estructural de recursos y presión de los costes energéticos, reforzada por impagos y baja resiliencia.',
      activationRationale:'Se activa por pobreza relativa o por una combinación de renta insuficiente con carga energética o impago. I11, I12, I21, I22 e I25 modulan la prioridad.',
      cautions:['I1 e I2 están relacionados; el peso inicial de I2 es cero para evitar doble conteo hasta revisión experta.','I22 se incorpora como resiliencia complementaria con peso inicial cero.'],
      initialWeights:{I2:0,I22:0},
    }),
    P2:make('P2', ['I9','I10'], ['I5','I6','I7','I20'], riskOr('I9','I10'), {
      description:'Vulnerabilidad causada principalmente por condiciones físicas, térmicas o técnicas de la vivienda.',
      activationRationale:'Se activa cuando la habitabilidad o los sistemas energéticos presentan riesgo; el consumo y el disconfort aportan contexto.',
    }),
    P3:make('P3', ['I8'], ['I1','I3','I4','I5','I6','I9','I10'], {
      type:'and', operands:[riskRef('I8'), riskOr('I9','I10'), riskOr('I1','I3')],
    }, {
      description:'Infraconsumo involuntario que no se explica por una vivienda eficiente y coincide con restricción económica.',
      activationRationale:'Exige simultáneamente señal de infraconsumo, condiciones que descarten eficiencia como explicación y restricción económica. I4 refuerza la prioridad.',
      cautions:['I8 sigue siendo una aproximación de demo; la referencia comparable debe ajustarse por hogar, vivienda y clima.'],
    }),
    P4:make('P4', ['I15','I16','I17'], ['I5','I6','I9','I10'], riskOr('I15','I16','I17'), {
      description:'Necesidades energéticas críticas asociadas a dependencia, movilidad reducida, salud o equipos eléctricos.',
      activationRationale:'Se activa cuando existe al menos una señal primaria de fragilidad. La renta no es un requisito de entrada.',
      cautions:['La continuidad eléctrica necesita una salvaguarda específica además del score ponderado.'],
    }),
    P5:make('P5', ['I18','I19'], ['I22','I23'], riskOr('I18','I19'), {
      description:'Desventaja territorial o barreras efectivas de acceso a infraestructuras, servicios y mecanismos de protección.',
      activationRationale:'Se activa por riesgo territorial o por barreras efectivas de acceso; apoyo y participación modulan la prioridad.',
      cautions:['I19 aparece en D1.5 y en la propuesta de perfiles, pero está retirado en el catálogo V3.0. Se conserva temporalmente para trazabilidad hasta acordar sustituto.'],
    }),
    P6:make('P6', ['I22','I23','I24'], ['I1','I3','I13','I14','I18'], riskOr('I22','I23','I24'), {
      description:'Debilidad de apoyo social, integración comunitaria y capacidad efectiva de participar o acceder a ayuda.',
      activationRationale:'Se activa por una señal social primaria; las dimensiones económica, territorial y digital amplifican la prioridad.',
      pendingIndicators:['I13','I14'],
      cautions:['I13 e I14 están en el catálogo V3.0 y en D1.5, pero la demo aún no dispone de datos ni normalización ejecutable; quedan visibles como pendientes.'],
    }),
  };
}

let profileSeedCache = null;
function seedProfileDefinitions() {
  if (!profileSeedCache) profileSeedCache = documentedProfileSeeds();
  return cloneExpression(profileSeedCache);
}

function readDeletedProfileIds() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const ids = JSON.parse(localStorage.getItem(PROFILE_DELETED_KEY) || '[]');
    return Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && id))] : [];
  } catch (error) {
    return [];
  }
}

function writeDeletedProfileIds(ids) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(PROFILE_DELETED_KEY, JSON.stringify([...new Set(ids)]));
}

function readProfileDefinitions() {
  let stored = {};
  if (typeof localStorage !== 'undefined') {
    try { stored = JSON.parse(localStorage.getItem(PROFILE_DEFINITIONS_KEY) || '{}'); } catch (error) { stored = {}; }
  }
  const deleted = new Set(readDeletedProfileIds());
  return Object.fromEntries(Object.entries({...seedProfileDefinitions(), ...stored}).filter(([profileId]) => !deleted.has(profileId)));
}

function collectWeightedKeys(expression) {
  const keys = [];
  walkExpression(expression, node => {
    if (node.type === 'weightedSum') for (const key of node.weightKeys || []) if (!keys.includes(key)) keys.push(key);
  });
  return keys;
}

function initialProfileWeights(expression) {
  const weights = {};
  walkExpression(expression, node => {
    if (node.type !== 'weightedSum') return;
    for (const key of node.weightKeys || []) {
      const value = Number(node.initialWeights?.[key]);
      weights[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
    }
  });
  return normalizeWeights(weights, Object.keys(weights));
}

function profileDefinitionExpression(definition) {
  return {
    type:'if',
    operands:[
      cloneExpression(definition.activationExpression),
      cloneExpression(definition.prioritizationExpression),
      {type:'constant', dataType:'number', value:0, unit:UNIT_DIMENSIONLESS, label:'Perfil no activado'},
    ],
  };
}

function profileDependencies(definition) {
  return [...new Set([
    ...extractIndicatorDependencies(definition.activationExpression),
    ...extractIndicatorDependencies(definition.prioritizationExpression),
  ])];
}

function validateProfileDefinition(definition) {
  const activation = validateExpression(definition.activationExpression, {indicatorCatalog:INDICATOR_CATALOG, output:{type:'boolean',unit:UNIT_DIMENSIONLESS}});
  const prioritization = validateExpression(definition.prioritizationExpression, {indicatorCatalog:INDICATOR_CATALOG, output:{type:'number',unit:UNIT_DIMENSIONLESS}});
  const dependencies = profileDependencies(definition);
  const unavailable = dependencies.filter(id => !INDICATOR_DEFS[id]);
  const weightedKeys = collectWeightedKeys(definition.prioritizationExpression);
  const errors = [...activation.errors, ...prioritization.errors];
  if (!weightedKeys.length) errors.push('La priorización necesita al menos un bloque WEIGHTED SUM para que la fase experta pueda ponderar variables.');
  if (unavailable.length) errors.push(`Estos indicadores aún no tienen normalización ejecutable para perfiles: ${unavailable.join(', ')}.`);
  return {
    valid:errors.length === 0,
    errors:[...new Set(errors)],
    warnings:[...new Set([...activation.warnings, ...prioritization.warnings])],
    dependencies, weightedKeys, activation, prioritization,
  };
}

function profileDefinitionToRuntime(definition) {
  const dependencies = profileDependencies(definition);
  const weightKeys = collectWeightedKeys(definition.prioritizationExpression);
  return {
    name:definition.metadata.name,
    short:definition.metadata.short || definition.profileId,
    color:definition.metadata.color || '#2563EB',
    display_keys:dependencies.filter(id => !!INDICATOR_DEFS[id]),
    weight_keys:weightKeys,
    init_weights:initialProfileWeights(definition.prioritizationExpression),
    question:definition.metadata.question || `¿Presenta vulnerabilidad ${definition.metadata.name}?`,
    expression:profileDefinitionExpression(definition),
    activation_expression:cloneExpression(definition.activationExpression),
    methodology:cloneExpression(definition.methodology),
    profileDefinitionVersion:definition.updatedAt || 'documented-baseline-v2',
  };
}

function hydrateApprovedProfiles() {
  const seeds = seedProfileDefinitions();
  for (const profileId of readDeletedProfileIds()) delete PROFILES[profileId];
  for (const definition of Object.values(readProfileDefinitions())) {
    const published = definition.status === 'APPROVED' ? definition : seeds[definition.profileId];
    if (published && validateProfileDefinition(published).valid) PROFILES[published.profileId] = profileDefinitionToRuntime(published);
  }
}

function saveProfileDefinition(definition) {
  writeDeletedProfileIds(readDeletedProfileIds().filter(profileId => profileId !== definition.profileId));
  let stored = {};
  if (typeof localStorage !== 'undefined') {
    try { stored = JSON.parse(localStorage.getItem(PROFILE_DEFINITIONS_KEY) || '{}'); } catch (error) { stored = {}; }
    stored[definition.profileId] = cloneExpression(definition);
    localStorage.setItem(PROFILE_DEFINITIONS_KEY, JSON.stringify(stored));
  }
  if (definition.status === 'APPROVED') PROFILES[definition.profileId] = profileDefinitionToRuntime(definition);
  return definition;
}

function deleteProfileDefinition(profileId) {
  let stored = {};
  if (typeof localStorage !== 'undefined') {
    try { stored = JSON.parse(localStorage.getItem(PROFILE_DEFINITIONS_KEY) || '{}'); } catch (error) { stored = {}; }
    delete stored[profileId];
    localStorage.setItem(PROFILE_DEFINITIONS_KEY, JSON.stringify(stored));
  }
  writeDeletedProfileIds([...readDeletedProfileIds(), profileId]);
  delete PROFILES[profileId];
}

function createProfileDraft(profileId) {
  return {
    schemaVersion:PROFILE_SCHEMA_VERSION,
    profileId,
    metadata:{name:'Nuevo perfil de vulnerabilidad',short:profileId,color:'#475569',question:`¿Presenta vulnerabilidad ${profileId}?`,description:'Define el propósito y el alcance del perfil.'},
    methodology:{source:'Borrador creado en la demo',primaryIndicators:['I1'],secondaryIndicators:[],pendingIndicators:[],activationStatus:'BORRADOR',prioritizationStatus:'SIN VALIDAR',activationRationale:'Describe aquí por qué se activa.',cautions:[]},
    activationExpression:riskRef('I1'),
    prioritizationExpression:createWeightedProfileExpression(['I1'], {I1:1}),
    output:{type:'number',unit:'score 0–1',nullable:false,name:'Nuevo perfil de vulnerabilidad'},
    status:'DRAFT',updatedAt:null,author:'',
  };
}

function serializeProfileDefinition(definition) { return JSON.stringify(definition, null, 2); }

function deserializeProfileDefinition(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : cloneExpression(json);
  if (!parsed || parsed.schemaVersion !== PROFILE_SCHEMA_VERSION || !parsed.profileId || !parsed.metadata || !parsed.activationExpression || !parsed.prioritizationExpression) throw new Error('El JSON no es una definición de perfil schemaVersion 2.');
  return parsed;
}

hydrateApprovedProfiles();
