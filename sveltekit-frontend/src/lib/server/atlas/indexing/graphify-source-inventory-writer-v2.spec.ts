import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
} from '../identity/workspace-source-binding-v1.js';
import {
  writeGraphifySourceInventoryInTransactionV2,
  type GraphifySourceInventorySqlClientV2,
} from './graphify-source-inventory-writer-v2.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';

function fixture() {
  const contentDigest = digest('export const x = 1;');
  const entry = {
    sourceRef: 'src/x.ts',
    sourceRevision: `sha256:${contentDigest}`,
    contentDigest,
    byteLength: Buffer.byteLength('export const x = 1;', 'utf8'),
    gitBlobOid: 'a'.repeat(40),
  };
  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat: 'sha1',
    baseCommitOid: 'b'.repeat(40),
    baseTreeOid: 'c'.repeat(40),
    gitHeadRef: 'refs/heads/main',
    dirty: false,
    entries: [entry],
    generatedAt: '2026-08-22T00:00:00.000Z',
    producerRevision: 'fixture',
  });
  const bindings = buildWorkspaceSourceBindingsV1({
    record: built.record,
    entries: built.entries,
    trackedAtBaseCommit: new Map([['src/x.ts', true]]),
    dirtyRelativeToBaseCommit: new Map([['src/x.ts', false]]),
    producerRevision: 'fixture',
  });
  return { record: built.record, bindings, entry };
}

function clientFor(input: {
  contentDigest?: string;
  byteLength?: number;
} = {}): GraphifySourceInventorySqlClientV2 & { queries: string[] } {
  const f = fixture();
  const queries: string[] = [];
  return {
    queries,
    async query(text) {
      queries.push(text);
      if (text.includes('INSERT INTO public.graphify_runs')) {
        return {
          rowCount: 1,
          rows: [{
            run_id: runId,
            workspace_id: workspaceId,
            repository_revision: f.record.baseCommitOid,
            workspace_revision: f.record.workspaceRevision,
            source_manifest_digest: f.record.sourceManifestDigest,
            parser_contract_version: 'parser:v1',
            extraction_contract_version: 'extract:v1',
            dry_run: false,
          }],
        };
      }
      if (text.includes('INSERT INTO public.graphify_files')) {
        return {
          rowCount: 1,
          rows: [{
            file_id: fileId,
            source_ref: 'src/x.ts',
            source_revision: f.record.baseCommitOid,
            content_hash: input.contentDigest ?? f.entry.contentDigest,
            code_source_revision: f.entry.sourceRevision,
            byte_length: input.byteLength ?? f.entry.byteLength,
            last_seen_run_id: runId,
          }],
        };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

describe('GraphifySourceInventoryWriterV2', () => {
  it('persists workspace/source logical revisions while retaining Git provenance', async () => {
    const f = fixture();
    const client = clientFor();
    const receipt = await writeGraphifySourceInventoryInTransactionV2({
      client,
      workspaceId,
      record: f.record,
      bindings: f.bindings,
      parserContractVersion: 'parser:v1',
      extractionContractVersion: 'extract:v1',
    });

    expect(receipt.workspaceRevision).toBe(f.record.workspaceRevision);
    expect(receipt.repositoryRevision).toBe(f.record.baseCommitOid);
    expect(receipt.files[0]?.sourceRevision).toBe(f.entry.sourceRevision);
    expect(receipt.files[0]?.legacySourceRevision).toBe(f.record.baseCommitOid);
    expect(receipt.readbackVerified).toBe(true);
    expect(client.queries[0]).toContain('ON CONFLICT (workspace_id, workspace_revision, parser_contract_version)');
    expect(client.queries[0]).toContain('WHERE workspace_revision IS NOT NULL');
    expect(client.queries[1]).toContain('ON CONFLICT (workspace_id, source_ref, code_source_revision)');
    expect(client.queries[1]).toContain('WHERE code_source_revision IS NOT NULL');
  });

  it('fails closed when persisted bytes disagree with the canonical binding', async () => {
    const f = fixture();
    const client = clientFor({ contentDigest: digest('corrupted') });
    await expect(writeGraphifySourceInventoryInTransactionV2({
      client,
      workspaceId,
      record: f.record,
      bindings: f.bindings,
      parserContractVersion: 'parser:v1',
      extractionContractVersion: 'extract:v1',
    })).rejects.toThrow('GRAPHIFY_CONTENT_DIGEST_READBACK_MISMATCH');
  });

  it('rejects a selected source that is not in the canonical manifest', async () => {
    const f = fixture();
    const client = clientFor();
    await expect(writeGraphifySourceInventoryInTransactionV2({
      client,
      workspaceId,
      record: f.record,
      bindings: f.bindings,
      selectedSourceRefs: ['src/missing.ts'],
      parserContractVersion: 'parser:v1',
      extractionContractVersion: 'extract:v1',
    })).rejects.toThrow('GRAPHIFY_SELECTED_SOURCE_NOT_IN_MANIFEST');
  });
});
