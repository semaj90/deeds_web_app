declare module 'parent-atlas-core' {
  export interface DecomposedQuery {
    query: string;
    intent?: string;
    evidence?: unknown[];
    subgoals?: Array<{
      type: string;
      query: string;
      priority: number;
    }>;
  }

  export interface ScoredCandidate {
    id: string;
    score: number;
    rawScore?: number;
    summary?: string;
    embedding?: number[];
    signals?: Record<string, unknown>;
  }

  export interface PolicyScore {
    score: number;
    rationale?: string;
  }

  export interface ACEContext {
    query: string;
    evidence: unknown[];
    scores?: Record<string, number>;
  }
}
