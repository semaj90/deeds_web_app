import { describe, expect, it } from 'vitest';

import {
  validateQdrantProjection,
  verifyPacketKeyImmutabilityAcrossCollections,
  type QdrantPayload,
} from '../../src/lib/server/atlas/projections/qdrant-packet-projection.js';

function buildPayload(overrides: Partial<QdrantPayload> = {}): QdrantPayload {
  return {
    packet_key: 'packet:1f18437ee58f',
    source_ref: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
    file_path: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
    feature_id: 'sveltekit-frontend.+page',
    feature_label: '+page.svelte',
    domain_class: 'frontend',
    title_id: 'title:sveltekit-frontend-page:e2342d79',
    content_hash: null,
    workspace_id: 'deeds-web-app',
    workspace_revision: null,
    ontology_id: null,
    ontology_version: 'v1.0',
    collection_name: 'codebase_chunks_384_hybrid',
    ...overrides,
  };
}

describe('Qdrant packet projection', () => {
  it('accepts the live packet: prefix', () => {
    const result = validateQdrantProjection(buildPayload());
    expect(result.violations.find((violation) => violation.code === 'PACKET_KEY_INVALID_PREFIX')).toBeUndefined();
  });

  it('still rejects unknown packet key prefixes', () => {
    const result = validateQdrantProjection(buildPayload({ packet_key: 'ace_packet_e3b0c44298fc' }));
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PACKET_KEY_INVALID_PREFIX',
          actual: 'ace_packet_e3b0c44298fc',
        }),
      ])
    );
  });

  it('detects cross-collection packet identity drift', () => {
    const left = buildPayload({ collection_name: 'codebase_chunks_384_hybrid' });
    const right = buildPayload({
      collection_name: 'codebase_chunks_768',
      packet_key: 'packet:12dfac568730',
      source_ref: 'sveltekit-frontend/src/lib/components/evidence/EvidencePrimaryUpload.svelte',
    });

    const result = verifyPacketKeyImmutabilityAcrossCollections(left, right);
    expect(result.isImmutable).toBe(false);
    expect(result.reason).toContain('packet_key mismatch');
  });
});
