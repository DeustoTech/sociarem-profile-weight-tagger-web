'use strict';

const EXPRESSION_SCHEMA_VERSION = 1;
const EXPRESSION_TYPES = ['number','integer','boolean','ordinal','category','vector','text','unknown'];

const BLOCK_DEFINITIONS = {
  rawInput:      {family:'input', label:'Raw field', arity:0},
  indicatorRef:  {family:'input', label:'Indicator', arity:0},
  constant:      {family:'input', label:'Constant', arity:0},
  parameter:     {family:'input', label:'Parameter', arity:0},
  add:           {family:'math', label:'ADD', arity:2, nary:true},
  subtract:      {family:'math', label:'SUBTRACT', arity:2},
  multiply:      {family:'math', label:'MULTIPLY', arity:2, nary:true},
  divide:        {family:'math', label:'DIVIDE', arity:2},
  sum:           {family:'math', label:'SUM', arity:2, nary:true},
  average:       {family:'math', label:'AVERAGE', arity:2, nary:true},
  min:           {family:'math', label:'MIN', arity:2, nary:true},
  max:           {family:'math', label:'MAX', arity:2, nary:true},
  abs:           {family:'math', label:'ABS', arity:1},
  power:         {family:'math', label:'POWER', arity:2},
  percent:       {family:'math', label:'PERCENT', arity:1},
  lt:            {family:'comparison', label:'<', arity:2},
  lte:           {family:'comparison', label:'≤', arity:2},
  gt:            {family:'comparison', label:'>', arity:2},
  gte:           {family:'comparison', label:'≥', arity:2},
  eq:            {family:'comparison', label:'==', arity:2},
  neq:           {family:'comparison', label:'!=', arity:2},
  between:       {family:'comparison', label:'BETWEEN', arity:3},
  notBetween:    {family:'comparison', label:'NOT BETWEEN', arity:3},
  and:           {family:'logic', label:'AND', arity:2, nary:true},
  or:            {family:'logic', label:'OR', arity:2, nary:true},
  not:           {family:'logic', label:'NOT', arity:1},
  if:            {family:'flow', label:'IF / THEN / ELSE', arity:3},
  clamp:         {family:'transform', label:'CLAMP', arity:3},
  normalize:     {family:'transform', label:'NORMALIZE', arity:3},
  mapCategory:   {family:'transform', label:'MAP CATEGORY', arity:1},
  round:         {family:'transform', label:'ROUND', arity:1},
  scale:         {family:'transform', label:'UNIT SCALE', arity:2},
};

const NUMERIC_TYPES = new Set(['number','integer','ordinal']);

