import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { qualifyFunctionRegistryEvidenceV1 } from './function-registry-v1.js';

const source = Buffer.from('// note 🧭\nexport function lookupPacket(id: string) { return id; }\n', 'utf8');
const declaration = Buffer.from('export function lookupPacket(id: string) { return id; }', 'utf8');
const startByte = source.indexOf(declaration);
const endByte = startByte + declaration.byteLength;

const owner = {
  stableSymbolId: 'stable-symbol:lookupPacket',
  symbolVersionId: 'symbol-version:lookupPacket:source-r1',
  packetKey: 'packet:lookupPacket',
  treeNodeId: 'tree-node:lookupPacket',
  sourceRef: 'src/lookup.ts',
  sourceRevision: 'source-r1',
  workspaceRevision: 'workspace-r1',
  qualifiedName: 'lookupPacket',
  byteStart: startByte,
  byteEnd: endByte,
  signatureNormalized: 'lookupPacket(id:string)',
  producerRevision: 'atlas-symbol-version-producer-v1',
};

const ast = {
  sourceRef: 'src/lookup.ts',
  sourceRevision: 'source-r1',
  workspaceRevision: 'workspace-r1',
  qualifiedName: 'lookupPacket',
  language: 'typescript',
  nodeType: 'function_declaration',
  astPath: 'source_file/function_declaration[0]',
  startByte,
  endByte,
  signature: 'export function lookupPacket(id: string)',
  declarationText: declaration.toString('utf8'),
  parserRevision: 'tree-sitter-typescript:test-fixture',
};

function qualify(overrides: { owner?: Record<string, unknown>; ast?: Record<string, unknown>; bytes?: Uint8Array } = {}) {
  const sourceBytes = overrides.bytes ?? source;
  const expectedSourceContentHash = createHash('sha256').update(source).digest('hex');
  const result = qualifyFunctionRegistryEvidenceV1({
    owner: { ...owner, ...overrides.owner },
    ast: { ...ast, ...overrides.ast },
    sourceBytes,
    expectedSourceContentHash,
  });
  return result;
}

describe('FunctionRegistryV1 qualification scaffold', () => {
  it('binds existing symbol identities to exact source bytes and revisions', () => {
    const result = qualify();
    expect(result.status).toBe('QUALIFIED_ADVISORY');
    if (result.status !== 'QUALIFIED_ADVISORY') throw new Error('EXPECTED_ADVISORY_ENTRY');
    expect(result.entry.canonicalId).toBe(owner.stableSymbolId);
    expect(result.entry.symbolVersionId).toBe(owner.symbolVersionId);
    expect(result.entry.packetKey).toBe(owner.packetKey);
    expect(result.entry.sourceContentHash).toBe(createHash('sha256').update(source).digest('hex'));
    expect(result.entry.canonicalAuthority).toBe(false);
    expect(result.entry.writesAllowed).toBe(false);
  });

  it('blocks unresolved packet or tree identity instead of deriving replacements', () => {
    expect(qualify({ owner: { packetKey: null } })).toMatchObject({ status: 'BLOCKED', failures: ['PACKET_KEY_UNRESOLVED'] });
    expect(qualify({ owner: { treeNodeId: null } })).toMatchObject({ status: 'BLOCKED', failures: ['TREE_NODE_UNRESOLVED'] });
  });

  it('blocks owner-to-AST source, revision, name, or span disagreement', () => {
    expect(qualify({ ast: { sourceRevision: 'source-r2' } })).toMatchObject({ status: 'BLOCKED', failures: ['IDENTITY_REVISION_MISMATCH'] });
    expect(qualify({ ast: { qualifiedName: 'otherFunction' } })).toMatchObject({ status: 'BLOCKED', failures: ['IDENTITY_REVISION_MISMATCH'] });
    expect(qualify({ ast: { endByte: endByte - 1 } })).toMatchObject({ status: 'BLOCKED', failures: ['IDENTITY_REVISION_MISMATCH', 'SOURCE_SPAN_MISMATCH'] });
  });

  it('blocks a source digest mismatch or out-of-range source span', () => {
    expect(qualify({ bytes: Buffer.from('changed source', 'utf8') })).toMatchObject({ status: 'BLOCKED', failures: ['SOURCE_HASH_MISMATCH', 'SOURCE_SPAN_INVALID'] });
    expect(qualify({ ast: { endByte: source.byteLength + 1 } })).toMatchObject({ status: 'BLOCKED', failures: ['IDENTITY_REVISION_MISMATCH', 'SOURCE_SPAN_INVALID'] });
  });

  it('does not invent graph edges, summaries, or executable capabilities', () => {
    const first = qualify();
    const second = qualify();
    expect(first.status).toBe('QUALIFIED_ADVISORY');
    expect(second.status).toBe('QUALIFIED_ADVISORY');
    if (first.status !== 'QUALIFIED_ADVISORY' || second.status !== 'QUALIFIED_ADVISORY') return;
    expect(first.entry.evidenceChecksum).toBe(second.entry.evidenceChecksum);
    expect(first.entry.graphRevision).toBeNull();
    expect(first.entry.resolvedCallTargetSymbolVersionIds).toEqual([]);
    expect(first.entry.summary).toBeNull();
    expect(first.entry.capabilityId).toBeNull();
    expect(first.entry.toolRegistrationStatus).toBe('none');
  });
});
