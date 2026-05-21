/**
 * Holistic Document Synthesizer — Gemma-4 TurboQuant GraphRAG Pipeline.
 *
 * Uses Gemma-4's large context window to analyze entire documents
 * and extract structural relationships (triples) for the knowledge graph.
 */

import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { z } from 'zod';

const RUNTIME_CONTEXT_SIZE = Number(
  process.env.LLM_CONTEXT_SIZE ??
    process.env.TURBO_CTX_SIZE ??
    process.env.LLAMA_CTX_SIZE ??
    process.env.LLAMA_SERVER_CTX ??
    process.env.OLLAMA_CONTEXT_LENGTH ??
    '65536'
);


const MODEL = ENV.OLLAMA_CHAT_MODEL ?? 'gemma4:e4b-it-q4_K_M';
const TURBOQUANT_BASE_URL = ENV.TURBOQUANT_BASE_URL;

const synthesisSchema = z.object({
  globalSummary: z.string(),
  keyTakeaways: z.array(z.string()),
  entities: z.array(z.object({
    name: z.string(),
    type: z.string(),
    importance: z.number().min(0).max(1)
  })),
  triples: z.array(z.object({
    subject: z.string(),
    predicate: z.string(),
    object: z.string(),
    context: z.string().optional()
  }))
});

const synthesisJsonSchema = z.toJSONSchema(synthesisSchema);

export interface HolisticSynthesisResult {
  globalSummary: string;
  keyTakeaways: string[];
  entities: Array<{ name: string; type: string; importance: number }>;
  triples: Array<{ subject: string; predicate: string; object: string; context?: string }>;
}

/**
 * Synthesize a holistic view of a document using Gemma-4's large context window.
 *
 * @param text - Full extracted text of the document (up to 128K characters)
 */
export async function synthesizeHolisticDocument(text: string): Promise<HolisticSynthesisResult | null> {
  if (!text || text.length < 500) return null;

  // Use a large slice for holistic understanding (up to 100K chars ~ 25K-30K tokens)
  const input = text.length > 100_000 ? text.slice(0, 100_000) : text;

  const prompt = `Perform a holistic analysis of this legal document.
1. Provide a comprehensive global summary.
2. Identify the most critical entities (People, Organizations, Locations, Legal Concepts).
3. Extract key relationships (Subject-Predicate-Object triples) that define the "who, what, where, and why" of this document.

Respond in structured JSON format according to this schema:
${JSON.stringify(synthesisJsonSchema, null, 2)}

Text:
${input}`;

  try {
    return await traceLLM('holistic-synthesis', { model: MODEL, prompt: input.slice(0, 500) }, async (gen) => {
      // Prefer TurboQuant if available for faster long-context inference
      const baseUrl = TURBOQUANT_BASE_URL;
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-legal',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 4096,
          // TurboQuant specific options for KV compression
          options: {
            num_ctx: RUNTIME_CONTEXT_SIZE,
            kv_cache_type: 'turbo3'
          }
        }),
        signal: AbortSignal.timeout(180_000), // 3 min timeout for long-context synthesis
      });

      if (!res.ok) {
        console.warn('[HolisticSynthesizer] TurboQuant failed, falling back to Ollama');
        const ollamaRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            prompt,
            stream: false,
            format: synthesisJsonSchema,
            options: { num_ctx: RUNTIME_CONTEXT_SIZE, temperature: 0.1 }
          }),
          signal: AbortSignal.timeout(180_000),
        });

        if (!ollamaRes.ok) throw new Error('Both synthesis backends failed');
        const data = await ollamaRes.json();
        const result = typeof data.response === 'string' ? JSON.parse(data.response) : data.response;
        gen.end({ output: 'Ollama fallback success' });
        return result as HolisticSynthesisResult;
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content ?? '';
      const result = JSON.parse(rawContent.replace(/^```json?\n?|\n?```$/g, '').trim());
      gen.end({ output: `Extracted ${result.triples?.length ?? 0} triples` });
      return result as HolisticSynthesisResult;
    });
  } catch (err) {
    console.error('[HolisticSynthesizer] Synthesis failed:', err);
    return null;
  }
}
