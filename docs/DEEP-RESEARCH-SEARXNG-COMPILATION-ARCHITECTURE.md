# Deep Research + SearXNG Compilation Architecture

**Status**: Firecrawl web scraper + recommendation engine exist; SearXNG available in docker-compose --profile full  
**Goal**: Build 5-stage pipeline: query decomposition → parallel SearXNG searches → compile results → Gemma4 synthesis → recommendations merge  
**Timeline**: 6-8 hours (greenfield + integration)

---

## Current Components

### A. Query Tools
- **Firecrawl** (`src/lib/server/research/fastcrawl.ts`) — Single URL scraper
- **RecommendationEngine** (`src/lib/server/admin/recommendation-engine.ts`) — LLM-based action synthesis

### B. Web Research Stack
- **SearXNG** (docker-compose --profile full, port 8889) — Privacy metasearch aggregator
- **web-research-crawler.ts** — Parallel fetch orchestrator
- **research-cache.ts** — Local result deduplication

### C. Search Contracts
```typescript
// From go-retrieval-client.ts
interface GoRetrievalSearchHit {
  source_ref: string;
  content: string;
  snippet: string;
  score: number;
  source_type: string;
  cache_hit_source?: string;
}
```

---

## Proposed 5-Stage Pipeline

```
┌─ Stage 1: Decompose ─────────────────────────────┐
│ User query → Gemma4 reasoning                    │
│ Output: { subtasks, keywords, strategy }         │
└────────────┬────────────────────────────────────┘
             ↓
┌─ Stage 2: Parallel Search ──────────────────────┐
│ Each subtask → SearXNG + go-search              │
│ Output: raw results + metadata                  │
└────────────┬────────────────────────────────────┘
             ↓
┌─ Stage 3: Compile + Deduplicate ───────────────┐
│ Merge results → remove duplicates               │
│ Output: unified ranked result set               │
└────────────┬────────────────────────────────────┘
             ↓
┌─ Stage 4: Synthesize + Cite ──────────────────┐
│ Gemma4: "Write a report citing these results" │
│ Output: markdown report + citation refs        │
└────────────┬────────────────────────────────────┘
             ↓
┌─ Stage 5: Recommendations Merge ───────────────┐
│ Extract actions from synthesis                  │
│ Output: actionable recommendations              │
└────────────────────────────────────────────────┘
```

---

## Stage 1: Query Decomposition

**File**: `src/lib/server/research/deep-research-decomposer.ts` (NEW)

```typescript
import { bifrostChat } from '$lib/server/ollama.js';

export interface DecomposedQuery {
  original: string;
  subtasks: Array<{
    id: string;
    query: string;
    intent: 'legal' | 'factual' | 'procedural';
    priority: 'high' | 'medium' | 'low';
  }>;
  keywords: string[];
  strategy: 'web_search' | 'legal_database' | 'hybrid';
}

export async function decomposeQuery(query: string): Promise<DecomposedQuery> {
  const prompt = `
You are a legal research decomposition engine.
Break down this query into 3-5 focused subtasks for parallel searching.

QUERY: ${query}

RESPONSE (JSON):
{
  "subtasks": [
    {"id": "search_1", "query": "...", "intent": "legal|factual|procedural", "priority": "high|medium|low"},
    ...
  ],
  "keywords": ["keyword1", "keyword2", ...],
  "strategy": "web_search|legal_database|hybrid"
}
`;

  const response = await bifrostChat(
    [{ role: 'user', content: prompt }],
    'gemma4-rotorquant:latest',
    { temperature: 0.3, maxTokens: 512 }
  );

  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    
    const data = JSON.parse(match[0]);
    return {
      original: query,
      subtasks: data.subtasks || [],
      keywords: data.keywords || [],
      strategy: data.strategy || 'hybrid'
    };
  } catch (err) {
    console.error('[decomposeQuery] Parse error:', err);
    // Fallback: treat whole query as single task
    return {
      original: query,
      subtasks: [
        { id: 'search_1', query, intent: 'legal', priority: 'high' }
      ],
      keywords: query.split(/\s+/).slice(0, 5),
      strategy: 'hybrid'
    };
  }
}
```

