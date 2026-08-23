/**
 * Gemma4 Synthesis Generator
 * Stage 5 of Policy Orchestrator: Generate answer from ACE context
 *
 * Input: ACEContext with selected packets + evidence
 * Output: Synthesized answer with citations
 * Pattern: Gemma4 receives evidence bundle from ACE assembler, generates answer
 */

import type { DecomposedQuery } from './gemma4-policy-orchestrator';
import type { ACEContext } from '../server/ace/types';
import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';
import {
  resolveLoadedLlamaModel,
  LlamaServerUnreachableError,
  LlamaServerNoModelError,
  LlamaServerModelResponseInvalidError,
} from '$lib/server/ai/llama-server-model-resolver.js';

/**
 * ACEContext has no `selectedPackets`/`evidence`/`contextWindow` fields —
 * this file was written against a shape that never matched the real
 * ACEContext (src/lib/server/ace/types.ts). The real evidence surface is
 * the four chunk arrays below; merge them into one packet list.
 */
function collectEvidencePackets(aceContext: ACEContext): UnifiedRetrievalResult[] {
  return [
    ...aceContext.ragChunks,
    ...aceContext.kbChunks,
    ...aceContext.caseChunks,
    ...aceContext.docChunks,
  ];
}

/** Rough token estimate (chars/4) — ACEContext carries no token-budget field to read instead. */
function estimateTokens(packets: UnifiedRetrievalResult[]): number {
  const chars = packets.reduce((sum, p) => sum + (p.content?.length ?? 0), 0);
  return Math.ceil(chars / 4);
}

interface SynthesisRequest {
  query: string;
  decomposition: DecomposedQuery;
  aceContext: ACEContext;
  maxTokens?: number;
  temperature?: number;
}

interface SynthesisResponse {
  answer: string;
  citations: Array<{
    packetId: string;
    sourceRef: string;
    relevance: number;
  }>;
  confidence: number;
  reasoning: string;
}

const SYNTHESIS_PROMPT_TEMPLATE = `You are a legal research assistant synthesizing answers from evidence packets.

Your task:
1. Read the original user question
2. Review the evidence packets with their citations
3. Generate a clear, well-cited answer
4. Mark citations inline with [source_ref] format
5. Explain your reasoning for the synthesis approach

IMPORTANT CONSTRAINTS:
- Only cite evidence that directly supports your answer
- If evidence is contradictory, acknowledge both positions
- Be explicit about uncertainty ("The evidence suggests...", "Based on available information...")
- Keep the answer concise but complete
- Do NOT hallucinate facts not in the evidence
- Do NOT claim to know things outside the evidence bundle

User Question: {QUERY}

Decomposition Intent: {INTENT}
Subgoals: {SUBGOALS}

Evidence Bundle ({PACKET_COUNT} packets, {TOKEN_COUNT} tokens available):
{EVIDENCE}

Synthesize a comprehensive answer citing the evidence above.`;

/**
 * Build evidence context string from ACE packets
 */
function buildEvidenceContext(packets: UnifiedRetrievalResult[]): string {
  const entries = packets.map((packet, idx) => {
    const citation = packet.sourceRef || packet.packetKey || packet.id || 'unknown';
    return `
[${idx + 1}] ${citation}
Summary: ${packet.summary || 'No summary'}
Kind: ${packet.kind}
Content: ${packet.summary || packet.content || '(no details)'}
`;
  });

  return entries.join('\n---\n');
}

/**
 * Call Gemma4 (TurboQuant at :8090) to synthesize answer from ACE context
 * Fallback to Ollama if TurboQuant unavailable
 */
export async function synthesizeWithGemma4(
  request: SynthesisRequest
): Promise<SynthesisResponse> {
  const {
    query,
    decomposition,
    aceContext,
    maxTokens = 1024,
    temperature = 0.3
  } = request;

  const packets = collectEvidencePackets(aceContext);
  const evidenceContext = buildEvidenceContext(packets);
  const subgoalsText = decomposition.subgoals
    .map((sg) => `- ${sg.query} (priority: ${sg.priority})`)
    .join('\n');

  const systemPrompt = SYNTHESIS_PROMPT_TEMPLATE
    .replace('{QUERY}', query)
    .replace('{INTENT}', decomposition.intent)
    .replace('{SUBGOALS}', subgoalsText)
    .replace('{PACKET_COUNT}', packets.length.toString())
    .replace('{TOKEN_COUNT}', estimateTokens(packets).toString())
    .replace('{EVIDENCE}', evidenceContext);

  try {
    // Try TurboQuant first (faster, cached)
    const turboQuantAnswer = await callTurboQuantSynthesis(
      systemPrompt,
      maxTokens,
      temperature
    );

    if (turboQuantAnswer) {
      return turboQuantAnswer;
    }
  } catch (err) {
    console.warn('[Synthesis] TurboQuant failed, falling back to Ollama:', err);
  }

  try {
    // Fallback to Ollama
    const ollamaAnswer = await callOllamaSynthesis(
      systemPrompt,
      maxTokens,
      temperature
    );

    if (ollamaAnswer) {
      return ollamaAnswer;
    }
  } catch (err) {
    console.warn('[Synthesis] Ollama also failed, using fallback:', err);
  }

  // Fallback: return structured response based on ACE context alone
  return getFallbackSynthesis(query, aceContext);
}

