export interface TangKanbanCandidate {
  taskId: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  blockedBy: string[];
  confidence?: number | null;
  evidenceCount: number;
  priorExecutionSuccess?: number | null;
  estimatedCost?: number | null;
}

const priorityValue: Record<TangKanbanCandidate['priority'], number> = { P0: 1, P1: 0.75, P2: 0.5, P3: 0.25 };
const clamp01 = (value: number | null | undefined, fallback = 0) => Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : fallback));

/**
 * Request-scoped board prioritization only. Existing Kanban task identity,
 * dependency, promotion and approval gates remain authoritative.
 */
export function prioritizeKanbanCandidates(candidates: TangKanbanCandidate[]): TangKanbanCandidate[] {
  return [...candidates].sort((a, b) => {
    const score = (x: TangKanbanCandidate) => {
      if (x.blockedBy.length > 0) return -1;
      return 0.35 * priorityValue[x.priority]
        + 0.20 * clamp01(x.confidence, 0.5)
        + 0.20 * clamp01(x.priorExecutionSuccess, 0.5)
        + 0.15 * Math.min(1, x.evidenceCount / 8)
        - 0.10 * clamp01(x.estimatedCost, 0);
    };
    return score(b) - score(a) || a.taskId.localeCompare(b.taskId);
  });
}