---

## Stage 2: Parallel Search Orchestration

**File**: `src/lib/server/research/parallel-research-launcher.ts` (NEW)

```typescript
import { decomposeQuery, type DecomposedQuery } from './deep-research-decomposer.js';
import { searchSearXNG } from './searxng-client.js';
import { searchViaGoRetrieval } from '../retrieval/go-retrieval-client.js';
import { fastCrawl } from './fastcrawl.js';

export interface ResearchResult {
  source: 'searxng' | 'go_retrieval' | 'firecrawl';
  title: string;
  url: string;
  snippet: string;
  relevance_score: number;
  fetched_at: string;
  raw_content?: string;
}

export interface ResearchCompilationState {
  query: string;
  decomposed: DecomposedQuery;
  results: Map<string, ResearchResult[]>; // subtask_id → results
  totalResults: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

/**
 * Launch parallel searches across SearXNG, go-retrieval, and Firecrawl
 */
export async function launchParallelResearch(
  query: string,
  options?: { timeout?: number; maxResultsPerTask?: number }
): Promise<ResearchCompilationState> {
  const maxResultsPerTask = options?.maxResultsPerTask ?? 10;
  const timeout = options?.timeout ?? 30_000;

  // Step 1: Decompose query
  const decomposed = await decomposeQuery(query);

  // Step 2: Launch parallel searches for each subtask
  const searchPromises = decomposed.subtasks.map(async (task) => {
    const searchQuery = task.query;
    const results: ResearchResult[] = [];

    try {
      // Lane A: SearXNG (web search)
      const searxngResults = await Promise.race([
        searchSearXNG(searchQuery, { limit: maxResultsPerTask }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('SearXNG timeout')), timeout / 3)
        )
      ]).catch((err) => {
        console.warn(`[searxng] Timeout for "${searchQuery}":`, err.message);
        return null;
      });

      if (searxngResults) {
        results.push(
          ...searxngResults.map((r: any) => ({
            source: 'searxng' as const,
            title: r.title || '',
            url: r.url || '',
            snippet: r.content || r.summary || '',
            relevance_score: r.score ?? 0.5,
            fetched_at: new Date().toISOString(),
          }))
        );
      }

      // Lane B: Go Retrieval (codebase + local knowledge)
      if (decomposed.strategy === 'hybrid' || task.intent === 'legal') {
        const goResults = await Promise.race([
          searchViaGoRetrieval({
            query: searchQuery,
            topK: maxResultsPerTask / 2,
            includeMetadata: true
          }),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Go retrieval timeout')), timeout / 3)
          )
        ]).catch((err) => {
          console.warn(`[go-retrieval] Timeout for "${searchQuery}":`, err.message);
          return null;
        });

        if (goResults?.results) {
          results.push(
            ...goResults.results.map((r: any) => ({
              source: 'go_retrieval' as const,
              title: r.source_ref || r.file_path || '',
              url: r.source_url || `internal:${r.feature_id}`,
              snippet: r.content || r.snippet || '',
              relevance_score: r.score ?? 0.5,
              fetched_at: new Date().toISOString(),
            }))
          );
        }
      }

      // Lane C: Firecrawl (deep scrape for top result)
      if (results.length > 0) {
        const topUrl = results[0]?.url;
        if (topUrl && !topUrl.startsWith('internal:')) {
          const crawled = await Promise.race([
            fastCrawl(topUrl),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Firecrawl timeout')), timeout / 3)
            )
          ]).catch((err) => {
            console.warn(`[firecrawl] Timeout for "${topUrl}":`, err.message);
            return null;
          });

          if (crawled) {
            results[0].raw_content = crawled.body;
          }
        }
      }
    } catch (err) {
      console.error(`[parallelResearch] Subtask ${task.id} failed:`, err);
    }

    return { taskId: task.id, results };
  });

  // Step 3: Wait for all searches (with overall timeout)
  const searchResults = await Promise.race([
    Promise.all(searchPromises),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Overall search timeout')), timeout)
    )
  ]).catch(() => []);

  // Step 4: Build state
  const resultMap = new Map<string, ResearchResult[]>();
  let totalResults = 0;

  for (const { taskId, results } of searchResults) {
    resultMap.set(taskId, results);
    totalResults += results.length;
  }

  return {
    query,
    decomposed,
    results: resultMap,
    totalResults,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() // Will be updated by caller
  };
}
```

