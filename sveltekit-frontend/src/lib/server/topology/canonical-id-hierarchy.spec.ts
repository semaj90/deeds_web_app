import { describe, expect, it, vi } from 'vitest';

import {
  generateIDHierarchy,
  persistIDHierarchyToPostgres
} from './canonical-id-hierarchy.js';

describe('canonical-id-hierarchy representation lineage', () => {
  it('originates a frozen semantic representation lineage by default', () => {
    const ids = generateIDHierarchy('src/lib/server/auth.ts');

    expect(ids.representation_id).toBe('semantic_768');
    expect(ids.representation_revision).toBe(0);
    expect(ids.source_representation_id).toBe('semantic_768');
    expect(ids.source_dimension).toBe(768);
    expect(ids.projection_representation_id).toBeNull();
    expect(ids.projection_dimension).toBeNull();
  });

  it('allows an explicit frozen lineage override for the canonical writer', async () => {
    const ids = generateIDHierarchy('src/lib/server/auth.ts', {
      representation_id: 'semantic_768',
      representation_revision: 12,
      source_representation_id: 'semantic_768',
      source_dimension: 768,
      projection_representation_id: 'latent_64',
      projection_dimension: 64
    });

    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 })
    };

    const envelope = {
      ...ids,
      source_ref: 'src/lib/server/auth.ts',
      packet_type: 'function',
      mirrors: {},
      topology: {},
      provenance: {
        truth: 'postgres',
        revision: 12,
        parity_status: 'unknown'
      }
    } as any;

    await persistIDHierarchyToPostgres(pool, ids, envelope);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [query, params] = pool.query.mock.calls[0];

    expect(String(query)).toContain('representation_revision');
    expect(String(query)).toContain('source_representation_id');
    expect(String(query)).toContain('projection_representation_id');
    expect(params[8]).toBe(12);
    expect(params[9]).toBe('semantic_768');
    expect(params[10]).toBe(768);
    expect(params[11]).toBe('latent_64');
    expect(params[12]).toBe(64);
    expect(params[13]).toBe('src/lib/server/auth.ts');
    expect(params[14]).toBe('function');
  });
});
