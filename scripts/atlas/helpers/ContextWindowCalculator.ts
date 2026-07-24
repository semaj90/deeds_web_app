export interface TokenBudget {
  availableForContext: number;
  recommendedTopK: number;
  recommendedMaxSummary: number;
  totalContextWindow: number;
  reserved: number;
  utilizationPercent: number;
}

export class ContextWindowCalculator {
  /**
   * Calculate token budget for multi-turn LLM workflows
   * Accounts for: query + system prompt + retrieved context + response
   */
  calculateTokenBudget(
    queryTokens: number,
    systemPromptTokens: number = 200,
    contextWindowSize: number = 65536
  ): TokenBudget {
    // Reserve tokens for response + safety buffer
    const responseReserve = 2000;
    const safetyBuffer = 500;
    const reserved = queryTokens + systemPromptTokens + responseReserve + safetyBuffer;

    const availableForContext = Math.max(0, contextWindowSize - reserved);

    // Typical chunk size: 200 tokens per retrieved chunk
    const bytesPerChunk = 200;
    const recommendedTopK = Math.floor(availableForContext / bytesPerChunk);

    // Use half of remaining context for summary (leave buffer)
    const recommendedMaxSummary = Math.min(512, Math.floor(availableForContext / 2));

    return {
      availableForContext,
      recommendedTopK: Math.max(1, recommendedTopK),
      recommendedMaxSummary,
      totalContextWindow: contextWindowSize,
      reserved,
      utilizationPercent: (reserved / contextWindowSize) * 100
    };
  }

  /**
   * Estimate token count for a string (rough approximation)
   * Actual: use tiktoken or similar; this is heuristic
   */
  estimateTokens(text: string): number {
    // Average: 1 token per 4 characters (English)
    return Math.ceil(text.length / 4);
  }

  /**
   * Adaptive budget recalculation if input grows
   */
  recalculateIfInputGrows(
    originalBudget: TokenBudget,
    additionalTokens: number
  ): TokenBudget {
    const newReserved = originalBudget.reserved + additionalTokens;
    const newAvailable = originalBudget.totalContextWindow - newReserved;

    return {
      ...originalBudget,
      reserved: newReserved,
      availableForContext: Math.max(0, newAvailable),
      recommendedTopK: Math.floor(newAvailable / 200),
      utilizationPercent: (newReserved / originalBudget.totalContextWindow) * 100
    };
  }
}
