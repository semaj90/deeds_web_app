/**
 * ACE Synthesis Engine: Converts retrieval results to LLM responses
 *
 * Layer 5 of ACE → Search → Chat → Go Retrieval pipeline
 *
 * Responsibilities:
 * 1. Assemble context from ACE packet (retrieval results)
 * 2. Build prompt with retrieved chunks + metadata
 * 3. Stream response from Gemma4 via llama-server
 * 4. Extract and format citations from source references
 * 5. Cache synthesis results for future queries
 */

import { getRedis } from '$lib/server/redis.js';
import type { AcePacket } from '$lib/server/cache/ace-packet-cache.js';

export interface SynthesisRequest {
  query: string;
  acePacket: AcePacket;
  userId?: string;
  sessionId?: string;
  maxContextChunks?: number;
  temperature?: number;
}

export interface SynthesisStreamEvent {
  type:
    | 'synthesis.start'
    | 'synthesis.chunk'
    | 'synthesis.complete'
    | 'synthesis.error'
    | 'citation.resolved'
    | 'cache.populated';
  content?: string;
  citations?: Citation[];
  metadata?: Record<string, any>;
  error?: string;
  duration?: number;
}

export interface Citation {
  id: string;
  sourceRef: string;
  filePath?: string;
  lineRange?: [number, number];
  title?: string;
  confidence?: number;
}

const DEFAULT_MAX_CONTEXT_CHUNKS = 20;
const SYNTHESIS_CACHE_TTL = 3600; // 1 hour

/**
 * Synthesize an answer using the Gemma4 LLM with ACE context
 *
 * @param request - Synthesis parameters including query and ACE packet
 * @param onEvent - Callback for streaming events
 * @returns Completion text and extracted citations
 */
export async function synthesizeWithAce(
  request: SynthesisRequest,
  onEvent: (event: SynthesisStreamEvent) => void
): Promise<{ text: string; citations: Citation[] }> {
  const startTime = Date.now();
  const maxContextChunks = request.maxContextChunks ?? DEFAULT_MAX_CONTEXT_CHUNKS;
  const temperature = request.temperature ?? 0.3;

  onEvent({ type: 'synthesis.start', metadata: { query: request.query } });

  try {
    // 1. Assemble context from ACE packet
    const context = assembleContext(request.acePacket, maxContextChunks);

    // 2. Check synthesis cache (optional optimization)
    const cacheKey = `synthesis:${hashQuery(request.query)}`;
    const cached = await getCachedSynthesis(cacheKey).catch(() => null);

    if (cached) {
      onEvent({
        type: 'cache.populated',
        metadata: { source: 'redis', duration: 0 },
      });
      return cached;
    }

    // 3. Build system and user prompts
    const systemPrompt = buildSystemPrompt(request.acePacket);
    const userPrompt = buildUserPrompt(request.query, context);

    // 4. Stream response from Gemma4
    const { text, citations } = await streamGemma4Synthesis(
      systemPrompt,
      userPrompt,
      temperature,
      onEvent
    );

    // 5. Cache result for future queries
    const result = { text, citations };
    await cacheSynthesis(cacheKey, result, SYNTHESIS_CACHE_TTL).catch(() => null);

    onEvent({
      type: 'synthesis.complete',
      metadata: {
        duration: Date.now() - startTime,
        citationCount: citations.length,
        contextChunks: context.chunks.length,
      },
    });

    return result;
  } catch (err) {
    onEvent({
      type: 'synthesis.error',
      error: err instanceof Error ? err.message : 'Unknown synthesis error',
      metadata: { duration: Date.now() - startTime },
    });
    throw err;
  }
}

/**
 * Assemble context from ACE packet for LLM consumption
 */
function assembleContext(
  packet: AcePacket,
  maxChunks: number
): {
  chunks: ContextChunk[];
  summary: string;
  sourceRefs: string[];
} {
  const chunks: ContextChunk[] = [];
  const sourceRefs = new Set<string>();

  // Extract source references from packet
  if (packet.sourceRefs && Array.isArray(packet.sourceRefs)) {
    packet.sourceRefs.forEach((ref) => sourceRefs.add(ref));
  }

  // Extract ranked cards (retrieval results)
  if (packet.rankedCards && Array.isArray(packet.rankedCards)) {
    for (const card of packet.rankedCards.slice(0, maxChunks)) {
      const chunk: ContextChunk = {
        id: card.id || `chunk-${chunks.length}`,
        title: card.title || 'Untitled',
        content: card.content || card.summary || '',
        sourceRef: card.sourceRef || 'unknown',
        score: card.score ?? 0,
        metadata: card.metadata || {},
      };
      chunks.push(chunk);

      if (card.sourceRef) {
        sourceRefs.add(card.sourceRef);
      }
    }
  }

  // Build summary of what we have
  const summary =
    chunks.length > 0
      ? `Retrieved ${chunks.length} relevant context chunks`
      : packet.degraded
        ? 'Limited context available (degraded mode)'
        : 'No specific context retrieved';

  return {
    chunks,
    summary,
    sourceRefs: Array.from(sourceRefs),
  };
}