/**
 * Call llama-server at :8090 (TurboQuant), streaming. Resolves the actually
 * loaded model via GET /v1/models first — never assumes the configured
 * model name is what's loaded, never sends a filesystem path hoping the
 * server will load it.
 */
async function callTurboQuantSynthesis(
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<SynthesisResponse | null> {
  const TURBO_QUANT_URL = process.env.TURBO_QUANT_URL || 'http://127.0.0.1:8090';
  const configuredModel = process.env.GEMMA4_MODEL || 'gemma4-legal-iq4xs-direct.gguf';
  const timeout = 90_000; // 90s for thinking models

  try {
    const { resolvedModel } = await resolveLoadedLlamaModel(TURBO_QUANT_URL, configuredModel);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${TURBO_QUANT_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: resolvedModel,
        messages: [
          { role: 'system', content: 'You are a legal research synthesis assistant.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature,
        stream: true,
        cache_prompt: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`TurboQuant HTTP ${response.status}`);
    }

    // Parse streaming response
    const answer = await parseStreamingResponse(response);
    return parseAndCiteSynthesis(answer);
  } catch (err) {
    if (err instanceof LlamaServerUnreachableError || err instanceof LlamaServerNoModelError || err instanceof LlamaServerModelResponseInvalidError) {
      console.warn(`[Synthesis] ${err.code}:`, err.message);
    } else if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[Synthesis] TurboQuant timeout');
    } else {
      console.warn('[Synthesis] TurboQuant call failed:', err);
    }
    return null;
  }
}

/**
 * Non-streaming fallback call to the same llama-server at :8090. Also
 * resolves the loaded model via GET /v1/models rather than the previous
 * try-each-hardcoded-name loop (MODEL_PREFERENCE), which never checked
 * what was actually loaded.
 */
async function callOllamaSynthesis(
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<SynthesisResponse | null> {
  const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
  const configuredModel = process.env.GEMMA4_MODEL || 'hforf';

  try {
    const { resolvedModel } = await resolveLoadedLlamaModel(LLAMA_SERVER_URL, configuredModel);

    try {
      const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: 'You are a legal research synthesis assistant.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: maxTokens,
          temperature,
          stream: false,
          cache_prompt: true
        }),
        signal: AbortSignal.timeout(60_000)
      });

      if (!response.ok) {
        throw new Error(`llama-server HTTP ${response.status}`);
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const answerText = data.choices?.[0]?.message?.content?.trim() || '';

      return parseAndCiteSynthesis(answerText);
    } catch (err) {
      console.warn('[Synthesis] llama-server call failed:', err);
      return null;
    }
  } catch (err) {
    if (err instanceof LlamaServerUnreachableError || err instanceof LlamaServerNoModelError || err instanceof LlamaServerModelResponseInvalidError) {
      console.warn(`[Synthesis] ${err.code}:`, err.message);
    } else {
      console.warn('[Synthesis] llama-server model resolution failed:', err);
    }
    return null;
  }
}

/**
 * Parse streaming response from TurboQuant
 */
async function parseStreamingResponse(response: Response): Promise<string> {
  let assembled = '';
  const decoder = new TextDecoder();
  let buffer = '';

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          assembled += parsed.choices?.[0]?.delta?.content ?? '';
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return assembled.trim();
}

/**
 * Parse synthesis response and extract citations
 */
function parseAndCiteSynthesis(answerText: string): SynthesisResponse {
  // Extract citations: [source_ref] format
  const citationRegex = /\[([^\]]+)\]/g;
  const citedSources = new Set<string>();
  let match;

  while ((match = citationRegex.exec(answerText)) !== null) {
    citedSources.add(match[1]);
  }

  return {
    answer: answerText,
    citations: Array.from(citedSources).map((source) => ({
      packetId: source,
      sourceRef: source,
      relevance: 0.8 // Inferred from citation presence
    })),
    confidence: 0.85, // Moderate confidence for LLM synthesis
    reasoning: 'Synthesized via Gemma4 with ACE evidence bundle'
  };
}

/**
 * Fallback synthesis when LLM unavailable
 */
function getFallbackSynthesis(_query: string, aceContext: ACEContext): SynthesisResponse {
  const packets = collectEvidencePackets(aceContext);
  const summaries = packets
    .map((p) => {
      const citation = p.sourceRef || p.packetKey || p.id || 'unknown';
      return `${p.summary || p.content || ''} [${citation}]`;
    })
    .filter((s: string) => s.length > 0);

  const answer = `Based on available evidence, ${summaries.join(' Additionally, ')}`;

  return {
    answer,
    citations: packets.map((p) => ({
      packetId: p.packetKey || p.id,
      sourceRef: p.sourceRef || p.id,
      relevance: 0.5
    })),
    confidence: 0.6, // Lower confidence for fallback
    reasoning: 'Fallback synthesis (LLM unavailable, combining evidence summaries)'
  };
}