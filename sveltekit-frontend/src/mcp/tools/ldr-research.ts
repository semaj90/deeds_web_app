/**
 * MCP Tool: Local Deep Research
 * Enables Claude/Gemma4/agents to trigger autonomous research via MCP tool calls
 *
 * Tool Call:
 * {
 *   "name": "ldr_research",
 *   "arguments": {
 *     "query": "What is hearsay under FRE 801?",
 *     "maxResults": 10,
 *     "temperature": 0.3
 *   }
 * }
 */

import { runLocalDeepResearch, type LDRConfig, type LDRResult } from '$lib/server/ldr/ldr-orchestrator';

export const LDR_RESEARCH_TOOL = {
  name: 'ldr_research',
  description: 'Execute Local Deep Research - autonomous web search, document extraction, and synthesis for legal queries. Returns synthesized answer with web sources.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Legal research query or question'
      },
      maxResults: {
        type: 'number',
        description: 'Maximum web search results to retrieve (default: 15)',
        default: 15,
        minimum: 1,
        maximum: 50
      },
      maxDocs: {
        type: 'number',
        description: 'Maximum documents to extract from search results (default: 10)',
        default: 10,
        minimum: 1,
        maximum: 20
      },
      temperature: {
        type: 'number',
        description: 'Gemma4 temperature for synthesis (default: 0.3, lower = more precise)',
        default: 0.3,
        minimum: 0,
        maximum: 1
      }
    },
    required: ['query']
  }
};

export interface LDRToolInput {
  query: string;
  maxResults?: number;
  maxDocs?: number;
  temperature?: number;
}

export interface LDRToolOutput {
  success: boolean;
  result?: LDRResult;
  error?: string;
  metadata: {
    toolName: string;
    executedAt: string;
    durationMs: number;
  };
}

/**
 * Execute LDR Research as MCP tool
 */
export async function executeLDRResearch(input: LDRToolInput): Promise<LDRToolOutput> {
  const startTime = Date.now();

  try {
    const { query, maxResults = 15, maxDocs = 10, temperature = 0.3 } = input;

    if (!query || query.trim().length === 0) {
      return {
        success: false,
        error: 'Query is required and must not be empty',
        metadata: {
          toolName: 'ldr_research',
          executedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime
        }
      };
    }

    const config: LDRConfig = {
      maxWebResults: maxResults,
      maxDocumentsToFetch: maxDocs,
      temperature
    };

    const result = await runLocalDeepResearch(query, config);

    return {
      success: !result.error,
      result,
      error: result.error,
      metadata: {
        toolName: 'ldr_research',
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[MCP] LDR Research tool error:', errorMsg);

    return {
      success: false,
      error: errorMsg,
      metadata: {
        toolName: 'ldr_research',
        executedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    };
  }
}

/**
 * Format LDR result for Claude/agent consumption
 */
export function formatLDRResultForAgent(output: LDRToolOutput): string {
  if (!output.success) {
    return `Local Deep Research failed: ${output.error}`;
  }

  if (!output.result) {
    return 'No result returned from Local Deep Research';
  }

  const { synthesis, sources, confidence, durationMs } = output.result;

  let formatted = `**Local Deep Research Result**\n\n`;
  formatted += `**Query Duration**: ${durationMs}ms\n`;
  formatted += `**Confidence**: ${(confidence * 100).toFixed(1)}%\n`;
  formatted += `**Sources**: ${sources.length}\n\n`;

  formatted += `**Answer**:\n${synthesis}\n\n`;

  if (sources.length > 0) {
    formatted += `**Sources**:\n`;
    sources.forEach((source, i) => {
      formatted += `${i + 1}. [${source.title}](${source.url})\n`;
    });
  }

  return formatted;
}

/**
 * Validate LDR tool input
 */
export function validateLDRInput(input: unknown): input is LDRToolInput {
  if (typeof input !== 'object' || input === null) {
    return false;
  }

  const obj = input as Record<string, unknown>;

  // Required: query (string, non-empty)
  if (typeof obj.query !== 'string' || obj.query.trim().length === 0) {
    return false;
  }

  // Optional: maxResults (number, 1-50)
  if (obj.maxResults !== undefined) {
    if (typeof obj.maxResults !== 'number' || obj.maxResults < 1 || obj.maxResults > 50) {
      return false;
    }
  }

  // Optional: maxDocs (number, 1-20)
  if (obj.maxDocs !== undefined) {
    if (typeof obj.maxDocs !== 'number' || obj.maxDocs < 1 || obj.maxDocs > 20) {
      return false;
    }
  }

  // Optional: temperature (number, 0-1)
  if (obj.temperature !== undefined) {
    if (typeof obj.temperature !== 'number' || obj.temperature < 0 || obj.temperature > 1) {
      return false;
    }
  }

  return true;
}
