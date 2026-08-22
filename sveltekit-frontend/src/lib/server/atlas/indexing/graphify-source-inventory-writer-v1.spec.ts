import { describe, expect, it } from 'vitest';

import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
} from '../identity/workspace-source-binding-v1.js';
import {
  writeGraphifySourceInventoryFileInTransactionV1,
  type GraphifySourceInventorySqlClientV1,
} from './graphify-source-inventory-writer-v1';
import type { WorkspaceRevisionOriginRuntimeV1 } from './workspace-revision-origin-runtime-v1';

type Row = Record<string, unknown>;

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const GIT_COMMIT = 'a'.repeat(40);
const GIT_TREE = 'b'.repeat(40);
const GIT_BLOB = 'c'.repeat(40);

function origin(sourceText = 'export const a = 1;\n'): WorkspaceRevisionOriginRuntimeV1 {
  const source = deriveCodeSourceRevisionV1(sourceText);
  const entry = {
    sourceRef: 'src/a.ts', sourceRevision: source.sourceRevision,
    contentDigest: source.contentDigest, byteLength: source.byteLength,
    gitBlobOid: GIT_BLOB,
  };
  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app', gitObjectFormat: 'sha1',
    baseCommitOid: GIT_COMMIT, baseTreeOid: GIT_TREE, gitHeadRef: 'refs/heads/main',
    dirty: false, entries: [entry], generatedAt: '2026-08-21T19:00:00.000Z',
    producerRevision: 'test:graphify-writer:v2',
  });
  const bindings = buildWorkspaceSourceBindingsV1({
    record: built.record, entries: built.entries,
    trackedAtBaseCommit: new Map([['src/a.ts', true]]),
    dirtyRelativeToBaseCommit: new Map([['src/a.ts', false]]),
    producerRevision: 'test:graphify-writer:v2',
  });
  return { record: built.record, bindings, skipped: [], runtimeRevision: 'atlas.workspace-revision-origin-runtime.2026-08-21.v1' };
}

function fakeClient(options?: { existingDigest?: string; existingBytes?: number; schemaReady?: boolean }) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const built = origin();
  const binding = built.bindings[0]!;
  const client: GraphifySourceInventorySqlClientV1 = {
    async query(text, values = []) {
      calls.push({ text, values });
      if (text.includes('information_schema.columns')) {
        return options?.schemaReady === false
          ? { rowCount: 0, rows: [] }
          : {
              rowCount: 3,
              rows: [
                { table_name: 'graphify_runs', column_name: 'workspace_revision' },
                { table_name: 'graphify_runs', column_name: 'source_manifest_digest' },
                { table_name: 'graphify_files', column_name: 'code_source_revision' },
              ],
            };
      }
      if (text.includes('INSERT INTO graphify_runs')) {
        return {
          rowCount: 1,
          rows: [{
            run_id: RUN_ID,
            workspace_id: values[0],
            repository_revision: values[1],
            workspace_revision: values[2],
            source_manifest_digest: values[3],
            parser_contract_version: values[4],
            extraction_contract_version: values[5],
            dry_run: false,
          }],
        };
      }
      if (text.includes('INSERT INTO graphify_files')) {
        if (options?.existingDigest) return { rowCount: 0, rows: [] };
        return {
          rowCount: 1,
          rows: [{
            file_id: FILE_ID,
            workspace_id: values[0],
            source_ref: values[1],
            source_revision: values[2],
            code_source_revision: values[3],
            content_hash: values[4],
            byte_length: values[5],
            first_seen_run_id: RUN_ID,
            last_seen_run_id: RUN_ID,
          }],
        };
      }
      if (text.includes('FROM graphify_files')) {
        return {
          rowCount: 1,
          rows: [{
            file_id: FILE_ID,
            workspace_id: values[0],
            source_ref: values[1],
            source_revision: GIT_COMMIT,
            code_source_revision: values[2],
            content_hash: options?.existingDigest ?? binding.contentDigest,
            byte_length: options?.existingBytes ?? binding.byteLength,
            first_seen_run_id: RUN_ID,
            last_seen_run_id: RUN_ID,
          }],
        };
      }
      throw new Error(`UNEXPECTED_SQL:${text}`);
    },
  };
  return { client, calls, built };
}

const base = {
  workspaceId: WORKSPACE_ID,
  workspaceRoot: '/repo',
  repositoryId: 'semaj90/deeds_web_app',
  absoluteSourcePath: '/repo/src/a.ts',
  parserContractVersion: 'graphify.parser.v1',
  extractionContractVersion: 'graphify.extractor.v1',
};

describe('GraphifySourceInventoryWriterV1', () => {
  it('stores logical revisions separately from Git provenance', async () => {
    const { client, calls, built } = fakeClient();
    const receipt = await writeGraphifySourceInventoryFileInTransactionV1({
      ...base, client, originMaterializer: () => built,
    });

    expect(receipt.workspaceRevision).toBe(built.record.workspaceRevision);
    expect(receipt.repositoryRevision).toBe(GIT_COMMIT);
    expect(receipt.codeSourceRevision).toBe(built.bindings[0]!.sourceRevision);
    expect(receipt.legacySourceRevision).toBe(GIT_COMMIT);
    expect(receipt.gitRevisionIsProvenanceOnly).toBe(true);

    const runInsert = calls.find((call) => call.text.includes('INSERT INTO graphify_runs'))!;
    expect(runInsert.values[1]).toBe(GIT_COMMIT);
    expect(runInsert.values[2]).toBe(built.record.workspaceRevision);
    expect(runInsert.values[3]).toBe(built.record.sourceManifestDigest);

    const fileInsert = calls.find((call) => call.text.includes('INSERT INTO graphify_files'))!;
    expect(fileInsert.values[2]).toBe(GIT_COMMIT);
    expect(fileInsert.values[3]).toBe(built.bindings[0]!.sourceRevision);
    expect(fileInsert.values[4]).toBe(built.bindings[0]!.contentDigest);
  });

  it('refuses to write before the v2 logical revision migration exists', async () => {
    const { client, built } = fakeClient({ schemaReady: false });
    await expect(writeGraphifySourceInventoryFileInTransactionV1({
      ...base, client, originMaterializer: () => built,
    })).rejects.toThrow('GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED');
  });

  it('fails closed when a matching CodeSourceRevision row points at different bytes', async () => {
    const { client, built } = fakeClient({ existingDigest: 'f'.repeat(64), existingBytes: 999 });
    await expect(writeGraphifySourceInventoryFileInTransactionV1({
      ...base, client, originMaterializer: () => built,
    })).rejects.toThrow(/GRAPHIFY_SOURCE_CONTENT_DIGEST_MISMATCH|GRAPHIFY_SOURCE_BYTE_LENGTH_MISMATCH/);
  });
});
