export type KanbanCategory =
  | 'BUG' | 'PERFORMANCE' | 'RETRIEVAL' | 'GPU'
  | 'CACHE' | 'GRAPH' | 'MODEL' | 'TEST' | 'TECH_DEBT';

export interface KanbanCandidateV1 {
  schemaVersion: 'atlas.kanban-candidate.v1';
  candidateId: string;
  title: string;
  category: KanbanCategory;
  utility: number;
  confidence: number;
  impact: number;
  effort: number;
  risk: number;
  sourceEvidenceRefs: string[];
  analyticsMerkleRoot: string;
  sourceRevisionSetHash?: string;
  graphRevision?: string;
  featureRevision: string;
  recommendationModelRevision: string;
  proposedGate: string;
}

export function computeKanbanPriority(candidate: KanbanCandidateV1): number {
  const denominator = Math.max(0.001, candidate.effort + candidate.risk);
  return candidate.confidence * candidate.impact * candidate.utility / denominator;
}
