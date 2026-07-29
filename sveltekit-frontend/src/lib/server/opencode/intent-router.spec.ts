// @vitest-environment node

import { describe, expect, it } from 'vitest';

describe('opencode intent router', () => {
  it('routes lexical keyword requests to ripgrep', async () => {
    const { classifyOpenCodeIntent, chooseOpenCodeAction } = await import('./intent-router.js');

    const heuristic = classifyOpenCodeIntent('find keyword references for packet identity');
    expect(heuristic.action).toBe('search_rg');
    expect(heuristic.routeHints).toContain('codebase.rg_search');

    const selected = chooseOpenCodeAction(
      { action: 'auto', confidence: 0.1, reason: 'fallback', routeHints: [] },
      heuristic
    );
    expect(selected.action).toBe('search_rg');
  });

  it('routes structural implementation requests to codebase search', async () => {
    const { classifyOpenCodeIntent } = await import('./intent-router.js');

    const heuristic = classifyOpenCodeIntent('where is the AST wiring for opencode dispatch');
    expect(heuristic.action).toBe('search_codebase');
    expect(heuristic.routeHints).toContain('trace.kag_search');
  });

  it('routes semantic and centroid-heavy requests to qdrant', async () => {
    const { classifyOpenCodeIntent } = await import('./intent-router.js');

    const heuristic = classifyOpenCodeIntent('use embeddings, centroids, and HyperRAG synthesis for ACE packets');
    expect(heuristic.action).toBe('query_qdrant');
    expect(heuristic.routeHints).toContain('redis.centroid_lookup');
  });
});
