import { describe, it, expect } from 'vitest';
import {
  buildHyperedgeOrdinalMapV1,
  assertHyperedgeOrdinalMapIntegrityV1,
} from './hyperedge-ordinal-map-v1.js';
import {
  buildSparseIncidenceTensorV1,
  toPyTorchCooDescriptor,
} from './sparse-incidence-tensor-v1.js';
import {
  materializeCandidateOrdinalMap,
  type CanonicalCandidateIdentityInput,
} from '../features/canonical-candidate-v1.js';

describe('SparseIncidenceTensorV1 & HyperedgeOrdinalMapV1', () => {
  const rev = 'sha256:' + 'a'.repeat(64);

  function createMockCandidateInput(id: string): CanonicalCandidateIdentityInput {
    return {
      canonicalId: id,
      packetKey: 'pkt:1',
      sourceRef: 'src/lib/foo.ts',
      treeNodeId: 'tn:1',
      symbolVersionId: 'sym:1',
      workspaceRevision: rev,
      sourceRevision: rev,
      graphRevision: rev,
      semanticRevision: rev,
      degradedIdentity: false,
      evidenceRefs: [],
      representationBindings: [],
    };
  }

  it('builds and validates a sealed HyperedgeOrdinalMapV1 with deterministic UTF-8 ordering', () => {
    const map = buildHyperedgeOrdinalMapV1({
      workspaceRevision: rev,
      producerRevision: 'test:v1',
      hyperedges: [
        { hyperedgeId: 'edge:gamma', participantCount: 2, sourceRevision: rev },
        { hyperedgeId: 'edge:alpha', participantCount: 3, sourceRevision: rev },
        { hyperedgeId: 'edge:beta', participantCount: 1, sourceRevision: rev },
      ],
    });

    expect(map.rowCount).toBe(3);
    // Should be sorted deterministically: edge:alpha (0), edge:beta (1), edge:gamma (2)
    expect(map.hyperedges[0].hyperedgeId).toBe('edge:alpha');
    expect(map.hyperedges[0].hyperedgeOrdinal).toBe(0);
    expect(map.hyperedges[1].hyperedgeId).toBe('edge:beta');
    expect(map.hyperedges[1].hyperedgeOrdinal).toBe(1);
    expect(map.hyperedges[2].hyperedgeId).toBe('edge:gamma');
    expect(map.hyperedges[2].hyperedgeOrdinal).toBe(2);

    expect(() => assertHyperedgeOrdinalMapIntegrityV1(map)).not.toThrow();
  });

  it('builds a SparseIncidenceTensorV1 with separately sealed row and column maps', () => {
    // 1. Entity Ordinal Map (|V| = 3)
    const entityMap = materializeCandidateOrdinalMap({
      workspaceRevision: rev,
      candidateSnapshotRevision: rev,
      producerRevision: 'test:v1',
      candidates: [
        createMockCandidateInput('entity:0'),
        createMockCandidateInput('entity:1'),
        createMockCandidateInput('entity:2'),
      ],
    });

    // 2. Hyperedge Ordinal Map (|E| = 2)
    const hyperedgeMap = buildHyperedgeOrdinalMapV1({
      workspaceRevision: rev,
      producerRevision: 'test:v1',
      hyperedges: [
        { hyperedgeId: 'tuple:A', participantCount: 2, sourceRevision: rev },
        { hyperedgeId: 'tuple:B', participantCount: 2, sourceRevision: rev },
      ],
    });

    // 3. Sparse Incidence Entries:
    // tuple:A (col 0) includes entity:0 (SUBJECT) and entity:1 (OBJECT)
    // tuple:B (col 1) includes entity:1 (CALLER) and entity:2 (CALLEE)
    const tensor = buildSparseIncidenceTensorV1({
      entityOrdinalMap: entityMap,
      hyperedgeOrdinalMap: hyperedgeMap,
      entries: [
        {
          entityOrdinal: 0,
          hyperedgeOrdinal: 0,
          role: 'SUBJECT',
          predicate: 'calls',
          weight: 1.0,
          evidenceRef: 'ev:1',
          sourceRevision: rev,
        },
        {
          entityOrdinal: 1,
          hyperedgeOrdinal: 0,
          role: 'OBJECT',
          predicate: 'calls',
          weight: 1.0,
          evidenceRef: 'ev:2',
          sourceRevision: rev,
        },
        {
          entityOrdinal: 1,
          hyperedgeOrdinal: 1,
          role: 'CALLER',
          predicate: 'invokes',
          weight: 0.9,
          evidenceRef: 'ev:3',
          sourceRevision: rev,
        },
        {
          entityOrdinal: 2,
          hyperedgeOrdinal: 1,
          role: 'CALLEE',
          predicate: 'invokes',
          weight: 0.9,
          evidenceRef: 'ev:4',
          sourceRevision: rev,
        },
      ],
    });

    expect(tensor.entityRowCount).toBe(3);       // |V| = 3
    expect(tensor.hyperedgeColumnCount).toBe(2); // |E| = 2
    expect(tensor.nnz).toBe(4);                  // 4 non-zero entries
    expect(tensor.tensorChecksum).toHaveLength(64);

    // Convert to PyTorch COO descriptor
    const pt = toPyTorchCooDescriptor(tensor);
    expect(pt.shape).toEqual([3, 2]);
    expect(pt.nnz).toBe(4);
    expect(Array.from(pt.rowIndices)).toEqual([0, 1, 1, 2]);
    const values = Array.from(pt.values);
    expect(values).toHaveLength(4);
    expect(values[0]).toBeCloseTo(1.0, 5);
    expect(values[1]).toBeCloseTo(1.0, 5);
    expect(values[2]).toBeCloseTo(0.9, 5);
    expect(values[3]).toBeCloseTo(0.9, 5);

    // Sidecar preserves semantic role and predicate information
    expect(tensor.qualifiedEntries[0].role).toBe('SUBJECT');
    expect(tensor.qualifiedEntries[1].role).toBe('OBJECT');
  });

  it('fails closed when an entry references an out-of-bounds entity or hyperedge ordinal', () => {
    const entityMap = materializeCandidateOrdinalMap({
      workspaceRevision: rev,
      candidateSnapshotRevision: rev,
      producerRevision: 'test:v1',
      candidates: [createMockCandidateInput('entity:0')],
    });

    const hyperedgeMap = buildHyperedgeOrdinalMapV1({
      workspaceRevision: rev,
      producerRevision: 'test:v1',
      hyperedges: [{ hyperedgeId: 'tuple:0', participantCount: 1, sourceRevision: rev }],
    });

    // entityOrdinal 5 is out of bounds (only 1 entity)
    expect(() =>
      buildSparseIncidenceTensorV1({
        entityOrdinalMap: entityMap,
        hyperedgeOrdinalMap: hyperedgeMap,
        entries: [
          {
            entityOrdinal: 5,
            hyperedgeOrdinal: 0,
            role: 'SUBJECT',
            predicate: 'p',
            weight: 1.0,
            evidenceRef: 'ev:1',
            sourceRevision: rev,
          },
        ],
      })
    ).toThrow(/ENTITY_ORDINAL_OUT_OF_BOUNDS/);
  });
});
