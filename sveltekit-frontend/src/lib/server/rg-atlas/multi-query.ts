/**
 * Stage 4 — Multi-query rewriter (Gemma4)
 * Generates 3-5 query variants to improve retrieval recall.
 */

import { ollamaCachedChat } from '$lib/server/ollama-cached.js';

/**
 * Rewrites a single query into multiple variants using Gemma4.
 */
export async function rewriteQuery(
    query: string,
    variantCount: number = 3
): Promise<string[]> {
    const prompt = `
You are a retrieval expert. Rewrite the following search query into ${variantCount} distinct variations to improve vector search recall.
Include technical terms, synonymous concepts, and alternative phrasing.
Return ONLY a JSON array of strings.

Query: "${query}"
`.trim();

    try {
        const response = await ollamaCachedChat(
            [{ role: 'user', content: prompt }],
            'gemma4-rotorquant:latest-fast',
            { temperature: 0.1, maxTokens: 512 }
        );

        // Attempt to parse JSON from the response
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
            const variants = JSON.parse(jsonMatch[0]) as string[];
            return [query, ...variants.slice(0, variantCount)];
        }
    } catch (err) {
        console.error('[multi-query] Rewrite failed:', err);
    }

    return [query];
}
