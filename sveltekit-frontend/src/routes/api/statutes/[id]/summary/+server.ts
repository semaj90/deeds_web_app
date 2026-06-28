/**
 * POST /api/statutes/[id]/summary
 * Generates an AI summary of a statute using Ollama gemma4-rotorquant:latest.
 * Caches results in Redis (24h TTL).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/client';
import { statutes, statuteChunks } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { getChatModelKeepAlive, getOllamaGenerationEndpoint, ollamaFetch } from '$lib/server/ollama.js';
import { redis } from '$lib/server/redis.js';
import { isUuid } from '$lib/server/validation.js';
const CACHE_TTL = 86400; // 24 hours
const LLM_MODEL = 'gemma4-rotorquant:latest';

export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const statuteId = params.id;
  if (!isUuid(statuteId)) {
    return json({ error: 'Invalid statute ID' }, { status: 400 });
  }

  // Check Redis cache
  const cacheKey = `statute:summary:${statuteId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return json({ ...parsed, cached: true });
    }
  } catch {
    /* cache miss */
  }

  // Fetch statute + chunks
  const [statuteRows, chunks] = await Promise.all([
    db.select().from(statutes).where(eq(statutes.id, statuteId)).limit(1),
    db
      .select({ content: statuteChunks.content, chunkIndex: statuteChunks.chunkIndex })
      .from(statuteChunks)
      .where(eq(statuteChunks.statuteId, statuteId))
      .orderBy(statuteChunks.chunkIndex),
  ]);

  const statute = statuteRows[0];
  if (!statute) {
    return json({ error: 'Statute not found' }, { status: 404 });
  }

  // Build context from statute content + chunks
  const fullText =
    statute.content || chunks.map((c) => c.content).join('\n\n') || 'No text available';
  const truncated = fullText.slice(0, 4000); // Keep under context window

  const prompt = `You are a legal analyst. Analyze the following statute and provide a structured analysis.

Statute: ${statute.title ?? 'Unknown'}
Section: ${statute.section ?? 'N/A'}
Jurisdiction: ${statute.jurisdiction ?? 'Unknown'}

Text:
${truncated}

Respond in JSON format:
{
  "summary": "executive summary (2-3 paragraphs)",
  "keyProvisions": [
    { "title": "Short provision name", "description": "1-2 sentence explanation", "icon": "shield" }
  ],
  "implications": [
    { "title": "Short label", "description": "1-2 sentence explanation", "severity": "high|medium|low" }
  ],
  "citedSources": ["case name or reference mentioned in the text"]
}`;

  try {
    const res = await ollamaFetch(`${getOllamaGenerationEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 1024 },
        keep_alive: getChatModelKeepAlive(),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return json(
        {
          error: 'LLM unavailable',
          summary: null,
          keyProvisions: [],
          implications: [],
          citedSources: [],
        },
        { status: 503 }
      );
    }

    const data = await res.json();
    const responseText = data.response ?? '';

    // Parse JSON from LLM response
    let summary = responseText;
    let keyProvisions: { title: string; description: string; icon?: string }[] = [];
    let implications: { title: string; description: string; severity?: string }[] = [];
    let citedSources: string[] = [];

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        summary = parsed.summary ?? responseText;
        keyProvisions = Array.isArray(parsed.keyProvisions) ? parsed.keyProvisions : [];
        citedSources = Array.isArray(parsed.citedSources) ? parsed.citedSources : [];
        if (Array.isArray(parsed.implications)) {
          implications = parsed.implications.map((imp: unknown) =>
            typeof imp === 'string'
              ? { title: imp, description: '', severity: 'medium' }
              : (imp as { title: string; description: string; severity?: string })
          );
        }
      }
    } catch {
      // If JSON parsing fails, use raw text as summary
    }

    const result = {
      summary,
      keyProvisions,
      implications,
      citedSources,
      model: LLM_MODEL,
      statuteId,
      generatedAt: new Date().toISOString(),
    };

    // Cache in Redis
    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    } catch {
      /* cache write failure is non-fatal */
    }

    return json(result);
  } catch (err) {
    console.error('[statute/summary] LLM error:', err);
    return json(
      {
        error: 'Summary generation failed',
        summary: null,
        keyProvisions: [],
        implications: [],
        citedSources: [],
      },
      { status: 500 }
    );
  }
};


