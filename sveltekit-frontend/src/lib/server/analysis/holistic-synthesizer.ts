/**
 * Holistic Document Synthesizer — Gemma-4 TurboQuant GraphRAG Pipeline.
 *
 * Uses Gemma-4's large context window to analyze entire documents
 * and extract structural relationships (triples) for the knowledge graph.
 */

import { traceLLM } from '$lib/server/observability/langfuse.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { getLlamaSessionDescriptor } from '$lib/server/ai/local-llama-provider.js';
import { z } from 'zod';

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
    const llamaSession = await getLlamaSessionDescriptor();
    return await traceLLM('holistic-synthesis', { model: llamaSession.modelId, prompt: input.slice(0, 500) }, async (gen) => {
      // bifrostChat() already implements the TurboQuant-first / llama-server-fallback
      // cascade this function used to hand-roll here; json_schema response_format
      // enforces the shape instead of relying on prompt instructions alone.
      const rawContent = await bifrostChat(
        [{ role: 'user', content: prompt }],
        llamaSession.modelId,
        {
          temperature: 0.1,
          maxTokens: 4096,
          timeoutMs: 180_000, // long-context synthesis
          responseFormat: { type: 'json_schema', json_schema: synthesisJsonSchema as Record<string, unknown> },
        }
      );
      const result = JSON.parse(rawContent.replace(/^```json?\n?|\n?```$/g, '').trim());
      gen.end({ output: `Extracted ${result.triples?.length ?? 0} triples` });
      return result as HolisticSynthesisResult;
    });
  } catch (err) {
    console.error('[HolisticSynthesizer] Synthesis failed:', err);
    return null;
  }
}
