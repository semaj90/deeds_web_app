import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { CODEBASE_COLLECTION_PRIORITY } from '$lib/server/retrieval/collection-aliases.js';

describe('Qdrant sync worker target contract', () => {
  it('keeps canonical payload sync on v2 and uses payload-only mutation', async () => {
    expect(CODEBASE_COLLECTION_PRIORITY[0]).toBe('codebase_chunks_768_v2');

    const source = await readFile(new URL('./qdrant-sync-worker.ts', import.meta.url), 'utf8');

    expect(source).toContain('QDRANT_SYNC_COLLECTION = CODEBASE_COLLECTION_PRIORITY[0]');
    expect(source).toContain('retrieve(QDRANT_SYNC_COLLECTION');
    expect(source).toContain('with_vector: false');
    expect(source).toContain('setPayload(QDRANT_SYNC_COLLECTION');
    expect(source).not.toContain("upsert('codebase_chunks_768'");
    expect(source).not.toContain('upsert(QDRANT_SYNC_COLLECTION');
  });

  it('proves the v2 point and authoritative lineage before payload construction or mutation', async () => {
    const source = await readFile(new URL('./qdrant-sync-worker.ts', import.meta.url), 'utf8');

    const retrieveIndex = source.indexOf('retrieve(QDRANT_SYNC_COLLECTION');
    const lineageIndex = source.indexOf('resolveQdrantSyncLineageV1({');
    const lineageGateIndex = source.indexOf("lineage.status !== 'LINEAGE_RESOLVED'");
    const payloadIndex = source.indexOf('buildQdrantSyncPayload({');
    const mutationIndex = source.indexOf('setPayload(QDRANT_SYNC_COLLECTION');

    expect(retrieveIndex).toBeGreaterThan(-1);
    expect(lineageIndex).toBeGreaterThan(retrieveIndex);
    expect(lineageGateIndex).toBeGreaterThan(lineageIndex);
    expect(payloadIndex).toBeGreaterThan(lineageGateIndex);
    expect(mutationIndex).toBeGreaterThan(payloadIndex);

    expect(source).toContain('sourceContentDigest: p.sha256');
    expect(source).toContain('workspaceWorldRevision: lineage.workspaceWorldRevision');
    expect(source).toContain('repositoryRevision: lineage.repositoryRevision');
    expect(source).toContain('sourceRevision: lineage.sourceRevision');
  });

  it('fails closed on unresolved lineage and does not fabricate graph revision', async () => {
    const source = await readFile(new URL('./qdrant-sync-worker.ts', import.meta.url), 'utf8');

    expect(source).toContain('if (!lineage.mutationAllowed');
    expect(source).toContain("lineage.status !== 'LINEAGE_RESOLVED'");
    expect(source).toContain('Qdrant payload sync blocked by unresolved canonical lineage:');
    expect(source).toContain('return;');

    expect(source).not.toContain('graphRevision: lineage.graphRevision');
    expect(source).toContain('graph_revision is intentionally not fabricated');
  });
});
