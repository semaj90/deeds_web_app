// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildGraphRevisionSnapshotFromOwnersV1, buildGraphRevisionSnapshotV1, classifyEdgeCandidateV1, summarizeEdgeReadbackV1, verifyGraphRevisionSnapshotV1,
  type GraphEdgeCandidateV1, type GraphEndpointCandidateV1,
} from './graph-revision-snapshot-v1.js';

const snap = buildGraphRevisionSnapshotV1({
  workspaceRevisionKey: 'git:e874742189', graphRevision: 'sha256:aabbccdd11', producerId: 'graphify', producerRevision: 'p1',
  sourceRevisionCoverage: { qualified: 15925, total: 25643 },
});
const endpoint = (key: string, rev: string | null, packetRev: string | null = rev ? `sha256:${rev}` : null, count = 1): GraphEndpointCandidateV1 => ({
  graphEndpointKey: key,
  graphSourceRevision: rev,
  packets: Array.from({ length: count }, (_, i) => ({ packetKey: `packet:${key}${i}`, sourceRevision: packetRev })),
});
const edge = (over: Partial<GraphEdgeCandidateV1> = {}): GraphEdgeCandidateV1 => ({
  edgeType: 'IMPORTS', a: endpoint('a', 'aa11aa11'), b: endpoint('b', 'bb22bb22'),
  workspaceRevisionKey: snap.workspaceRevisionKey, graphRevision: snap.graphRevision, evidenceRefs: ['span:1'], ...over,
});

describe('GraphRevisionSnapshotV1', () => {
  it('seals deterministically and detects tampering', () => {
    expect(snap.snapshotChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(verifyGraphRevisionSnapshotV1(snap)).toBe(true);
    expect(verifyGraphRevisionSnapshotV1({ ...snap, graphRevision: 'sha256:other' })).toBe(false);
    expect(buildGraphRevisionSnapshotV1({ ...snap }).snapshotChecksum).toBe(snap.snapshotChecksum);
  });

  it('fails closed on a missing revision, a malformed key or impossible coverage', () => {
    const ok = { workspaceRevisionKey: 'git:e874742189', graphRevision: 'g', producerId: 'p', producerRevision: 'r', sourceRevisionCoverage: { qualified: 1, total: 2 } };
    expect(() => buildGraphRevisionSnapshotV1({ ...ok, workspaceRevisionKey: 'HEAD' })).toThrow(/workspaceRevisionKey/);
    expect(() => buildGraphRevisionSnapshotV1({ ...ok, graphRevision: ' ' })).toThrow(/graphRevision/);
    expect(() => buildGraphRevisionSnapshotV1({ ...ok, sourceRevisionCoverage: { qualified: 3, total: 2 } })).toThrow(/sourceRevisionCoverage/);
  });
});

describe('derivation from the existing revision owners', () => {
  const ws = 'sha256:' + 'e'.repeat(64);
  const receipt = { workspaceRevision: ws, boundNodeCount: 15925, sourceBackedNodeCount: 16151 };

  it('takes the key and coverage from the owners and adds only the graph pairing', () => {
    const s = buildGraphRevisionSnapshotFromOwnersV1({ workspaceRecord: { workspaceRevision: ws }, bindingReceipt: receipt, graphRevision: 'g1', producerId: 'graphify', producerRevision: 'p1' });
    expect(s.workspaceRevisionKey).toBe(ws);
    expect(s.sourceRevisionCoverage).toEqual({ qualified: 15925, total: 16151 });
    expect(verifyGraphRevisionSnapshotV1(s)).toBe(true);
  });

  it('refuses a receipt and record that name different workspaces', () => {
    expect(() => buildGraphRevisionSnapshotFromOwnersV1({
      workspaceRecord: { workspaceRevision: ws }, bindingReceipt: { ...receipt, workspaceRevision: 'sha256:' + 'f'.repeat(64) },
      graphRevision: 'g1', producerId: 'graphify', producerRevision: 'p1',
    })).toThrow(/different workspace revisions/);
  });
});

describe('edge candidate classification', () => {
  it('admits an edge only when both endpoints, both revisions and evidence all hold', () => {
    expect(classifyEdgeCandidateV1(edge(), snap)).toEqual({ status: 'ADMISSIBLE', failures: [] });
  });

  it('names each non-admission with the contract codes', () => {
    expect(classifyEdgeCandidateV1(edge({ a: endpoint('a', 'aa11aa11', null, 0) }), snap).status).toBe('ENDPOINT_UNRESOLVED');
    expect(classifyEdgeCandidateV1(edge({ b: endpoint('b', 'bb22bb22', undefined, 2) }), snap).status).toBe('ENDPOINT_AMBIGUOUS');
    expect(classifyEdgeCandidateV1(edge({ a: endpoint('a', 'aa11aa11', null) }), snap).status).toBe('SOURCE_REVISION_UNBOUND');
    expect(classifyEdgeCandidateV1(edge({ b: endpoint('b', 'bb22bb22', 'sha256:stale') }), snap).status).toBe('SOURCE_REVISION_UNBOUND');
    expect(classifyEdgeCandidateV1(edge({ workspaceRevisionKey: 'git:0000000' }), snap).status).toBe('WORKSPACE_REVISION_UNBOUND');
    expect(classifyEdgeCandidateV1(edge({ workspaceRevisionKey: null }), snap).status).toBe('WORKSPACE_REVISION_UNBOUND');
    expect(classifyEdgeCandidateV1(edge({ graphRevision: 'sha256:elsewhere' }), snap).status).toBe('GRAPH_REVISION_UNBOUND');
    expect(classifyEdgeCandidateV1(edge({ evidenceRefs: [' '] }), snap).status).toBe('EVIDENCE_UNBOUND');
  });

  it('accepts the graph revision with or without the sha256 prefix, but never a different value', () => {
    expect(classifyEdgeCandidateV1(edge({ a: endpoint('a', 'sha256:aa11aa11', 'sha256:aa11aa11') }), snap).status).toBe('ADMISSIBLE');
  });

  it('reports every failure in contract order and the first as the status', () => {
    const v = classifyEdgeCandidateV1(edge({ a: endpoint('a', 'x', null, 0), evidenceRefs: [], graphRevision: null }), snap);
    expect(v.failures).toEqual(['ENDPOINT_UNRESOLVED', 'GRAPH_REVISION_UNBOUND', 'EVIDENCE_UNBOUND']);
    expect(v.status).toBe('ENDPOINT_UNRESOLVED');
  });

  it('a tampered snapshot admits nothing', () => {
    const bad = { ...snap, producerRevision: 'forged' };
    expect(classifyEdgeCandidateV1(edge(), bad).failures).toEqual(['WORKSPACE_REVISION_UNBOUND', 'GRAPH_REVISION_UNBOUND']);
  });

  it('summarises a batch with a total and no partial promotion', () => {
    const s = summarizeEdgeReadbackV1([classifyEdgeCandidateV1(edge(), snap), classifyEdgeCandidateV1(edge({ evidenceRefs: [] }), snap)]);
    expect(s).toMatchObject({ total: 2, ADMISSIBLE: 1, EVIDENCE_UNBOUND: 1 });
  });
});
