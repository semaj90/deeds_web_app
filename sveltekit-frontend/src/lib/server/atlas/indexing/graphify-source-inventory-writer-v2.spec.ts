import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
} from '../identity/workspace-source-binding-v1.js';
import {
  writeGraphifySourceInventoryInTransactionV2,
  completeGraphifyRunInTransactionV2,
  openGraphifyRunInTransactionV1,
  bindWorkspaceRevisionInTransactionV1,
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
      if (text.includes('FROM public.graphify_runs')) {
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
            workspace_revision: f.record.workspaceRevision,
            source_ref: 'src/x.ts',
            source_revision: f.record.baseCommitOid,
            content_hash: input.contentDigest ?? f.entry.contentDigest,
            code_source_revision: f.entry.sourceRevision,
            byte_length: input.byteLength ?? f.entry.byteLength,
            last_seen_run_id: runId,
          }],
        };
      }
      if (text.includes('FROM public.graphify_files')) {
        return {
          rowCount: 1,
          rows: [{
            file_id: fileId,
            workspace_id: workspaceId,
            workspace_revision: f.record.workspaceRevision,
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
    expect(client.queries[1]).toContain('FROM public.graphify_runs');
    expect(client.queries[2]).toContain('ON CONFLICT (workspace_id, source_ref, code_source_revision)');
    expect(client.queries[2]).toContain('WHERE code_source_revision IS NOT NULL');
    expect(client.queries[3]).toContain('FROM public.graphify_files');
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

describe('completeGraphifyRunInTransactionV2', () => {
  function completionClient(input: {
    updateRowCount?: number;
    readbackRowCount?: number;
    completedAt?: string | null;
  } = {}): GraphifySourceInventorySqlClientV2 & { queries: string[] } {
    const queries: string[] = [];
    const completedAt = input.completedAt === undefined ? '2026-09-03T00:00:00.000Z' : input.completedAt;
    return {
      queries,
      async query(text) {
        queries.push(text);
        if (text.includes('UPDATE public.graphify_runs')) {
          const rowCount = input.updateRowCount ?? 1;
          return {
            rowCount,
            rows: rowCount === 1
              ? [{ run_id: runId, workspace_id: workspaceId, status: 'COMPLETED', completed_at: completedAt }]
              : [],
          };
        }
        if (text.includes('SELECT run_id, workspace_id, status, completed_at')) {
          const rowCount = input.readbackRowCount ?? 1;
          return {
            rowCount,
            rows: rowCount === 1
              ? [{ run_id: runId, workspace_id: workspaceId, status: 'COMPLETED', completed_at: completedAt }]
              : [],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };
  }

  it('closes a RUNNING row and returns a verified completion receipt', async () => {
    const client = completionClient();
    const receipt = await completeGraphifyRunInTransactionV2({ client, runId, workspaceId });
    expect(receipt.status).toBe('COMPLETED');
    expect(receipt.previousStatus).toBe('RUNNING');
    expect(receipt.runId).toBe(runId);
    expect(receipt.readbackVerified).toBe(true);
    expect(client.queries.some((q) => q.includes("status = 'RUNNING'"))).toBe(true);
  });

  it('fails closed when no matching RUNNING row exists (already completed, wrong id, or wrong workspace)', async () => {
    const client = completionClient({ updateRowCount: 0 });
    await expect(completeGraphifyRunInTransactionV2({ client, runId, workspaceId }))
      .rejects.toThrow('GRAPHIFY_RUN_COMPLETION_CONFLICT_OR_NOT_RUNNING');
  });

  it('fails closed when the independent readback disagrees with the UPDATE result', async () => {
    const client = completionClient({ readbackRowCount: 0 });
    await expect(completeGraphifyRunInTransactionV2({ client, runId, workspaceId }))
      .rejects.toThrow('GRAPHIFY_RUN_COMPLETION_READBACK_FAILED');
  });

  it('fails closed when completed_at is missing on the UPDATE result', async () => {
    const client = completionClient({ completedAt: null });
    await expect(completeGraphifyRunInTransactionV2({ client, runId, workspaceId }))
      .rejects.toThrow('GRAPHIFY_RUN_COMPLETION_WRITE_MISMATCH');
  });
});

describe('openGraphifyRunInTransactionV1', () => {
  function openClient(input: {
    insertRowCount?: number;
    readbackRowCount?: number;
    workspaceRevisionOnInsert?: string | null;
    statusOnInsert?: string;
    workspaceRevisionOnReadback?: string | null;
    statusOnReadback?: string;
  } = {}): GraphifySourceInventorySqlClientV2 & { queries: string[] } {
    const queries: string[] = [];
    return {
      queries,
      async query(text) {
        queries.push(text);
        if (text.includes('INSERT INTO public.graphify_runs')) {
          const rowCount = input.insertRowCount ?? 1;
          return {
            rowCount,
            rows: rowCount === 1
              ? [{
                  run_id: runId,
                  workspace_id: workspaceId,
                  repository_revision: 'b'.repeat(40),
                  parser_contract_version: 'parser:v1',
                  extraction_contract_version: 'extract:v1',
                  status: input.statusOnInsert ?? 'RUNNING',
                  workspace_revision: input.workspaceRevisionOnInsert === undefined ? null : input.workspaceRevisionOnInsert,
                  dry_run: false,
                }]
              : [],
          };
        }
        if (text.includes('SELECT run_id, workspace_id, repository_revision, parser_contract_version')) {
          const rowCount = input.readbackRowCount ?? 1;
          return {
            rowCount,
            rows: rowCount === 1
              ? [{
                  run_id: runId,
                  workspace_id: workspaceId,
                  repository_revision: 'b'.repeat(40),
                  parser_contract_version: 'parser:v1',
                  extraction_contract_version: 'extract:v1',
                  status: input.statusOnReadback ?? 'RUNNING',
                  workspace_revision: input.workspaceRevisionOnReadback === undefined ? null : input.workspaceRevisionOnReadback,
                }]
              : [],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };
  }

  it('opens a bare RUNNING row with workspace_revision null, no manufactured revision', async () => {
    const client = openClient();
    const receipt = await openGraphifyRunInTransactionV1({
      client,
      workspaceId,
      repositoryRevision: 'b'.repeat(40),
      parserContractVersion: 'parser:v1',
      extractionContractVersion: 'extract:v1',
    });
    expect(receipt.status).toBe('RUNNING');
    expect(receipt.workspaceRevision).toBeNull();
    expect(receipt.runId).toBe(runId);
    expect(client.queries.some((q) => q.includes("'RUNNING'"))).toBe(true);
  });

  it('fails closed if the INSERT unexpectedly returns a non-null workspace_revision', async () => {
    const client = openClient({ workspaceRevisionOnInsert: 'sha256:' + 'a'.repeat(64) });
    await expect(openGraphifyRunInTransactionV1({
      client,
      workspaceId,
      repositoryRevision: 'b'.repeat(40),
      parserContractVersion: 'parser:v1',
      extractionContractVersion: 'extract:v1',
    })).rejects.toThrow('GRAPHIFY_RUN_OPEN_UNEXPECTED_WORKSPACE_REVISION');
  });

  it('fails closed when the independent readback disagrees with the INSERT result', async () => {
    const client = openClient({ readbackRowCount: 0 });
    await expect(openGraphifyRunInTransactionV1({
      client,
      workspaceId,
      repositoryRevision: 'b'.repeat(40),
      parserContractVersion: 'parser:v1',
      extractionContractVersion: 'extract:v1',
    })).rejects.toThrow('GRAPHIFY_RUN_OPEN_READBACK_FAILED');
  });
});

describe('bindWorkspaceRevisionInTransactionV1', () => {
  function bindClient(input: {
    updateRowCount?: number;
    readbackRowCount?: number;
    readbackWorkspaceRevision?: string;
  } = {}): GraphifySourceInventorySqlClientV2 & { queries: string[] } {
    const f = fixture();
    const queries: string[] = [];
    return {
      queries,
      async query(text) {
        queries.push(text);
        if (text.includes('UPDATE public.graphify_runs')) {
          const rowCount = input.updateRowCount ?? 1;
          return {
            rowCount,
            rows: rowCount === 1
              ? [{
                  run_id: runId,
                  workspace_id: workspaceId,
                  workspace_revision: f.record.workspaceRevision,
                  source_manifest_digest: f.record.sourceManifestDigest,
                  source_manifest_source_count: f.record.sourceCount,
                }]
              : [],
          };
        }
        if (text.includes('SELECT run_id, workspace_id, workspace_revision, source_manifest_digest')) {
          const rowCount = input.readbackRowCount ?? 1;
          return {
            rowCount,
            rows: rowCount === 1
              ? [{
                  run_id: runId,
                  workspace_id: workspaceId,
                  workspace_revision: input.readbackWorkspaceRevision ?? f.record.workspaceRevision,
                  source_manifest_digest: f.record.sourceManifestDigest,
                  source_manifest_source_count: f.record.sourceCount,
                  status: 'RUNNING',
                }]
              : [],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };
  }

  it('binds a WorkspaceRevisionRecordV1 to an already-open run', async () => {
    const f = fixture();
    const client = bindClient();
    const receipt = await bindWorkspaceRevisionInTransactionV1({ client, runId, workspaceId, record: f.record });
    expect(receipt.workspaceRevision).toBe(f.record.workspaceRevision);
    expect(receipt.runId).toBe(runId);
    expect(client.queries.some((q) => q.includes('workspace_revision IS NULL'))).toBe(true);
  });

  it('fails closed when the run is not RUNNING or already has a bound revision (one-time bind)', async () => {
    const f = fixture();
    const client = bindClient({ updateRowCount: 0 });
    await expect(bindWorkspaceRevisionInTransactionV1({ client, runId, workspaceId, record: f.record }))
      .rejects.toThrow('GRAPHIFY_RUN_REVISION_BINDING_CONFLICT_NOT_RUNNING_OR_ALREADY_BOUND');
  });

  it('fails closed when the independent readback disagrees with the UPDATE result', async () => {
    const f = fixture();
    const client = bindClient({ readbackWorkspaceRevision: 'sha256:' + 'f'.repeat(64) });
    await expect(bindWorkspaceRevisionInTransactionV1({ client, runId, workspaceId, record: f.record }))
      .rejects.toThrow('GRAPHIFY_RUN_REVISION_BINDING_STATE_READBACK_MISMATCH');
  });
});
