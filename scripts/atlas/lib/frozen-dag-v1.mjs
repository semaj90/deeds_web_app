import { createHash } from 'node:crypto';

export const EXECUTION_STATES = ['SCHEDULED', 'STARTED', 'PROGRESS', 'FINALIZED', 'INVALIDATED', 'RETRIED', 'SUPERSEDED'];
export const MUTATION_STATES = ['NONE', 'PROPOSED', 'AUTHORIZED', 'APPLIED_TEMP', 'VALIDATED', 'PROMOTED', 'ROLLED_BACK', 'REJECTED'];

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function sha256(value) {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function sortedNodes(nodes) {
  // Canonical node identity is the stable nodeId. This is the deterministic
  // tie-break for otherwise-valid topological orders.
  return [...nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function sortedEdges(edges) {
  return [...edges].sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

export function buildFrozenDag(input) {
  const nodes = sortedNodes(input.nodes);
  const edges = sortedEdges(input.edges);
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  if (nodeIds.size !== nodes.length) throw new Error('DAG_DUPLICATE_NODE');
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`DAG_UNKNOWN_NODE:${edge.from}:${edge.to}`);
  }

  const incoming = new Map(nodes.map((node) => [node.nodeId, 0]));
  const outgoing = new Map(nodes.map((node) => [node.nodeId, []]));
  for (const edge of edges) {
    incoming.set(edge.to, incoming.get(edge.to) + 1);
    outgoing.get(edge.from).push(edge.to);
  }
  for (const targets of outgoing.values()) targets.sort();

  const remaining = new Map(incoming);
  let frontier = nodes.filter((node) => remaining.get(node.nodeId) === 0).map((node) => node.nodeId).sort();
  const topologicalOrder = [];
  const topologicalGenerations = [];
  while (frontier.length > 0) {
    topologicalGenerations.push([...frontier]);
    const next = [];
    for (const nodeId of frontier) {
      topologicalOrder.push(nodeId);
      for (const target of outgoing.get(nodeId)) {
        remaining.set(target, remaining.get(target) - 1);
        if (remaining.get(target) === 0) next.push(target);
      }
    }
    frontier = next.sort();
  }
  if (topologicalOrder.length !== nodes.length) throw new Error('DAG_CYCLE_DETECTED');

  const definition = {
    schema: 'atlas.frozen-dag-definition.v1',
    dagId: input.dagId,
    dagRevision: input.dagRevision,
    kernelRevision: input.kernelRevision,
    nodes,
    edges,
    topologicalOrder,
    topologicalGenerations,
    generationSemantics: 'longest_dependency_distance_from_source',
    frozen: true,
  };
  return { ...definition, checksum: sha256(definition) };
}

export function deriveReadySet(definition, states) {
  const stateById = new Map(states.map((state) => [state.nodeId, state.status]));
  const predecessors = new Map(definition.nodes.map((node) => [node.nodeId, []]));
  for (const edge of definition.edges) predecessors.get(edge.to).push(edge.from);
  return definition.nodes.map((node) => node.nodeId).filter((nodeId) => {
    if ((stateById.get(nodeId) ?? 'SCHEDULED') !== 'SCHEDULED') return false;
    return predecessors.get(nodeId).every((predecessor) => ['FINALIZED', 'SUPERSEDED'].includes(stateById.get(predecessor)));
  }).sort();
}

const transitions = {
  SCHEDULED: new Set(['STARTED', 'INVALIDATED']),
  STARTED: new Set(['PROGRESS', 'FINALIZED', 'INVALIDATED', 'RETRIED']),
  PROGRESS: new Set(['PROGRESS', 'FINALIZED', 'INVALIDATED', 'RETRIED']),
  FINALIZED: new Set(['SUPERSEDED']),
  INVALIDATED: new Set(['RETRIED']),
  RETRIED: new Set(['STARTED', 'INVALIDATED']),
  SUPERSEDED: new Set(),
};

export function applyExecutionEvent(state, event) {
  const current = state[event.nodeId] ?? { nodeId: event.nodeId, status: 'SCHEDULED', mutation: 'NONE' };
  if (!EXECUTION_STATES.includes(event.status) || !transitions[current.status]?.has(event.status)) throw new Error(`INVALID_EXECUTION_TRANSITION:${current.status}->${event.status}`);
  if (!MUTATION_STATES.includes(event.mutation ?? current.mutation)) throw new Error(`INVALID_MUTATION_STATE:${event.mutation}`);
  return { ...state, [event.nodeId]: { ...current, status: event.status, mutation: event.mutation ?? current.mutation } };
}

export function replayExecutionEvents(events) {
  return events.reduce((state, event) => applyExecutionEvent(state, event), {});
}

export function assertMutationTransition(previous, next) {
  const allowed = {
    NONE: ['PROPOSED'], PROPOSED: ['AUTHORIZED', 'REJECTED'], AUTHORIZED: ['APPLIED_TEMP', 'REJECTED'],
    APPLIED_TEMP: ['VALIDATED', 'ROLLED_BACK'], VALIDATED: ['PROMOTED', 'ROLLED_BACK'], PROMOTED: [], ROLLED_BACK: [], REJECTED: [],
  };
  if (!allowed[previous]?.includes(next)) throw new Error(`INVALID_MUTATION_TRANSITION:${previous}->${next}`);
  return next;
}
