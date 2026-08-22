import type { EvidenceItem } from '../trace-dynamic-context.types.js';

export interface TreeSitterEvidenceInput {
  filePath: string;
  sourceRevision?: string;
  parserName: string;
  parserVersion: string;
  grammarRevision: string;
  nodeKind: string;
  byteStart: number;
  byteEnd: number;
  parentNodeKind?: string;
  parseDiagnostics?: string[];
  symbolCandidate?: string;
}

export function makeTreeSitterEvidence(input: TreeSitterEvidenceInput): EvidenceItem {
  return {
    kind: 'parser_occurrence',
    lane: 'parser_ast',
    status: 'NOT_PROVEN',
    source: `${input.parserName}@${input.parserVersion}`,
    path: input.filePath,
    symbol: input.symbolCandidate,
    message: `${input.nodeKind} ${input.byteStart}-${input.byteEnd}`,
    revision: input.sourceRevision,
    score: 0.4,
  };
}

export const TREE_SITTER_PROOF_STATE = {
  STRUCTURAL_SYMBOL_CANDIDATE: 'STRUCTURAL_SYMBOL_CANDIDATE',
  PARSER_BACKED_SYMBOL_OCCURRENCE: 'PARSER_BACKED_SYMBOL_OCCURRENCE',
} as const;
