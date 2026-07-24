export interface TokenRemapResult {
  remappedInputTokens: number;
  remappedCompletionTokens: number;
  compressionRatio: number;
  strategy: 'full' | 'truncate' | 'summarize';
  message?: string;
}

export class TokenRemappingStrategy {
  /**
   * Adapt context for Gemma4 when input exceeds available budget
   * Problem: user requests 10K tokens but context only has 8K available
   * Solution: dynamically remap input + output budgets
   */
  async adaptContextForGemma4(
    originalTokenCount: number,
    requestedCompletionTokens: number = 512,
    contextWindowSize: number = 65536
  ): Promise<TokenRemapResult> {
    const totalNeeded = originalTokenCount + requestedCompletionTokens;

    // Case 1: Fits comfortably
    if (totalNeeded <= contextWindowSize * 0.8) {
      return {
        remappedInputTokens: originalTokenCount,
        remappedCompletionTokens: requestedCompletionTokens,
        compressionRatio: 1.0,
        strategy: 'full',
        message: 'Budget within 80% utilization; using full context'
      };
    }

    // Case 2: Tight fit, but possible
    if (totalNeeded <= contextWindowSize) {
      return {
        remappedInputTokens: originalTokenCount,
        remappedCompletionTokens: requestedCompletionTokens,
        compressionRatio: 1.0,
        strategy: 'full',
        message: `Budget at ${((totalNeeded / contextWindowSize) * 100).toFixed(1)}% utilization`
      };
    }

    // Case 3: Need to truncate (most common for error-fixing workflows)
    const maxInput = Math.floor(contextWindowSize * 0.75); // 75% for input
    const maxCompletion = contextWindowSize - maxInput; // 25% for output

    const truncatedInput = Math.min(originalTokenCount, maxInput);
    const truncatedCompletion = Math.min(requestedCompletionTokens, maxCompletion);

    return {
      remappedInputTokens: truncatedInput,
      remappedCompletionTokens: truncatedCompletion,
      compressionRatio: truncatedInput / originalTokenCount,
      strategy: 'truncate',
      message: `Truncated input: ${originalTokenCount} → ${truncatedInput} tokens (${((truncatedInput / originalTokenCount) * 100).toFixed(1)}% retained)`
    };
  }

  /**
   * Aggressive truncation for multi-turn error fixing
   * Keep: error message (200 tokens) + most relevant context (1000 tokens)
   * Drop: less relevant historical context
   */
  prioritizeBudgetForErrorFixing(
    errorMessage: string,
    relatedCode: string,
    historicalContext: string,
    contextWindowSize: number = 65536
  ): {
    prioritized: string;
    dropped: string;
    tokenBudget: TokenRemapResult;
  } {
    // Estimate tokens
    const errorTokens = Math.ceil(errorMessage.length / 4);
    const codeTokens = Math.ceil(relatedCode.length / 4);
    const historyTokens = Math.ceil(historicalContext.length / 4);

    const totalTokens = errorTokens + codeTokens + historyTokens;

    // Budget: error (fixed) + code (high priority) + history (low priority)
    const maxTotal = Math.floor(contextWindowSize * 0.6); // 60% for input

    let prioritized = errorMessage;
    let dropped = '';

    // Always include error + code (high priority)
    const essentialTokens = errorTokens + codeTokens;

    if (essentialTokens > maxTotal) {
      // Even essentials don't fit; aggressively truncate code
      const codeAllocation = Math.floor((maxTotal - errorTokens) * 0.8);
      prioritized += `\n\n[CODE - TRUNCATED to ${codeAllocation} tokens]\n${relatedCode.substring(0, codeAllocation * 4)}`;
      dropped = relatedCode.substring(codeAllocation * 4);
    } else {
      // Include code, allocate remainder to history
      prioritized += `\n\n[RELATED CODE]\n${relatedCode}`;

      const historyAllocation = maxTotal - essentialTokens;
      if (historyTokens > historyAllocation) {
        prioritized += `\n\n[HISTORY - TRUNCATED to ${historyAllocation} tokens]\n${historicalContext.substring(
          0,
          historyAllocation * 4
        )}`;
        dropped = historicalContext.substring(historyAllocation * 4);
      } else {
        prioritized += `\n\n[HISTORY]\n${historicalContext}`;
      }
    }

    const tokenBudget = {
      remappedInputTokens: Math.ceil(prioritized.length / 4),
      remappedCompletionTokens: Math.floor(contextWindowSize * 0.3),
      compressionRatio: (totalTokens - Math.ceil(dropped.length / 4)) / totalTokens,
      strategy: 'truncate' as const,
      message: `Prioritized error-fix context: ${((Math.ceil(prioritized.length / 4) / contextWindowSize) * 100).toFixed(1)}% utilization`
    };

    return {
      prioritized,
      dropped,
      tokenBudget
    };
  }

  /**
   * Optimal split for retrieval-augmented generation (RAG)
   * Balance: query + system + retrieved chunks + generation
   */
  optimizeBudgetForRAG(
    queryTokens: number,
    systemPromptTokens: number = 200,
    numChunks: number = 10,
    chunkTokens: number = 200,
    contextWindowSize: number = 65536
  ): {
    queryAllocation: number;
    systemAllocation: number;
    contextAllocation: number;
    generationAllocation: number;
    actualChunks: number;
    efficiency: number;
  } {
    const fixed = queryTokens + systemPromptTokens + 1000; // 1K safety buffer
    const available = contextWindowSize - fixed;

    // How many chunks can we fit?
    const actualChunks = Math.min(numChunks, Math.floor(available / chunkTokens));
    const contextAllocation = actualChunks * chunkTokens;
    const generationAllocation = available - contextAllocation;

    return {
      queryAllocation: queryTokens,
      systemAllocation: systemPromptTokens,
      contextAllocation,
      generationAllocation: Math.max(128, generationAllocation),
      actualChunks,
      efficiency: (contextAllocation / (contextWindowSize * 0.6)) * 100
    };
  }
}
