/**
 * ContextWindowCalculator
 *
 * Implements token budgeting and headroom allocation for model context windows.
 * Respects system prompt, query tokens, and buffer reservation before allocating
 * retrieved context chunks and summary budgets.
 */
export interface TokenBudgetResult {
  availableForContext: number;
  recommendedTopK: number;
  recommendedMaxSummary: number;
  totalReserved: number;
  contextWindowSize: number;
}

export class ContextWindowCalculator {
  /**
   * Calculates safe context token budget given query, system prompt, and context window size.
   *
   * @param queryTokens Number of tokens in the user query.
   * @param systemPromptTokens Number of tokens in system instructions.
   * @param contextWindowSize Total context window capacity (defaults to 65,536 for Gemma 4 legal).
   * @param safetyBuffer Buffer tokens reserved for completion headroom (defaults to 2,000).
   */
  calculateTokenBudget(
    queryTokens: number,
    systemPromptTokens: number,
    contextWindowSize = 65536,
    safetyBuffer = 2000
  ): TokenBudgetResult {
    const totalReserved = Math.max(0, queryTokens) + Math.max(0, systemPromptTokens) + safetyBuffer;
    const availableForContext = Math.max(0, contextWindowSize - totalReserved);

    // Standard RAG assumption: ~200 tokens per chunk
    const recommendedTopK = Math.max(1, Math.floor(availableForContext / 200));
    const recommendedMaxSummary = Math.min(512, Math.floor(availableForContext / 2));

    return {
      availableForContext,
      recommendedTopK,
      recommendedMaxSummary,
      totalReserved,
      contextWindowSize,
    };
  }
}
