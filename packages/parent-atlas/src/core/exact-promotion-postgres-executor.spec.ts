import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createExactPromotionPostgresExecutor } from './exact-promotion-postgres-executor.js';

const FILE_HASH = 'a'.repeat(64);
const SPAN_HASH = 'b'.repeat(64);
const PROOF_HASH = 'd'.repeat(64);

function fakePool(queries: string[]) {
  const client = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      queries.push(normalized);
      if (normalized.startsWith('BEGIN TRANSACTION')) return { rows: [], rowCount: null };
      if (normalized === 'ROLLBACK') return { rows: [], rowCount: null };
      if (normalized.includes('FROM atlas_packets')) {
        return {
          rows: [{
            packet_key: 'packet:1',
            source_ref: 'src/example.ts',
            workspace_revision: 42,
            representation_revision: 7,
            sha256: SPAN_HASH,
            tree_node_id: null,
            byte_start: 4,
            byte_end: 12,
          }],
          rowCount: 1,
        };
      }
      if (normalized.includes('FROM atlas_source_refs')) return { rows: [], rowCount: 0 };
      if (normalized.includes("to_regclass('public.graphify_files')")) {
        return { rows: [{ available: true }], rowCount: 1 };
      }
      if (normalized.includes('FROM graphify_files')) {
        return {
          rows: [{
            source_ref: 'src/example.ts',
            source_revision: 'S1',
            content_hash: FILE_HASH,
            repository_revision: '42',
          }],
          rowCount: 1,
        };
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    release() {
      queries.push('RELEASE');
    },
  };
  return { connect: async () => client } as unknown as Pool;
}

describe('exact promotion Postgres executor', () => {
  it('collects evidence inside one read-only repeatable-read snapshot and rolls back', async () => {
    const queries: string[] = [];
    const sourceReads: unknown[] = [];
    const executor = createExactPromotionPostgresExecutor({
      pool: fakePool(queries),
      sourceReader: async (request) => {
        sourceReads.push(request);
        return {
          file_found: true,
          file_sha256: FILE_HASH,
          file_byte_length: 100,
          span_found: true,
          span_sha256: SPAN_HASH,
          span_byte_length: 8,
          evidence_ref: 'workspace-bytes:src/example.ts:4-12',
        };
      },
    });

    const result = await executor.execute({
      request_id: 'request:1',
      candidate: {
        candidate_id: 'candidate:1',
        candidate_ordinal: 0,
        canonical_id: 'packet:1',
        packet_key: 'packet:1',
        stable_symbol_id: null,
        symbol_version_id: null,
        tree_node_id: null,
        source_ref: 'src/example.ts',
        workspace_revision: '42',
        source_revision: 'S1',
        representation_revision: '7',
        expected_file_content_hash: FILE_HASH,
        expected_span_content_hash: SPAN_HASH,
        evidence_refs: [],
        qdrant_point_id: 'projection-only:99',
      },
      revision_authority: {
        proof_schema: 'atlas.revision-owner-proof.v1',
        proof_checksum: PROOF_HASH,
        status: 'REVISION_OWNER_PROVEN',
        workspace_revision_proven: true,
        source_revision_proven: true,
      },
      producer_revision: 'exact-promotion-postgres:test:v1',
    });

    expect(result.receipt.status).toBe('PROVEN');
    expect(result.receipt.mutation_authorized).toBe(false);
    expect(result.transaction).toEqual({
      isolation_level: 'REPEATABLE READ',
      read_only: true,
      committed: false,
      rolled_back: true,
    });
    expect(sourceReads).toEqual([{ source_ref: 'src/example.ts', span_start: 4, span_end: 12 }]);
    expect(queries[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(queries).not.toContain('COMMIT');
    expect(queries.at(-2)).toBe('ROLLBACK');
    expect(queries.at(-1)).toBe('RELEASE');
    expect(result.receipt.evidence_refs).toContain('workspace-bytes:src/example.ts:4-12');
  });

  it('rolls back and releases the client when source evidence collection fails', async () => {
    const queries: string[] = [];
    const executor = createExactPromotionPostgresExecutor({
      pool: fakePool(queries),
      sourceReader: async () => { throw new Error('SOURCE_READ_FAILED'); },
    });

    await expect(executor.execute({
      request_id: 'request:2',
      candidate: {
        candidate_id: 'candidate:2', candidate_ordinal: null, canonical_id: 'packet:1',
        packet_key: 'packet:1', stable_symbol_id: null, symbol_version_id: null, tree_node_id: null,
        source_ref: 'src/example.ts', workspace_revision: '42', source_revision: 'S1',
        representation_revision: '7', expected_file_content_hash: FILE_HASH,
        expected_span_content_hash: SPAN_HASH, evidence_refs: [], qdrant_point_id: null,
      },
      revision_authority: {
        proof_schema: 'atlas.revision-owner-proof.v1', proof_checksum: PROOF_HASH,
        status: 'REVISION_OWNER_PROVEN', workspace_revision_proven: true, source_revision_proven: true,
      },
      producer_revision: 'exact-promotion-postgres:test:v1',
    })).rejects.toThrow('SOURCE_READ_FAILED');

    expect(queries).toContain('ROLLBACK');
    expect(queries.at(-1)).toBe('RELEASE');
  });
});
