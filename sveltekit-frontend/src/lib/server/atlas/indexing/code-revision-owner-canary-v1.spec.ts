import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { deriveCodeRevisionAuthorityV1 } from './code-revision-authority-v1.js';
import {
  classifyCodeRevisionOwnerCanaryV1,
  type CodeRevisionStorageObservationV1,
} from './code-revision-owner-canary-v1.js';

function authority() {
  return deriveCodeRevisionAuthorityV1({
    workspaceRoot: path.resolve('/fixture/workspace'),
    absoluteSourcePath: path.resolve('/fixture/workspace/src/a.ts'),
    sourceText: 'export const a = 1;\n',
    producerRevision: 'test:revision-owner-canary:v1',
    workspaceRevisionResolver: () => 'b'.repeat(40),
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

describe('CodeRevisionOwnerCanaryV1', () => {
  it('does not confuse deterministic revision semantics with durable authority', () => {
    const receipt = classifyCodeRevisionOwnerCanaryV1({
      authority: authority(),
      storage: storage(),
      producerRevision: 'test:revision-owner-canary:v1',
    });
    expect(receipt.status).toBe('REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND');
    expect(receipt.workspaceOriginSemanticsProven).toBe(true);
    expect(receipt.sourceOriginSemanticsProven).toBe(true);
    expect(receipt.durableOwnerBound).toBe(false);
    expect(receipt.revisionOwnerProven).toBe(false);
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(false);
    expect(receipt.blockers).toContain('GRAPHIFY_REVISION_PRODUCTION_WRITER_NOT_BOUND');
  });

  it('blocks when the durable Graphify schema does not exist', () => {
    const receipt = classifyCodeRevisionOwnerCanaryV1({
      authority: authority(),
      storage: storage({ graphifyFilesPresent: false, requiredFileColumnsPresent: false }),
      producerRevision: 'test:revision-owner-canary:v1',
    });
    expect(receipt.status).toBe('BLOCKED_SCHEMA_MISSING');
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('accepts legacy Git source_revision only when content_hash is the exact-byte authority field', () => {
    const receipt = classifyCodeRevisionOwnerCanaryV1({
      authority: authority(),
      storage: storage({
        sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
        sourceRevisionAuthorityField: 'CONTENT_HASH',
      }),
      producerRevision: 'test:revision-owner-canary:v1',
    });
    expect(receipt.status).toBe('REVISION_ORIGIN_SEMANTICS_PROVEN_DURABLE_OWNER_NOT_BOUND');
    expect(receipt.blockers).not.toContain('GRAPHIFY_SOURCE_REVISION_SEMANTICS_LEGACY_GIT_SHA_WITHOUT_CONTENT_HASH_AUTHORITY');
    expect(receipt.blockers).toContain('GRAPHIFY_REVISION_PRODUCTION_WRITER_NOT_BOUND');
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('blocks legacy Git-SHA source_revision when no exact-byte content authority is proven', () => {
    const receipt = classifyCodeRevisionOwnerCanaryV1({
      authority: authority(),
      storage: storage({
        sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA',
        sourceRevisionAuthorityField: 'NONE',
      }),
      producerRevision: 'test:revision-owner-canary:v1',
    });
    expect(receipt.status).toBe('BLOCKED_STORAGE_SEMANTICS_MISMATCH');
    expect(receipt.blockers).toContain('GRAPHIFY_SOURCE_REVISION_SEMANTICS_LEGACY_GIT_SHA_WITHOUT_CONTENT_HASH_AUTHORITY');
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(false);
  });

  it('blocks a mismatched authority-field declaration', () => {
    const receipt = classifyCodeRevisionOwnerCanaryV1({
      authority: authority(),
      storage: storage({
        sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
        sourceRevisionAuthorityField: 'SOURCE_REVISION',
      }),
      producerRevision: 'test:revision-owner-canary:v1',
    });
    expect(receipt.status).toBe('BLOCKED_STORAGE_SEMANTICS_MISMATCH');
    expect(receipt.blockers).toContain('GRAPHIFY_SOURCE_REVISION_AUTHORITY_FIELD_MISMATCH');
  });

  it('becomes ready for a controlled canary only after an origin writer is bound', () => {
    const receipt = classifyCodeRevisionOwnerCanaryV1({
      authority: authority(),
      storage: storage({
        productionWriterPath: 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-writer-v1.ts',
        productionWriterPresent: true,
        productionWriterCreatesWorkspaceRevision: true,
        productionWriterCreatesSourceRevision: true,
      }),
      producerRevision: 'test:revision-owner-canary:v1',
    });
    expect(receipt.status).toBe('REVISION_OWNER_READY_FOR_CONTROLLED_CANARY');
    expect(receipt.durableOwnerBound).toBe(true);
    expect(receipt.revisionOwnerProven).toBe(false);
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(false);
    expect(receipt.blockers).toEqual(['CONTROLLED_PERSISTENCE_CANARY_NOT_PROVEN']);
  });

  it('permits FANOUT only after an origin writer and matching persisted canary are both proven', () => {
    const receipt = classifyCodeRevisionOwnerCanaryV1({
      authority: authority(),
      storage: storage({
        sourceRevisionStorageSemantics: 'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
        sourceRevisionAuthorityField: 'CONTENT_HASH',
        productionWriterPath: 'sveltekit-frontend/src/lib/server/atlas/indexing/code-revision-writer-v1.ts',
        productionWriterPresent: true,
        productionWriterCreatesWorkspaceRevision: true,
        productionWriterCreatesSourceRevision: true,
        persistedMatchingRows: 1,
      }),
      producerRevision: 'test:revision-owner-canary:v1',
    });
    expect(receipt.status).toBe('REVISION_OWNER_PROVEN');
    expect(receipt.revisionOwnerProven).toBe(true);
    expect(receipt.fanoutMayConsumeAsCanonical).toBe(true);
    expect(receipt.blockers).toEqual([]);
  });
});
