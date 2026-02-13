/**
 * LLM Logger - Tracks LLM interactions for instruction tuning export
 *
 * Stores prompt/response pairs with metadata for RLHF/DPO training data generation.
 * Used by /api/ace/export-training
 */

interface LogEntry {
  id: string;
  timestamp: string;
  prompt: string;
  response: string;
  model: string;
  provider: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  metadata?: Record<string, unknown>;
  rating?: number;
}

class LLMLogger {
  private logs: LogEntry[] = [];
  private maxEntries = 10000;

  log(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
    this.logs.push({
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    });

    // Ring buffer: drop oldest when full
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(-this.maxEntries);
    }
  }

  getAll(): LogEntry[] {
    return this.logs;
  }

  getRecent(count = 100): LogEntry[] {
    return this.logs.slice(-count);
  }

  exportTrainingData(format: 'jsonl' | 'alpaca' = 'jsonl'): string {
    if (format === 'alpaca') {
      return this.logs
        .filter(e => e.rating === undefined || e.rating >= 3)
        .map(e => JSON.stringify({
          instruction: e.prompt,
          input: '',
          output: e.response,
          metadata: { model: e.model, rating: e.rating }
        }))
        .join('\n');
    }

    // Default JSONL
    return this.logs
      .map(e => JSON.stringify({
        messages: [
          { role: 'user', content: e.prompt },
          { role: 'assistant', content: e.response }
        ],
        model: e.model,
        provider: e.provider,
        latency_ms: e.latencyMs,
        rating: e.rating
      }))
      .join('\n');
  }

  getStats(): { total: number; byModel: Record<string, number>; avgLatency: number } {
    const byModel: Record<string, number> = {};
    let totalLatency = 0;

    for (const entry of this.logs) {
      byModel[entry.model] = (byModel[entry.model] ?? 0) + 1;
      totalLatency += entry.latencyMs;
    }

    return {
      total: this.logs.length,
      byModel,
      avgLatency: this.logs.length > 0 ? Math.round(totalLatency / this.logs.length) : 0
    };
  }

  clear(): void {
    this.logs = [];
  }
}

export const llmLogger = new LLMLogger();