/**
 * Gemma4 Synthesis Generator
 * Stage 5 of Policy Orchestrator: Generate answer from ACE context
 *
 * Input: ACEContext with selected packets + evidence
 * Output: Synthesized answer with citations
 * Pattern: Gemma4 receives evidence bundle from ACE assembler, generates answer
 */

import type { ACEContext, DecomposedQuery } from './gemma4-policy-orchestrator';

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
function buildEvidenceContext(aceContext: ACEContext): string {
  const packets = aceContext.selectedPackets.map((packet, idx) => {
    const citation = aceContext.evidence[idx]?.citation || packet.sourceRef || 'unknown';
    return `
[${idx + 1}] ${citation}
Summary: ${packet.summary || 'No summary'}
Type: ${aceContext.evidence[idx]?.type || 'unknown'}
Score: ${(aceContext.evidence[idx]?.score || 0).toFixed(2)}
Content: ${packet.metadata?.summary || packet.summary || '(no details)'}
`;
  });

  return packets.join('\n---\n');
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

  const evidenceContext = buildEvidenceContext(aceContext);
  const subgoalsText = decomposition.subgoals
    .map((sg) => `- ${sg.query} (priority: ${sg.priority})`)
    .join('\n');

  const systemPrompt = SYNTHESIS_PROMPT_TEMPLATE
    .replace('{QUERY}', query)
    .replace('{INTENT}', decomposition.intent)
    .replace('{SUBGOALS}', subgoalsText)
    .replace('{PACKET_COUNT}', aceContext.selectedPackets.length.toString())
    .replace('{TOKEN_COUNT}', aceContext.contextWindow.available.toString())
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
 * Call TurboQuant llama-server at :8090
 */
async function callTurboQuantSynthesis(
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<SynthesisResponse | null> {
  const TURBO_QUANT_URL = process.env.TURBO_QUANT_URL || 'http://127.0.0.1:8090';
  const timeout = 90_000; // 90s for thinking models

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${TURBO_QUANT_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
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
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[Synthesis] TurboQuant timeout');
    } else {
      console.warn('[Synthesis] TurboQuant call failed:', err);
    }
    return null;
  }
}

/**
 * Call Ollama at :11434
 */
async function callOllamaSynthesis(
  prompt: string,
  maxTokens: number,
  temperature: number
): Promise<SynthesisResponse | null> {
  const OLLAMA_URL = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(
    /^0\.0\.0\.0/,
    '127.0.0.1'
  );

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        messages: [
          { role: 'system', content: 'You are a legal research synthesis assistant.' },
          { role: 'user', content: prompt }
        ],
        stream: false,
        think: false, // Don't use reasoning block
        options: {
          temperature,
          num_predict: maxTokens
        }
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = (await response.json()) as { message?: { content?: string } };
    const answerText = data.message?.content?.trim() || '';

    return parseAndCiteSynthesis(answerText);
  } catch (err) {
    console.warn('[Synthesis] Ollama call failed:', err);
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
function getFallbackSynthesis(query: string, aceContext: ACEContext): SynthesisResponse {
  const summaries = aceContext.selectedPackets
    .map((p, idx) => {
      const citation = aceContext.evidence[idx]?.citation || 'unknown';
      return `${p.summary} [${citation}]`;
    })
    .filter((s) => s.length > 0);

  const answer = `Based on available evidence, ${summaries.join(' Additionally, ')}`;

  return {
    answer,
    citations: aceContext.evidence.map((ev) => ({
      packetId: ev.packetId,
      sourceRef: ev.citation,
      relevance: ev.score || 0.5
    })),
    confidence: 0.6, // Lower confidence for fallback
    reasoning: 'Fallback synthesis (LLM unavailable, combining evidence summaries)'
  };
}