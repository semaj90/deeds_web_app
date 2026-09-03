import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildTaxonomyOrdinalMapV1,
  taxonomyNodeKeyForOrdinalV1,
  taxonomyOrdinalToResidencySortKeyInputV1,
  taxonomyOrdinalMapV1Schema,
} from './taxonomy-ordinal-map-v1.js';

// Local mirror of sveltekit-frontend/src/lib/server/atlas/residency/packet-glyph-v1.ts's
// ResidencySortKeyV1Schema — packages/parent-atlas cannot import across the app's rootDir
// boundary, so this test proves shape compatibility without a cross-package import.
const ResidencySortKeyV1Schema = z.object({
  tier: z.number().int().min(0).max(255),
  lod: z.number().int().min(0).max(255),
  utilityBucket: z.number().int().min(0).max(255),
  recencyBucket: z.number().int().min(0).max(255),
  projectionOrdinal: z.number().int().min(0).max(4294967295),
}).strict();

describe('TaxonomyOrdinalMapV1', () => {
  it('sorts taxonomy node keys into dense ordinals, same convention as GraphOrdinalMapV1/ProjectionOrdinalMapV1', () => {
    const map = buildTaxonomyOrdinalMapV1({
      taxonomyRevision: 'taxonomy:r1',
      nodes: [
        { taxonomyNodeKey: 'topo:database-schema', level: 1, parentKey: 'root' },
        { taxonomyNodeKey: 'root', level: 0, parentKey: null },
        { taxonomyNodeKey: 'topo:api-route', level: 1, parentKey: 'root' },
      ],
    });
    expect(map.rows.map((r) => r.taxonomyNodeKey)).toEqual(['root', 'topo:api-route', 'topo:database-schema']);
    expect(map.rows.map((r) => r.taxonomyOrdinal)).toEqual([0, 1, 2]);
    expect(taxonomyNodeKeyForOrdinalV1(map, 2)).toBe('topo:database-schema');
    expect(map.canonicalAuthority).toBe(false);
  });

  it('rejects duplicates and a missing revision', () => {
    expect(() =>
      buildTaxonomyOrdinalMapV1({
        taxonomyRevision: 'taxonomy:r1',
        nodes: [
          { taxonomyNodeKey: 'root', level: 0, parentKey: null },
          { taxonomyNodeKey: 'root', level: 0, parentKey: null },
        ],
      })
    ).toThrow('TAXONOMY_ORDINAL_DUPLICATE_NODE_KEY');
    expect(() =>
      buildTaxonomyOrdinalMapV1({ taxonomyRevision: '', nodes: [] })
    ).toThrow('TAXONOMY_ORDINAL_REVISION_BINDING_REQUIRED');
  });

  it('rejects a row whose parentKey is not present in the same map', () => {
    expect(() =>
      taxonomyOrdinalMapV1Schema.parse({
        schema: 'atlas.taxonomy-ordinal-map.v1',
        taxonomyRevision: 'taxonomy:r1',
        rows: [{ taxonomyOrdinal: 0, taxonomyNodeKey: 'topo:api-route', level: 1, parentKey: 'root' }],
        taxonomyOrdinalMapChecksum: 'a'.repeat(64),
        canonicalAuthority: false,
      })
    ).toThrow('is not present in this map');
  });

  it('is deterministic — same input yields the same checksum', () => {
    const input = {
      taxonomyRevision: 'taxonomy:r1',
      nodes: [{ taxonomyNodeKey: 'root', level: 0, parentKey: null }],
    };
    const a = buildTaxonomyOrdinalMapV1(input);
    const b = buildTaxonomyOrdinalMapV1(input);
    expect(a.taxonomyOrdinalMapChecksum).toBe(b.taxonomyOrdinalMapChecksum);
  });

  it('maps a taxonomy ordinal row into the existing generic ResidencySortKeyV1 shape without inventing a parallel type', () => {
    const map = buildTaxonomyOrdinalMapV1({
      taxonomyRevision: 'taxonomy:r1',
      nodes: [
        { taxonomyNodeKey: 'root', level: 0, parentKey: null },
        { taxonomyNodeKey: 'topo:api-route', level: 1, parentKey: 'root' },
      ],
    });
    const apiRouteRow = map.rows.find((r) => r.taxonomyNodeKey === 'topo:api-route')!;
    const sortKeyInput = taxonomyOrdinalToResidencySortKeyInputV1(apiRouteRow, {
      tier: 0,
      utilityBucket: 5,
      recencyBucket: 2,
    });
    const parsed = ResidencySortKeyV1Schema.parse(sortKeyInput);
    expect(parsed.projectionOrdinal).toBe(apiRouteRow.taxonomyOrdinal);
    expect(parsed.lod).toBe(1);
    expect('taxonomyNodeKey' in parsed).toBe(false); // glyph must not carry identity
  });
});
