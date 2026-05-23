import { getLangfuse } from './langfuse.js';

export interface TraceKagRunParams {
  query: string;
  selectedCards: Array<any>;
  toonHash?: string;
  mcpCalls?: Array<{
    tool: string;
    input?: any;
    output?: any;
    metadata?: Record<string, unknown>;
  }>;
  cacheHits?: Record<string, unknown> | number;
  bifrostModel?: string;
  output?: string;
  error?: any;
}

/**
 * Sanitizes an object to remove forbidden properties per the Zero Hidden Thoughts Policy:
 * hiddenThoughts, chainOfThought, kv_cache, tensor, cudaPointer.
 */
export function sanitizeObject(val: any): any {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    return val.map(sanitizeObject);
  }
  if (val instanceof Error) {
    return {
      message: val.message,
      name: val.name,
      stack: val.stack,
    };
  }
  if (typeof val === 'object') {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      if (['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'cudaPointer'].includes(key)) {
        continue;
      }
      cleaned[key] = sanitizeObject(val[key]);
    }
    return cleaned;
  }
  return val;
}

/**
 * Trace a KAG run (observability logging to Langfuse).
 */
export async function traceKagRun(params: TraceKagRunParams): Promise<void> {
  const langfuse = await getLangfuse();
  if (!langfuse) {
    return; // No-op when Langfuse is disabled or not configured
  }

  const {
    query,
    selectedCards,
    toonHash,
    mcpCalls = [],
    cacheHits = 0,
    bifrostModel,
    output,
    error,
  } = params;

  try {
    const trace = langfuse.trace({
      name: 'kag-run',
      input: query,
      output: error ? undefined : output,
      tags: ['kag-run', ...(toonHash ? [toonHash] : [])],
      metadata: sanitizeObject({
        toonHash,
        cacheHits,
        hasError: !!error,
      }),
    });

    // Log the cards retrieval as a span
    const cardsSpan = trace.span({
      name: 'cards-retrieval',
      input: query,
      metadata: sanitizeObject({
        selectedCards,
      }),
    });
    cardsSpan.end({
      output: `Retrieved ${selectedCards.length} cards`,
    });

    // Log MCP tool calls as individual spans
    if (mcpCalls.length > 0) {
      for (const call of mcpCalls) {
        const mcpSpan = trace.span({
          name: `mcp:${call.tool}`,
          input: sanitizeObject(call.input),
          metadata: sanitizeObject(call.metadata),
        });
        mcpSpan.end({
          output: typeof call.output === 'string' ? call.output : JSON.stringify(sanitizeObject(call.output)),
        });
      }
    }

    // Log the synthesis generation using Langfuse generation trace if bifrostModel is specified
    if (bifrostModel) {
      const gen = trace.generation({
        name: 'synthesis-generation',
        model: bifrostModel,
        input: query,
        metadata: sanitizeObject({
          cacheHits,
        }),
      });
      if (error) {
        gen.end({
          statusMessage: error.message || String(error),
          level: 'ERROR',
        });
      } else {
        gen.end({
          output: output,
          level: 'DEFAULT',
        });
      }
    } else if (error) {
      // If error occurred but no generation trace was started, log it as an error span
      const errorSpan = trace.span({
        name: 'execution-error',
        input: error.message || String(error),
      });
      errorSpan.end({
        statusMessage: error.message || String(error),
        level: 'ERROR',
      });
    }
  } catch (err) {
    console.warn('[Langfuse] traceKagRun failed (non-fatal):', (err as Error).message);
  }
}
