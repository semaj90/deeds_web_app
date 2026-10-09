/**
 * TokenRemappingStrategy
 *
 * Dynamically adapts and bounds prompt token allocations when user requests
 * or conversational histories exceed context boundaries.
 */
export type RemapStrategy = 'full' | 'truncate' | 'summarize';

export interface TokenRemapResult {
  remappedInputTokens: number;
  remappedCompletionTokens: number;
  compressionRatio: number;
  strategy: RemapStrategy;
}

export class TokenRemappingStrategy {
  /**
   * Adapts token budgets for model context capacity (e.g. 65,536).
   */
  adaptContextForGemma4(
    originalTokenCount: number,
    requestedCompletionTokens: number,
    contextWindowSize = 65536
  ): TokenRemapResult {
    const totalNeeded = originalTokenCount + requestedCompletionTokens;

    if (totalNeeded <= contextWindowSize) {
      return {
        remappedInputTokens: originalTokenCount,
        remappedCompletionTokens: requestedCompletionTokens,
        compressionRatio: 1.0,
        strategy: 'full',
      };
    }

    // 75% allocated for input context, 25% for completion output
    const maxInput = Math.floor(contextWindowSize * 0.75);
    const maxCompletion = Math.max(256, contextWindowSize - maxInput);

    const remappedInputTokens = Math.min(originalTokenCount, maxInput);
    const remappedCompletionTokens = Math.min(requestedCompletionTokens, maxCompletion);
    const compressionRatio = originalTokenCount > 0 ? remappedInputTokens / originalTokenCount : 1.0;

    return {
      remappedInputTokens,
      remappedCompletionTokens,
      compressionRatio: Number(compressionRatio.toFixed(4)),
      strategy: 'truncate',
    };
  }
}
