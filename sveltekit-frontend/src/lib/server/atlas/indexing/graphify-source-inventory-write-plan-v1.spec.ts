import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { deriveCodeRevisionAuthorityV1 } from './code-revision-authority-v1.js';
import {
  classifyCodeRevisionOwnerCanaryV1,
  type CodeRevisionStorageObservationV1,
} from './code-revision-owner-canary-v1.js';
import { planGraphifySourceInventoryWriterV1 } from './graphify-source-inventory-write-plan-v1.js';

function authority() {
  return deriveCodeRevisionAuthorityV1({
    workspaceRoot: path.resolve('/fixture/workspace'),
    absoluteSourcePath: path.resolve('/fixture/workspace/src/a.ts'),
    sourceText: 'export const a = 1;\n',
    producerRevision: 'test:writer-plan:v1',
    workspaceRevisionResolver: () => 'a'.repeat(40),
  });
}

function storage(overrides: Partial<CodeRevisionStorageObservationV1> = {}): CodeRevisionStorageObservationV1 {
  return {
    graphifyRunsPresent: true,
    graphifyFilesPresent: true,
    requiredRunColumnsPresent: true,
    requiredFileColumnsPresent: true,
    productionWriterPath: null,
    productionWriterPresent: false,
    productionWriterCreatesWorkspaceRevision: false,
    productionWriterCreatesSourceRevision: false,
    persistedMatchingRows: 0,
    sourceRevisionStorageSemantics: 'CODE_SOURCE_REVISION_V1',
    sourceRevisionAuthorityField: 'SOURCE_REVISION',
    notes: [],
    ...overrides,
  };
}

function plan(overrides: Partial<CodeRevisionStorageObservationV1> = {}) {
  const canary = classifyCodeRevisionOwnerCanaryV1({
    authority: authority(),
    storage: storage(overrides),
    producerRevision: 'test:writer-plan:canary:v1',
  });
  return planGraphifySourceInventoryWriterV1({
    canary,
    producerRevision: 'test:writer-plan:v1',
  });
}

describe('GraphifySourceInventoryWritePlanV1', () => {
  it('requires schema review and never schedules a write when Graphify lineage is missing', () => {
    const result = plan({ graphifyFilesPresent: false, requiredFileColumnsPresent: false });
    expect(result.status).toBe('BLOCKED_SCHEMA_DECISION_REQUIRED');
    expect(result.storageStrategy).toBe('NONE');
    expect(result.target).toBeNull();
    expect(result.migrationRequired).toBe(true);
    expect(result.createNewWriterAllowed).toBe(false);
    expect(result.applyAllowed).toBe(false);
    expect(result.canonicalWriteAttempted).toBe(false);
    expect(result.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('requires a versioned storage decision when legacy Git revisions have no byte authority', () => {
    const result = plan({
      sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA',
      sourceRevisionAuthorityField: 'NONE',
    });
    expect(result.status).toBe('BLOCKED_STORAGE_SEMANTICS_DECISION_REQUIRED');
    expect(result.storageStrategy).toBe('VERSIONED_LINEAGE_SCHEMA_REQUIRED');
    expect(result.target).toBeNull();
    expect(result.migrationRequired).toBe(true);
    expect(result.createNewWriterAllowed).toBe(false);
    expect(result.blockers).toContain('NO_LEGACY_SOURCE_REVISION_REINTERPRETATION');
  });

  it('targets source_revision when the canonical revision is stored there directly', () => {
    const result = plan();
    expect(result.status).toBe('READY_FOR_CANONICAL_WRITER_IMPLEMENTATION');
    expect(result.storageStrategy).toBe('EXISTING_GRAPHIFY_LINEAGE');
    expect(result.target).toEqual({
      runTable: 'graphify_runs',
      fileTable: 'graphify_files',
      workspaceRevisionColumn: 'repository_revision',
      sourceRevisionAuthorityColumn: 'source_revision',
      legacySourceRevisionColumn: 'source_revision',
      sourceRefColumn: 'source_ref',
      contentDigestColumn: 'content_hash',
      byteLengthColumn: 'byte_length',
    });
    expect(result.createNewWriterAllowed).toBe(true);
    expect(result.migrationRequired).toBe(false);
    expect(result.applyAllowed).toBe(false);
    expect(result.requiredWriterBehavior.preservesLegacySourceRevisionSemantics).toBe(true);
    expect(result.requiredWriterBehavior.acceptsCallerSourceRevisionAsAuthority).toBe(false);
    expect(result.requiredWriterBehavior.acceptsCallerWorkspaceRevisionAsAuthority).toBe(false);
  });

  it('targets content_hash without reinterpreting legacy source_revision', () => {
    const result = plan({
      sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
      sourceRevisionAuthorityField: 'CONTENT_HASH',
    });
    expect(result.status).toBe('READY_FOR_CANONICAL_WRITER_IMPLEMENTATION');
    expect(result.storageStrategy).toBe('EXISTING_GRAPHIFY_LINEAGE');
    expect(result.target?.sourceRevisionAuthorityColumn).toBe('content_hash');
    expect(result.target?.legacySourceRevisionColumn).toBe('source_revision');
    expect(result.migrationRequired).toBe(false);
    expect(result.createNewWriterAllowed).toBe(true);
  });

  it('forbids a second writer when an owner is already bound and asks only for the controlled canary', () => {
    const result = plan({
      productionWriterPath: 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-writer-v1.ts',
      productionWriterPresent: true,
      productionWriterCreatesWorkspaceRevision: true,
      productionWriterCreatesSourceRevision: true,
    });
    expect(result.status).toBe('OWNER_ALREADY_BOUND_CONTROLLED_CANARY_REQUIRED');
    expect(result.createNewWriterAllowed).toBe(false);
    expect(result.blockers).toContain('SECOND_REVISION_WRITER_FORBIDDEN');
    expect(result.blockers).toContain('CONTROLLED_PERSISTENCE_CANARY_REQUIRED');
  });

  it('forbids a second writer after revision ownership is proven', () => {
    const result = plan({
      sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
      sourceRevisionAuthorityField: 'CONTENT_HASH',
      productionWriterPath: 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-writer-v1.ts',
      productionWriterPresent: true,
      productionWriterCreatesWorkspaceRevision: true,
      productionWriterCreatesSourceRevision: true,
      persistedMatchingRows: 1,
    });
    expect(result.status).toBe('OWNER_ALREADY_PROVEN_NO_NEW_WRITER');
    expect(result.target?.sourceRevisionAuthorityColumn).toBe('content_hash');
    expect(result.createNewWriterAllowed).toBe(false);
    expect(result.applyAllowed).toBe(false);
    expect(result.fanoutMayConsumeAsCanonical).toBe(false);
    expect(result.blockers).toContain('SECOND_REVISION_WRITER_FORBIDDEN');
  });

  it('preserves the exact computed revision lineage in the plan deterministically', () => {
    const first = plan();
    const second = plan();
    expect(second.plannedRunRevision).toEqual(first.plannedRunRevision);
    expect(second.plannedFileRevision).toEqual(first.plannedFileRevision);
    expect(second.planChecksum).toBe(first.planChecksum);
    expect(first.plannedRunRevision.workspaceRevision).toBe('a'.repeat(40));
    expect(first.plannedFileRevision.sourceRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.plannedFileRevision.contentDigest).toMatch(/^[a-f0-9]{64}$/);
  });
});
