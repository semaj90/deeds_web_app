import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FunctionRegistryReadPortsV1 } from './function-registry-read-adapter-v1.js';
import { qualifyFunctionRegistryReadOnlyV1 } from './function-registry-read-adapter-v1.js';

const sourceText = 'export function resolveFunction(query: string) { return query; }';
const sourceBytes = Buffer.from(sourceText, 'utf8');
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
const sourceRevision = `sha256:${sourceHash}`;
const workspaceRevision = `sha256:${'b'.repeat(64)}`;
const symbolVersionId = 'symbol-version:resolve-function:r1';

function ports(overrides: Partial<FunctionRegistryReadPortsV1> = {}): FunctionRegistryReadPortsV1 {
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
    byteEnd: sourceBytes.byteLength,
  };
  const astNode = {
    treeNodeId: 'tree-node:resolve-function',
    relativePath: 'src/resolve-function.ts',
    nodeKind: 'function_declaration',
    qualifiedSymbol: 'resolveFunction',
    parserLanguage: 'typescript',
    normalizedSignature: '(query:string)',
    startByte: 0,
    endByte: sourceBytes.byteLength,
    sourceContentHash: sourceHash,
    sourceRevision,
    sourceRefKey: 'src/resolve-function.ts#function:resolveFunction',
    repoId: 'repo-uuid',
    parserName: 'tree-sitter',
    parserVersion: '0.25.0',
    grammarVersion: 'typescript-r1',
  };
  const observations = [{
    node: astNode,
    astPath: 'program/function_declaration',
    signature: 'resolveFunction(query: string)',
    declarationText: sourceText,
    parserRevision: 'tree-sitter-typescript:0.25.0:typescript-r1',
  }];

  return {
    getSymbolVersion: async () => symbol,
    getSymbolRegistry: async () => ({
      stableSymbolId: symbol.stableSymbolId,
      registryRevision: 'symbol-registry:r1',
      status: 'active',
    }),
    getAstCandidates: async () => observations,
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
    readSourceBytes: async () => sourceBytes,
    ...overrides,
  } as unknown as FunctionRegistryReadPortsV1;
}

describe('function registry read adapter v1', () => {
  it('qualifies one revision-bound symbol through AST, packet, binding, bytes, and snapshot', async () => {
    const result = await qualifyFunctionRegistryReadOnlyV1({
      symbolVersionId,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSourceRevision: sourceRevision,
      ports: ports(),
    });

    expect(result.status).toBe('QUALIFIED');
    if (result.status !== 'QUALIFIED') return;
    expect(result.snapshot.entries).toHaveLength(1);
    expect(result.snapshot.entries[0]).toMatchObject({
      symbolVersionId,
      packetKey: 'packet:resolve-function',
      treeNodeId: 'tree-node:resolve-function',
      sourceRevision,
      workspaceRevision,
      sourceContentHash: sourceHash,
    });
    expect(result.evidenceRefs).toHaveLength(4);
  });

  it('rejects a source repository label without a proven AST repository UUID mapping', async () => {
    const result = await qualifyFunctionRegistryReadOnlyV1({
      symbolVersionId,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSourceRevision: sourceRevision,
      ports: ports({
        getWorkspaceSourceBindings: async () => [{
          repoId: 'deeds-web-app',
          astRepoId: null,
          canonicalSourceRef: 'src/resolve-function.ts',
          sourceRevision,
          workspaceRevision,
          contentDigest: sourceHash,
        }],
      }),
    });

    expect(result).toMatchObject({ status: 'REJECTED', reason: 'AST_PROVENANCE_MISMATCH' });
  });

  it('rejects a mismatched expected workspace revision', async () => {
    const result = await qualifyFunctionRegistryReadOnlyV1({
      symbolVersionId,
      expectedWorkspaceRevision: `sha256:${'c'.repeat(64)}`,
      expectedSourceRevision: sourceRevision,
      ports: ports(),
    });
    expect(result).toMatchObject({ status: 'REJECTED', reason: 'REVISION_MISMATCH' });
  });

  it('rejects a stale AST source revision', async () => {
    const staleAst = ports({
      getAstCandidates: async (symbol) => {
        const rows = await ports().getAstCandidates(symbol);
        return rows.map((row) => ({ ...row, node: { ...row.node, sourceRevision: `sha256:${'d'.repeat(64)}` } }));
      },
    });
    const result = await qualifyFunctionRegistryReadOnlyV1({
      symbolVersionId,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSourceRevision: sourceRevision,
      ports: staleAst,
    });
    expect(result).toMatchObject({ status: 'REJECTED', reason: 'REVISION_MISMATCH' });
  });

  it('rejects missing and ambiguous native AST node bindings', async () => {
    const missingNode = ports({ getAstCandidates: async () => [] });
    const missing = await qualifyFunctionRegistryReadOnlyV1({
      symbolVersionId,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSourceRevision: sourceRevision,
      ports: missingNode,
    });
    expect(missing).toMatchObject({ status: 'REJECTED', reason: 'AST_NOT_FOUND' });

    const base = ports();
    const ambiguous = ports({
      getAstCandidates: async (symbol) => {
        const rows = await base.getAstCandidates(symbol);
        return [...rows, { ...rows[0], node: { ...rows[0].node, treeNodeId: 'tree-node:duplicate' } }];
      },
    });
    const duplicate = await qualifyFunctionRegistryReadOnlyV1({
      symbolVersionId,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSourceRevision: sourceRevision,
      ports: ambiguous,
    });
    expect(duplicate).toMatchObject({ status: 'REJECTED', reason: 'AST_AMBIGUOUS' });
  });

  it('rejects altered source bytes and non-unique exact packets', async () => {
    const alteredBytes = ports({ readSourceBytes: async () => Buffer.from(`${sourceText} `, 'utf8') });
    const altered = await qualifyFunctionRegistryReadOnlyV1({
      symbolVersionId,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSourceRevision: sourceRevision,
      ports: alteredBytes,
    });
    expect(altered).toMatchObject({ status: 'REJECTED', reason: 'SOURCE_HASH_MISMATCH' });

    const duplicatePackets = ports({
      getPackets: async () => [
        { packetKey: 'packet:resolve-function', sourceRef: 'src/resolve-function.ts', sourceRevision, workspaceRevisionKey: workspaceRevision },
        { packetKey: 'packet:resolve-function', sourceRef: 'src/resolve-function.ts', sourceRevision, workspaceRevisionKey: workspaceRevision },
      ],
    });
    const duplicate = await qualifyFunctionRegistryReadOnlyV1({
      symbolVersionId,
      expectedWorkspaceRevision: workspaceRevision,
      expectedSourceRevision: sourceRevision,
      ports: duplicatePackets,
    });
    expect(duplicate).toMatchObject({ status: 'REJECTED', reason: 'PACKET_AMBIGUOUS' });
  });
});
