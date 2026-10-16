import { createHash } from 'node:crypto';
import type { AtlasAstNode } from '$lib/server/db/schema/atlas-ast-nodes.js';
import type { AtlasPacket } from '$lib/server/db/schema/atlas-packets.js';
import type {
  AtlasSymbolRegistryRow,
  AtlasSymbolVersionRow,
} from '$lib/server/db/schema/atlas-structural-intelligence.js';
import {
  buildFunctionRegistrySnapshotV1,
  type FunctionRegistrySnapshotV1,
} from './function-registry-snapshot-v1.js';
import { qualifyFunctionRegistryEvidenceV1 } from './function-registry-v1.js';
import { matchesAstNodeStoragePathV1, type AstNodeStoragePathBindingV1 } from './ast-node-storage-path-v1.js';

type SymbolVersionOwnerRowV1 = Pick<AtlasSymbolVersionRow,
  | 'symbolVersionId'
  | 'stableSymbolId'
  | 'sourceRef'
  | 'sourceRevision'
  | 'workspaceRevision'
  | 'qualifiedName'
  | 'upstreamNodeId'
  | 'signatureNormalized'
  | 'producerRevision'
  | 'packetKey'
  | 'byteStart'
  | 'byteEnd'
>;

type SymbolRegistryOwnerRowV1 = Pick<AtlasSymbolRegistryRow,
  'stableSymbolId' | 'registryRevision' | 'status'
>;

type AstNodeOwnerRowV1 = Pick<AtlasAstNode,
  | 'treeNodeId'
  | 'relativePath'
  | 'nodeKind'
  | 'qualifiedSymbol'
  | 'parserLanguage'
  | 'normalizedSignature'
  | 'startByte'
  | 'endByte'
  | 'sourceContentHash'
  | 'sourceRevision'
  | 'sourceRefKey'
  | 'repoId'
  | 'parserName'
  | 'parserVersion'
  | 'grammarVersion'
>;

export type AstParserObservationV1 = {
  node: AstNodeOwnerRowV1;
  pathBinding?: AstNodeStoragePathBindingV1;
  astPath: string;
  signature: string;
  declarationText: string;
  parserRevision: string;
};

type PacketOwnerRowV1 = Pick<AtlasPacket,
  'packetKey' | 'sourceRef' | 'sourceRevision' | 'workspaceRevisionKey'
>;

export type WorkspaceSourceBindingRowV1 = {
  repoId: string;
  astRepoId: string | null;
  canonicalSourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  contentDigest: string;
};

export interface FunctionRegistryReadPortsV1 {
  getSymbolVersion(symbolVersionId: string): Promise<SymbolVersionOwnerRowV1 | null>;
  getSymbolRegistry(stableSymbolId: string): Promise<SymbolRegistryOwnerRowV1 | null>;
  getAstCandidates(
    symbol: SymbolVersionOwnerRowV1,
    binding: WorkspaceSourceBindingRowV1,
    sourceBytes: Uint8Array,
  ): Promise<AstParserObservationV1[]>;
  getPackets(packetKey: string): Promise<PacketOwnerRowV1[]>;
  getWorkspaceSourceBindings(sourceRef: string, sourceRevision: string, workspaceRevision: string): Promise<WorkspaceSourceBindingRowV1[]>;
  readSourceBytes(sourceRef: string, sourceRevision: string): Promise<Uint8Array | null>;
}

export type FunctionRegistryReadRejectionV1 =
  | 'SYMBOL_NOT_FOUND'
  | 'SYMBOL_REGISTRY_NOT_FOUND'
  | 'SYMBOL_NOT_ACTIVE'
  | 'AST_NOT_FOUND'
  | 'AST_AMBIGUOUS'
  | 'AST_PROVENANCE_MISMATCH'
  | 'REVISION_MISMATCH'
  | 'PACKET_NOT_FOUND'
  | 'PACKET_AMBIGUOUS'
  | 'SOURCE_BINDING_NOT_FOUND'
  | 'SOURCE_BINDING_AMBIGUOUS'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_HASH_MISMATCH'
  | 'BYTE_SPAN_MISMATCH'
  | 'IDENTITY_INCOMPLETE'
  | 'READ_FAILED'
  | 'SNAPSHOT_BUILD_FAILED';

