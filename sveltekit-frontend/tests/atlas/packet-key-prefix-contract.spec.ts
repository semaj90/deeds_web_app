import { describe, expect, it } from 'vitest';
import { validatePostgresProjection } from '$lib/server/atlas/projections/postgres-packet-projection.js';
import { fromRedisValue, validateRedisProjection } from '$lib/server/atlas/projections/redis-packet-projection.js';
import { fromHyperRagRpcPacket } from '$lib/server/atlas/projections/hyperrag-packet-projection.js';
import { validateQdrantProjection } from '$lib/server/atlas/projections/qdrant-packet-projection.js';

describe('atlas packet-key prefix contract', () => {
  const packetKey = 'packet:1f18437ee58f';

  it('accepts packet: keys in Postgres projections', () => {
    const result = validatePostgresProjection({
      packet_key: packetKey,
      source_ref: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      file_path: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      feature_id: 'sveltekit-frontend.+page',
      feature_label: 'Demo page',
      domain_class: 'ui',
      title_id: 'title:demos-page',
      tree_node_id: null,
      content_hash: null,
      workspace_id: 'sveltekit-frontend',
      workspace_revision: null,
      ontology_id: null,
      ontology_version: 'v1.0',
      identity_lane: 'canonical',
      identity_confidence: 1,
      created_at: new Date('2026-07-27T00:00:00.000Z'),
      updated_at: new Date('2026-07-27T00:00:00.000Z'),
    });

    expect(result.isValid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('accepts packet: keys in Redis projections', () => {
    const result = validateRedisProjection(JSON.stringify({
      packet_key: packetKey,
      source_ref: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      feature_id: 'sveltekit-frontend.+page',
      feature_label: 'Demo page',
      workspace_id: 'sveltekit-frontend',
      ontology_version: 'v1.0',
      content_hash: null,
      tree_node_id: null,
      cached_at: '2026-07-27T00:00:00.000Z',
      ttl_seconds: 3600,
    }));

    expect(result.isValid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('preserves partial identity from legacy bifrost payloads with explicit warnings', () => {
    const result = fromRedisValue(JSON.stringify({
      packet_key: packetKey,
      source_ref: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      feature_id: 'sveltekit-frontend.+page',
      feature_label: 'Demo page',
      file_path: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      created_at: '2026-07-27T00:00:00.000Z',
    }));

    expect(result.packet?.packetKey).toBe(packetKey);
    expect(result.packet?.sourceRef).toBe('sveltekit-frontend/src/routes/(app)/demos/+page.svelte');
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WORKSPACE_ID_MISSING' }),
        expect.objectContaining({ code: 'ONTOLOGY_VERSION_MISSING' }),
      ])
    );
  });

  it('accepts packet: keys in HyperRAG projections', () => {
    const result = fromHyperRagRpcPacket({
      packet_key: packetKey,
      source_ref: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      feature_id: 'sveltekit-frontend.+page',
      feature_label: 'Demo page',
      workspace_id: 'sveltekit-frontend',
      ontology_version: 'v1.0',
      content_hash: 'sha256:abc123',
      rpc_received_at: '2026-07-27T00:00:00.000Z',
      rpc_version: 'hyperrag-v1',
      n_ary_facts: [
        {
          predicate: 'IMPLEMENTS',
          subject: packetKey,
          objects: ['feature:sveltekit-frontend.+page'],
          confidence: 1,
          sourced_from: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
        },
      ],
    });

    expect(result.value?.packetKey).toBe(packetKey);
    expect(result.violations).toEqual([]);
  });

  it('accepts packet: keys in Qdrant projections', () => {
    const result = validateQdrantProjection({
      packet_key: packetKey,
      source_ref: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      file_path: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      feature_id: 'sveltekit-frontend.+page',
      feature_label: 'Demo page',
      domain_class: 'ui',
      title_id: 'title:demos-page',
      workspace_id: 'sveltekit-frontend',
      ontology_version: 'v1.0',
      content_hash: null,
      collection_name: 'codebase_chunks_384_hybrid',
    });

    expect(result.isValid).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