interface ContextChunk {
  id: string;
  title: string;
  content: string;
  sourceRef: string;
  score: number;
  metadata: Record<string, any>;
}

/**
 * Build system prompt for ACE-aware synthesis
 */
function buildSystemPrompt(packet: AcePacket): string {
  const degraded = packet.degraded ? ' Note: This packet is in degraded mode.' : '';
  return `You are a legal AI assistant powered by ACE (Autonomous Context Engine).
Your role is to provide accurate, well-sourced answers based on retrieved legal and codebase context.

Guidelines:
1. Always cite your sources using the format: [Source: reference]
2. If context is incomplete or uncertain, say so explicitly
3. Prefer direct quotes from retrieved chunks when possible
4. For codebase questions, provide file paths and function names
5. For legal questions, cite statutes and case precedents${degraded}

The retrieved context below represents the most relevant information available.
Use it to formulate your answer.`;
}

/**
 * Build user prompt with context and query
 */
function buildUserPrompt(query: string, context: ReturnType<typeof assembleContext>): string {
  let prompt = `Context:\n`;

  if (context.chunks.length > 0) {
    for (const chunk of context.chunks) {
      prompt += `\n[${chunk.id}] ${chunk.title} (from ${chunk.sourceRef}, score: ${chunk.score.toFixed(2)})\n`;
      prompt += `${chunk.content.substring(0, 500)}\n`;
    }
  } else {
    prompt += `No specific context retrieved. The system attempted retrieval but found limited matches.\n`;
  }

  prompt += `\nQuery: ${query}`;
  return prompt;
}

/**
 * Stream response from Gemma4 LLM
 */
async function streamGemma4Synthesis(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  onEvent: (event: SynthesisStreamEvent) => void
): Promise<{ text: string; citations: Citation[] }> {
  const baseUrl = process.env.GEMMA4_BASE_URL ?? 'http://127.0.0.1:8090';
  const model = process.env.GEMMA4_MODEL ?? 'gemma4';
  const url = `${baseUrl}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemma4 synthesis failed: ${response.status} ${response.statusText}`);
  }

  let fullText = '';
  const citations: Citation[] = [];

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          if (line === 'data: [DONE]') break;

          try {
            const data = JSON.parse(line.substring(6));
            const chunk = data.choices?.[0]?.delta?.content ?? '';

            if (chunk) {
              fullText += chunk;
              onEvent({
                type: 'synthesis.chunk',
                content: chunk,
              });
            }
          } catch {
            // Ignore JSON parse errors for malformed SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // Extract citations from response
  const citationPattern = /\[Source:\s*([^\]]+)\]/g;
  let match;
  while ((match = citationPattern.exec(fullText)) !== null) {
    const sourceRef = match[1].trim();
    citations.push({
      id: `citation-${citations.length}`,
      sourceRef,
      confidence: 0.9,
    });

    onEvent({
      type: 'citation.resolved',
      metadata: { sourceRef },
    });
  }

  return { text: fullText, citations };
}

/**
 * Get cached synthesis result from Redis
 */
async function getCachedSynthesis(
  cacheKey: string
): Promise<{ text: string; citations: Citation[] } | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // Cache miss or Redis error - continue
  }
  return null;
}

/**
 * Cache synthesis result in Redis
 */
async function cacheSynthesis(
  cacheKey: string,
  result: { text: string; citations: Citation[] },
  ttl: number
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(cacheKey, ttl, JSON.stringify(result));
  } catch (err) {
    // Log but don't fail on cache write
    console.warn('Failed to cache synthesis result:', err);
  }
}

/**
 * Simple query hash for cache keys
 */
function hashQuery(query: string): string {
  return require('crypto').createHash('md5').update(query).digest('hex');
}