---

## Stage 2b: SearXNG Client

**File**: `src/lib/server/research/searxng-client.ts` (NEW)

```typescript
import { ENV } from '$lib/server/env.server.js';

export interface SearXNGResult {
  title: string;
  url: string;
  content: string;
  summary?: string;
  score?: number;
}

export async function searchSearXNG(
  query: string,
  options?: { limit?: number; lang?: string }
): Promise<SearXNGResult[]> {
  const limit = options?.limit ?? 10;
  const lang = options?.lang ?? 'en-US';

  const endpoint = process.env.SEARXNG_ENDPOINT || 'http://localhost:8889';
  const url = new URL(`${endpoint}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageno', '1');
  url.searchParams.set('language', lang);

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      console.error(`[searxng] HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results: SearXNGResult[] = (data.results || [])
      .slice(0, limit)
      .map((r: any, i: number) => ({
        title: r.title || '',
        url: r.url || '',
        content: r.content || '',
        summary: r.summary,
        score: (limit - i) / limit // Simple ranking by position
      }));

    return results;
  } catch (err) {
    console.error('[searxng] Request failed:', err);
    return [];
  }
}
```

---

## Stage 3: Compile & Deduplicate

**File**: `src/lib/server/research/research-compiler.ts` (NEW)

```typescript
import type { ResearchCompilationState, ResearchResult } from './parallel-research-launcher.js';
import { simhash } from './content-deduplicator.js';

export interface CompiledResearchReport {
  query: string;
  totalResults: number;
  uniqueResults: number;
  deduplicationRate: number; // % of duplicates removed
  results: Array<ResearchResult & { dedupeHash: string; sources: string[] }>;
  compiledAt: string;
}

/**
 * Compile parallel search results and remove near-duplicates
 */
export async function compileSearchResults(
  state: ResearchCompilationState
): Promise<CompiledResearchReport> {
  const allResults: ResearchResult[] = [];
  const dedupeMap = new Map<string, Set<string>>(); // hash → source set

  // Flatten all results
  for (const results of state.results.values()) {
    allResults.push(...results);
  }

  // Deduplicate by content hash
  const dedupedResults: typeof allResults = [];
  const seenHashes = new Set<string>();

  for (const result of allResults) {
    const contentHash = simhash(result.snippet + result.title);
    
    if (!seenHashes.has(contentHash)) {
      seenHashes.add(contentHash);
      dedupedResults.push(result);
      dedupeMap.set(contentHash, new Set([result.source]));
    } else {
      // Track multiple sources for same content
      dedupeMap.get(contentHash)?.add(result.source);
    }
  }

  // Sort by relevance
  dedupedResults.sort((a, b) => b.relevance_score - a.relevance_score);

  // Build report
  const report: CompiledResearchReport = {
    query: state.query,
    totalResults: allResults.length,
    uniqueResults: dedupedResults.length,
    deduplicationRate: allResults.length > 0
      ? ((allResults.length - dedupedResults.length) / allResults.length) * 100
      : 0,
    results: dedupedResults.map((r) => ({
      ...r,
      dedupeHash: simhash(r.snippet + r.title),
      sources: Array.from(dedupeMap.get(simhash(r.snippet + r.title)) || new Set())
    })),
    compiledAt: new Date().toISOString()
  };

  return report;
}

/**
 * Simple 64-bit Simhash for near-duplicate detection
 */
function simhash(text: string): string {
  const hashBits = new Uint32Array(2);
  const tokens = text.toLowerCase().split(/\s+/).slice(0, 50); // Limit tokens

  for (const token of tokens) {
    let hash = 5381;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) + hash) + token.charCodeAt(i);
    }
    hash = Math.abs(hash);

    // XOR into bit vector
    if (hash % 2 === 0) hashBits[0] |= (hash >> 1) % Math.pow(2, 32);
    else hashBits[1] |= (hash >> 1) % Math.pow(2, 32);
  }

  return `${hashBits[0].toString(16)}.${hashBits[1].toString(16)}`;
}
```

---

## Stage 4: Synthesize with Citations

**File**: `src/lib/server/research/research-synthesizer.ts` (NEW)

```typescript
import { bifrostChat } from '$lib/server/ollama.js';
import type { CompiledResearchReport } from './research-compiler.js';

export interface SynthesizedReport {
  markdown: string;
  citations: Array<{
    num: number;
    title: string;
    url: string;
    snippet: string;
  }>;
  generatedAt: string;
}

export async function synthesizeReport(
  report: CompiledResearchReport
): Promise<SynthesizedReport> {
  // Build context from top results
  const contextLines = report.results.slice(0, 10).map((r, i) => {
    return `[${i + 1}] ${r.title}
URL: ${r.url}
${r.snippet}
Source: ${r.sources.join(', ')}
---`;
  }).join('\n\n');

  const prompt = `You are a legal research synthesizer.
Write a comprehensive markdown report analyzing the following research results.
Cite sources by number [1], [2], etc.

ORIGINAL QUERY: ${report.query}
TOTAL UNIQUE SOURCES: ${report.uniqueResults}

RESEARCH RESULTS:
${contextLines}

REQUIREMENTS:
1. Write in professional legal language
2. Organize into sections (Overview, Key Findings, Legal Implications, Recommendations)
3. Cite all sources with [1], [2], etc.
4. Highlight contradictions or conflicting viewpoints
5. Keep to 2000 words maximum

MARKDOWN REPORT:`;

  const response = await bifrostChat(
    [{ role: 'user', content: prompt }],
    'gemma4-rotorquant:latest',
    { temperature: 0.3, maxTokens: 2048 }
  );

  // Extract citations from markdown
  const citations: SynthesizedReport['citations'] = [];
  const citationMatches = response.matchAll(/\[(\d+)\]/g);
  const citationNums = new Set<number>();

  for (const match of citationMatches) {
    const num = parseInt(match[1]);
    if (num <= report.uniqueResults && !citationNums.has(num)) {
      citationNums.add(num);
      const result = report.results[num - 1];
      if (result) {
        citations.push({
          num,
          title: result.title,
          url: result.url,
          snippet: result.snippet
        });
      }
    }
  }

  return {
    markdown: response,
    citations,
    generatedAt: new Date().toISOString()
  };
}
```

---

## Stage 5: Recommendations Merge

**File**: `src/lib/server/research/recommendations-merger.ts` (NEW)

```typescript
import { RecommendationEngine } from '../admin/recommendation-engine.js';
import type { SynthesizedReport } from './research-synthesizer.js';
import type { AdminRecommendation } from '../admin/recommendation-engine.js';

export interface MergedRecommendations {
  query: string;
  reportSummary: string;
  recommendations: AdminRecommendation[];
  actionableInsights: string[];
  followUpQuestions: string[];
}

export async function mergeRecommendations(
  query: string,
  synthesizedReport: SynthesizedReport,
  history?: any[]
): Promise<MergedRecommendations> {
  // Extract first paragraph as summary
  const summary = synthesizedReport.markdown
    .split('\n\n')
    .find(p => p.length > 100) || synthesizedReport.markdown.slice(0, 200);

  // Generate recommendations from synthesis
  const recommendations = await RecommendationEngine.generate(
    query,
    'deep_research_synthesis',
    synthesizedReport.citations.map(c => ({
      title: c.title,
      content: c.snippet,
      source: c.url
    })),
    history || []
  );

  // Extract actionable insights from markdown
  const actionableInsights: string[] = [];
  const lines = synthesizedReport.markdown.split('\n');
  
  for (const line of lines) {
    if (/should|must|recommend|critical|urgent|important/i.test(line)) {
      const text = line.replace(/^#+\s+/, '').trim();
      if (text.length > 20 && text.length < 200) {
        actionableInsights.push(text);
      }
    }
  }

  // Generate follow-up questions
  const followUpPrompt = `Based on this research summary, suggest 3 follow-up questions for deeper investigation:

${summary}

List as JSON array of strings.`;

  // TODO: Call Gemma4 to generate follow-ups
  const followUpQuestions = [
    'How do recent legislative changes affect this issue?',
    'What are the procedural requirements for enforcement?',
    'What precedent cases support this analysis?'
  ];

  return {
    query,
    reportSummary: summary,
    recommendations,
    actionableInsights,
    followUpQuestions
  };
}
```

---

## Integration: API Route

**File**: `src/routes/api/research/deep-search/+server.ts` (NEW)

```typescript
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { launchParallelResearch } from '$lib/server/research/parallel-research-launcher.js';
import { compileSearchResults } from '$lib/server/research/research-compiler.js';
import { synthesizeReport } from '$lib/server/research/research-synthesizer.js';
import { mergeRecommendations } from '$lib/server/research/recommendations-merger.js';

const schema = z.object({
  query: z.string().min(10).max(500),
  caseId: z.string().optional(),
  streaming: z.boolean().optional().default(false)
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const { query, caseId, streaming } = parsed.data;

    // Stage 1 & 2: Decompose + Search
    const startTime = Date.now();
    const searchState = await launchParallelResearch(query, {
      timeout: 30_000,
      maxResultsPerTask: 10
    });
    searchState.durationMs = Date.now() - startTime;

    // Stage 3: Compile
    const compiled = await compileSearchResults(searchState);

    // Stage 4: Synthesize
    const synthesized = await synthesizeReport(compiled);

    // Stage 5: Recommendations
    const merged = await mergeRecommendations(query, synthesized);

    return json({
      success: true,
      query,
      compiledReport: compiled,
      synthesizedReport: synthesized,
      recommendations: merged,
      metadata: {
        totalSearchTimeMs: searchState.durationMs,
        resultsDeduplicatedFrom: compiled.totalResults,
        resultsFinalCount: compiled.uniqueResults,
        deduplicationRate: compiled.deduplicationRate,
        citationCount: synthesized.citations.length
      }
    });
  } catch (err) {
    console.error('[deep-search] Error:', err);
    return json({
      error: 'Research compilation failed',
      details: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
};
```

---

## Frontend Integration

**File**: `src/routes/(app)/deep-research/+page.svelte` (NEW)

```svelte
<script lang="ts">
  import { writable } from 'svelte/store';

  let query = $state('');
  let isLoading = $state(false);
  let result = $state<any | null>(null);
  let error = $state<string | null>(null);

  async function performDeepSearch() {
    if (!query.trim()) return;
    
    isLoading = true;
    error = null;
    result = null;

    try {
      const response = await fetch('/api/research/deep-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      result = await response.json();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Search failed';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="deep-research-page">
  <h1>Deep Research Compiler</h1>
  
  <div class="search-box">
    <input
      type="text"
      bind:value={query}
      placeholder="Enter your legal research query..."
      onkeydown={(e) => e.key === 'Enter' && performDeepSearch()}
    />
    <button onclick={performDeepSearch} disabled={isLoading}>
      {isLoading ? 'Searching...' : 'Deep Search'}
    </button>
  </div>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if result}
    <div class="results">
      <h2>Compiled Report</h2>
      <p>Found {result.compiledReport.uniqueResults} unique sources from {result.compiledReport.totalResults} results</p>
      
      <div class="synthesis">
        <h3>Synthesized Analysis</h3>
        <div class="markdown">{result.synthesizedReport.markdown}</div>
      </div>

      <div class="citations">
        <h3>Citations</h3>
        <ol>
          {#each result.synthesizedReport.citations as citation (citation.num)}
            <li>
              <strong>{citation.title}</strong><br />
              <a href={citation.url} target="_blank">{citation.url}</a>
            </li>
          {/each}
        </ol>
      </div>

      <div class="recommendations">
        <h3>Actionable Recommendations</h3>
        <ul>
          {#each result.recommendations.recommendations as rec (rec.id)}
            <li>
              <strong>{rec.title}</strong> (Confidence: {rec.confidence})
              <p>{rec.description}</p>
            </li>
          {/each}
        </ul>
      </div>

      <div class="follow-up">
        <h3>Follow-up Questions</h3>
        <ul>
          {#each result.recommendations.followUpQuestions as question}
            <li>{question}</li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
</div>

<style>
  .deep-research-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .search-box {
    display: flex;
    gap: 1rem;
    margin: 2rem 0;
  }

  .search-box input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  .search-box button {
    padding: 0.75rem 1.5rem;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .search-box button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .results {
    margin: 2rem 0;
  }

  .synthesis, .citations, .recommendations, .follow-up {
    margin: 2rem 0;
    padding: 1.5rem;
    background: #f9f9f9;
    border-radius: 4px;
  }

  .markdown {
    line-height: 1.6;
    color: #333;
  }

  .citations ol {
    margin: 1rem 0;
  }

  .recommendations ul, .follow-up ul {
    list-style: none;
    padding: 0;
  }

  .recommendations li, .follow-up li {
    margin: 0.5rem 0;
    padding: 0.5rem;
    background: white;
    border-left: 4px solid #0066cc;
  }
</style>
```

---

## Docker Setup

Ensure SearXNG is running:

```bash
docker compose --profile full up -d searxng

# Verify
curl http://localhost:8889/search?q=test&format=json
```

Environment variables (add to `.env`):

```bash
SEARXNG_ENDPOINT=http://localhost:8889
FIRECRAWL_API_KEY=your_key_here  # Optional for deep scraping
```

---

## Performance Expectations

| Stage | Time | Bottleneck |
|-------|------|-----------|
| Decomposition | 1-2s | Gemma4 reasoning |
| Parallel search (3 lanes × 5 tasks) | 3-8s | Network + SearXNG latency |
| Compilation + dedup | 0.5-1s | Simhash computation |
| Synthesis | 2-4s | Gemma4 generation |
| Recommendations | 1-2s | Gemma4 + post-processing |
| **Total** | **8-17s** | — |

---

## Caching Strategy

Add Redis caching for repeat queries:

```typescript
const cacheKey = `deep-research:${sha256(query)}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const result = await performFullPipeline(query);
await redis.setex(cacheKey, 86400, JSON.stringify(result)); // 24h TTL

return result;
```

---

## Monitoring

Add to Langfuse:

```typescript
import { traceLLM } from '$lib/server/observability/langfuse.js';

return traceLLM(
  'deep-research',
  { input: query, stage: 'full-pipeline' },
  async (gen) => {
    const result = await performFullPipeline(query);
    gen.end({
      output: result.synthesizedReport.markdown.slice(0, 1000),
      metadata: {
        totalResults: result.compiledReport.totalResults,
        uniqueResults: result.compiledReport.uniqueResults,
        durationMs: result.metadata.totalSearchTimeMs,
        recommendationCount: result.recommendations.recommendations.length
      }
    });
    return result;
  }
);
```

---

## Next Steps

1. **Implement Stage 1**: Query decomposition (30 min)
2. **Implement Stage 2**: Parallel search (1.5 hours)
3. **Implement Stage 3**: Compilation (1 hour)
4. **Implement Stage 4**: Synthesis (1 hour)
5. **Implement Stage 5**: Recommendations (45 min)
6. **Wire API route** (30 min)
7. **Build frontend** (1.5 hours)
8. **Test e2e** (1 hour)

**Total: 6-8 hours**

---

## Decision: Start Stage 1 Today?

The pipeline is designed to be **incremental**. You can:
- ✅ Build stages 1-3 first (fast iteration)
- ✅ Test without synthesis (use raw results)
- ✅ Add stages 4-5 later

Want me to scaffold the decomposer and parallel launcher now?
