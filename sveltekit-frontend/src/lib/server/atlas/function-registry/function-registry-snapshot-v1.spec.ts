import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { qualifyFunctionRegistryEvidenceV1 } from './function-registry-v1.js';
import {
  buildFunctionRegistrySnapshotV1,
  verifyFunctionRegistrySnapshotV1,
  type FunctionRegistrySnapshotV1,
} from './function-registry-snapshot-v1.js';

const source = Buffer.from('export function first() { return second(); }\nexport function second() { return 2; }\n', 'utf8');
const declarations = [
  Buffer.from('export function first() { return second(); }', 'utf8'),
  Buffer.from('export function second() { return 2; }', 'utf8'),
];
const sourceHash = createHash('sha256').update(source).digest('hex');

function makeEntry(index: number) {
  const declaration = declarations[index]!;
  const startByte = source.indexOf(declaration);
  const endByte = startByte + declaration.byteLength;
  const name = index === 0 ? 'first' : 'second';
  const qualifiedName = name;
  const result = qualifyFunctionRegistryEvidenceV1({
    owner: {
      stableSymbolId: `stable:${name}`,
      symbolVersionId: `version:${name}:source-r1`,
      packetKey: `packet:${name}`,
      treeNodeId: `tree:${name}`,
      sourceRef: 'src/functions.ts',
      sourceRevision: 'source-r1',
      workspaceRevision: 'workspace-r1',
      qualifiedName,
      byteStart: startByte,
      byteEnd: endByte,
      signatureNormalized: `function ${name}()`,
      producerRevision: 'symbol-owner-v1',
    },
    ast: {
      sourceRef: 'src/functions.ts',
      sourceRevision: 'source-r1',
      workspaceRevision: 'workspace-r1',
      qualifiedName,
      language: 'typescript',
      nodeType: 'function_declaration',
      astPath: `source_file/function_declaration[${index}]`,
      startByte,
      endByte,
      signature: `export function ${name}()`,
      declarationText: declaration.toString('utf8'),
      parserRevision: 'tree-sitter-ts-v1',
    },
    sourceBytes: source,
    expectedSourceContentHash: sourceHash,
  });
  if (result.status !== 'QUALIFIED_ADVISORY') throw new Error(`FUNCTION_ENTRY_NOT_QUALIFIED:${result.failures.join(',')}`);
  return result.entry;
}

function input(overrides: Partial<FunctionRegistrySnapshotV1> = {}): Omit<FunctionRegistrySnapshotV1, 'snapshotChecksum'> {
  const entries = [makeEntry(0), makeEntry(1)];
  return {
    schema: 'atlas.function-registry-snapshot.v1',
    workspaceRevision: 'workspace-r1',
    symbolRegistryRevision: 'symbols-r1',
    parserRevision: 'tree-sitter-ts-v1',
    graphRevision: null,
    toolRegistryRevision: 'tools-r1',
    entries,
    relationships: [{
      relationKind: 'CALLS',
      resolutionStatus: 'RESOLVED_SYMBOL',
      sourceSymbolVersionId: entries[0]!.symbolVersionId,
      targetSymbolVersionId: entries[1]!.symbolVersionId,
      targetSourceRevision: entries[1]!.sourceRevision,
      targetRef: 'second',
      sourceRef: entries[0]!.sourceRef,
      sourceRevision: entries[0]!.sourceRevision,
      workspaceRevision: 'workspace-r1',
      evidenceKind: 'AST_REFERENCE',
      graphRevision: null,
      evidenceRef: 'ast-ref:first-to-second',
      producerRevision: 'reference-resolver-v1',
    }],
    capabilities: [],
    representations: [],
    status: 'ADVISORY_ONLY',
    canonicalAuthority: false,
    writesAllowed: false,
    ...overrides,
  };
}

describe('FunctionRegistrySnapshotV1', () => {
  it('builds a stable unified snapshot that reuses source-owned symbol IDs', () => {
    const first = buildFunctionRegistrySnapshotV1(input());
    const reversed = buildFunctionRegistrySnapshotV1(input({ entries: [...input().entries].reverse() }));
    expect(first.snapshotChecksum).toBe(reversed.snapshotChecksum);
    expect(first.entries.map((entry) => entry.canonicalId)).toEqual(['stable:first', 'stable:second']);
    expect(first.relationships[0]?.targetSymbolVersionId).toBe('version:second:source-r1');
    expect(first.canonicalAuthority).toBe(false);
    expect(first.writesAllowed).toBe(false);
    expect(verifyFunctionRegistrySnapshotV1(first)).toBe(true);
  });

  it('rejects dangling symbol relationships and revision mismatches', () => {
    const bad = input({ relationships: [{
      ...input().relationships[0]!,
      targetSymbolVersionId: 'version:missing',
      targetSourceRevision: 'source-r1',
    }] });
    expect(() => buildFunctionRegistrySnapshotV1(bad)).toThrow();
    const wrongWorkspace = input({ workspaceRevision: 'workspace-r2' });
    expect(() => buildFunctionRegistrySnapshotV1(wrongWorkspace)).toThrow();
  });

  it('accepts MCP registration evidence without granting invocation authority', () => {
    const base = input();
    const snapshot = buildFunctionRegistrySnapshotV1({
      ...base,
      capabilities: [{
        symbolVersionId: base.entries[0]!.symbolVersionId,
        capabilityId: 'atlas.inspect_function',
        toolName: 'atlas.inspect_function',
        registrationStatus: 'VERIFIED',
        toolRegistryRevision: 'tools-r1',
        evidenceRef: 'mcp:tools-list:atlas.inspect_function',
        invocationAllowed: false,
      }],
    });
    expect(snapshot.capabilities[0]?.registrationStatus).toBe('VERIFIED');
    expect(snapshot.capabilities[0]?.invocationAllowed).toBe(false);
  });

  it('requires graph revision agreement and source-matched semantic references', () => {
    const base = input();
    const graphRelation = {
      ...base.relationships[0]!,
      evidenceKind: 'GRAPH_EDGE' as const,
      graphRevision: 'graph-r1',
    };
    expect(() => buildFunctionRegistrySnapshotV1({ ...base, relationships: [graphRelation] })).toThrow();

    const representation = {
      symbolVersionId: base.entries[0]!.symbolVersionId,
      logicalLane: 'semantic' as const,
      representationId: 'semantic_768' as const,
      representationRevision: 'representation-r1',
      modelRevision: 'embedding-model-r1',
      sourceContentHash: '0'.repeat(64),
      vectorContentHash: '1'.repeat(64),
      dimensions: 768 as const,
      evidenceRef: 'representation:fixture',
    };
    expect(() => buildFunctionRegistrySnapshotV1({ ...base, representations: [representation] })).toThrow();
  });

  it('detects snapshot tampering after construction', () => {
    const snapshot = buildFunctionRegistrySnapshotV1(input());
    const tampered = { ...snapshot, parserRevision: 'parser-r2' };
    expect(verifyFunctionRegistrySnapshotV1(tampered)).toBe(false);
  });
});
