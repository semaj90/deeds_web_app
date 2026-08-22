import { describe, expect, it } from 'vitest';
import {
  resolveQdrantSyncLineageV1,
  type QdrantSyncLineageSqlClientV1,
} from './qdrant-sync-lineage-resolver.js';

const DIGEST = 'a'.repeat(64);
const SOURCE_REVISION = `sha256:${DIGEST}`;
const WORKSPACE_REVISION = `sha256:${'b'.repeat(64)}`;
const REPOSITORY_REVISION = 'c'.repeat(40);
const MANIFEST_DIGEST = 'd'.repeat(64);

function client(rows: Array<Record<string, unknown>>): QdrantSyncLineageSqlClientV1 {
  return {
    async execute<T = unknown>() {
      return { rows: rows as T[] };
    },
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    source_ref: 'src/a.ts',
    content_hash: DIGEST,
    code_source_revision: SOURCE_REVISION,
    workspace_revision: WORKSPACE_REVISION,
    repository_revision: REPOSITORY_REVISION,
    source_manifest_digest: MANIFEST_DIGEST,
    ...overrides,
  };
}

describe('QdrantSyncLineageV1', () => {
  it('resolves one exact Graphify v2 logical lineage tuple', async () => {
    const result = await resolveQdrantSyncLineageV1({
      client: client([row()]),
      sourceRef: 'src\\a.ts',
      sourceContentDigest: `sha256:${DIGEST}`,
    });
    expect(result).toMatchObject({
      status: 'LINEAGE_RESOLVED',
      sourceRef: 'src/a.ts',
      sourceContentDigest: DIGEST,
      workspaceWorldRevision: WORKSPACE_REVISION,
      repositoryRevision: REPOSITORY_REVISION,
      sourceRevision: SOURCE_REVISION,
      sourceManifestDigest: MANIFEST_DIGEST,
      mutationAllowed: true,
      blocker: null,
    });
  });

  it('allows duplicate physical rows only when logical lineage is identical', async () => {
    const result = await resolveQdrantSyncLineageV1({
      client: client([row(), row()]),
      sourceRef: 'src/a.ts',
      sourceContentDigest: DIGEST,
    });
    expect(result.status).toBe('LINEAGE_RESOLVED');
    expect(result.rowsObserved).toBe(2);
    expect(result.mutationAllowed).toBe(true);
  });

  it('rejects multiple distinct logical lineages for the same packet bytes', async () => {
    const result = await resolveQdrantSyncLineageV1({
      client: client([row(), row({ workspace_revision: `sha256:${'e'.repeat(64)}` })]),
      sourceRef: 'src/a.ts',
      sourceContentDigest: DIGEST,
    });
    expect(result.status).toBe('GRAPHIFY_LINEAGE_AMBIGUOUS');
    expect(result.mutationAllowed).toBe(false);
  });

  it('fails closed when packet content digest is absent', async () => {
    const result = await resolveQdrantSyncLineageV1({
      client: client([]),
      sourceRef: 'src/a.ts',
      sourceContentDigest: null,
    });
    expect(result.status).toBe('SOURCE_DIGEST_REQUIRED');
    expect(result.mutationAllowed).toBe(false);
  });

  it('returns a typed missing result when no exact Graphify v2 row exists', async () => {
    const result = await resolveQdrantSyncLineageV1({
      client: client([]),
      sourceRef: 'src/a.ts',
      sourceContentDigest: DIGEST,
    });
    expect(result.status).toBe('GRAPHIFY_LINEAGE_MISSING');
    expect(result.mutationAllowed).toBe(false);
  });

  it('rejects malformed authority rows instead of coercing them', async () => {
    const result = await resolveQdrantSyncLineageV1({
      client: client([row({ workspace_revision: '41' })]),
      sourceRef: 'src/a.ts',
      sourceContentDigest: DIGEST,
    });
    expect(result.status).toBe('GRAPHIFY_LINEAGE_INVALID');
    expect(result.mutationAllowed).toBe(false);
  });
});
