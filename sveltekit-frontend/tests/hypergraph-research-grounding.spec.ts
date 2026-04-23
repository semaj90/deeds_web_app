/**
 * hypergraph-research-grounding.spec.ts  (Part A)
 *
 * Regression test: assembleAceContext → linkResearchBatchToSession wiring.
 *
 * Proves the exact bugs found in live verification (April 2026) are fixed:
 *   - assembleAceContext now propagates sessionId to linkResearchBatchToSession
 *   - source-priority sort (official_docs > reddit_post) is preserved in output
 *
 * Part B (MERGE cypher semantics) lives in hypergraph-merge-semantics.spec.ts
 * because vi.mock is file-scoped and the two parts need conflicting mock topologies:
 *   Part A mocks '$lib/server/ai/hypergraph-store.js' (spy pattern)
 *   Part B keeps the real linkResearchToSession + mocks '$lib/server/neo4j-driver.js'
 */

// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── vi.hoisted: all mock fns + fixture declared before vi.mock factories run ──
const { mockLinkResearchBatch, mockGetResearchContext, MOCK_RESEARCH } = vi.hoisted(() => {
  const MOCK_RESEARCH = [
    { chunk_id: 'c1', source: 'official_docs', url: 'https://svelte.dev/blog/runes',              title: 'Runes',  body: 'Svelte 5 runes intro', score: 0.82, semantic_tags: ['svelte5'] },
    { chunk_id: 'c2', source: 'github_issue',  url: 'https://github.com/sveltejs/svelte/issues/1', title: 'Issue',  body: 'perf bug',            score: 0.74, semantic_tags: [] },
    { chunk_id: 'c3', source: 'reddit_post',   url: 'https://reddit.com/r/sveltejs/1',             title: 'Reddit', body: 'community post',       score: 0.91, semantic_tags: [] },
  ];
  return {
    mockLinkResearchBatch: vi.fn(),
    mockGetResearchContext: vi.fn(),
    MOCK_RESEARCH,
  };
});

// ── Shared environment + Postgres stubs ───────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({
  ENV: { NEO4J_URI: 'bolt://localhost:7687', NEO4J_USER: 'neo4j', NEO4J_PASSWORD: 'test' },
}));
vi.mock('$lib/server/db/client.js', () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('$lib/server/ai/hypergraph-store.js', () => ({
  linkResearchBatchToSession: (...args: unknown[]) => mockLinkResearchBatch(...args),
  recordSessionStart: vi.fn(),
  recordInferenceStep: vi.fn(),
}));

vi.mock('$lib/server/grpc/retrieval-client.js', () => ({
  retrievalClient: {
    getResearchContext: (...args: unknown[]) => mockGetResearchContext(...args),
  },
}));

// ══════════════════════════════════════════════════════════════════════════════
// Part A — assembleAceContext session wiring
// Mocks linkResearchBatchToSession directly (spy) — no Neo4j timing dependency
// ══════════════════════════════════════════════════════════════════════════════

describe('Part A — assembleAceContext session wiring', () => {

  let assembleAceContext: (query: string, opts?: Record<string, unknown>) => Promise<{
    researchContext?: Array<{ source: string; url: string; score: number }>;
  }>;

  beforeEach(async () => {
    // Re-establish implementations each test because tests/setup.ts calls
    // vi.restoreAllMocks() in afterEach, which strips .mockImplementation().
    // The vi.mock factory delegates to hoisted fns, so re-setting here is
    // sufficient — the factory wrapper is never cleared.
    mockLinkResearchBatch.mockResolvedValue(undefined);
    mockGetResearchContext.mockResolvedValue({
      research: MOCK_RESEARCH.map((chunk) => ({
        id: chunk.chunk_id,
        chunkId: chunk.chunk_id,
        source: chunk.source,
        url: chunk.url,
        title: chunk.title,
        body: chunk.body,
        score: chunk.score,
        semanticTags: chunk.semantic_tags,
      })),
      totalMs: 12,
      source: 'grpc',
    });

    const mod = await import('$lib/server/ace/codeintel-datastore.js');
    assembleAceContext = mod.assembleAceContext as typeof assembleAceContext;
  });

  it('1. sessionId propagation: linkResearchBatchToSession called once with the session id', async () => {
    const sessionId = crypto.randomUUID();

    await assembleAceContext('svelte runes performance', { includeResearch: true, sessionId });

    expect(mockLinkResearchBatch).toHaveBeenCalledTimes(1);
    expect(mockLinkResearchBatch.mock.calls[0]?.[0]).toBe(sessionId);
  });

  it('2. Call args: correct url, source, and score array passed to the batch helper', async () => {
    const sessionId = crypto.randomUUID();

    await assembleAceContext('svelte runes performance', { includeResearch: true, sessionId });

    expect(mockLinkResearchBatch).toHaveBeenCalledWith(
      sessionId,
      MOCK_RESEARCH.map((chunk) => ({
        url: chunk.url,
        source: chunk.source,
        relevance: chunk.score,
      }))
    );
  });

  it('3. includeResearch: false → linkResearchBatchToSession never called', async () => {
    const sessionId = crypto.randomUUID();

    await assembleAceContext('svelte runes performance', { includeResearch: false, sessionId });

    expect(mockLinkResearchBatch).not.toHaveBeenCalled();
  });

  it('4. No sessionId → linkResearchBatchToSession never called', async () => {
    await assembleAceContext('svelte runes performance', { includeResearch: true });

    expect(mockLinkResearchBatch).not.toHaveBeenCalled();
  });

  it('5. Trust-priority: researchContext sorted official_docs < github_issue < reddit_post', async () => {
    const ctx = await assembleAceContext('svelte runes performance', { includeResearch: true });

    const PRIORITY: Record<string, number> = {
      official_docs: 0, github_issue: 1, github_code: 2,
      github_repo: 3, web_page: 4, reddit_post: 5,
    };

    const research = ctx.researchContext ?? [];
    expect(research.length).toBe(MOCK_RESEARCH.length);

    for (let i = 1; i < research.length; i++) {
      const prev = PRIORITY[research[i - 1].source] ?? 99;
      const curr = PRIORITY[research[i].source] ?? 99;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }

    // official_docs (priority 0, score 0.82) must beat reddit_post (priority 5, score 0.91)
    const officialIdx = research.findIndex((r) => r.source === 'official_docs');
    const redditIdx = research.findIndex((r) => r.source === 'reddit_post');
    expect(officialIdx).toBeLessThan(redditIdx);
  });
});


