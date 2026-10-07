'use strict';

function extractIndicatorDependencies(expression) {
  const dependencies = [];
  walkExpression(expression, node => {
    if (node.type === 'indicatorRef' && node.indicatorId && !dependencies.includes(node.indicatorId)) dependencies.push(node.indicatorId);
  });
  return dependencies.sort();
}

function buildIndicatorDependencyGraph(definitions, candidate = null) {
  const merged = {...(definitions || {})};
  if (candidate?.indicatorId) merged[candidate.indicatorId] = candidate;
  const graph = {};
  for (const indicator of INDICATOR_CATALOG) graph[indicator.id] = [];
  for (const [id, definition] of Object.entries(merged)) graph[id] = extractIndicatorDependencies(definition.expression);
  return graph;
}

function findDependencyCycle(graph) {
  const visiting = new Set(), visited = new Set(), stack = [];
  function visit(id) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visiting.add(id); stack.push(id);
    for (const dependency of graph[id] || []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop(); visiting.delete(id); visited.add(id);
    return null;
  }
  for (const id of Object.keys(graph)) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

function getIndicatorUsedBy(indicatorId, definitions) {
  return Object.entries(buildIndicatorDependencyGraph(definitions))
    .filter(([, dependencies]) => dependencies.includes(indicatorId))
    .map(([id]) => id)
    .sort();
}
