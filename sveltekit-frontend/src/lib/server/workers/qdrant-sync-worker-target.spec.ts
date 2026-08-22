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
});
