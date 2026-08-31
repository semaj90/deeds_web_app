import { describe, expect, it } from 'vitest';
import { buildProjectionOrdinalMapV1, projectionNodeKeyForOrdinalV1 } from './projection-ordinal-map-v1.js';

describe('ProjectionOrdinalMapV1', () => {
  it('sorts projection node keys into dense ordinals, same convention as GraphOrdinalMapV1', () => {
    const map = buildProjectionOrdinalMapV1({
      graphRevision: 'graph:r1',
      ontologyRevision: 'ontology:r1',
      projectionRevision: 'projection:r1',
      nodes: [
        { projectionNodeKey: 'tuple:z', nodeClass: 'TUPLE', tupleId: 'tuple:z' },
        { projectionNodeKey: 'entity:a', nodeClass: 'ENTITY' },
      ],
    });
    expect(map.rows.map((r) => r.projectionNodeKey)).toEqual(['entity:a', 'tuple:z']);
    expect(map.rows.map((r) => r.projectionOrdinal)).toEqual([0, 1]);
    expect(projectionNodeKeyForOrdinalV1(map, 1)).toBe('tuple:z');
    expect(map.canonicalAuthority).toBe(false);
  });

  it('an ENTITY row may cross-reference a real GraphNodeKeyV1/GraphOrdinal', () => {
    const map = buildProjectionOrdinalMapV1({
      graphRevision: 'graph:r1',
      ontologyRevision: 'ontology:r1',
      projectionRevision: 'projection:r1',
      nodes: [{ projectionNodeKey: 'entity:symbol:S1', nodeClass: 'ENTITY', graphOrdinal: 42, graphNodeKey: 'symbol:S1' }],
    });
    expect(map.rows[0]!.graphOrdinal).toBe(42);
    expect(map.rows[0]!.graphNodeKey).toBe('symbol:S1');
  });

  it('refuses a non-ENTITY row that tries to claim durable graph identity', () => {
    expect(() =>
      buildProjectionOrdinalMapV1({
        graphRevision: 'g', ontologyRevision: 'o', projectionRevision: 'p',
        nodes: [{ projectionNodeKey: 'tuple:r17', nodeClass: 'TUPLE', tupleId: 'r17', graphOrdinal: 1, graphNodeKey: 'symbol:S1' }],
      })
    ).toThrow();
  });

  it('refuses TUPLE/HYPEREDGE rows missing their required id, and mismatched key prefixes', () => {
    expect(() =>
      buildProjectionOrdinalMapV1({ graphRevision: 'g', ontologyRevision: 'o', projectionRevision: 'p', nodes: [{ projectionNodeKey: 'tuple:r17', nodeClass: 'TUPLE' }] })
    ).toThrow();
    expect(() =>
      buildProjectionOrdinalMapV1({ graphRevision: 'g', ontologyRevision: 'o', projectionRevision: 'p', nodes: [{ projectionNodeKey: 'entity:x', nodeClass: 'TUPLE', tupleId: 'x' }] })
    ).toThrow();
  });

  it('rejects duplicates and missing revisions', () => {
    expect(() =>
      buildProjectionOrdinalMapV1({ graphRevision: 'g', ontologyRevision: 'o', projectionRevision: 'p', nodes: [{ projectionNodeKey: 'entity:a', nodeClass: 'ENTITY' }, { projectionNodeKey: 'entity:a', nodeClass: 'ENTITY' }] })
    ).toThrow('PROJECTION_ORDINAL_DUPLICATE_NODE_KEY');
    expect(() =>
      buildProjectionOrdinalMapV1({ graphRevision: '', ontologyRevision: 'o', projectionRevision: 'p', nodes: [] })
    ).toThrow('PROJECTION_ORDINAL_REVISION_BINDING_REQUIRED');
  });

  it('is deterministic — same input yields the same checksum', () => {
    const input = {
      graphRevision: 'g', ontologyRevision: 'o', projectionRevision: 'p',
      nodes: [{ projectionNodeKey: 'evidence:e1', nodeClass: 'EVIDENCE' as const }],
    };
    const a = buildProjectionOrdinalMapV1(input);
    const b = buildProjectionOrdinalMapV1(input);
    expect(a.projectionOrdinalMapChecksum).toBe(b.projectionOrdinalMapChecksum);
  });
});
