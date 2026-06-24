/**
 * Tool Gateway Diagnostics
 *
 * Traces tool invocation through both the bounded tool-gateway AND the
 * in-process gemma4-agent dispatch layers. Captures routing decisions,
 * argument validation, execution flow, and error sources.
 */

export interface ToolDiagnosticEntry {
  timestamp: number;
  phase: 'request' | 'parse' | 'route' | 'validate' | 'dispatch' | 'execute' | 'result';
  toolName: string;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  durationMs?: number;
  error?: string;
}

const diagnosticLog: ToolDiagnosticEntry[] = [];
const maxLogSize = 1000;

function addEntry(entry: Omit<ToolDiagnosticEntry, 'timestamp'>): void {
  diagnosticLog.push({
    timestamp: Date.now(),
    ...entry,
  });

  // Keep log bounded
  if (diagnosticLog.length > maxLogSize) {
    diagnosticLog.splice(0, diagnosticLog.length - maxLogSize);
  }
}

export const ToolDiagnostics = {
  /**
   * Log the start of a tool request (RPC endpoint receives request)
   */
  logRequest(toolName: string, args: Record<string, unknown>): void {
    addEntry({
      phase: 'request',
      toolName,
      success: true,
      message: `RPC request received for tool: ${toolName}`,
      details: {
        argsKeys: Object.keys(args),
        argsCount: Object.keys(args).length,
      },
    });
  },

  /**
   * Log parsing of tool arguments
   */
  logParsing(
    toolName: string,
    rawInput: unknown,
    parsed: Record<string, unknown>,
    error?: string
  ): void {
    addEntry({
      phase: 'parse',
      toolName,
      success: !error,
      message: error ? `Argument parsing failed` : `Arguments parsed successfully`,
      details: { rawType: typeof rawInput, parsedKeys: Object.keys(parsed) },
      error,
    });
  },

  /**
   * Log routing decision: which dispatcher handles this tool?
   */
  logRouting(
    toolName: string,
    router: 'tool-registry' | 'gemma4-agent' | 'trace-mcp' | 'unknown',
    reason: string
  ): void {
    addEntry({
      phase: 'route',
      toolName,
      success: router !== 'unknown',
      message: `Routed to ${router}: ${reason}`,
      details: { router },
    });
  },

  /**
   * Log argument validation (e.g., required params, type checks)
   */
  logValidation(toolName: string, valid: boolean, issues?: string[]): void {
    addEntry({
      phase: 'validate',
      toolName,
      success: valid,
      message: valid ? 'Arguments valid' : 'Validation failed',
      details: { issues },
    });
  },

  /**
   * Log dispatch call (the actual function invocation)
   */
  logDispatch(
    toolName: string,
    dispatcher: string,
    args: Record<string, unknown>,
    error?: string
  ): void {
    addEntry({
      phase: 'dispatch',
      toolName,
      success: !error,
      message: error ? `Dispatch failed` : `Dispatched to ${dispatcher}`,
      details: { dispatcher, argsCount: Object.keys(args).length },
      error,
    });
  },

  /**
   * Log execution start/end
   */
  logExecution(toolName: string, durationMs: number, success: boolean, error?: string): void {
    addEntry({
      phase: 'execute',
      toolName,
      success,
      message: success
        ? `Execution completed in ${durationMs}ms`
        : `Execution failed after ${durationMs}ms`,
      durationMs,
      error,
    });
  },

  /**
   * Log result transformation (normalization to response format)
   */
  logResult(
    toolName: string,
    rawResult: unknown,
    normalized: unknown,
    error?: string
  ): void {
    addEntry({
      phase: 'result',
      toolName,
      success: !error,
      message: error ? 'Result normalization failed' : 'Result normalized',
      details: {
        rawType: typeof rawResult,
        normalizedType: typeof normalized,
      },
      error,
    });
  },

  /**
   * Get diagnostic log entries
   */
  getLog(
    toolName?: string,
    phase?: ToolDiagnosticEntry['phase'],
    maxEntries = 100
  ): ToolDiagnosticEntry[] {
    let filtered = [...diagnosticLog];

    if (toolName) {
      filtered = filtered.filter((e) => e.toolName === toolName);
    }
    if (phase) {
      filtered = filtered.filter((e) => e.phase === phase);
    }

    return filtered.slice(-maxEntries);
  },

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalRequests: number;
    successCount: number;
    failureCount: number;
    toolDistribution: Record<string, number>;
    errorDistribution: Record<string, number>;
    averageDurationMs: number;
  } {
    const summary = {
      totalRequests: diagnosticLog.filter((e) => e.phase === 'request').length,
      successCount: diagnosticLog.filter((e) => e.success).length,
      failureCount: diagnosticLog.filter((e) => !e.success).length,
      toolDistribution: {} as Record<string, number>,
      errorDistribution: {} as Record<string, number>,
      averageDurationMs: 0,
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const entry of diagnosticLog) {
      // Tool distribution
      summary.toolDistribution[entry.toolName] =
        (summary.toolDistribution[entry.toolName] ?? 0) + 1;

      // Error distribution
      if (entry.error) {
        const errorType = entry.error.split(':')[0].trim();
        summary.errorDistribution[errorType] = (summary.errorDistribution[errorType] ?? 0) + 1;
      }

      // Duration average
      if (entry.durationMs) {
        totalDuration += entry.durationMs;
        durationCount++;
      }
    }

    summary.averageDurationMs = durationCount > 0 ? totalDuration / durationCount : 0;

    return summary;
  },

  /**
   * Clear diagnostic log
   */
  clear(): void {
    diagnosticLog.length = 0;
  },

  /**
   * Export diagnostic report as JSON
   */
  exportReport(): {
    log: ToolDiagnosticEntry[];
    summary: ReturnType<typeof ToolDiagnostics.getSummary>;
    exportedAt: string;
  } {
    return {
      log: [...diagnosticLog],
      summary: this.getSummary(),
      exportedAt: new Date().toISOString(),
    };
  },
};

/**
 * Middleware helper: wraps tool execution with diagnostics
 */
export function createDiagnosedToolDispatcher<T extends Record<string, unknown>>(
  toolName: string,
  dispatcher: (args: T) => Promise<unknown>
): (args: T) => Promise<unknown> {
  return async (args: T) => {
    const startMs = performance.now();
    let error: Error | undefined;

    try {
      ToolDiagnostics.logValidation(toolName, true);
      const result = await dispatcher(args);
      const durationMs = Math.round(performance.now() - startMs);
      ToolDiagnostics.logExecution(toolName, durationMs, true);
      return result;
    } catch (err) {
      error = err as Error;
      const durationMs = Math.round(performance.now() - startMs);
      ToolDiagnostics.logExecution(toolName, durationMs, false, error.message);
      throw error;
    }
  };
}