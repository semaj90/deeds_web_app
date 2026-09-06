import { z } from 'zod';
import { contextualTextAnchorV1Schema, relocateContextualTextAnchorV1, type ContextualTextAnchorV1 } from './evidence-relocation-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

export const EVIDENCE_RELOCATION_STAGE_VALUES = [
  'EXACT_SOURCE_REVISION',
  'SYMBOL_VERSION',
  'TREE_SITTER_OCCURRENCE',
  'LSP_COMPILER_LOCATION',
  'EXACT_TEXT',
  'CONTEXT_ANCHOR',
] as const;
export const evidenceRelocationStageV1Schema = z.enum(EVIDENCE_RELOCATION_STAGE_VALUES);
export type EvidenceRelocationStageV1 = z.infer<typeof evidenceRelocationStageV1Schema>;

export interface EvidenceRelocationCandidateV1 {
  sourceRef: string;
  sourceRevision: string;
  contentChecksum: string;
  byteRange: { startByte: number; endByte: number } | null;
  lineRange: { startLine: number; endLine: number } | null;
  stableSymbolId: string | null;
  symbolVersionId: string | null;
  evidenceRefs: string[];
}

export type EvidenceRelocationAttemptV1 =
  | { status: 'MISS' }
  | { status: 'AMBIGUOUS'; candidateCount: number; evidenceRefs?: string[] }
  | { status: 'UNRESOLVED'; evidenceRefs?: string[] }
  | { status: 'RESOLVED'; candidate: EvidenceRelocationCandidateV1 };

export interface EvidenceRelocationReadersV1 {
  exactSourceRevision(): Promise<EvidenceRelocationAttemptV1>;
  symbolVersion(): Promise<EvidenceRelocationAttemptV1>;
  treeSitterOccurrence(): Promise<EvidenceRelocationAttemptV1>;
  lspCompilerLocation(): Promise<EvidenceRelocationAttemptV1>;
}

export interface EvidenceRelocationHierarchyInputV1 {
  relocationRevision: string;
  currentSourceRef: string;
  currentSourceRevision: string;
  currentSourceText: string;
  contextAnchor: ContextualTextAnchorV1;
}

export type EvidenceRelocationHierarchyResultV1 =
  | {
      status: 'RESOLVED';
      stage: EvidenceRelocationStageV1;
      candidate: EvidenceRelocationCandidateV1;
      attemptStages: EvidenceRelocationStageV1[];
      relocationChecksum: string;
    }
  | {
      status: 'AMBIGUOUS' | 'UNRESOLVED';
      stage: EvidenceRelocationStageV1;
      attemptStages: EvidenceRelocationStageV1[];
      candidateCount: number;
      evidenceRefs: string[];
      relocationChecksum: string;
    };

function sealed<T extends Omit<EvidenceRelocationHierarchyResultV1, 'relocationChecksum'>>(value: T): T & { relocationChecksum: string } {
  return { ...value, relocationChecksum: sha256HexV1(value) };
}

function validateCandidate(candidate: EvidenceRelocationCandidateV1): void {
  if (!candidate.sourceRef.trim() || !candidate.sourceRevision.trim()) throw new Error('RELOCATION_SOURCE_IDENTITY_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(candidate.contentChecksum)) throw new Error('RELOCATION_CONTENT_CHECKSUM_REQUIRED');
  if (candidate.symbolVersionId !== null && candidate.stableSymbolId === null) throw new Error('RELOCATION_SYMBOL_VERSION_REQUIRES_STABLE_SYMBOL');
  if (candidate.byteRange && candidate.byteRange.endByte <= candidate.byteRange.startByte) throw new Error('RELOCATION_BYTE_RANGE_INVALID');
  if (candidate.lineRange && candidate.lineRange.endLine < candidate.lineRange.startLine) throw new Error('RELOCATION_LINE_RANGE_INVALID');
}

export async function relocateEvidenceHierarchyV1(
  input: EvidenceRelocationHierarchyInputV1,
  readers: EvidenceRelocationReadersV1,
): Promise<EvidenceRelocationHierarchyResultV1> {
  if (!input.relocationRevision.trim()) throw new Error('RELOCATION_REVISION_REQUIRED');
  contextualTextAnchorV1Schema.parse(input.contextAnchor);
  const attempts: EvidenceRelocationStageV1[] = [];
  const structural: Array<[EvidenceRelocationStageV1, () => Promise<EvidenceRelocationAttemptV1>]> = [
    ['EXACT_SOURCE_REVISION', readers.exactSourceRevision],
    ['SYMBOL_VERSION', readers.symbolVersion],
    ['TREE_SITTER_OCCURRENCE', readers.treeSitterOccurrence],
    ['LSP_COMPILER_LOCATION', readers.lspCompilerLocation],
  ];

  for (const [stage, reader] of structural) {
    attempts.push(stage);
    const result = await reader();
    if (result.status === 'MISS') continue;
    if (result.status === 'RESOLVED') {
      validateCandidate(result.candidate);
      return sealed({ status: 'RESOLVED' as const, stage, candidate: result.candidate, attemptStages: attempts });
    }
    return sealed({
      status: result.status,
      stage,
      attemptStages: attempts,
      candidateCount: result.status === 'AMBIGUOUS' ? result.candidateCount : 0,
      evidenceRefs: [...(result.evidenceRefs ?? [])].sort(),
    });
  }

  const context = relocateContextualTextAnchorV1(input.currentSourceText, input.contextAnchor);
  attempts.push(context.method === 'EXACT_TEXT' ? 'EXACT_TEXT' : 'CONTEXT_ANCHOR');
  const stage: EvidenceRelocationStageV1 = context.method === 'EXACT_TEXT' ? 'EXACT_TEXT' : 'CONTEXT_ANCHOR';
  if (context.status === 'AMBIGUOUS') {
    return sealed({ status: 'AMBIGUOUS' as const, stage, attemptStages: attempts, candidateCount: context.candidateCount, evidenceRefs: [] });
  }
  if (context.status === 'UNRESOLVED') {
    return sealed({ status: 'UNRESOLVED' as const, stage, attemptStages: attempts, candidateCount: 0, evidenceRefs: [] });
  }
  const candidate: EvidenceRelocationCandidateV1 = {
    sourceRef: input.currentSourceRef,
    sourceRevision: input.currentSourceRevision,
    contentChecksum: context.contentChecksum,
    byteRange: null,
    lineRange: { startLine: context.startLine, endLine: context.endLine },
    stableSymbolId: null,
    symbolVersionId: null,
    evidenceRefs: [],
  };
  validateCandidate(candidate);
  return sealed({ status: 'RESOLVED' as const, stage, candidate, attemptStages: attempts });
}
