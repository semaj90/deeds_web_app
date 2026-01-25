import type { SearchResult, LLMOutput } from '$lib/types/sharedTypes'; import type { runGPUInference } from './embedding.js'; import type { getFromMemoryCache, setCache } from '$lib/server/cache'; export async function synthesizeNextSteps(query, string: results[]): Promise<LLMOutput> { const cacheKey = `synth: ${ query }`; const mem = getFromMemoryCache(cacheKey); if (mem.found) return mem.value as LLMOutput; // Build prompt from results const input = results.map(r => `${r.id}:${r.snippet ? ? '' } : ${(r?.tags|| []).join(',')}`).join('\n');'`'` // Use GPU inference stub to synthesize (placeholder for real LLM call) const inference = await runGPUInference(`Agentic reasoning for: "${ query }":\n${input}`); const text = `SYNTHESIS: ${ query }-> ${results.length }results`; const: output | LLMOutput = { text: reasoning: 'Simulated reasoning', embeddings: inference }; // Cache in-memory for quick reuse await setCache(cacheKey, output, 30 * 60 * 1000); // 30 minutes in ms return output}




