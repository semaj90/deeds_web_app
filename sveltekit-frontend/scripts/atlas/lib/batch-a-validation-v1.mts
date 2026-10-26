import { createHash } from 'node:crypto';

export interface BatchANodeV1 {
  node_id: string | null;
  parent_id?: string | null;
  metadata?: unknown;
}

export interface BatchAEdgeV1 {
  parent_tree_node_id: string;
  child_tree_node_id: string;
  edge_kind: string;
}

export interface BatchASnapshotV1 {
  schema: 'atlas.batch-a.snapshot.v1';
  nodes: BatchANodeV1[];
  edges: BatchAEdgeV1[];
  observedNodeCount: number | null;
  structuralEvidence: boolean;
  inputChecksum: string | null;
}

export interface BatchAGateV1 {
  gate_id: 'A1' | 'A2' | 'A3' | 'A4' | 'A5';
  pass: boolean;
  status: 'PASS' | 'FAIL' | 'NOT_PROVEN';
  message: string;
  metric?: number;
  threshold?: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

export function parseBatchASnapshotV1(value: unknown): BatchASnapshotV1 {
  if (!record(value) || value.schema !== 'atlas.batch-a.snapshot.v1'
    || !Array.isArray(value.nodes) || !Array.isArray(value.edges)
    || typeof value.structuralEvidence !== 'boolean'
    || !(value.observedNodeCount === null || (Number.isSafeInteger(value.observedNodeCount) && Number(value.observedNodeCount) >= 0))
    || !(value.inputChecksum === null || (typeof value.inputChecksum === 'string' && /^sha256:[0-9a-f]{64}$/.test(value.inputChecksum)))) {
    throw new Error('INVALID_BATCH_A_SNAPSHOT');
  }
  for (const node of value.nodes) {
    if (!record(node) || !(node.node_id === null || identifier(node.node_id))
      || !(node.parent_id === undefined || node.parent_id === null || identifier(node.parent_id))) {
      throw new Error('INVALID_BATCH_A_NODE');
    }
  }
  for (const edge of value.edges) {
    if (!record(edge) || !identifier(edge.parent_tree_node_id) || !identifier(edge.child_tree_node_id)
      || !['parent_child', 'import_call', 'type_reference'].includes(String(edge.edge_kind))) {
      throw new Error('INVALID_BATCH_A_EDGE');
    }
  }
  return value as unknown as BatchASnapshotV1;
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  throw new Error('NON_JSON_BATCH_A_SNAPSHOT');
}

function rowOrder(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function checksumBatchASnapshotV1(snapshot: BatchASnapshotV1): string {
  const valid = parseBatchASnapshotV1(snapshot);
  const payload = {
    schema: valid.schema,
    inputChecksum: valid.inputChecksum,
    observedNodeCount: valid.observedNodeCount,
    structuralEvidence: valid.structuralEvidence,
    nodes: valid.nodes.map(node => JSON.stringify(canonical(node))).sort(rowOrder),
    edges: valid.edges.map(edge => JSON.stringify(canonical(edge))).sort(rowOrder),
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function gate(gate_id: BatchAGateV1['gate_id'], status: BatchAGateV1['status'], message: string,
  measurement: { metric?: number; threshold?: number } = {}): BatchAGateV1 {
  return { gate_id, status, pass: status === 'PASS', message, ...measurement };
}

export function validateBatchASnapshotV1(snapshot: BatchASnapshotV1, replay?: BatchASnapshotV1): BatchAGateV1[] {
  const valid = parseBatchASnapshotV1(snapshot);
  const ids = valid.nodes.map(node => node.node_id).filter(identifier);
  const distinct = new Set(ids);
  const denominator = valid.observedNodeCount;
  const coverageKnown = valid.structuralEvidence && denominator !== null && denominator > 0;
  const coverage = coverageKnown ? ids.length / denominator : 0;
  const coverageValid = coverageKnown && valid.nodes.length <= denominator && coverage >= 0.95 && coverage <= 1;
  const coverageGate = gate('A1', coverageKnown ? (coverageValid ? 'PASS' : 'FAIL') : 'NOT_PROVEN',
    coverageKnown ? `Identified parser nodes: ${ids.length}/${denominator}` : 'Native node denominator and structural evidence required',
    coverageKnown ? { metric: coverage, threshold: 0.95 } : { threshold: 0.95 });
  const duplicates = ids.length - distinct.size;
  const identityGate = gate('A2', duplicates === 0 && ids.length === valid.nodes.length ? 'PASS' : 'FAIL',
    `Duplicate node IDs: ${duplicates}; unidentified rows: ${valid.nodes.length - ids.length}`, { metric: duplicates });

  let replayGate: BatchAGateV1;
  if (!replay || !valid.inputChecksum || !parseBatchASnapshotV1(replay).inputChecksum) {
    replayGate = gate('A3', 'NOT_PROVEN', 'Two independently captured snapshots with input checksums required');
  } else if (valid.inputChecksum !== replay.inputChecksum) {
    replayGate = gate('A3', 'FAIL', 'Replay input checksum differs');
  } else {
    const equal = checksumBatchASnapshotV1(valid) === checksumBatchASnapshotV1(replay);
    replayGate = gate('A3', equal ? 'PASS' : 'FAIL', equal ? 'Canonical row and edge replay matches' : 'Replay rows or edges differ');
  }

  const adjacency = new Map([...distinct].map(id => [id, new Set<string>()]));
  let dangling = 0;
  const addParent = (parent: string, child: string) => {
    if (distinct.has(parent) && distinct.has(child)) adjacency.get(parent)!.add(child);
  };
  for (const edge of valid.edges) {
    if (!distinct.has(edge.parent_tree_node_id) || !distinct.has(edge.child_tree_node_id)) dangling++;
    if (edge.edge_kind === 'parent_child') addParent(edge.parent_tree_node_id, edge.child_tree_node_id);
  }
  for (const node of valid.nodes) {
    if (node.parent_id) {
      if (!distinct.has(node.parent_id) || !identifier(node.node_id)) dangling++;
      if (identifier(node.node_id)) addParent(node.parent_id, node.node_id);
    }
  }
  const indegree = new Map([...distinct].map(id => [id, 0]));
  for (const children of adjacency.values()) {
    for (const child of children) indegree.set(child, indegree.get(child)! + 1);
  }
  const ready = [...distinct].filter(id => indegree.get(id) === 0);
  for (let position = 0; position < ready.length; position++) {
    for (const child of adjacency.get(ready[position])!) {
      const remaining = indegree.get(child)! - 1;
      indegree.set(child, remaining);
      if (remaining === 0) ready.push(child);
    }
  }
  const cyclic = ready.length !== distinct.size;
  return [coverageGate, identityGate, replayGate,
    gate('A4', cyclic ? 'FAIL' : 'PASS', cyclic ? 'Parent graph contains a cycle' : 'Parent graph is acyclic'),
    gate('A5', dangling === 0 ? 'PASS' : 'FAIL', `Dangling parent/edge references: ${dangling}`, { metric: dangling })];
}
