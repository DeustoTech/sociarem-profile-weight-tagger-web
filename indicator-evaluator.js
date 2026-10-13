'use strict';

class IndicatorEvaluationError extends Error {
  constructor(code, message, path = []) {
    super(message);
    this.name = 'IndicatorEvaluationError';
    this.code = code;
    this.path = path;
  }
}

function coerceInputValue(value, dataType, label, path) {
  if (value === '' || value === null || value === undefined) throw new IndicatorEvaluationError('EMPTY_INPUT', `${label}: input vacío.`, path);
  if (dataType === 'boolean') {
    if (value === true || value === false) return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    throw new IndicatorEvaluationError('INVALID_BOOLEAN', `${label}: valor booleano no válido.`, path);
  }
  if (NUMERIC_TYPES.has(dataType)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new IndicatorEvaluationError('NOT_NUMERIC', `${label}: valor no numérico.`, path);
    return dataType === 'integer' ? Math.round(number) : number;
  }
  if (dataType === 'vector') {
    if (Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) { /* handled below */ }
    throw new IndicatorEvaluationError('INVALID_VECTOR', `${label}: la lista debe ser JSON válido.`, path);
  }
  return String(value);
}

function evaluateExpression(expression, context = {}) {
  const trace = [];
  let step = 0;
  const format = value => Array.isArray(value) ? JSON.stringify(value) : typeof value === 'string' ? `“${value}”` : String(value);
  const record = (node, args, value) => {
    step += 1;
    trace.push({step, type:node.type, inputs:cloneExpression(args), result:cloneExpression(value), text:`${step}. ${BLOCK_DEFINITIONS[node.type]?.label || node.type.toUpperCase()}(${args.map(format).join(', ')}) = ${format(value)}`});
    return value;
  };

  function visit(node, path = []) {
    if (!node || !node.type) throw new IndicatorEvaluationError('INCOMPLETE_EXPRESSION', 'Expresión incompleta.', path);
    if (node.type === 'rawInput') {
      const value = context.raw?.[node.inputId];
      return coerceInputValue(value, node.dataType || 'number', node.label || node.field || node.inputId, path);
    }
    if (node.type === 'indicatorRef') {
      const source = node.valueMode === 'risk' ? context.riskIndicators : node.valueMode === 'raw' ? context.rawIndicators : context.indicators;
      if (!(node.indicatorId in (source || {}))) throw new IndicatorEvaluationError('MISSING_DEPENDENCY', `Falta el valor de ${node.indicatorId}.`, path);
      return coerceInputValue(source[node.indicatorId], node.dataType || 'number', node.indicatorId, path);
    }
    if (node.type === 'constant') return coerceInputValue(node.value, node.dataType || 'number', node.label || 'Constante', path);
    if (node.type === 'parameter') {
      const supplied = context.parameters && node.parameterId in context.parameters ? context.parameters[node.parameterId] : node.defaultValue;
      return coerceInputValue(supplied, node.dataType || 'number', node.name || node.parameterId, path);
    }

    if (node.type === 'if') {
      if (!node.operands || node.operands.length < 3) throw new IndicatorEvaluationError('INCOMPLETE_IF', 'IF requiere condición, THEN y ELSE.', path);
      const condition = visit(node.operands[0], [...path, 0]);
      if (typeof condition !== 'boolean') throw new IndicatorEvaluationError('TYPE_ERROR', 'IF requiere una condición booleana.', path);
      const branchIndex = condition ? 1 : 2;
      const branchValue = visit(node.operands[branchIndex], [...path, branchIndex]);
      return record(node, [condition, branchValue], branchValue);
    }

    const args = (node.operands || []).map((child, index) => visit(child, [...path, index]));
    const numeric = () => {
      if (args.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new IndicatorEvaluationError('TYPE_ERROR', `${node.type} requiere operandos numéricos.`, path);
    };
    const boolean = () => {
      if (args.some(value => typeof value !== 'boolean')) throw new IndicatorEvaluationError('TYPE_ERROR', `${node.type} requiere operandos booleanos.`, path);
    };
    let value;
    switch (node.type) {
      case 'weightedSum': {
        numeric();
        const weightValues = args.map((_, index) => Math.max(0, Number(context.weights?.[node.weightKeys?.[index]]) || 0));
        const totalWeight = weightValues.reduce((sum, weight) => sum + weight, 0);
        if (totalWeight <= 0) throw new IndicatorEvaluationError('ZERO_WEIGHTS', 'WEIGHTED SUM necesita al menos un peso mayor que cero.', path);
        value = args.reduce((sum, operand, index) => sum + operand * weightValues[index], 0) / totalWeight;
        break;
      }
      case 'add': case 'sum': numeric(); value = args.reduce((a,b)=>a+b,0); break;
      case 'subtract': numeric(); value = args[0] - args[1]; break;
      case 'multiply': case 'scale': numeric(); value = args.reduce((a,b)=>a*b,1); break;
      case 'divide': numeric(); if (args[1] === 0) throw new IndicatorEvaluationError('DIVIDE_BY_ZERO', 'División por cero.', path); value = args[0] / args[1]; break;
      case 'average': numeric(); value = args.reduce((a,b)=>a+b,0) / args.length; break;
      case 'min': numeric(); value = Math.min(...args); break;
      case 'max': numeric(); value = Math.max(...args); break;
      case 'abs': numeric(); value = Math.abs(args[0]); break;
      case 'power': numeric(); value = Math.pow(args[0], args[1]); break;
      case 'percent': numeric(); value = args[0] * 100; break;
      case 'lt': value = args[0] < args[1]; break;
      case 'lte': value = args[0] <= args[1]; break;
      case 'gt': value = args[0] > args[1]; break;
      case 'gte': value = args[0] >= args[1]; break;
      case 'eq': value = args[0] === args[1]; break;
      case 'neq': value = args[0] !== args[1]; break;
      case 'between': numeric(); value = args[0] >= args[1] && args[0] <= args[2]; break;
      case 'notBetween': numeric(); value = args[0] < args[1] || args[0] > args[2]; break;
      case 'and': boolean(); value = args.every(Boolean); break;
      case 'or': boolean(); value = args.some(Boolean); break;
      case 'not': boolean(); value = !args[0]; break;
      case 'clamp': numeric(); value = Math.min(args[2], Math.max(args[1], args[0])); break;
      case 'normalize': numeric(); if (args[2] === args[1]) throw new IndicatorEvaluationError('ZERO_RANGE', 'NORMALIZE requiere mínimo y máximo diferentes.', path); value = (args[0] - args[1]) / (args[2] - args[1]); break;
      case 'mapCategory': {
        const key = String(args[0]);
        value = Object.prototype.hasOwnProperty.call(node.mapping || {}, key) ? node.mapping[key] : node.defaultValue;
        if (value === undefined || value === null || value === '') throw new IndicatorEvaluationError('UNMAPPED_CATEGORY', `La categoría ${key} no tiene correspondencia.`, path);
        break;
      }
      case 'round': numeric(); value = Number(args[0].toFixed(Math.max(0, Number(node.decimals) || 0))); break;
      default: throw new IndicatorEvaluationError('UNKNOWN_NODE', `Bloque no ejecutable: ${node.type}.`, path);
    }
    return record(node, args, value);
  }

  const value = visit(expression, []);
  trace.push({step:step + 1, type:'output', inputs:[value], result:value, text:`${step + 1}. OUTPUT = ${format(value)}`});
  return {value, trace};
}

function evaluateIndicatorDefinition(indicatorId, definitions, context = {}) {
  const resolved = {...(context.indicators || {})};
  const traces = [];

  function resolve(id, stack = []) {
    if (Object.prototype.hasOwnProperty.call(resolved, id)) return resolved[id];
    if (stack.includes(id)) throw new IndicatorEvaluationError('CIRCULAR_DEPENDENCY', `Dependencia circular: ${[...stack,id].join(' → ')}.`);
    const definition = definitions?.[id];
    if (!definition?.expression) throw new IndicatorEvaluationError('MISSING_DEPENDENCY', `No existe una definición computacional para ${id}.`);
    const dependencyValues = {...resolved};
    for (const dependency of extractIndicatorDependencies(definition.expression)) dependencyValues[dependency] = resolve(dependency, [...stack,id]);
    const evaluation = evaluateExpression(definition.expression, {...context, indicators:dependencyValues});
    resolved[id] = evaluation.value;
    traces.push(...evaluation.trace.map(item => ({...item, indicatorId:id, text:`${id} · ${item.text}`})));
    return evaluation.value;
  }

  const value = resolve(indicatorId, []);
  return {value, trace:traces, indicators:resolved};
}
