/**
 * src/lib/server/ace/context-packet-budgeter.ts
 * 
 * Enforces token and entity budgets for context synthesis to prevent LLM bloat.
 */

export interface ContextBudget {
  maxTokens: number;
  maxTaskDistillates: number;
  maxClusterCards: number;
  maxGraphPaths: number;
  maxRawChunks: number;
  maxCitations: number;
}

export const DEFAULT_BUDGET: ContextBudget = {
  maxTokens: 12000,
  maxTaskDistillates: 2,
  maxClusterCards: 3,
  maxGraphPaths: 8,
  maxRawChunks: 12,
  maxCitations: 20
};

export class ContextPacketBudgeter {
  /**
   * Trims a context packet to stay within budget, prioritizing high-signal items.
   */
  public static budget(packet: any, budget: ContextBudget = DEFAULT_BUDGET): any {
    const trimmed = { ...packet };

    // 1. Task Distillates (Highest priority)
    if (trimmed.taskDistillates) {
      trimmed.taskDistillates = trimmed.taskDistillates.slice(0, budget.maxTaskDistillates);
    }

    // 2. Cluster Cards
    if (trimmed.clusterCards) {
      trimmed.clusterCards = trimmed.clusterCards.slice(0, budget.maxClusterCards);
    }

    // 3. Graph Paths
    if (trimmed.graphPaths) {
      trimmed.graphPaths = trimmed.graphPaths.slice(0, budget.maxGraphPaths);
    }

    // 4. Raw Chunks
    if (trimmed.hits) {
      trimmed.hits = trimmed.hits.slice(0, budget.maxRawChunks);
    }

    // 5. Citations
    if (trimmed.citations) {
      trimmed.citations = trimmed.citations.slice(0, budget.maxCitations);
    }

    return trimmed;
  }
}
