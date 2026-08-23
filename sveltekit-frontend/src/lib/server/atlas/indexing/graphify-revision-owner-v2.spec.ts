import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import { buildWorkspaceRevisionRecordV1, buildWorkspaceSourceBindingsV1 } from '../identity/workspace-source-binding-v1.js';
import { deriveGraphifyRevisionAuthorityV2 } from './graphify-revision-authority-v2.js';
import { classifyGraphifyRevisionOwnerV2, type GraphifyRevisionStorageObservationV2 } from './graphify-revision-owner-v2.js';
import { classifyGraphifySourceInventorySchemaV2, legacyMaterializerCompatibleWithV2 } from './graphify-source-inventory-schema-v2.js';

function authority() {
  const workspaceRoot = path.resolve('/fixture/workspace');
  const source = deriveCodeSourceRevisionV1('export const a = 1;\n');
  const entry = { sourceRef: 'src/a.ts', sourceRevision: source.sourceRevision, contentDigest: source.contentDigest, byteLength: source.byteLength, gitBlobOid: 'c'.repeat(40) };
  const built = buildWorkspaceRevisionRecordV1({ repositoryId: 'semaj90/deeds_web_app', gitObjectFormat: 'sha1', baseCommitOid: 'a'.repeat(40), baseTreeOid: 'b'.repeat(40), gitHeadRef: 'refs/heads/main', dirty: false, entries: [entry], generatedAt: '2026-08-21T19:00:00.000Z', producerRevision: 'test:v2' });
  const [binding] = buildWorkspaceSourceBindingsV1({ record: built.record, entries: built.entries, trackedAtBaseCommit: new Map([['src/a.ts', true]]), dirtyRelativeToBaseCommit: new Map([['src/a.ts', false]]), producerRevision: 'test:v2' });
  return deriveGraphifyRevisionAuthorityV2({ workspaceRoot, absoluteSourcePath: path.resolve(workspaceRoot, 'src/a.ts'), workspaceRecord: built.record, sourceBinding: binding, producerRevision: 'test:v2' });
}
function storage(overrides: Partial<GraphifyRevisionStorageObservationV2> = {}): GraphifyRevisionStorageObservationV2 {
  return { graphifyRunsPresent: true, graphifyFilesPresent: true, requiredRunColumnsPresent: true, requiredFileColumnsPresent: true, logicalWorkspaceRevisionColumnsPresent: true, logicalCodeSourceRevisionColumnPresent: true, productionWriterPath: null, productionWriterPresent: false, productionWriterCreatesWorkspaceRevision: false, productionWriterCreatesSourceRevision: false, persistedMatchingRows: 0, notes: [], ...overrides };
}

describe('Graphify revision authority v2', () => {
  it('binds exact manifest/source revisions while keeping Git as provenance', () => {
    const result = authority();
    expect(result.workspaceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.workspaceRevision).toBe(`sha256:${result.workspaceSourceManifestDigest}`);
    expect(result.gitCommitIsProvenanceOnly).toBe(true);
    expect(result.callerSuppliedWorkspaceRevisionAccepted).toBe(false);
    expect(result.callerSuppliedSourceRevisionAccepted).toBe(false);
  });

  it('requires the v2 schema and writer before durable ownership', () => {
    const missing = classifyGraphifyRevisionOwnerV2({ authority: authority(), storage: storage({ logicalCodeSourceRevisionColumnPresent: false }), producerRevision: 'test:v2' });
    expect(missing.status).toBe('GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED');
    const noWriter = classifyGraphifyRevisionOwnerV2({ authority: authority(), storage: storage(), producerRevision: 'test:v2' });
    expect(noWriter.status).toBe('REVISION_OWNER_READY_FOR_CONTROLLED_CANARY');
    expect(noWriter.revisionOwnerProven).toBe(false);
    expect(noWriter.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('unblocks FANOUT only after writer binding plus exact persisted readback', () => {
    const result = classifyGraphifyRevisionOwnerV2({ authority: authority(), storage: storage({ productionWriterPath: 'writer-v2', productionWriterPresent: true, productionWriterCreatesWorkspaceRevision: true, productionWriterCreatesSourceRevision: true, persistedMatchingRows: 1 }), producerRevision: 'test:v2' });
    expect(result.status).toBe('REVISION_OWNER_PROVEN');
    expect(result.revisionOwnerProven).toBe(true);
    expect(result.fanoutMayConsumeAsCanonical).toBe(true);
  });
});

describe('Graphify source inventory schema v2', () => {
  it('recognizes the two-table v2 contract', () => {
    const result = classifyGraphifySourceInventorySchemaV2({
      graphifyRunsPresent: true,
      graphifyFilesPresent: true,
      runColumns: ['run_id','workspace_id','repository_revision','workspace_revision','source_manifest_digest','source_manifest_source_count','parser_contract_version','extraction_contract_version'],
      fileColumns: ['file_id','workspace_id','source_ref','source_revision','code_source_revision','content_hash','byte_length','first_seen_run_id','last_seen_run_id'],
    });
    expect(result.v2Ready).toBe(true);
    expect(result.missingRunColumns).toEqual([]);
    expect(result.missingFileColumns).toEqual([]);
  });

  it('does not mistake the legacy single-table materializer contract for v2', () => {
    expect(legacyMaterializerCompatibleWithV2(['workspace_id','source_ref','code_source_revision','content_hash'])).toBe(false);
    expect(legacyMaterializerCompatibleWithV2(['workspace_revision','git_blob_oid','source_revision_authority','producer_revision'])).toBe(true);
  });
});
