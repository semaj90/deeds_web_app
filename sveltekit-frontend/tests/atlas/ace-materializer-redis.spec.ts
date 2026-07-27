import { describe, expect, it } from 'vitest';
import { buildBifrostRedisPacketValue } from '$lib/server/ace/ace-materializer.js';
import { fromRedisValue } from '$lib/server/atlas/projections/redis-packet-projection.js';

describe('ace materializer bifrost redis payload', () => {
  it('writes the proof envelope from authoritative fields', () => {
    const json = buildBifrostRedisPacketValue(
      {
        packetKey: 'packet:1f18437ee58f',
        sourceRef: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
        canonicalSourceRef: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
        filePath: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
        directoryPath: 'sveltekit-frontend',
        featureId: 'sveltekit-frontend.+page',
        featureLabel: '+page.svelte',
        metadata: {
          content_hash: 'sha256:from-metadata',
        },
        payload: {},
      },
      {
        workspace_id: 'sveltekit-frontend',
        ontology_version: 'v1.0',
        content_hash: 'sha256:from-proof',
      },
      86400,
      '2026-07-27T05:10:00.000Z'
    );

    const { packet, violations } = fromRedisValue(json);
    expect(violations).toEqual([]);
    expect(packet).toMatchObject({
      packetKey: 'packet:1f18437ee58f',
      sourceRef: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
      featureId: 'sveltekit-frontend.+page',
      featureLabel: '+page.svelte',
      workspaceId: 'sveltekit-frontend',
      ontologyVersion: 'v1.0',
      contentHash: 'sha256:from-proof',
      ttlSeconds: 86400,
    });
  });

  it('falls back to a path-derived workspace when the row-level workspace is absent', () => {
    const json = buildBifrostRedisPacketValue(
      {
        packetKey: 'packet:1f18437ee58f',
        sourceRef: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
        canonicalSourceRef: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
        filePath: 'sveltekit-frontend/src/routes/(app)/demos/+page.svelte',
        directoryPath: 'sveltekit-frontend',
        featureId: 'sveltekit-frontend.+page',
        featureLabel: '+page.svelte',
        metadata: {},
        payload: {},
      },
      {
        workspace_id: null,
        ontology_version: null,
        content_hash: null,
      },
      3600,
      '2026-07-27T05:10:00.000Z'
    );

    const { packet, violations } = fromRedisValue(json);
    expect(packet?.workspaceId).toBe('sveltekit-frontend');
    expect(violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'ONTOLOGY_VERSION_MISSING' })])
    );
  });
});
