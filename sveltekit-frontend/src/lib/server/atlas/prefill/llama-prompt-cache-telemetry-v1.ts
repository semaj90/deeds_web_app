import { z } from 'zod';

export const LlamaPromptCacheTelemetryV1Schema = z.object({
  schema: z.literal('parent-atlas.llama-prompt-cache-telemetry.v1'),
  promptTokens: z.number().int().nonnegative(),
  cachedPrefillTokens: z.number().int().nonnegative(),
  newPrefillTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  cacheTelemetryAvailable: z.boolean(),
  source: z.enum(['usage.prompt_tokens_details.cached_tokens', 'usage.prompt_tokens_cached', 'UNAVAILABLE']),
}).strict();

export type LlamaPromptCacheTelemetryV1 = z.infer<typeof LlamaPromptCacheTelemetryV1Schema>;

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Normalize llama-server/OpenAI-compatible usage fields without guessing
 * cache state from completion tokens or from an absent field.
 */
export function extractLlamaPromptCacheTelemetryV1(response: unknown): LlamaPromptCacheTelemetryV1 {
  const usage = response && typeof response === 'object' && 'usage' in response
    ? (response as { usage?: unknown }).usage
    : undefined;
  const usageRecord = usage && typeof usage === 'object' ? usage as Record<string, unknown> : {};
  const promptTokens = nonNegativeInteger(usageRecord.prompt_tokens) ?? 0;
  const completionTokens = nonNegativeInteger(usageRecord.completion_tokens) ?? 0;
  const details = usageRecord.prompt_tokens_details;
  const detailRecord = details && typeof details === 'object' ? details as Record<string, unknown> : {};
  const detailedCached = nonNegativeInteger(detailRecord.cached_tokens);
  const legacyCached = nonNegativeInteger(usageRecord.prompt_tokens_cached);
  const cachedPrefillTokens = detailedCached ?? legacyCached ?? 0;
  const source = detailedCached !== null
    ? 'usage.prompt_tokens_details.cached_tokens' as const
    : legacyCached !== null
      ? 'usage.prompt_tokens_cached' as const
      : 'UNAVAILABLE' as const;
  const newPrefillTokens = Math.max(0, promptTokens - cachedPrefillTokens);

  return LlamaPromptCacheTelemetryV1Schema.parse({
    schema: 'parent-atlas.llama-prompt-cache-telemetry.v1',
    promptTokens,
    cachedPrefillTokens,
    newPrefillTokens,
    completionTokens,
    cacheTelemetryAvailable: source !== 'UNAVAILABLE',
    source,
  });
}
