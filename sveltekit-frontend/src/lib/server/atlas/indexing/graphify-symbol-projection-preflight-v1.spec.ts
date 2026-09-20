import { describe, expect, it } from 'vitest';
import type { GraphifyStructuralIntelligenceReceipt } from './graphify-structural-intelligence-adapter.js';
import type { GraphifySymbolProjectionBatchV1 } from './graphify-symbol-projection-v1.js';
import {
  proveGraphifySymbolProjectionPreflightV1,
  type GraphifySymbolProjectionRunOwnerEvidenceV1,
  type GraphifySymbolProjectionSourceBindingV1,
} from './graphify-symbol-projection-preflight-v1.js';

const workspaceId = '625743d2-092b-4fa8-abe0-9dc094920c80';
const fileId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';
const workspaceRevision = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sourceRevision = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const sourceRef = 'src/lib/example.ts';

function batch(): GraphifySymbolProjectionBatchV1 {
  return {
    schema: 'atlas.graphify-symbol-projection-batch.v1',
    workspaceId,
    workspaceRevision,
    fileId,
    sourceRef,
    sourceRevision,
    symbols: [{
      schema: 'atlas.graphify-symbol-projection-candidate.v1',
      fileId,
      workspaceRevision,
      sourceRef,
      sourceRevision,
      stableSymbolKey: 'upstream-symbol:symbol-example',
      symbolKind: 'function',
      qualifiedName: 'module::example',
      parentStableSymbolKey: null,
      startByte: 0,
      endByte: 32,
      startRow: 0,
      endRow: 0,
      signatureText: 'export function example()',
      sourceTextHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      astFingerprint: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      upstreamNodeId: 'node-example',
      upstreamSymbolId: 'symbol-example',
      upstreamChunkId: 'chunk-example',
      extractorRevision: 'treesitter-chunker:test',
    }],
    edges: [],
    inputChecksum: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    mapperRevision: 'mapper:test',
    canonicalAuthority: false,
    writesAllowed: false,
  };
}

function runOwner(overrides: Partial<GraphifySymbolProjectionRunOwnerEvidenceV1> = {}): GraphifySymbolProjectionRunOwnerEvidenceV1 {
  return {
    expectedWorkspaceRevision: workspaceRevision,
    runId,
    executionId,
    workspaceId,
    runWorkspaceRevision: workspaceRevision,
    runCompleted: true,
    terminalExecutionBound: true,
    canonicalAuthority: true,
    workspaceForeignRowExists: true,
    sourceManifestBound: true,
    readbackVerified: true,
    coordinatorCompletedStageCount: 10,
    ...overrides,
  };
}

function sourceBinding(overrides: Partial<GraphifySymbolProjectionSourceBindingV1> = {}): GraphifySymbolProjectionSourceBindingV1 {
  return {
    fileId,
    workspaceId,
    workspaceRevision,
    sourceRef,
    sourceRevision,
    contentDigest: sourceRevision.replace(/^sha256:/, ''),
    byteLength: 64,
    readbackVerified: true,
    ...overrides,
  };
}

function structuralReceipt(overrides: Partial<GraphifyStructuralIntelligenceReceipt> = {}): GraphifyStructuralIntelligenceReceipt {
  return {
    schema: 'atlas.graphify-structural-intelligence-receipt.v1',
    sourceRef,
    sourceRevision,
    sourceVersionAnchor: sourceRevision,
    sourceRevisionAuthority: 'PROVEN',
    parserSourceRevisionToken: sourceRevision,
    workspaceRevision,
    status: 'COMPILED_NATIVE',
    providerStatus: 'PROVEN',
    provenanceStatus: 'NATIVE_READY',
    strictNativeMode: true,
    canonicalPromotionMayBeAttempted: true,
    chunkCount: 1,
    symbolNominationCount: 1,
    referenceFactCount: 0,
    astGrepObservationCount: 0,
    langExtractObservationCount: 0,
    groundedDomainCandidateCount: 0,
    compatibilityNodeIdCount: 0,
    compatibilityFileIdCount: 0,
    compatibilityChunkIdCount: 0,
    diagnostics: [],
    canonicalIdentityCreated: false,
    ...overrides,
  };
}

