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

function authority() {
  const workspaceRoot = path.resolve('/fixture/workspace');
  const source = deriveCodeSourceRevisionV1('export const a = 1;\n');
  const entry = {
    sourceRef: 'src/a.ts',
    sourceRevision: source.sourceRevision,
    contentDigest: source.contentDigest,
    byteLength: source.byteLength,
    gitBlobOid: 'c'.repeat(40),
  };
  const built = buildWorkspaceRevisionRecordV1({
    repositoryId: 'semaj90/deeds_web_app',
    gitObjectFormat: 'sha1',
    baseCommitOid: 'a'.repeat(40),
    baseTreeOid: 'b'.repeat(40),
    gitHeadRef: 'refs/heads/main',
    dirty: false,
    entries: [entry],
    generatedAt: '2026-08-21T19:00:00.000Z',
    producerRevision: 'test:revision-owner-canary:v2',
  });
  const [binding] = buildWorkspaceSourceBindingsV1({
    record: built.record,
    entries: built.entries,
    trackedAtBaseCommit: new Map([['src/a.ts', true]]),
    dirtyRelativeToBaseCommit: new Map([['src/a.ts', false]]),
    producerRevision: 'test:revision-owner-canary:v2',
  });
  return deriveCodeRevisionAuthorityV1({
    workspaceRoot,
    absoluteSourcePath: path.resolve(workspaceRoot, 'src/a.ts'),
    workspaceRecord: built.record,
    sourceBinding: binding,
    producerRevision: 'test:revision-owner-canary:v2',
  });
}

function storage(overrides: Partial<CodeRevisionStorageObservationV1> = {}): CodeRevisionStorageObservationV1 {
  return {
    graphifyRunsPresent: true,
    graphifyFilesPresent: true,
    requiredRunColumnsPresent: true,
    requiredFileColumnsPresent: true,
    logicalWorkspaceRevisionColumnsPresent: true,
    logicalCodeSourceRevisionColumnPresent: true,
    productionWriterPath: null,
    productionWriterPresent: false,
    productionWriterCreatesWorkspaceRevision: false,
    productionWriterCreatesSourceRevision: false,
    persistedMatchingRows: 0,
    sourceRevisionStorageSemantics: 'GRAPHIFY_REVISION_AUTHORITY_V2',
    sourceRevisionAuthorityField: 'CODE_SOURCE_REVISION',
    notes: [],
    ...overrides,
  };
}

function classify(overrides: Partial<CodeRevisionStorageObservationV1> = {}) {
  return classifyCodeRevisionOwnerCanaryV1({
    authority: authority(),
    storage: storage(overrides),
    producerRevision: 'test:revision-owner-canary:v2',
  });
}

describe('CodeRevisionOwnerCanaryV1', () => {
  it('keeps v2 deterministic semantics unproven until the canonical writer is bound', () => {
    const receipt = classify();
    expect(receipt.status).toBe('REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND');
    expect(receipt.durableOwnerBound).toBe(false);
    expect(receipt.revisionOwnerProven).toBe(false);
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(false);
    expect(receipt.blockers).toContain('GRAPHIFY_REVISION_PRODUCTION_WRITER_NOT_BOUND');
    expect(receipt.blockers).not.toContain('GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED');
  });

  it('blocks when the base durable Graphify schema does not exist', () => {
    const receipt = classify({ graphifyFilesPresent: false, requiredFileColumnsPresent: false });
    expect(receipt.status).toBe('BLOCKED_SCHEMA_MISSING');
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('accepts legacy Git plus content hash only as migration-compatible evidence', () => {
    const receipt = classify({
      logicalWorkspaceRevisionColumnsPresent: false,
      logicalCodeSourceRevisionColumnPresent: false,
      sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
      sourceRevisionAuthorityField: 'CONTENT_HASH',
    });
    expect(receipt.status).toBe('REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND');
    expect(receipt.durableOwnerBound).toBe(false);
    expect(receipt.blockers).toContain('GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED');
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('blocks legacy Git source revision without exact-byte content authority', () => {
    const receipt = classify({
      logicalWorkspaceRevisionColumnsPresent: false,
      logicalCodeSourceRevisionColumnPresent: false,
      sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA',
      sourceRevisionAuthorityField: 'NONE',
    });
    expect(receipt.status).toBe('BLOCKED_STORAGE_SEMANTICS_MISMATCH');
    expect(receipt.blockers).toContain('GRAPHIFY_SOURCE_REVISION_SEMANTICS_LEGACY_GIT_SHA_WITHOUT_CONTENT_HASH_AUTHORITY');
  });

  it('blocks an authority-field mismatch even when v2 columns exist', () => {
    const receipt = classify({
      sourceRevisionStorageSemantics: 'GRAPHIFY_REVISION_AUTHORITY_V2',
      sourceRevisionAuthorityField: 'CONTENT_HASH',
    });
    expect(receipt.status).toBe('BLOCKED_STORAGE_SEMANTICS_MISMATCH');
    expect(receipt.blockers).toContain('GRAPHIFY_SOURCE_REVISION_AUTHORITY_FIELD_MISMATCH');
  });

  it('becomes ready for controlled persistence only with v2 schema plus origin writer', () => {
    const receipt = classify({
      productionWriterPath: 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v1.ts',
      productionWriterPresent: true,
      productionWriterCreatesWorkspaceRevision: true,
      productionWriterCreatesSourceRevision: true,
    });
    expect(receipt.status).toBe('REVISION_OWNER_READY_FOR_CONTROLLED_CANARY');
    expect(receipt.durableOwnerBound).toBe(true);
    expect(receipt.revisionOwnerProven).toBe(false);
    expect(receipt.blockers).toEqual(['CONTROLLED_PERSISTENCE_CANARY_NOT_PROVEN']);
  });

  it('permits FANOUT only after an exact v2 persisted readback match', () => {
    const receipt = classify({
      productionWriterPath: 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v1.ts',
      productionWriterPresent: true,
      productionWriterCreatesWorkspaceRevision: true,
      productionWriterCreatesSourceRevision: true,
      persistedMatchingRows: 1,
    });
    expect(receipt.status).toBe('REVISION_OWNER_PROVEN');
    expect(receipt.revisionOwnerProven).toBe(true);
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(true);
    expect(receipt.blockers).toEqual([]);
  });
});
