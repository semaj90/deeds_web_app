import { describe, expect, it } from 'vitest';

import {
  writeGraphifySourceInventoryFileInTransactionV1,
  type GraphifySourceInventorySqlClientV1,
} from './graphify-source-inventory-writer-v1';

type Row = Record<string, unknown>;

function fakeClient(options?: { existingDigest?: string; existingBytes?: number }) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const workspaceRevision = 'a'.repeat(40);
  const runId = '11111111-1111-4111-8111-111111111111';
  const fileId = '22222222-2222-4222-8222-222222222222';

  const client: GraphifySourceInventorySqlClientV1 = {
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.includes('INSERT INTO graphify_runs')) {
        return {
          rowCount: 1,
          rows: [{
            run_id: runId,
            workspace_id: values[0],
            repository_revision: workspaceRevision,
            parser_contract_version: values[2],
            extraction_contract_version: values[3],
            dry_run: false,
          }],
        };
      }
      if (text.includes('INSERT INTO graphify_files')) {
        const digest = String(values[3]);
        const bytes = Number(values[4]);
        if (options?.existingDigest) return { rowCount: 0, rows: [] };
        return {
          rowCount: 1,
          rows: [{
            file_id: fileId,
            workspace_id: values[0],
            source_ref: values[1],
            source_revision: values[2],
            content_hash: digest,
            byte_length: bytes,
            first_seen_run_id: runId,
            last_seen_run_id: runId,
          }],
        };
      }
      if (text.includes('FROM graphify_files')) {
        return {
          rowCount: 1,
          rows: [{
            file_id: fileId,
            workspace_id: values[0],
            source_ref: values[1],
            source_revision: values[2],
            content_hash: options?.existingDigest,
            byte_length: options?.existingBytes,
            first_seen_run_id: runId,
            last_seen_run_id: runId,
          }],
        };
      }
      throw new Error(`UNEXPECTED_SQL:${text}`);
    },
  };
  return { client, calls, workspaceRevision };
}

const base = {
  workspaceId: '33333333-3333-4333-8333-333333333333',
  workspaceRoot: '/repo',
  absoluteSourcePath: '/repo/src/a.ts',
  sourceText: 'export const a = 1;\n',
  parserContractVersion: 'graphify.parser.v1',
  extractionContractVersion: 'graphify.extractor.v1',
};

describe('GraphifySourceInventoryWriterV1', () => {
  it('preserves legacy Git source_revision and uses content_hash as exact-byte authority', async () => {
    const { client, calls, workspaceRevision } = fakeClient();
    const receipt = await writeGraphifySourceInventoryFileInTransactionV1({
      ...base,
      client,
      storageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
      workspaceRevisionResolver: () => workspaceRevision,
    });

    expect(receipt.storedSourceRevision).toBe(workspaceRevision);
    expect(receipt.sourceRevisionAuthorityField).toBe('CONTENT_HASH');
    expect(receipt.codeSourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(receipt.runReadbackVerified).toBe(true);
    expect(receipt.fileReadbackVerified).toBe(true);

    const fileInsert = calls.find((call) => call.text.includes('INSERT INTO graphify_files'))!;
    expect(fileInsert.values[2]).toBe(workspaceRevision);
    expect(fileInsert.values[3]).toBe(receipt.sourceContentDigest);
  });

  it('stores CodeSourceRevisionV1 directly only under the canonical storage layout', async () => {
    const { client, calls, workspaceRevision } = fakeClient();
    const receipt = await writeGraphifySourceInventoryFileInTransactionV1({
      ...base,
      client,
      storageSemantics: 'CODE_SOURCE_REVISION_V1',
      workspaceRevisionResolver: () => workspaceRevision,
    });

    expect(receipt.storedSourceRevision).toBe(receipt.codeSourceRevision);
    expect(receipt.sourceRevisionAuthorityField).toBe('SOURCE_REVISION');
    const fileInsert = calls.find((call) => call.text.includes('INSERT INTO graphify_files'))!;
    expect(fileInsert.values[2]).toBe(receipt.codeSourceRevision);
  });

  it('fails closed when an existing stored identity points at different bytes', async () => {
    const { client, workspaceRevision } = fakeClient({
      existingDigest: 'f'.repeat(64),
      existingBytes: 999,
    });

    await expect(writeGraphifySourceInventoryFileInTransactionV1({
      ...base,
      client,
      storageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
      workspaceRevisionResolver: () => workspaceRevision,
    })).rejects.toThrow(/GRAPHIFY_SOURCE_IDENTITY_CONTENT_MISMATCH/);
  });
});
