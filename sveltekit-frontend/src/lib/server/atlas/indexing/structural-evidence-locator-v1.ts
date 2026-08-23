import { createHash } from 'node:crypto';

import type { ExtractedFeature } from '$lib/server/analysis/ast-grep-extractor.js';
import type { AtlasStructuralEvidenceChunk } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import {
  fingerprintStructuralSource,
  normalizeStructuralSymbolKind,
  type StructuralSourceFingerprintV1,
  type StructuralSymbolKindV1,
} from './structural-observation-v1.js';

export interface StructuralEvidenceLocatorV1 {
  schema: 'atlas.structural-evidence-locator.v1';
  provider: 'ast-grep' | 'node-tree-sitter' | 'treesitter-chunker';
  sourceRef: string;
  sourceRevision: string;
  sourceFingerprint: StructuralSourceFingerprintV1;
  startByte: number;
  endByte: number;
  spanSha256: string;
  spanValid: boolean;
  name: string | null;
  symbolKind: StructuralSymbolKindV1;
  rawKind: string;
  rawNodeType: string;
  comparisonKey: string;
  identityAuthority: false;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildComparisonKey(input: {
  sourceRef: string;
  sourceRevision: string;
  startByte: number;
  endByte: number;
  symbolKind: StructuralSymbolKindV1;
  name: string | null;
  spanSha256: string;
}): string {
  return sha256(JSON.stringify({
    schema: 'atlas.structural-evidence-comparison-key.v1',
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    startByte: input.startByte,
    endByte: input.endByte,
    symbolKind: input.symbolKind,
    name: input.name,
    spanSha256: input.spanSha256,
  }));
}

export function materializeStructuralEvidenceLocatorV1(input: {
  provider: StructuralEvidenceLocatorV1['provider'];
  sourceRef: string;
  sourceRevision: string;
  source: string;
  startByte: number;
  endByte: number;
  name?: string | null;
  rawKind?: string | null;
  rawNodeType?: string | null;
}): StructuralEvidenceLocatorV1 {
  const sourceRef = input.sourceRef.trim();
  const sourceRevision = input.sourceRevision.trim();
  if (!sourceRef) throw new Error('STRUCTURAL_LOCATOR_SOURCE_REF_REQUIRED');
  if (!sourceRevision) throw new Error('STRUCTURAL_LOCATOR_SOURCE_REVISION_REQUIRED');

  const bytes = Buffer.from(input.source, 'utf8');
  const spanValid = Number.isInteger(input.startByte)
    && Number.isInteger(input.endByte)
    && input.startByte >= 0
    && input.endByte >= input.startByte
    && input.endByte <= bytes.byteLength;
  if (!spanValid) throw new Error('STRUCTURAL_LOCATOR_SPAN_INVALID');

  const name = input.name?.trim() || null;
  const rawKind = input.rawKind?.trim() || 'UNKNOWN';
  const rawNodeType = input.rawNodeType?.trim() || rawKind;
  const symbolKind = normalizeStructuralSymbolKind(rawKind, rawNodeType);
  const spanBytes = bytes.subarray(input.startByte, input.endByte);
  const spanSha256 = sha256(spanBytes);
  const comparisonKey = buildComparisonKey({
    sourceRef,
    sourceRevision,
    startByte: input.startByte,
    endByte: input.endByte,
    symbolKind,
    name,
    spanSha256,
  });

  return {
    schema: 'atlas.structural-evidence-locator.v1',
    provider: input.provider,
    sourceRef,
    sourceRevision,
    sourceFingerprint: fingerprintStructuralSource(input.source),
    startByte: input.startByte,
    endByte: input.endByte,
    spanSha256,
    spanValid: true,
    name,
    symbolKind,
    rawKind,
    rawNodeType,
    comparisonKey,
    identityAuthority: false,
  };
}

function astGrepRawKind(feature: ExtractedFeature): string {
  switch (feature.type) {
    case 'ast_function':
    case 'ast_arrow': return 'FUNCTION';
    case 'ast_method': return 'METHOD';
    case 'ast_class': return 'CLASS';
    case 'ast_import': return 'UNKNOWN';
    default: return 'UNKNOWN';
  }
}

export function locateAstGrepFeatureV1(input: {
  sourceRef: string;
  sourceRevision: string;
  source: string;
  feature: ExtractedFeature;
}): StructuralEvidenceLocatorV1 {
  if (!Number.isInteger(input.feature.byteStart) || !Number.isInteger(input.feature.byteEnd)) {
    throw new Error('AST_GREP_FEATURE_BYTE_RANGE_REQUIRED');
  }
  return materializeStructuralEvidenceLocatorV1({
    provider: 'ast-grep',
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    source: input.source,
    startByte: input.feature.byteStart!,
    endByte: input.feature.byteEnd!,
    name: input.feature.name,
    rawKind: astGrepRawKind(input.feature),
    rawNodeType: input.feature.ruleId ?? input.feature.type,
  });
}

export function locateStructuralChunkV1(input: {
  provider: 'node-tree-sitter' | 'treesitter-chunker';
  sourceRef: string;
  sourceRevision: string;
  source: string;
  chunk: AtlasStructuralEvidenceChunk;
}): StructuralEvidenceLocatorV1 {
  return materializeStructuralEvidenceLocatorV1({
    provider: input.provider,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    source: input.source,
    startByte: Number(input.chunk.start_byte),
    endByte: Number(input.chunk.end_byte),
    name: input.chunk.name ?? null,
    rawKind: input.chunk.kind,
    rawNodeType: input.chunk.node_type,
  });
}
