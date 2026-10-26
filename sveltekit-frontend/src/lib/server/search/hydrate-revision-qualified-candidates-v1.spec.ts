// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ db: { execute: mocks.execute }, pgRows: (result: { rows: unknown[] }) => result.rows }));
import {
  joinRevisionQualifiedCandidatesV1,
  hydrateRevisionQualifiedCandidatesV1,
  type RevisionQualifiedHydrationDbRowV1,
} from './hydrate-revision-qualified-candidates-v1.js';
import type { StrictSemanticProjectionCandidateV1 } from './strict-semantic-projection-candidate-v1.js';

const workspaceRevision = `sha256:${'1'.repeat(64)}`;
const sourceRevision = `sha256:${'2'.repeat(64)}`;
const postgresId = '11111111-1111-4111-8111-111111111111';

const candidate: StrictSemanticProjectionCandidateV1 = {
  schema: 'atlas.strict-semantic-projection-candidate.v1',
  physicalPointId: 'qdrant-point-1',
  postgresId,
  chunkId: 'chunk:one',
  sourceRef: 'src/lib/example.ts',
  contentHash: 'chunk-hash-1',
  score: 0.91,
  representationName: 'semantic_768',
  representationRevision: 'semantic_768:rev:current',
  projectionRevision: 'qdrant-projection:rev:current',
  modelRevision: 'embeddinggemma:model:current',
  modelRevisionState: 'VERIFIED',
  identityMissing: false,
};

const row: RevisionQualifiedHydrationDbRowV1 = {
  chunk_row_id: postgresId,
  chunk_source_revision: sourceRevision,
  chunk_workspace_revision: workspaceRevision,
  canonical_chunk_id: 'chunk:one',
  chunk_id: 'chunk:one',
  packet_key: 'packet:one',
  source_ref: 'src/lib/example.ts',
  source_revision: sourceRevision,
  workspace_revision: workspaceRevision,
  binding_checksum: 'a'.repeat(64),
  content_hash: 'chunk-hash-1',
  content: 'export const one = 1;',
  lineage_producer_revision: 'packet-chunk-lineage:v1',
  evidence_refs: ['lineage:one', 'binding:one'],
};

describe('joinRevisionQualifiedCandidatesV1', () => {
  it('queries chunk row revisions without silently choosing the newest binding', async () => {
    mocks.execute.mockResolvedValue({ rows: [row] });
    const result = await hydrateRevisionQualifiedCandidatesV1({ candidates: [candidate], workspaceRevision });
    expect(result.hydrated).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.sql).toContain('c.source_revision::text AS chunk_source_revision');
    expect(query.sql).toContain('c.workspace_revision::text AS chunk_workspace_revision');
    expect(query.sql).not.toContain('DISTINCT ON');
    expect(query.params).toContain(workspaceRevision);
    expect(query.params).toContain(postgresId);
  });

  it('does not fabricate content for a qualified-looking empty readback', () => {
    const result = joinRevisionQualifiedCandidatesV1({ candidates: [candidate], rows: [{ ...row, content: null }], workspaceRevision });
    expect(result.hydrated).toEqual([]);
    expect(result.failures[0]?.reason).toBe('CONTENT_MISSING');
  });
  it.each([
    ['chunk_source_revision', null, 'CHUNK_SOURCE_REVISION_MISMATCH'],
    ['chunk_source_revision', `sha256:${'9'.repeat(64)}`, 'CHUNK_SOURCE_REVISION_MISMATCH'],
    ['chunk_workspace_revision', null, 'CHUNK_WORKSPACE_REVISION_MISMATCH'],
    ['chunk_workspace_revision', `sha256:${'9'.repeat(64)}`, 'CHUNK_WORKSPACE_REVISION_MISMATCH'],
  ])('does not borrow lineage qualification for an unqualified %s', (field, value, reason) => {
    const result = joinRevisionQualifiedCandidatesV1({ candidates: [candidate], rows: [{ ...row, [field]: value }], workspaceRevision });
    expect(result.hydrated).toEqual([]);
    expect(result.failures[0]?.reason).toBe(reason);
  });

  it('requires both projection and canonical content hashes', () => {
    for (const [projection, canonical] of [[{ ...candidate, contentHash: null }, row], [candidate, { ...row, content_hash: null }]] as const) {
      const result = joinRevisionQualifiedCandidatesV1({ candidates: [projection], rows: [canonical], workspaceRevision });
      expect(result.hydrated).toEqual([]);
      expect(result.failures[0]?.reason).toBe('CONTENT_HASH_MISSING');
    }
  });
  it('hydrates exact current lineage and preserves semantic rank order', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [candidate],
      rows: [row],
      workspaceRevision,
    });

    expect(result.failures).toEqual([]);
    expect(result.hydrated).toHaveLength(1);
    expect(result.hydrated[0]).toMatchObject({
      postgresId,
      canonicalChunkId: 'chunk:one',
      packetKey: 'packet:one',
      workspaceRevision,
      sourceRevision,
      semanticScore: 0.91,
      representationName: 'semantic_768',
    });
    expect(result.writesPerformed).toBe(false);
    expect(result.canonicalAuthority).toBe(false);
  });

  it('fails closed when the current workspace has no exact lineage row', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [candidate],
      rows: [],
      workspaceRevision,
    });
    expect(result.hydrated).toEqual([]);
    expect(result.failures[0]?.reason).toBe('CURRENT_LINEAGE_NOT_FOUND');
  });

  it('fails closed on ambiguous canonical lineage', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [candidate],
      rows: [row, { ...row, packet_key: 'packet:duplicate' }],
      workspaceRevision,
    });
    expect(result.hydrated).toEqual([]);
    expect(result.failures[0]?.reason).toBe('CURRENT_LINEAGE_AMBIGUOUS');
  });

  it('rejects projection metadata that disagrees with canonical source identity', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [{ ...candidate, sourceRef: 'src/lib/other.ts' }],
      rows: [row],
      workspaceRevision,
    });
    expect(result.failures[0]?.reason).toBe('SOURCE_REF_MISMATCH');
  });

  it('requires semantic_768 representation lineage from the projection', () => {
    const result = joinRevisionQualifiedCandidatesV1({
      candidates: [{ ...candidate, representationName: 'semantic_mrl_128' }],
      rows: [row],
      workspaceRevision,
    });
    expect(result.failures[0]?.reason).toBe('REPRESENTATION_NAME_MISMATCH');
  });
});
