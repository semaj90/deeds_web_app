import { createHash } from 'node:crypto';
import {
  buildRevisionQualifiedSymbolResolution,
  type RevisionQualifiedSymbolResolutionV1,
} from './revision-qualified-symbol-resolution-v1.js';

export type LspTargetIdentityLookupMethodV1 =
  | 'EXACT_TREE_NODE'
  | 'EXACT_SYMBOL_RANGE'
  | 'EXACT_CONTAINING_SYMBOL';

export interface LspTargetIdentityEnrichmentInputV1 {
  featureId: string;
  packetKey: string;
  workspaceRevision: string;
  source: { sourceRef: string; sourceRevision: string };
  target: {
    uri: string;
    range: {
      startLine: number;
      startCharacter: number;
      endLine: number;
      endCharacter: number;
    };
    upstreamNodeId?: string | null;
  };
  producer: {
    lspServerRevision: string;
    projectRevision: string;
    resolverRevision: string;
  };
}

export interface LspTargetSourceRevisionV1 {
  sourceRef: string;
  sourceRevision: string;
  sourceInventoryRevision: string;
  contentDigest: string;
  sourceText: string;
}

export interface LspTargetSymbolCandidateV1 {
  stableSymbolId: string;
  symbolVersionId: string;
  treeNodeId?: string | null;
  startByte: number;
  endByte: number;
  symbolRegistryRevision: string;
}

export interface LspTargetIdentityReadersV1 {
  resolveSourceRef(uri: string): string | null;
  lookupSourceRevision(sourceRef: string): LspTargetSourceRevisionV1 | null;
  lookupSymbols(input: {
    sourceRef: string;
    sourceRevision: string;
    startByte: number;
    endByte: number;
    upstreamNodeId: string | null;
  }): LspTargetSymbolCandidateV1[];
}

export interface RevisionQualifiedTargetIdentityV1 {
  targetSourceRef: string;
  targetSourceRevision: string;
  stableSymbolId: string;
  symbolVersionId: string;
  treeNodeId: string | null;
  targetRange: { startByte: number; endByte: number };
  identityEvidence: {
    sourceInventoryRevision: string;
    sourceContentDigest: string;
    symbolRegistryRevision: string;
    lookupMethod: LspTargetIdentityLookupMethodV1;
  };
}

