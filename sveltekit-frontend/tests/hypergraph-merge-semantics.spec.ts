/**
 * hypergraph-merge-semantics.spec.ts  (Part B)
 *
 * Unit test for linkResearchToSession MERGE semantics.
 *
 * Guards against the silent-failure bug (April 2026):
 *   MATCH (s:InteractiveSession ...) returned nothing when session didn't pre-exist,
 *   causing CONSULTED_RESEARCH edges to never be created.
 *   Fix: MERGE instead of MATCH — auto-creates the InteractiveSession node.
 *
 * Lives separately from hypergraph-research-grounding.spec.ts because both
 * files need different vi.mock topologies for '$lib/server/ai/hypergraph-store.js':
 *   Part A: mock it (spy on calls from assembleAceContext)
 *   Part B: keep it real (verify its own Cypher via neo4j-driver mock)
 *
 * Tests:
 *   1. MERGE present: InteractiveSession created without prior recordSessionStart
 *   2. ResearchSource + CONSULTED_RESEARCH are MERGEd (not MATCH+CREATE)
 *   3. Edge payload: relevance = passed score, timestamp = datetime()
 */

// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Environment stubs ─────────────────────────────────────────────────────────

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/server/env.server.js', () => ({
  ENV: { NEO4J_URI: 'bolt://localhost:7687', NEO4J_USER: 'neo4j', NEO4J_PASSWORD: 'test' },
}));

// ── Neo4j driver mock — captures every run() call ────────────────────────────

const runCalls: Array<{ cypher: string; params: Record<string, unknown> }> = [];
const mockNeoRun = vi.fn(async (cypher: string, params: Record<string, unknown>) => {
  runCalls.push({ cypher, params });
});
const mockNeoSession = {
  run: mockNeoRun,
  close: vi.fn().mockResolvedValue(undefined),
};
const mockDriver = { session: vi.fn(() => mockNeoSession) };

vi.mock('$lib/server/neo4j-driver.js', () => ({
  getNeo4jDriver: () => mockDriver,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('linkResearchToSession — MERGE semantics', () => {

  beforeEach(() => {
    runCalls.length = 0;
    mockNeoRun.mockClear();
    mockNeoSession.close.mockClear();
    mockDriver.session.mockClear();
  });

  it('1. MERGE (not MATCH) creates InteractiveSession without prior recordSessionStart', async () => {
    const { linkResearchToSession } = await import('$lib/server/ai/hypergraph-store.js');

    // Fresh UUID — no recordSessionStart called, no pre-existing node
    await linkResearchToSession(
      crypto.randomUUID(),
      'https://svelte.dev/blog/runes',
      'official_docs',
      0.82
    );

    expect(runCalls.length).toBeGreaterThan(0);
    const cypher = runCalls[0].cypher;

    // Must use MERGE for the session node
    expect(cypher).toMatch(/MERGE\s+\(s:InteractiveSession/);

    // Must NOT use a bare MATCH that would silently return nothing
    expect(cypher).not.toMatch(/^MATCH\s+\(s:InteractiveSession/m);
  });

  it('2. ResearchSource node and CONSULTED_RESEARCH edge are MERGEd', async () => {
    const { linkResearchToSession } = await import('$lib/server/ai/hypergraph-store.js');

    await linkResearchToSession(
      crypto.randomUUID(),
      'https://github.com/sveltejs/svelte/issues/1',
      'github_issue',
      0.74
    );

    const cypher = runCalls[0]?.cypher ?? '';
    expect(cypher).toMatch(/MERGE\s+\(r:ResearchSource/);
    expect(cypher).toMatch(/MERGE\s+\(s\)-\[rel:CONSULTED_RESEARCH\]->\(r\)/);
  });

  it('3. Edge payload: relevance = passed score, rel.timestamp = datetime()', async () => {
    const { linkResearchToSession } = await import('$lib/server/ai/hypergraph-store.js');

    const score = 0.735;
    const sessionId = crypto.randomUUID();
    const url = 'https://reddit.com/r/sveltejs/1';

    await linkResearchToSession(sessionId, url, 'reddit_post', score);

    expect(runCalls.length).toBeGreaterThan(0);
    const { cypher, params } = runCalls[0];

    expect(params.sessionId).toBe(sessionId);
    expect(params.chunkUrl).toBe(url);
    expect(params.source).toBe('reddit_post');
    expect(params.relevance).toBe(score);
    expect(cypher).toContain('rel.relevance = $relevance');
    expect(cypher).toContain('rel.timestamp = datetime()');
  });
});