function cloneExpression(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makePlaceholder(type = 'number', label = 'Valor') {
  if (type === 'boolean') return {type:'constant', dataType:'boolean', value:false, label};
  if (type === 'category' || type === 'text') return {type:'constant', dataType:type, value:'', label};
  return {type:'constant', dataType:type, value:0, unit:UNIT_DIMENSIONLESS, label};
}

function createExpressionNode(type) {
  const definition = BLOCK_DEFINITIONS[type];
  if (!definition) throw new Error(`Tipo de bloque desconocido: ${type}`);
  if (type === 'rawInput') return {type, inputId:`input_${Date.now()}`, source:'', field:'', label:'Nuevo campo', dataType:'number', unit:UNIT_DIMENSIONLESS, sensitivity:'Media', sampleValue:0};
  if (type === 'indicatorRef') return {type, indicatorId:'I1', label:'I1', dataType:'number', unit:UNIT_DIMENSIONLESS, sampleValue:0};
  if (type === 'constant') return makePlaceholder('number', 'Constante');
  if (type === 'parameter') return {type, parameterId:`parameter_${Date.now()}`, name:'Nuevo parámetro', description:'', dataType:'number', defaultValue:0, unit:UNIT_DIMENSIONLESS};
  const node = {type, operands:[]};
  const childTypes = type === 'if' ? ['boolean','number','number']
    : ['and','or','not'].includes(type) ? Array(definition.arity).fill('boolean')
    : Array(definition.arity).fill('number');
  node.operands = childTypes.map((childType, index) => makePlaceholder(childType, `${definition.label} ${index + 1}`));
  if (type === 'mapCategory') { node.mapping = {}; node.defaultValue = ''; node.outputType = 'category'; }
  if (type === 'round') node.decimals = 0;
  return node;
}

function getNodeAtPath(expression, path) {
  let node = expression;
  for (const index of path) node = node?.operands?.[index];
  return node || null;
}

function replaceNodeAtPath(expression, path, replacement) {
  if (!path.length) return replacement;
  const root = cloneExpression(expression);
  const parent = getNodeAtPath(root, path.slice(0, -1));
  parent.operands[path[path.length - 1]] = replacement;
  return root;
}

function walkExpression(node, visitor, path = []) {
  if (!node) return;
  visitor(node, path);
  (node.operands || []).forEach((child, index) => walkExpression(child, visitor, [...path, index]));
}

function expressionInputKey(node) {
  if (node.type === 'rawInput') return `raw:${node.inputId}`;
  if (node.type === 'indicatorRef') return `indicator:${node.indicatorId}`;
  if (node.type === 'parameter') return `parameter:${node.parameterId}`;
  return null;
}

function collectExpressionInputs(expression) {
  const found = new Map();
  walkExpression(expression, node => {
    const key = expressionInputKey(node);
    if (key && !found.has(key)) found.set(key, cloneExpression(node));
  });
  return [...found.entries()].map(([key, node]) => ({key, node}));
}

function nodeDataType(node) {
  if (!node) return 'unknown';
  if (['rawInput','indicatorRef','constant','parameter'].includes(node.type)) return node.dataType || 'unknown';
  if (['lt','lte','gt','gte','eq','neq','between','notBetween','and','or','not'].includes(node.type)) return 'boolean';
  if (node.type === 'if') {
    const left = nodeDataType(node.operands?.[1]), right = nodeDataType(node.operands?.[2]);
    return left === right ? left : 'unknown';
  }
  if (node.type === 'mapCategory') return node.outputType || 'category';
  if (node.type === 'round') return 'integer';
  return 'number';
}

function inferExpressionUnit(node) {
  if (!node) return {unit:null, warnings:[], errors:['Expresión incompleta.']};
  if (['rawInput','indicatorRef','constant','parameter'].includes(node.type)) return {unit:normalizeUnit(node.unit), warnings:[], errors:[]};
  const child = (node.operands || []).map(inferExpressionUnit);
  const nestedWarnings = child.flatMap(item => item.warnings);
  const nestedErrors = child.flatMap(item => item.errors);
  const childUnits = child.map(item => item.unit);
  let own = {unit:UNIT_DIMENSIONLESS, warnings:[], errors:[]};
  if (['add','subtract','sum','average','min','max'].includes(node.type)) own = inferAdditiveUnit(childUnits);
  else if (node.type === 'multiply' || node.type === 'scale') own = childUnits.slice(1).reduce((acc, unit) => {
    const next = inferMultiplyUnit(acc.unit, unit);
    return {unit:next.unit, warnings:[...acc.warnings, ...next.warnings], errors:[...acc.errors, ...next.errors]};
  }, {unit:childUnits[0], warnings:[], errors:[]});
  else if (node.type === 'divide') own = inferDivideUnit(childUnits[0], childUnits[1]);
  else if (node.type === 'power') own = {unit:childUnits[0] === UNIT_DIMENSIONLESS ? UNIT_DIMENSIONLESS : `${childUnits[0]}^n`, warnings:childUnits[0] === UNIT_DIMENSIONLESS ? [] : ['La unidad de POWER requiere revisión manual.'], errors:[]};
  else if (node.type === 'abs' || node.type === 'round' || node.type === 'mapCategory') own = {unit:childUnits[0], warnings:[], errors:[]};
  else if (node.type === 'percent') own = {unit:'%', warnings:childUnits[0] === UNIT_DIMENSIONLESS ? [] : ['PERCENT suele esperar una entrada sin dimensión.'], errors:[]};
  else if (['lt','lte','gt','gte','eq','neq','between','notBetween'].includes(node.type)) own = inferComparisonUnit(childUnits);
  else if (['and','or','not'].includes(node.type)) own = {unit:UNIT_DIMENSIONLESS, warnings:[], errors:[]};
  else if (node.type === 'if') own = inferAdditiveUnit(childUnits.slice(1));
  else if (node.type === 'clamp') own = inferAdditiveUnit(childUnits);
  else if (node.type === 'normalize') own = {...inferComparisonUnit(childUnits), unit:UNIT_DIMENSIONLESS};
  return {unit:own.unit, warnings:[...nestedWarnings, ...own.warnings], errors:[...nestedErrors, ...own.errors]};
}

function validateExpression(expression, options = {}) {
  const errors = [], warnings = [];
  const indicatorIds = new Set((options.indicatorCatalog || []).map(item => item.id));
  if (!expression) return {valid:false, errors:['La definición computacional está pendiente.'], warnings, inferredType:'unknown', inferredUnit:null, dependencies:[]};

  walkExpression(expression, (node, path) => {
    const where = path.length ? `Bloque ${path.join('.')}` : 'Bloque raíz';
    const def = BLOCK_DEFINITIONS[node.type];
    if (!def) { errors.push(`${where}: tipo desconocido “${node.type}”.`); return; }
    const operands = node.operands || [];
    if (def.arity > operands.length) errors.push(`${where} (${def.label}): faltan operandos.`);
    if (!def.nary && operands.length > def.arity) errors.push(`${where} (${def.label}): demasiados operandos.`);
    if (node.type === 'rawInput' && (!node.inputId || !node.field)) errors.push(`${where}: el raw field necesita identificador y nombre de campo.`);
    if (node.type === 'indicatorRef' && (!node.indicatorId || (indicatorIds.size && !indicatorIds.has(node.indicatorId)))) errors.push(`${where}: dependencia de indicador inexistente.`);
    if (node.type === 'parameter' && !node.parameterId) errors.push(`${where}: el parámetro necesita un identificador.`);

    const types = operands.map(nodeDataType);
    if (['add','subtract','multiply','divide','sum','average','min','max','abs','power','percent','clamp','normalize','round','scale'].includes(node.type) && types.some(type => !NUMERIC_TYPES.has(type))) {
      errors.push(`${where} (${def.label}): solo acepta números.`);
    }
    if (['and','or','not'].includes(node.type) && types.some(type => type !== 'boolean')) errors.push(`${where} (${def.label}): requiere booleanos.`);
    if (['lt','lte','gt','gte','between','notBetween'].includes(node.type) && types.some(type => !NUMERIC_TYPES.has(type))) errors.push(`${where} (${def.label}): requiere valores numéricos.`);
    if (['eq','neq'].includes(node.type) && types.length === 2 && types[0] !== types[1] && !(types.every(type => NUMERIC_TYPES.has(type)))) errors.push(`${where} (${def.label}): compara tipos incompatibles.`);
    if (node.type === 'if') {
      if (types[0] !== 'boolean') errors.push(`${where} (IF): la condición debe ser booleana.`);
      if (types[1] !== types[2] && !types.slice(1).every(type => NUMERIC_TYPES.has(type))) errors.push(`${where} (IF): THEN y ELSE deben producir tipos compatibles.`);
    }
    if (node.type === 'divide' && node.operands?.[1]?.type === 'constant' && Number(node.operands[1].value) === 0) errors.push(`${where}: división por cero constante.`);
  });

  const unitInfo = inferExpressionUnit(expression);
  errors.push(...unitInfo.errors);
  warnings.push(...unitInfo.warnings);
  const inferredType = nodeDataType(expression);
  const output = options.output || {};
  if (output.type && output.type !== inferredType && !(NUMERIC_TYPES.has(output.type) && NUMERIC_TYPES.has(inferredType))) errors.push(`OUTPUT declara ${output.type}, pero la expresión produce ${inferredType}.`);
  if (output.unit && unitInfo.unit && !unitsEqual(output.unit, unitInfo.unit)) warnings.push(`OUTPUT usa ${output.unit}; la unidad inferida es ${unitInfo.unit}.`);
  const dependencies = [];
  walkExpression(expression, node => { if (node.type === 'indicatorRef' && !dependencies.includes(node.indicatorId)) dependencies.push(node.indicatorId); });
  return {valid:errors.length === 0, errors:[...new Set(errors)], warnings:[...new Set(warnings)], inferredType, inferredUnit:unitInfo.unit, dependencies};
}

function expressionToMath(node) {
  if (!node) return '∅';
  if (node.type === 'rawInput') return node.label || node.field || node.inputId;
  if (node.type === 'indicatorRef') return node.indicatorId;
  if (node.type === 'constant') return typeof node.value === 'string' ? `“${node.value}”` : String(node.value);
  if (node.type === 'parameter') return node.name || node.parameterId;
  const values = (node.operands || []).map(expressionToMath);
  const infix = {add:' + ', subtract:' − ', multiply:' × ', divide:' ÷ ', power:' ^ ', lt:' < ', lte:' ≤ ', gt:' > ', gte:' ≥ ', eq:' == ', neq:' != ', and:' AND ', or:' OR '};
  if (infix[node.type]) return `(${values.join(infix[node.type])})`;
  if (node.type === 'if') return `IF ${values[0]} THEN ${values[1]} ELSE ${values[2]}`;
  if (node.type === 'between' || node.type === 'notBetween') return `${values[0]} ${node.type === 'between' ? '' : 'NOT '}BETWEEN ${values[1]} AND ${values[2]}`;
  const names = {sum:'SUM',average:'AVG',min:'MIN',max:'MAX',abs:'ABS',not:'NOT',percent:'PERCENT',clamp:'CLAMP',normalize:'NORMALIZE',mapCategory:'MAP',round:'ROUND',scale:'SCALE'};
  return `${names[node.type] || node.type.toUpperCase()}(${values.join(', ')})`;
}

function expressionToNaturalLanguage(node) {
  if (!node) return 'Definición computacional pendiente.';
  if (node.type === 'rawInput') return `el campo ${node.label || node.field}`;
  if (node.type === 'indicatorRef') return `el indicador ${node.indicatorId}`;
  if (node.type === 'constant') return `la constante ${String(node.value)}`;
  if (node.type === 'parameter') return `el parámetro ${node.name || node.parameterId}`;
  const values = (node.operands || []).map(expressionToNaturalLanguage);
  const join = (verb, connector = ' y ') => `${verb} ${values.join(connector)}`;
  const phrases = {
    add:()=>join('Sumar'), subtract:()=>`Restar ${values[1]} de ${values[0]}`, multiply:()=>join('Multiplicar'), divide:()=>`Dividir ${values[0]} entre ${values[1]}`,
    sum:()=>join('Sumar'), average:()=>join('Calcular la media de'), min:()=>join('Tomar el mínimo de'), max:()=>join('Tomar el máximo de'), abs:()=>`Tomar el valor absoluto de ${values[0]}`,
    power:()=>`Elevar ${values[0]} a ${values[1]}`, percent:()=>`Convertir ${values[0]} a porcentaje`,
    lt:()=>`Comprobar si ${values[0]} es menor que ${values[1]}`, lte:()=>`Comprobar si ${values[0]} es menor o igual que ${values[1]}`,
    gt:()=>`Comprobar si ${values[0]} es mayor que ${values[1]}`, gte:()=>`Comprobar si ${values[0]} es mayor o igual que ${values[1]}`,
    eq:()=>`Comprobar si ${values[0]} es igual a ${values[1]}`, neq:()=>`Comprobar si ${values[0]} es distinto de ${values[1]}`,
    between:()=>`Comprobar si ${values[0]} está entre ${values[1]} y ${values[2]}`, notBetween:()=>`Comprobar si ${values[0]} no está entre ${values[1]} y ${values[2]}`,
    and:()=>join('Exigir simultáneamente', ' y '), or:()=>join('Aceptar cualquiera de', ' o '), not:()=>`Negar ${values[0]}`,
    if:()=>`Si ${values[0]}, devolver ${values[1]}; en caso contrario, devolver ${values[2]}`,
    clamp:()=>`Limitar ${values[0]} entre ${values[1]} y ${values[2]}`, normalize:()=>`Normalizar ${values[0]} entre ${values[1]} y ${values[2]}`,
    mapCategory:()=>`Mapear la categoría de ${values[0]}`, round:()=>`Redondear ${values[0]} a ${node.decimals || 0} decimales`, scale:()=>`Escalar ${values[0]} por ${values[1]}`,
  };
  return (phrases[node.type] || (()=>`${node.type} de ${values.join(', ')}`))();
}
