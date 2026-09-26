import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresChunkSummaryAdmissionRepositoryV1 } from './postgres-chunk-summary-admission-repository-v1.mjs';
import { admitCanonicalChunkSummaryV1 } from './canonical-chunk-summary-admission-v1.mjs';
import { buildSummaryProposalV1, sha256Hex } from './summary-proposal-candidate-v1.mjs';

const content = 'export const answer = 42;';
const bindingChecksum = 'sha256:binding';
const sourceRef = 'src/a.ts';
const sourceRevision = 'sha256:source';
const workspaceRevision = 'sha256:workspace';

function fakePool({ multipleBindings = false, failOnUpdate = false } = {}) {
  const calls = [];
  const chunk = { chunkRowId: '00000000-0000-0000-0000-000000000001', chunkId: 'chunk-a', sourceRef, content, summaryText: null, summaryProvenance: null };
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('BEGIN ISOLATION')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM public.codebase_chunk_index') && sql.includes('FOR UPDATE')) return { rows: [chunk], rowCount: 1 };
      if (sql.includes('FROM public.atlas_workspace_source_bindings')) {
        const rows = [{ workspaceRevision, sourceRevision, bindingChecksum }];
        return { rows: multipleBindings ? [...rows, ...rows] : rows, rowCount: multipleBindings ? 2 : 1 };
      }
      if (sql.includes('FROM public.atlas_packet_chunk_lineage')) return { rows: [{ canonicalChunkId: 'canonical-a', sourceRef, sourceRevision, revisionStatus: 'PROVEN' }], rowCount: 1 };
      if (sql.includes('UPDATE public.codebase_chunk_index')) {
        if (failOnUpdate) throw new Error('SIMULATED_UPDATE_FAILURE');
        return { rows: [{ id: chunk.chunkRowId }], rowCount: 1 };
      }
      if (sql.includes('COMMIT') || sql.includes('ROLLBACK')) return { rows: [], rowCount: 0 };
      throw new Error(`UNEXPECTED_SQL:${sql}`);
    },
    release() { calls.push({ released: true }); },
  };
  return { calls, pool: { async connect() { return client; } } };
}

function makeProposal() {
  const row = {
    workspaceId: 'deeds-web-app', workspaceRevision, sourceRef, sourceRevision,
    chunkId: 'chunk-a', canonicalChunkId: 'canonical-a', chunkRowId: '00000000-0000-0000-0000-000000000001',
    chunkContentHash: `sha256:${sha256Hex(content)}`, content,
    inputByteLength: Buffer.byteLength(content), inputTextSha256: sha256Hex(content),
    bindingChecksum, revisionStatus: 'PROVEN',
  };
  return buildSummaryProposalV1({
    row,
    sourceIdentityKey: 'deeds-web-app:src/a.ts',
    summary: 'Defines the answer constant as the integer forty-two.',
    model: { id: 'ornith-1.5-9b', revision: null },
    promptRevision: 'sha256:prompt', schemaRevision: 'atlas.chunk-summary-proposal.v1',
    generationParameters: null, runtimeBuildRevision: null, latencyMs: null, usage: null,
  });
}

function createRepository(pool) {
  return createPostgresChunkSummaryAdmissionRepositoryV1({
    pool,
    repositoryUuid: '00000000-0000-0000-0000-000000000002',
    identityRepositoryId: 'deeds-web-app',
    computeSourceIdentityKeyV1: (repositoryId, ref) => `${repositoryId}:${ref}`,
  });
}

test('PostgreSQL adapter admits through exact binding/lineage and updates only the canonical summary slots', async () => {
  const { pool, calls } = fakePool();
  const result = await admitCanonicalChunkSummaryV1({ proposal: makeProposal(), repository: createRepository(pool), admittedAt: '2026-09-25T00:00:00.000Z' });
  assert.equal(result.status, 'ADMITTED');
  assert.deepEqual(calls.filter((c) => c.sql && /^(BEGIN|COMMIT|ROLLBACK)/.test(c.sql.trim())).map((c) => c.sql.trim()), ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);
  const update = calls.find((c) => c.sql.includes('UPDATE public.codebase_chunk_index'));
  assert.ok(update);
  assert.match(update.sql, /summary_text IS NULL/);
  assert.match(update.sql, /summary_provenance IS NULL/);
  assert.doesNotMatch(update.sql, /summary_hash|embedding|qdrant|graph/i);
  assert.equal(calls.some((c) => c.sql.includes('FROM public.atlas_workspace_source_bindings')), true);
  assert.equal(calls.some((c) => c.sql.includes('FROM public.atlas_packet_chunk_lineage')), true);
  assert.equal(calls.some((c) => c.released), true);
});

test('duplicate authoritative bindings fail closed without an update', async () => {
  const { pool, calls } = fakePool({ multipleBindings: true });
  const result = await admitCanonicalChunkSummaryV1({ proposal: makeProposal(), repository: createRepository(pool) });
  assert.equal(result.status, 'BLOCKED_LINEAGE_MISSING');
  assert.equal(calls.some((c) => c.sql?.includes('UPDATE public.codebase_chunk_index')), false);
  assert.equal(calls.some((c) => c.sql?.trim() === 'COMMIT'), true);
});

test('update failure rolls back and releases the injected client', async () => {
  const { pool, calls } = fakePool({ failOnUpdate: true });
  await assert.rejects(() => admitCanonicalChunkSummaryV1({ proposal: makeProposal(), repository: createRepository(pool) }), /SIMULATED_UPDATE_FAILURE/);
  assert.equal(calls.some((c) => c.sql?.trim() === 'ROLLBACK'), true);
  assert.equal(calls.some((c) => c.released), true);
});

test('adapter requires the existing logical identity owner to be injected', () => {
  assert.throws(() => createPostgresChunkSummaryAdmissionRepositoryV1({ pool: { connect() {} }, repositoryUuid: 'repo-uuid', identityRepositoryId: 'deeds-web-app' }), /CANONICAL_SOURCE_IDENTITY_OWNER_REQUIRED/);
});
