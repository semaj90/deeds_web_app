import { createHash } from 'node:crypto';

export type StructuralEvidenceProviderV2 =
  | 'NODE_TREE_SITTER'
  | 'TREESITTER_CHUNKER'
  | 'AST_GREP';

export type StructuralObservationUnitV2 = 'SYMBOL' | 'CHUNK' | 'PATTERN_MATCH';

export type StructuralSpanAuthorityV2 = 'ORIGINAL_UTF8' | 'LF_COMPAT_REMAPPED';

export type StructuralSpanRelationV1 =
  | 'EXACT'
  | 'CHUNK_CONTAINS_SYMBOL'
  | 'SYMBOL_CONTAINS_CHUNK'
  | 'OVERLAPS'
  | 'DISJOINT';

export interface StructuralObservationV2 {
  schema: 'atlas.structural-observation.v2';
  evidenceKey: string;
  provider: StructuralEvidenceProviderV2;
  observationUnit: StructuralObservationUnitV2;
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  providerRevision: string;
  producerRevision: string;
  byteStart: number;
  byteEnd: number;
  semanticKind?: string;
  symbolName?: string;
  parentEvidenceKey?: string;
  containingChunkKeys?: string[];
  spanAuthority: StructuralSpanAuthorityV2;
  lineageQualified: boolean;
}

export interface StructuralEvidenceRelationV1 {
  schema: 'atlas.structural-evidence-relation.v1';
  leftEvidenceKey: string;
  rightEvidenceKey: string;
  relation: StructuralSpanRelationV1;
  sourceRevision: string;
}

function assertSpan(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
    throw new Error(`STRUCTURAL_SPAN_INVALID start=${start} end=${end}`);
  }
}

export function classifySpanRelationV1(input: {
  symbolStart: number;
  symbolEnd: number;
  chunkStart: number;
  chunkEnd: number;
}): StructuralSpanRelationV1 {
  assertSpan(input.symbolStart, input.symbolEnd);
  assertSpan(input.chunkStart, input.chunkEnd);

  if (input.symbolStart === input.chunkStart && input.symbolEnd === input.chunkEnd) return 'EXACT';
  if (input.chunkStart <= input.symbolStart && input.chunkEnd >= input.symbolEnd) return 'CHUNK_CONTAINS_SYMBOL';
  if (input.symbolStart <= input.chunkStart && input.symbolEnd >= input.chunkEnd) return 'SYMBOL_CONTAINS_CHUNK';
  if (Math.max(input.symbolStart, input.chunkStart) < Math.min(input.symbolEnd, input.chunkEnd)) return 'OVERLAPS';
  return 'DISJOINT';
}

export function makeStructuralEvidenceKeyV2(input: {
  provider: StructuralEvidenceProviderV2;
  observationUnit: StructuralObservationUnitV2;
  sourceRef: string;
  sourceRevision: string;
  providerRevision: string;
  byteStart: number;
  byteEnd: number;
  semanticKind?: string;
  symbolName?: string;
}): string {
  assertSpan(input.byteStart, input.byteEnd);
  const body = [
    input.provider,
    input.observationUnit,
    input.sourceRef,
    input.sourceRevision,
    input.providerRevision,
    String(input.byteStart),
    String(input.byteEnd),
    input.semanticKind ?? '',
    input.symbolName ?? '',
  ].join('\0');
  return `sev2:${createHash('sha256').update(body).digest('hex')}`;
}

export function assertStructuralObservationV2(row: StructuralObservationV2): void {
  assertSpan(row.byteStart, row.byteEnd);
  if (!row.evidenceKey || !row.sourceRef || !row.workspaceRevision || !row.sourceRevision) {
    throw new Error('STRUCTURAL_OBSERVATION_V2_LINEAGE_REQUIRED');
  }
  if (!row.providerRevision || !row.producerRevision) throw new Error('STRUCTURAL_OBSERVATION_V2_PRODUCER_REVISION_REQUIRED');
  if (!row.lineageQualified) throw new Error('STRUCTURAL_OBSERVATION_V2_LINEAGE_UNQUALIFIED');
}
