/**
 * Knowledge Search API Endpoint
 * POST /api/knowledge/search
 *
 * Accepts search queries and returns ranked results with scores.
 * Supports LLM synthesis and tag filtering.
 *
 * Requirements: 8.1
 */

import { getKnowledgeSearcher } from '$lib/services/knowledge-search/KnowledgeSearcher.js';
import type { SearchRequest } from '$lib/services/knowledge-search/types';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

// Zod schema validates query (trimmed, 1-500), topK (1-100), llmProvider enum
const knowledgeSearchSchema = z.object({
  query: z.string().trim().min(1, 'Query cannot be empty').max(500, 'Query too long (max 500 characters)'),
  topK: z.number().int().min(1).max(100).optional(),
  llmProvider: z.enum(['ollama', 'gemini', 'claude']).optional(),
}).passthrough();

interface SourceResult {
  id: string;
  title: string;
  snippet: string;
  source: 'glossary' | 'statutes' | 'precedents' | 'qdrant';
  similarity: number;
  metadata?: Record<string, unknown>;
}

// Inline TF-IDF for cross-source reranking
const STOP_WORDS = new Set(['the','a','an','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','of','in','to','for','with','on','at','by','from','as','into','through','and','but','or','not','no','if','then','than','that','this','it']);
function tfidfScore(query: string, text: string): number {
  const tokenize = (s: string) => s.toLowerCase().split(/\W+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;
  const dTokens = tokenize(text);
  if (dTokens.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const t of dTokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  let score = 0;
  for (const qt of qTokens) {
    const tf = (freq.get(qt) ?? 0) / dTokens.length;
    if (tf > 0) score += tf;
  }
  return Math.min(score / qTokens.length, 1);
}

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const parsed = knowledgeSearchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const body = parsed.data as SearchRequest & Record<string, unknown>;

    // Execute search — parallel across KnowledgeSearcher (Qdrant) + 3 legal sources
    const searcher = getKnowledgeSearcher();
    const startTime = Date.now();
    const rawQuery = body.query.trim();
    const topK = body.topK ?? 10;
    const enableExpansion = (body as unknown as Record<string, unknown>).expand !== false;

    // Query expansion: add legal synonyms for broader retrieval
    let query = rawQuery;
    let expansionMeta: { synonyms: Array<{ term: string; synonym: string }>; source: string } | null = null;
    if (enableExpansion) {
      try {
        const { expandQuery } = await import('$lib/server/retrieval/query-expansion.js');
        const expanded = expandQuery(rawQuery);
        if (expanded.synonyms.length > 0) {
          query = expanded.expanded;
          expansionMeta = { synonyms: expanded.synonyms, source: expanded.source };
        }
      } catch {
        // Non-fatal: search with original query
      }
    }

    const searchBody = JSON.stringify({ query, limit: topK });
    const hdrs = { 'Content-Type': 'application/json' };

    // Fire all 4 searches in parallel
    const [qdrantResults, glossaryRes, statutesRes, precedentsRes] = await Promise.allSettled([
      traceEmbedding(query, 'embeddinggemma:latest', () =>
        searcher.search(query, {
          topK,
          threshold: 0.5,
          filters: body.filters,
          includeContent: body.includeContent,
          synthesize: body.synthesize,
          llmProvider: body.llmProvider,
        })
      ),
      fetch('/api/glossary/search', {
        method: 'POST',
        headers: hdrs,
        body: searchBody,
        signal: AbortSignal.timeout(10_000),
      }),
      fetch('/api/statutes/search', {
        method: 'POST',
        headers: hdrs,
        body: searchBody,
        signal: AbortSignal.timeout(10_000),
      }),
      fetch('/api/precedents/search', {
        method: 'POST',
        headers: hdrs,
        body: searchBody,
        signal: AbortSignal.timeout(10_000),
      }),
    ]);

    // Collect KnowledgeSearcher (Qdrant) results
    const allResults: SourceResult[] = [];
    const sourceStats = { qdrant: 0, glossary: 0, statutes: 0, precedents: 0 };

    if (qdrantResults.status === 'fulfilled') {
      for (const r of qdrantResults.value) {
        allResults.push({
          id: r.id ?? `qdrant-${allResults.length}`,
          title: r.title ?? '',
          snippet: r.snippet ?? r.summary ?? '',
          source: 'qdrant',
          similarity: r.scores?.combined ?? r.scores?.semantic ?? 0.5,
          metadata: { tags: r.tags, url: r.url, synthesizedAnswer: r.synthesizedAnswer }
        });
        sourceStats.qdrant++;
      }
    }

    // Parse glossary results
    if (glossaryRes.status === 'fulfilled' && glossaryRes.value.ok) {
      try {
        const data = await glossaryRes.value.json();
        for (const r of data.results ?? []) {
          allResults.push({
            id: r.id ?? `glossary-${r.term}`,
            title: r.term ?? 'Unknown Term',
            snippet: r.definition ?? '',
            source: 'glossary',
            similarity: r.similarity ?? 0.5,
            metadata: { category: r.category, jurisdiction: r.jurisdiction, matchType: r.matchType, relatedTerms: r.relatedTerms }
          });
          sourceStats.glossary++;
        }
      } catch { /* ignore parse errors */ }
    }

    // Parse statutes results
    if (statutesRes.status === 'fulfilled' && statutesRes.value.ok) {
      try {
        const data = await statutesRes.value.json();
        for (const r of data.results ?? []) {
          allResults.push({
            id: r.chunkId ?? r.statuteId ?? `statute-${allResults.length}`,
            title: `${r.statuteTitle ?? ''}${r.section ? ` — ${r.section}` : ''}`,
            snippet: r.content ?? '',
            source: 'statutes',
            similarity: r.similarity ?? 0.5,
            metadata: { jurisdiction: r.jurisdiction, category: r.category, statuteId: r.statuteId }
          });
          sourceStats.statutes++;
        }
      } catch { /* ignore parse errors */ }
    }

    // Parse precedents results
    if (precedentsRes.status === 'fulfilled' && precedentsRes.value.ok) {
      try {
        const data = await precedentsRes.value.json();
        for (const r of data.results ?? []) {
          allResults.push({
            id: r.id ?? `precedent-${r.citation}`,
            title: r.title ?? r.citation ?? 'Unknown Case',
            snippet: r.summary ?? '',
            source: 'precedents',
            similarity: r.similarity ?? 0.5,
            metadata: { citation: r.citation, court: r.court, decisionDate: r.decisionDate, pgSource: r.source }
          });
          sourceStats.precedents++;
        }
      } catch { /* ignore parse errors */ }
    }

    // Apply TF-IDF reranking: hybrid = 0.7 * semantic + 0.3 * tfidf
    for (const r of allResults) {
      const tf = tfidfScore(query, `${r.title} ${r.snippet}`);
      r.similarity = 0.7 * r.similarity + 0.3 * tf;
    }

    // Sort by combined score, deduplicate by title, take topK
    allResults.sort((a, b) => b.similarity - a.similarity);
    const seen = new Set<string>();
    const deduplicated: SourceResult[] = [];
    for (const r of allResults) {
      const key = r.title.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      deduplicated.push(r);
      if (deduplicated.length >= topK) break;
    }

    const queryTime = Date.now() - startTime;

    // Return unified results with per-source metadata
    return json({
      success: true,
      query,
      results: deduplicated,
      metadata: {
        queryTime,
        totalResults: deduplicated.length,
        totalAcrossSources: allResults.length,
        sources: sourceStats,
        synthesized: body?.synthesize || false,
        llmProvider: body?.llmProvider ?? 'ollama',
        queryExpansion: expansionMeta
      }
    });
  } catch (error) {
    console.error('Search API error:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('Ollama')) {
        return json(
          { error: 'LLM service unavailable' },
          { status: 503 }
        );
      }

      if (error.message.includes('Qdrant')) {
        return json(
          { error: 'Search service unavailable' },
          { status: 503 }
        );
      }
    }

    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};