export type FunctionRegistryReadOutcomeV1 =
  | { status: 'QUALIFIED'; snapshot: FunctionRegistrySnapshotV1; evidenceRefs: string[] }
  | { status: 'REJECTED'; reason: FunctionRegistryReadRejectionV1; evidenceRefs: string[] };

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function digestHex(value: string): string | null {
  const normalized = value.replace(/^sha256:/i, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function evidenceRefs(symbolVersionId: string, treeNodeId?: string): string[] {
  return [
    `atlas_symbol_versions:${symbolVersionId}`,
    ...(treeNodeId ? [`atlas_ast_nodes:${treeNodeId}`] : []),
  ];
}

function reject(reason: FunctionRegistryReadRejectionV1, symbolVersionId: string, treeNodeId?: string): FunctionRegistryReadOutcomeV1 {
  return { status: 'REJECTED', reason, evidenceRefs: evidenceRefs(symbolVersionId, treeNodeId) };
}

async function qualifyFunctionRegistryReadOnlyInternalV1(input: {
  symbolVersionId: string;
  expectedWorkspaceRevision: string;
  expectedSourceRevision: string;
  ports: FunctionRegistryReadPortsV1;
}): Promise<FunctionRegistryReadOutcomeV1> {
  const symbol = await input.ports.getSymbolVersion(input.symbolVersionId);
  if (!symbol) return reject('SYMBOL_NOT_FOUND', input.symbolVersionId);

  if (!symbol.stableSymbolId || !symbol.packetKey || !symbol.sourceRef || !symbol.sourceRevision
    || !symbol.workspaceRevision || !symbol.qualifiedName || !symbol.producerRevision
    || !Number.isInteger(symbol.byteStart) || !Number.isInteger(symbol.byteEnd)
    || symbol.byteStart < 0 || symbol.byteEnd <= symbol.byteStart) {
    return reject('IDENTITY_INCOMPLETE', symbol.symbolVersionId);
  }
  if (symbol.workspaceRevision !== input.expectedWorkspaceRevision
    || symbol.sourceRevision !== input.expectedSourceRevision
    || !/^sha256:[a-f0-9]{64}$/i.test(symbol.sourceRevision)
    || !/^sha256:[a-f0-9]{64}$/i.test(symbol.workspaceRevision)) {
    return reject('REVISION_MISMATCH', symbol.symbolVersionId);
  }

  const registry = await input.ports.getSymbolRegistry(symbol.stableSymbolId);
  if (!registry) return reject('SYMBOL_REGISTRY_NOT_FOUND', symbol.symbolVersionId);
  if (registry.stableSymbolId !== symbol.stableSymbolId || registry.status !== 'active' || !registry.registryRevision) {
    return reject('SYMBOL_NOT_ACTIVE', symbol.symbolVersionId);
  }

  const packetRows = await input.ports.getPackets(symbol.packetKey);
  const exactPackets = packetRows.filter((packet) =>
    packet.packetKey === symbol.packetKey
      && packet.sourceRef === symbol.sourceRef
      && packet.sourceRevision === symbol.sourceRevision
      && packet.workspaceRevisionKey === symbol.workspaceRevision,
  );
  if (exactPackets.length === 0) return reject('PACKET_NOT_FOUND', symbol.symbolVersionId);
  if (exactPackets.length !== 1) return reject('PACKET_AMBIGUOUS', symbol.symbolVersionId);

  const bindings = await input.ports.getWorkspaceSourceBindings(
    symbol.sourceRef,
    symbol.sourceRevision,
    symbol.workspaceRevision,
  );
  const exactBindings = bindings.filter((binding) =>
    binding.canonicalSourceRef === symbol.sourceRef
      && binding.sourceRevision === symbol.sourceRevision
      && binding.workspaceRevision === symbol.workspaceRevision,
  );
  if (exactBindings.length === 0) return reject('SOURCE_BINDING_NOT_FOUND', symbol.symbolVersionId);
  if (exactBindings.length !== 1) return reject('SOURCE_BINDING_AMBIGUOUS', symbol.symbolVersionId);

  const binding = exactBindings[0];
  const expectedHash = digestHex(binding.contentDigest);
  const revisionHash = digestHex(symbol.sourceRevision);
  if (!expectedHash || !revisionHash || expectedHash !== revisionHash) {
    return reject('SOURCE_HASH_MISMATCH', symbol.symbolVersionId);
  }
  const sourceBytes = await input.ports.readSourceBytes(symbol.sourceRef, symbol.sourceRevision);
  if (!sourceBytes) return reject('SOURCE_NOT_FOUND', symbol.symbolVersionId);
  if (sha256(sourceBytes) !== revisionHash) return reject('SOURCE_HASH_MISMATCH', symbol.symbolVersionId);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  } catch {
    return reject('BYTE_SPAN_MISMATCH', symbol.symbolVersionId);
  }

  const astCandidates = await input.ports.getAstCandidates(symbol, binding, sourceBytes);
  const sameDeclaredSpan = astCandidates.filter(({ node, pathBinding }) =>
    node.treeNodeId
      && matchesAstNodeStoragePathV1({ canonicalSourceRef: symbol.sourceRef, storedRelativePath: node.relativePath, pathBinding })
      && node.qualifiedSymbol === symbol.qualifiedName
      && node.startByte === symbol.byteStart
      && node.endByte === symbol.byteEnd,
  );
  if (sameDeclaredSpan.length > 0
    && !sameDeclaredSpan.some(({ node }) => node.sourceRevision === symbol.sourceRevision)) {
    return reject('REVISION_MISMATCH', symbol.symbolVersionId);
  }
  const currentRevisionCandidates = sameDeclaredSpan.filter(({ node }) => node.sourceRevision === symbol.sourceRevision);
  if (currentRevisionCandidates.some(({ node }) => digestHex(node.sourceContentHash) === null)) {
    return reject('SOURCE_HASH_MISMATCH', symbol.symbolVersionId);
  }
  const exactAstCandidates = currentRevisionCandidates.filter(({ node }) =>
    digestHex(node.sourceContentHash) !== null,
  );
  if (exactAstCandidates.length === 0) return reject('AST_NOT_FOUND', symbol.symbolVersionId);
  if (exactAstCandidates.length !== 1) return reject('AST_AMBIGUOUS', symbol.symbolVersionId);

  const ast = exactAstCandidates[0];
  const treeNodeId = ast.node.treeNodeId;
  if (!binding.astRepoId || binding.astRepoId !== ast.node.repoId) {
    return reject('AST_PROVENANCE_MISMATCH', symbol.symbolVersionId, treeNodeId);
  }
  const astHash = digestHex(ast.node.sourceContentHash);
  if (!astHash || astHash !== revisionHash) {
    return reject('SOURCE_HASH_MISMATCH', symbol.symbolVersionId, treeNodeId);
  }
  const span = sourceBytes.subarray(symbol.byteStart, symbol.byteEnd);
  const spanText = new TextDecoder('utf-8', { fatal: true }).decode(span);
  if (spanText !== ast.declarationText) {
    return reject('BYTE_SPAN_MISMATCH', symbol.symbolVersionId, treeNodeId);
  }
  if (ast.astPath.trim().length === 0 || ast.signature.trim().length === 0
    || (symbol.signatureNormalized !== null
      && ast.node.normalizedSignature !== symbol.signatureNormalized)) {
    return reject('AST_PROVENANCE_MISMATCH', symbol.symbolVersionId, treeNodeId);
  }

  const ownerEvidence = {
    stableSymbolId: symbol.stableSymbolId,
    symbolVersionId: symbol.symbolVersionId,
    packetKey: symbol.packetKey,
    treeNodeId,
    sourceRef: symbol.sourceRef,
    sourceRevision: symbol.sourceRevision,
    workspaceRevision: symbol.workspaceRevision,
    qualifiedName: symbol.qualifiedName,
    byteStart: symbol.byteStart,
    byteEnd: symbol.byteEnd,
    signatureNormalized: symbol.signatureNormalized,
    producerRevision: symbol.producerRevision,
  };
  const astEvidence = {
    sourceRef: symbol.sourceRef,
    sourceRevision: symbol.sourceRevision,
    workspaceRevision: symbol.workspaceRevision,
    qualifiedName: symbol.qualifiedName,
    language: ast.node.parserLanguage,
    nodeType: ast.node.nodeKind,
    astPath: ast.astPath,
    startByte: ast.node.startByte,
    endByte: ast.node.endByte,
    signature: ast.signature,
    declarationText: ast.declarationText,
    parserRevision: ast.parserRevision,
  };
  const qualified = qualifyFunctionRegistryEvidenceV1({
    owner: ownerEvidence,
    ast: astEvidence,
    sourceBytes,
    expectedSourceContentHash: revisionHash,
  });
  if (qualified.status !== 'QUALIFIED_ADVISORY') {
    return reject(qualified.failures.includes('SOURCE_SPAN_MISMATCH') ? 'BYTE_SPAN_MISMATCH' : 'AST_PROVENANCE_MISMATCH', symbol.symbolVersionId, treeNodeId);
  }

  try {
    const snapshot = buildFunctionRegistrySnapshotV1({
      schema: 'atlas.function-registry-snapshot.v1',
      workspaceRevision: symbol.workspaceRevision,
      symbolRegistryRevision: registry.registryRevision,
      parserRevision: ast.parserRevision,
      graphRevision: null,
      toolRegistryRevision: null,
      entries: [qualified.entry],
      relationships: [],
      capabilities: [],
      representations: [],
      status: 'ADVISORY_ONLY',
      canonicalAuthority: false,
      writesAllowed: false,
    });
    return {
      status: 'QUALIFIED',
      snapshot,
      evidenceRefs: [
        ...evidenceRefs(symbol.symbolVersionId, treeNodeId),
        `atlas_packets:${symbol.packetKey}`,
        `atlas_workspace_source_bindings:${symbol.sourceRef}:${symbol.sourceRevision}:${symbol.workspaceRevision}`,
      ],
    };
  } catch {
    return reject('SNAPSHOT_BUILD_FAILED', symbol.symbolVersionId, treeNodeId);
  }
}

export async function qualifyFunctionRegistryReadOnlyV1(input: {
  symbolVersionId: string;
  expectedWorkspaceRevision: string;
  expectedSourceRevision: string;
  ports: FunctionRegistryReadPortsV1;
}): Promise<FunctionRegistryReadOutcomeV1> {
  try {
    return await qualifyFunctionRegistryReadOnlyInternalV1(input);
  } catch {
    return reject('READ_FAILED', input.symbolVersionId);
  }
}
