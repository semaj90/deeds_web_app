import type { ProofState, StageScore } from './contracts.js';

export const WORKSTATION_STAGES: ReadonlyArray<Omit<StageScore, 'achieved' | 'state' | 'evidence' | 'blockers'>> = [
  { id: 'inventory', label: 'Repository inventory and revision tracking', weight: 8 },
  { id: 'structure', label: 'File/symbol/AST structural mapping', weight: 10 },
  { id: 'summaries', label: 'Hierarchical summaries and contextual trees', weight: 8 },
  { id: 'postgres', label: 'Postgres canonical identity and indexed tables', weight: 10 },
  { id: 'embedding', label: 'Production embedding and representation lineage', weight: 12 },
  { id: 'qdrant', label: 'Qdrant dense/sparse projection and readback', weight: 9 },
  { id: 'graph', label: 'Neo4j graph projection and PageRank lineage', weight: 8 },
  { id: 'cache', label: 'Valkey cache contracts and invalidation', weight: 6 },
  { id: 'retrieval', label: 'Hybrid retrieval and bounded graph expansion', weight: 8 },
  { id: 'reranker', label: 'Reranker evaluation and production adapter', weight: 7 },
  { id: 'recommendations', label: 'Evidence-backed file/symbol recommendations', weight: 7 },
  { id: 'agent-loop', label: 'Edit, validate, re-index, and supersede loop', weight: 7 },
];

export function stateFromPercent(percent: number): ProofState {
  if (percent >= 95) return 'PROVEN';
  if (percent > 0) return 'PARTIAL';
  return 'NOT_PROVEN';
}

export function calculateWorkstationScore(stages: readonly StageScore[]): {
  score: number;
  grade: 'FOUNDATION' | 'INTEGRATION' | 'OPERATIONAL_BETA' | 'PRODUCTION_READY';
  weightedPoints: number;
  totalWeight: number;
  blockers: string[];
} {
  const totalWeight = stages.reduce((sum, stage) => sum + stage.weight, 0);
  const weightedPoints = stages.reduce((sum, stage) => sum + stage.weight * clamp(stage.achieved) / 100, 0);
  const score = Math.round((weightedPoints / totalWeight) * 100);

  const grade = score >= 90
    ? 'PRODUCTION_READY'
    : score >= 70
      ? 'OPERATIONAL_BETA'
      : score >= 45
        ? 'INTEGRATION'
        : 'FOUNDATION';

  return {
    score,
    grade,
    weightedPoints,
    totalWeight,
    blockers: stages.flatMap((stage) => stage.blockers.map((blocker) => `${stage.label}: ${blocker}`)),
  };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
