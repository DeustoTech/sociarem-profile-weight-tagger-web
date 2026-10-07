'use strict';

// Lightweight unit reasoning. It intentionally avoids full dimensional
// algebra, but catches the mistakes that are useful during methodology work.

const UNIT_DIMENSIONLESS = '1';

function normalizeUnit(unit) {
  const value = String(unit || '').trim();
  if (!value || ['1', 'dimensionless', 'sin unidad'].includes(value.toLowerCase())) return UNIT_DIMENSIONLESS;
  return value;
}

function unitsEqual(left, right) {
  return normalizeUnit(left).toLowerCase() === normalizeUnit(right).toLowerCase();
}

function inferAdditiveUnit(units) {
  const normalized = units.map(normalizeUnit);
  if (!normalized.length) return {unit:UNIT_DIMENSIONLESS, warnings:[], errors:['La operación no tiene operandos.']};
  const first = normalized[0];
  const incompatible = normalized.filter(unit => !unitsEqual(unit, first));
  return incompatible.length
    ? {unit:null, warnings:[], errors:[`No se pueden combinar unidades incompatibles: ${[...new Set(normalized)].join(' y ')}.`]}
    : {unit:first, warnings:[], errors:[]};
}

function inferMultiplyUnit(left, right) {
  const a = normalizeUnit(left), b = normalizeUnit(right);
  if (a === UNIT_DIMENSIONLESS) return {unit:b, warnings:[], errors:[]};
  if (b === UNIT_DIMENSIONLESS) return {unit:a, warnings:[], errors:[]};
  return {unit:`${a}·${b}`, warnings:[`Unidad compuesta inferida como ${a}·${b}; revísala metodológicamente.`], errors:[]};
}

function inferDivideUnit(left, right) {
  const a = normalizeUnit(left), b = normalizeUnit(right);
  if (unitsEqual(a, b)) return {unit:UNIT_DIMENSIONLESS, warnings:[], errors:[]};
  if (b === UNIT_DIMENSIONLESS) return {unit:a, warnings:[], errors:[]};
  if (a === UNIT_DIMENSIONLESS) return {unit:`1/${b}`, warnings:[`Unidad inversa inferida como 1/${b}.`], errors:[]};
  return {unit:`${a}/${b}`, warnings:[`Unidad compuesta inferida como ${a}/${b}; puede sobrescribirse en OUTPUT.`], errors:[]};
}

function inferComparisonUnit(units) {
  const check = inferAdditiveUnit(units);
  return {unit:UNIT_DIMENSIONLESS, warnings:check.warnings, errors:check.errors};
}

function mergeUnitDiagnostics(...diagnostics) {
  return diagnostics.reduce((result, item) => ({
    unit: item.unit ?? result.unit,
    warnings: [...result.warnings, ...(item.warnings || [])],
    errors: [...result.errors, ...(item.errors || [])],
  }), {unit:null, warnings:[], errors:[]});
}
