import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { deriveCodeSourceRevisionV1 } from '../identity/code-source-revision-v1.js';
import {
  buildWorkspaceRevisionRecordV1,
  buildWorkspaceSourceBindingsV1,
} from '../identity/workspace-source-binding-v1.js';
import { deriveCodeRevisionAuthorityV1 } from './code-revision-authority-v1.js';
import {
  classifyCodeRevisionOwnerCanaryV1,
  type CodeRevisionStorageObservationV1,
} from './code-revision-owner-canary-v1.js';
import { planGraphifySourceInventoryWriterV1 } from './graphify-source-inventory-write-plan-v1.js';

function authority() {
  const workspaceRoot = path.resolve('/fixture/workspace');
  const source = deriveCodeSourceRevisionV1('export const a = 1;\n');
  const entry = {
    sourceRef: 'src/a.ts', sourceRevision: source.sourceRevision,
    contentDigest: source.contentDigest, byteLength: source.byteLength,
    gitBlobOid: 'c'.repeat(40),
  };
  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app', gitObjectFormat: 'sha1',
    baseCommitOid: 'a'.repeat(40), baseTreeOid: 'b'.repeat(40),
    gitHeadRef: 'refs/heads/main', dirty: false, entries: [entry],
    generatedAt: '2026-08-21T19:00:00.000Z', producerRevision: 'test:writer-plan:v3',
  });
  const [binding] = buildWorkspaceSourceBindingsV1({
    record: built.record, entries: built.entries,
    trackedAtBaseCommit: new Map([['src/a.ts', true]]),
    dirtyRelativeToBaseCommit: new Map([['src/a.ts', false]]),
    producerRevision: 'test:writer-plan:v3',
  });
  return deriveCodeRevisionAuthorityV1({
    workspaceRoot, absoluteSourcePath: path.resolve(workspaceRoot, 'src/a.ts'),
    workspaceRecord: built.record, sourceBinding: binding,
    producerRevision: 'test:writer-plan:v3',
  });
}

function storage(overrides: Partial<CodeRevisionStorageObservationV1> = {}): CodeRevisionStorageObservationV1 {
  return {
    graphifyRunsPresent: true, graphifyFilesPresent: true,
    requiredRunColumnsPresent: true, requiredFileColumnsPresent: true,
    logicalWorkspaceRevisionColumnsPresent: true,
    logicalCodeSourceRevisionColumnPresent: true,
    productionWriterPath: null, productionWriterPresent: false,
    productionWriterCreatesWorkspaceRevision: false,
    productionWriterCreatesSourceRevision: false,
    persistedMatchingRows: 0,
    sourceRevisionStorageSemantics: 'GRAPHIFY_REVISION_AUTHORITY_V2',
    sourceRevisionAuthorityField: 'CODE_SOURCE_REVISION',
    notes: [], ...overrides,
  };
}

function plan(overrides: Partial<CodeRevisionStorageObservationV1> = {}) {
  const canary = classifyCodeRevisionOwnerCanaryV1({
    authority: authority(), storage: storage(overrides), producerRevision: 'test:writer-plan:canary:v3',
  });
  return planGraphifySourceInventoryWriterV1({ canary, producerRevision: 'test:writer-plan:v3' });
}

describe('GraphifySourceInventoryWritePlanV1', () => {
  it('requires base schema before any writer integration', () => {
    const result = plan({ graphifyFilesPresent: false, requiredFileColumnsPresent: false });
    expect(result.status).toBe('BLOCKED_BASE_SCHEMA_REQUIRED');
    expect(result.target).toBeNull();
    expect(result.migrationRequired).toBe(true);
    expect(result.createNewWriterAllowed).toBe(false);
    expect(result.applyAllowed).toBe(false);
  });

  it('requires the v2 logical revision migration even for compatible legacy rows', () => {
    const result = plan({
      logicalWorkspaceRevisionColumnsPresent: false,
      logicalCodeSourceRevisionColumnPresent: false,
      sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
      sourceRevisionAuthorityField: 'CONTENT_HASH',
    });
    expect(result.status).toBe('REVISION_AUTHORITY_V2_MIGRATION_REQUIRED');
    expect(result.target).toBeNull();
    expect(result.migrationRequired).toBe(true);
    expect(result.createNewWriterAllowed).toBe(false);
    expect(result.blockers).toContain('NO_LEGACY_REVISION_COLUMN_REINTERPRETATION');
  });

  it('targets only first-class v2 logical revision columns', () => {
    const result = plan();
    expect(result.status).toBe('READY_FOR_CANONICAL_WRITER_IMPLEMENTATION');
    expect(result.target).toEqual({
      runTable: 'graphify_runs', fileTable: 'graphify_files',
      gitRepositoryRevisionColumn: 'repository_revision',
      workspaceRevisionColumn: 'workspace_revision',
      sourceManifestDigestColumn: 'source_manifest_digest',
      legacySourceRevisionColumn: 'source_revision',
      codeSourceRevisionColumn: 'code_source_revision',
      sourceRefColumn: 'source_ref', contentDigestColumn: 'content_hash', byteLengthColumn: 'byte_length',
    });
    expect(result.createNewWriterAllowed).toBe(true);
    expect(result.migrationRequired).toBe(false);
    expect(result.requiredWriterBehavior.preservesGitRepositoryRevisionProvenance).toBe(true);
    expect(result.requiredWriterBehavior.preservesLegacySourceRevisionSemantics).toBe(true);
  });

  it('forbids a second writer once the v2 owner is bound', () => {
    const result = plan({
      productionWriterPath: 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v1.ts',
      productionWriterPresent: true,
      productionWriterCreatesWorkspaceRevision: true,
      productionWriterCreatesSourceRevision: true,
    });
    expect(result.status).toBe('OWNER_ALREADY_BOUND_CONTROLLED_CANARY_REQUIRED');
    expect(result.createNewWriterAllowed).toBe(false);
    expect(result.blockers).toContain('SECOND_REVISION_WRITER_FORBIDDEN');
  });

  it('forbids a second writer after exact v2 persisted readback proves ownership', () => {
    const result = plan({
      productionWriterPath: 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v1.ts',
      productionWriterPresent: true,
      productionWriterCreatesWorkspaceRevision: true,
      productionWriterCreatesSourceRevision: true,
      persistedMatchingRows: 1,
    });
    expect(result.status).toBe('OWNER_ALREADY_PROVEN_NO_NEW_WRITER');
    expect(result.createNewWriterAllowed).toBe(false);
    expect(result.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('preserves manifest revision and Git provenance as separate deterministic coordinates', () => {
    const first = plan();
    const second = plan();
    expect(second.planChecksum).toBe(first.planChecksum);
    expect(first.plannedRunRevision.workspaceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.plannedRunRevision.sourceManifestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.plannedRunRevision.repositoryRevision).toBe('a'.repeat(40));
    expect(first.plannedRunRevision.repositoryRevisionRole).toBe('GIT_PROVENANCE_ONLY');
    expect(first.plannedFileRevision.codeSourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
