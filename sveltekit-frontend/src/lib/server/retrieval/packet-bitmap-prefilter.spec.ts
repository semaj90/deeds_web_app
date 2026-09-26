import { describe, expect, it } from 'vitest';

import {
  buildPacketBitmapPrefilterQuery,
  PacketBitmapPrefilterValidationError,
  runPacketBitmapPrefilter,
  type PgQueryable,
} from './packet-bitmap-prefilter';

describe('buildPacketBitmapPrefilterQuery', () => {
  it('builds a single-filter query', () => {
    const { sql, params } = buildPacketBitmapPrefilterQuery({ featureId: 'auth.sessions' });
    expect(sql).toContain('feature_id = $1');
    expect(sql).toContain('packet_key IS NOT NULL');
    expect(params).toEqual(['auth.sessions', 501]);
  });

  it('builds a multi-filter query combining all provided predicates with AND', () => {
    const { sql, params } = buildPacketBitmapPrefilterQuery({
      featureId: 'auth.sessions',
      tags: ['auth', 'security'],
      domainClass: 'backend',
    });
    expect(sql).toContain('feature_id = $1');
    expect(sql).toContain('tags && $2::text[]');
    expect(sql).toContain('domain_class = $3');
    expect(sql).toMatch(/\$1.*AND.*\$2.*AND.*\$3/s);
    expect(params).toEqual(['auth.sessions', ['auth', 'security'], 'backend', 501]);
  });

  it('rejects a request with only domain_class set', () => {
    expect(() => buildPacketBitmapPrefilterQuery({ domainClass: 'backend' })).toThrow(
      PacketBitmapPrefilterValidationError
    );
  });

  it('rejects a request with only workspace_revision set', () => {
    expect(() => buildPacketBitmapPrefilterQuery({ workspaceRevision: 'rev-1' })).toThrow(
      PacketBitmapPrefilterValidationError
    );
  });

  it('rejects a request with no filters at all', () => {
    expect(() => buildPacketBitmapPrefilterQuery({})).toThrow(PacketBitmapPrefilterValidationError);
  });

  it('accepts source_ref alone as a selective filter', () => {
    const { sql } = buildPacketBitmapPrefilterQuery({ sourceRef: 'src/lib/server/auth.ts' });
    expect(sql).toContain('source_ref = $1');
  });

  it('accepts concept_id alone as a selective filter', () => {
    const { sql } = buildPacketBitmapPrefilterQuery({ conceptId: 'concept-42' });
    expect(sql).toContain('$1 = ANY(concept_ids)');
  });

  it('accepts tags alone as a selective filter', () => {
    const { sql } = buildPacketBitmapPrefilterQuery({ tags: ['auth'] });
    expect(sql).toContain('tags && $1::text[]');
  });

  it('respects a custom cap by requesting cap + 1 rows', () => {
    const { params } = buildPacketBitmapPrefilterQuery({ featureId: 'x' }, 10);
    expect(params.at(-1)).toBe(11);
  });

  it('rejects a non-positive cap', () => {
    expect(() => buildPacketBitmapPrefilterQuery({ featureId: 'x' }, 0)).toThrow(
      PacketBitmapPrefilterValidationError
    );
  });
});

describe('runPacketBitmapPrefilter', () => {
  function fakeDb(rowCount: number): PgQueryable {
    return {
      async query<T = { packet_key: string; source_ref: string }>() {
        return {
          rows: Array.from({ length: rowCount }, (_, i) => ({
            packet_key: `pk-${i}`,
            source_ref: `src/${i}.ts`,
          })) as T[],
        };
      },
    };
  }

  it('reports candidateSetTruncated: false when result is within the cap', async () => {
    const result = await runPacketBitmapPrefilter(fakeDb(120), { featureId: 'x' }, 500);
    expect(result.candidateSetTruncated).toBe(false);
    expect(result.candidates).toHaveLength(120);
    expect(result.candidates[0]).toMatchObject({ packetKey: 'pk-0', sourceRef: 'src/0.ts', sourceRevision: null, workspaceRevision: null });
  });

  it('reports candidateSetTruncated: true and trims to the cap when the boundary is exceeded (cap=500, 501 rows)', async () => {
    const result = await runPacketBitmapPrefilter(fakeDb(501), { featureId: 'x' }, 500);
    expect(result.candidateSetTruncated).toBe(true);
    expect(result.candidates).toHaveLength(500);
  });

  it('reports candidateSetTruncated: false at exactly the cap boundary (cap=500, 500 rows)', async () => {
    const result = await runPacketBitmapPrefilter(fakeDb(500), { featureId: 'x' }, 500);
    expect(result.candidateSetTruncated).toBe(false);
    expect(result.candidates).toHaveLength(500);
  });
});