export interface LspTargetIdentityEnrichmentResultV1 {
  resolution: RevisionQualifiedSymbolResolutionV1;
  targetIdentity: RevisionQualifiedTargetIdentityV1 | null;
  status: 'ENRICHED' | 'TARGET_IDENTITY_NOT_FOUND' | 'TARGET_IDENTITY_AMBIGUOUS' | 'TARGET_SOURCE_NOT_FOUND';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function byteOffsetAtPosition(text: string, line: number, character: number): number {
  if (!Number.isInteger(line) || !Number.isInteger(character) || line < 0 || character < 0) {
    throw new Error('LSP_TARGET_POSITION_INVALID');
  }
  const lines = text.split('\n');
  if (line >= lines.length) throw new Error('LSP_TARGET_POSITION_OUT_OF_RANGE');
  const lineText = lines[line].replace(/\r$/, '');
  let utf16 = 0;
  let byteOffset = 0;
  for (const codePoint of lineText) {
    if (utf16 >= character) break;
    const width = codePoint.length;
    if (utf16 + width > character) throw new Error('LSP_TARGET_POSITION_SPLITS_CODE_POINT');
    utf16 += width;
    byteOffset += Buffer.byteLength(codePoint, 'utf8');
  }
  if (utf16 !== character) throw new Error('LSP_TARGET_POSITION_OUT_OF_RANGE');
  const prefix = lines.slice(0, line).map((item) => `${item}\n`).join('');
  return Buffer.byteLength(prefix, 'utf8') + byteOffset;
}

function producerRevision(input: LspTargetIdentityEnrichmentInputV1): string {
  return `lsp:${sha256(input.producer)}`;
}

function unresolved(
  input: LspTargetIdentityEnrichmentInputV1,
  sourceRef: string,
  sourceRevision: string,
  resolutionClass: 'UNRESOLVED' | 'OUTSIDE_WORKSPACE',
  evidenceRefs: string[],
  status: 'TARGET_IDENTITY_NOT_FOUND' | 'TARGET_IDENTITY_AMBIGUOUS' | 'TARGET_SOURCE_NOT_FOUND' = resolutionClass === 'OUTSIDE_WORKSPACE' ? 'TARGET_SOURCE_NOT_FOUND' : 'TARGET_IDENTITY_NOT_FOUND',
): LspTargetIdentityEnrichmentResultV1 {
  const resolution = buildRevisionQualifiedSymbolResolution({
    schema: 'atlas.revision-qualified-symbol-resolution.v1',
    featureId: input.featureId,
    packetKey: input.packetKey,
    sourceRef: input.source.sourceRef,
    sourceRevision: input.source.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    targetSourceRef: sourceRef || null,
    targetSourceRevision: sourceRevision || null,
    targetStableSymbolId: null,
    targetSymbolVersionId: null,
    targetUpstreamNodeId: input.target.upstreamNodeId ?? null,
    graphRevision: null,
    stableSymbolId: null,
    symbolVersionId: null,
    upstreamNodeId: null,
    resolutionClass,
    evidenceRefs,
    producerRevision: producerRevision(input),
    canonicalAuthority: false,
  });
  return {
    resolution,
    targetIdentity: null,
    status,
  };
}

export function enrichLspTargetIdentityV1(
  input: LspTargetIdentityEnrichmentInputV1,
  readers: LspTargetIdentityReadersV1,
): LspTargetIdentityEnrichmentResultV1 {
  const targetSourceRef = readers.resolveSourceRef(input.target.uri);
  if (!targetSourceRef) return unresolved(input, '', '', 'OUTSIDE_WORKSPACE', ['LSP_TARGET_URI_OUTSIDE_WORKSPACE']);

  const targetSource = readers.lookupSourceRevision(targetSourceRef);
  if (!targetSource) return unresolved(input, targetSourceRef, '', 'UNRESOLVED', ['TARGET_SOURCE_REVISION_NOT_FOUND']);

  const startByte = byteOffsetAtPosition(targetSource.sourceText, input.target.range.startLine, input.target.range.startCharacter);
  const endByte = byteOffsetAtPosition(targetSource.sourceText, input.target.range.endLine, input.target.range.endCharacter);
  if (endByte < startByte) throw new Error('LSP_TARGET_RANGE_REVERSED');

  const candidates = readers.lookupSymbols({
    sourceRef: targetSourceRef,
    sourceRevision: targetSource.sourceRevision,
    startByte,
    endByte,
    upstreamNodeId: input.target.upstreamNodeId ?? null,
  });
  const byNode = input.target.upstreamNodeId
    ? candidates.filter((candidate) => candidate.treeNodeId === input.target.upstreamNodeId)
    : [];
  const byRange = candidates.filter((candidate) => candidate.startByte === startByte && candidate.endByte === endByte);
  const containing = candidates.filter((candidate) => candidate.startByte <= startByte && candidate.endByte >= endByte);
  const matches = byNode.length === 1 ? { rows: byNode, method: 'EXACT_TREE_NODE' as const }
    : byRange.length === 1 ? { rows: byRange, method: 'EXACT_SYMBOL_RANGE' as const }
      : containing.length === 1 ? { rows: containing, method: 'EXACT_CONTAINING_SYMBOL' as const }
        : { rows: byNode.length > 1 ? byNode : byRange.length > 1 ? byRange : containing, method: 'EXACT_CONTAINING_SYMBOL' as const };

  const evidence = [`source:${targetSourceRef}@${targetSource.sourceRevision}`, `lsp:${producerRevision(input)}`];
  if (matches.rows.length !== 1) {
    return unresolved(
      input,
      targetSourceRef,
      targetSource.sourceRevision,
      'UNRESOLVED',
      [...evidence, matches.rows.length > 1 ? 'TARGET_IDENTITY_AMBIGUOUS' : 'TARGET_IDENTITY_NOT_FOUND'],
      matches.rows.length > 1 ? 'TARGET_IDENTITY_AMBIGUOUS' : 'TARGET_IDENTITY_NOT_FOUND',
    );
  }

  const row = matches.rows[0];
  const targetIdentity: RevisionQualifiedTargetIdentityV1 = {
    targetSourceRef,
    targetSourceRevision: targetSource.sourceRevision,
    stableSymbolId: row.stableSymbolId,
    symbolVersionId: row.symbolVersionId,
    treeNodeId: row.treeNodeId ?? null,
    targetRange: { startByte, endByte },
    identityEvidence: {
      sourceInventoryRevision: targetSource.sourceInventoryRevision,
      sourceContentDigest: targetSource.contentDigest,
      symbolRegistryRevision: row.symbolRegistryRevision,
      lookupMethod: matches.method,
    },
  };
  const resolution = buildRevisionQualifiedSymbolResolution({
    schema: 'atlas.revision-qualified-symbol-resolution.v1',
    featureId: input.featureId,
    packetKey: input.packetKey,
    sourceRef: input.source.sourceRef,
    sourceRevision: input.source.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    targetSourceRef,
    targetSourceRevision: targetSource.sourceRevision,
    targetStableSymbolId: row.stableSymbolId,
    targetSymbolVersionId: row.symbolVersionId,
    targetUpstreamNodeId: row.treeNodeId ?? null,
    graphRevision: null,
    stableSymbolId: null,
    symbolVersionId: null,
    upstreamNodeId: null,
    resolutionClass: 'EXACT_SYMBOL',
    evidenceRefs: [...evidence, `symbol:${row.symbolVersionId}`],
    producerRevision: producerRevision(input),
    canonicalAuthority: false,
  });
  return { resolution, targetIdentity, status: 'ENRICHED' };
}