function prove(overrides: {
  admittedWorkspaceRevision?: string;
  batch?: GraphifySymbolProjectionBatchV1;
  runOwner?: GraphifySymbolProjectionRunOwnerEvidenceV1;
  sourceBinding?: GraphifySymbolProjectionSourceBindingV1;
  structuralReceipt?: GraphifyStructuralIntelligenceReceipt;
} = {}) {
  return proveGraphifySymbolProjectionPreflightV1({
    admittedWorkspaceRevision: overrides.admittedWorkspaceRevision ?? workspaceRevision,
    batch: overrides.batch ?? batch(),
    runOwner: overrides.runOwner ?? runOwner(),
    sourceBinding: overrides.sourceBinding ?? sourceBinding(),
    structuralReceipt: overrides.structuralReceipt ?? structuralReceipt(),
  });
}

describe('Graphify symbol projection preflight v1', () => {
  it('returns READY only when workspace, terminal owner, source binding and native provenance all align', () => {
    const receipt = prove();
    expect(receipt.status).toBe('READY');
    expect(receipt.readyForWriter).toBe(true);
    expect(receipt.writerMayBeAttempted).toBe(true);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.violations).toEqual([]);
    expect(receipt.receiptChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks coordinator completion when canonical terminal execution authority is absent', () => {
    const receipt = prove({
      runOwner: runOwner({
        canonicalAuthority: false,
        terminalExecutionBound: false,
        coordinatorCompletedStageCount: 3,
      }),
    });
    expect(receipt.status).toBe('BLOCKED_TERMINAL_RUN_OWNER');
    expect(receipt.readyForWriter).toBe(false);
    expect(receipt.violations).toContain('TERMINAL_CANONICAL_GRAPHIFY_RUN_OWNER_NOT_PROVEN');
  });

  it('gives workspace-revision mismatch precedence over downstream readiness', () => {
    const receipt = prove({
      admittedWorkspaceRevision: 'sha256:9999999999999999999999999999999999999999999999999999999999999999',
    });
    expect(receipt.status).toBe('BLOCKED_WORKSPACE_REVISION');
    expect(receipt.checks.workspaceRevisionMatches).toBe(false);
  });

  it('blocks a non-matching graphify_files source binding', () => {
    const receipt = prove({ sourceBinding: sourceBinding({ fileId: '44444444-4444-4444-8444-444444444444' }) });
    expect(receipt.status).toBe('BLOCKED_SOURCE_BINDING');
    expect(receipt.checks.sourceBindingMatches).toBe(false);
  });

  it('blocks source revision drift after source binding is otherwise exact', () => {
    const nextRevision = 'sha256:7777777777777777777777777777777777777777777777777777777777777777';
    const drifted = batch();
    drifted.sourceRevision = nextRevision;
    drifted.symbols = drifted.symbols.map((symbol) => ({ ...symbol, sourceRevision: nextRevision }));
    const receipt = prove({ batch: drifted });
    expect(receipt.status).toBe('BLOCKED_SOURCE_REVISION');
    expect(receipt.checks.sourceRevisionMatches).toBe(false);
  });

  it('blocks recovered/non-native structural evidence even when every owner binding is healthy', () => {
    const receipt = prove({
      structuralReceipt: structuralReceipt({
        sourceRevisionAuthority: 'UNPROVEN',
        status: 'COMPILED_NONPROMOTABLE',
        provenanceStatus: 'NATIVE_RECOVERED',
        strictNativeMode: false,
        canonicalPromotionMayBeAttempted: false,
      }),
    });
    expect(receipt.status).toBe('BLOCKED_NON_NATIVE_PROVENANCE');
    expect(receipt.checks.nativeProvenanceProven).toBe(false);
  });

  it('blocks a projection span that exceeds the exact source byte length', () => {
    const oversized = batch();
    oversized.symbols = oversized.symbols.map((symbol) => ({ ...symbol, endByte: 1000 }));
    const receipt = prove({ batch: oversized });
    expect(receipt.status).toBe('BLOCKED_INVALID_SPAN');
    expect(receipt.counts.invalidSpanCount).toBe(1);
  });

  it('is deterministic for an identical evidence set', () => {
    expect(prove()).toEqual(prove());
  });
});
