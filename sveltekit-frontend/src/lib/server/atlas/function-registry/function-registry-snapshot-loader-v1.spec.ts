import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FunctionRegistryReadPortsV1 } from './function-registry-read-adapter-v1.js';
import { createFunctionRegistrySnapshotLoaderV1 } from './function-registry-snapshot-loader-v1.js';

const text = 'export function resolveFunction(query: string) { return query; }';
const bytes = Buffer.from(text, 'utf8');
const sourceHash = createHash('sha256').update(bytes).digest('hex');
const sourceRevision = `sha256:${sourceHash}`;
const workspaceRevision = `sha256:${'b'.repeat(64)}`;
const symbolVersionId = 'symbol-version:resolve-function:r1';

function makePorts(overrides: Partial<FunctionRegistryReadPortsV1> = {}): FunctionRegistryReadPortsV1 {
  const symbol = {
    symbolVersionId,
    stableSymbolId: 'stable-symbol:resolve-function',
    packetKey: 'packet:resolve-function',
    sourceRef: 'src/resolve-function.ts',
    sourceRevision,
    workspaceRevision,
    qualifiedName: 'resolveFunction',
    signatureNormalized: '(query:string)',
    producerRevision: 'symbol-materializer:r1',
    byteStart: 0,
    byteEnd: bytes.byteLength,
  };
  const astNode = {
    treeNodeId: 'tree-node:resolve-function',
    relativePath: 'src/resolve-function.ts',
    nodeKind: 'function_declaration',
    qualifiedSymbol: 'resolveFunction',
    parserLanguage: 'typescript',
    normalizedSignature: '(query:string)',
    startByte: 0,
    endByte: bytes.byteLength,
    sourceContentHash: sourceHash,
    sourceRevision,
    sourceRefKey: 'src/resolve-function.ts#function:resolveFunction',
    repoId: 'repo-uuid',
    parserName: 'tree-sitter',
    parserVersion: '0.25.0',
    grammarVersion: 'typescript-r1',
  };

  return {
    getSymbolVersion: async () => symbol,
    getSymbolRegistry: async () => ({ stableSymbolId: symbol.stableSymbolId, registryRevision: 'registry:r1', status: 'active' }),
    getAstCandidates: async () => [{
      node: astNode,
      astPath: 'program/function_declaration',
      signature: 'resolveFunction(query: string)',
      declarationText: text,
      parserRevision: 'tree-sitter-typescript:0.25.0:typescript-r1',
    }],
    getPackets: async () => [{
      packetKey: symbol.packetKey,
      sourceRef: symbol.sourceRef,
      sourceRevision,
      workspaceRevisionKey: workspaceRevision,
    }],
    getWorkspaceSourceBindings: async () => [{
      repoId: 'deeds-web-app',
      astRepoId: 'repo-uuid',
      canonicalSourceRef: symbol.sourceRef,
      sourceRevision,
      workspaceRevision,
      contentDigest: sourceHash,
    }],
    readSourceBytes: async () => bytes,
    ...overrides,
  } as unknown as FunctionRegistryReadPortsV1;
}

describe('function registry snapshot loader v1', () => {
  it('loads the verified snapshot and emits a checksummed, source-free receipt', async () => {
    const loader = createFunctionRegistrySnapshotLoaderV1({ ports: makePorts() });
    const result = await loader.loadQualified({ symbolVersionId, expectedWorkspaceRevision: workspaceRevision, expectedSourceRevision: sourceRevision });

    expect(result.status).toBe('QUALIFIED');
    if (result.status !== 'QUALIFIED') return;
    expect(result.receipt).toMatchObject({
      schema: 'atlas.function-registry-load-receipt.v1',
      symbolVersionId,
      sourceRevision,
      workspaceRevision,
      packetKey: 'packet:resolve-function',
      treeNodeId: 'tree-node:resolve-function',
      sourceContentHash: sourceHash,
      snapshotChecksum: result.snapshot.snapshotChecksum,
      qualificationOutcome: 'QUALIFIED',
      rejectionReason: null,
    });
    expect(JSON.stringify(result.receipt)).not.toContain(text);
    expect(result.receipt.receiptChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects an expected source revision mismatch and records the reason', async () => {
    const loader = createFunctionRegistrySnapshotLoaderV1({ ports: makePorts() });
    const result = await loader.loadQualified({
      symbolVersionId,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSourceRevision: `sha256:${'c'.repeat(64)}`,
    });

    expect(result).toMatchObject({ status: 'REJECTED', reason: 'REVISION_MISMATCH' });
    expect(result.receipt).toMatchObject({
      qualificationOutcome: 'REJECTED',
      rejectionReason: 'REVISION_MISMATCH',
      snapshotChecksum: null,
    });
  });
});
