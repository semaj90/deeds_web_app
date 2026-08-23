import { assembleACEContext } from '@/lib/server/ace/context-assembler';
import { generateCacheKey } from './cache-utils'; // Assuming cache utils are centralized
import { llmClient } from './llm-client'; // Assuming LLM client handles the call

/**
 * Handles the main flow: context assembly, caching, and LLM invocation.
 * @param input Contains raw labels, search results, and cache context.
 * @param model The active model identifier.
 * @param dayBucket Current day for cache key generation.
 * @returns The LLM response or an error object.
 */
export async function processQueryForLLM(input: { rawLabels: any; searchResults: any; cacheData: any; userIntent: string; dayBucket: string; model: string }): Promise<any> {
  // 1. Assemble the core context using the structured label-aware assembler
  const cards = await assembleACEContext(input.rawLabels, input.searchResults, input.cacheData);

  // 2. Build the prompt body using the structured cards, which significantly reduces token count
  const promptBody = buildACEPrompt(cards);

  // 3. Cache the final request and pass to the LLM
  const cacheKey = generateCacheKey(input.model, cards[0]?.centroid_label, input.userIntent, input.dayBucket);
  await cache.set(cacheKey, promptBody, { ttl: 24 * 60 * 60 });

  return await llmClient.generateCompletion(promptBody);
}

/**
 * Placeholder for building the final prompt from structured cards.
 */
function buildACEPrompt(cards: { type: string; centroid_label: string | null; topology_label: string | null; hotness_bucket: string; feature_family: string; summary: any; top_files: any }[]): string {
  // Logic to serialize cards into the final, compressed prompt markdown structure
  return `[PROMPT_START]...${JSON.stringify(cards)}...[PROMPT_END]`;
}