import { describe, expect, it } from 'vitest';
import { HELPER_REGISTRY_V1 } from './helper-registry-v1';
import { combineViaRRF, type ContextHit } from '../../retrieval/rrf-combiner';
import { normalizeRetrievalLane, type CanonicalFusionLane } from '../../retrieval/retrieval-lane-aliases';

/**
 * MCP-LANE-VOTE-01 (guard form). Freezes how each canonical helper-registry entry relates to a
 * fusion vote. It adds no new fusion owner: the vote arithmetic stays in `rrf-combiner.ts` and the
 * alias vocabulary in `retrieval-lane-aliases.ts`. A helper added to the registry without a row
 * here fails this spec, so a new helper cannot silently become a second vote for an existing lane.
 *
 * ROLE meanings
 *   VOTING_EXECUTOR  produces ranked candidates; collapses into the named logical lane (one vote
 *                    per logical lane per candidate, not per helper)
 *   EVIDENCE         structural/grounding evidence; never a fusion vote, never identity
 *   FEATURE          graph/doc-derived feature; cannot create identity and has no fusion lane
 */
type Role = 'VOTING_EXECUTOR' | 'EVIDENCE' | 'FEATURE';
const HELPER_VOTE_MAP: Record<string, { role: Role; lane: CanonicalFusionLane | null; executorNames?: string[] }> = {
  'rg-exact': { role: 'VOTING_EXECUTOR', lane: 'rg' },
  'postgres-fts': { role: 'VOTING_EXECUTOR', lane: 'lexical', executorNames: ['lexical'] },
  'postgres-trigram': { role: 'VOTING_EXECUTOR', lane: 'lexical', executorNames: ['postgres_trigram'] },
  'semantic-768': { role: 'VOTING_EXECUTOR', lane: 'dense', executorNames: ['dense_768', 'qdrant', 'turbovec', 'cuvs', 'cagra'] },
  'ast-grep-structural': { role: 'VOTING_EXECUTOR', lane: 'ast' },
  'tree-sitter-chunk': { role: 'EVIDENCE', lane: null },
  'ts-morph-symbol': { role: 'EVIDENCE', lane: null },
  'lsp-definition': { role: 'EVIDENCE', lane: null },
  'lsp-references': { role: 'EVIDENCE', lane: null },
  'langextract-grounding': { role: 'EVIDENCE', lane: null },
  'docs-corpus-search': { role: 'FEATURE', lane: null },
  'graph-ppr': { role: 'FEATURE', lane: null }
};

const hit = (id: string, source: ContextHit['source'], score = 1): ContextHit => ({ id, source, score });

describe('helper registry vs fusion votes', () => {
  it('classifies exactly the helpers in the canonical (v1) registry', () => {
    const ids = HELPER_REGISTRY_V1.entries.map((e) => e.helperId).sort();
    expect(Object.keys(HELPER_VOTE_MAP).sort()).toEqual(ids);
  });

  it('every voting helper maps to a canonical fusion lane; non-voting helpers map to none', () => {
    for (const [id, row] of Object.entries(HELPER_VOTE_MAP)) {
      if (row.role === 'VOTING_EXECUTOR') expect(row.lane, id).not.toBeNull();
      else expect(row.lane, id).toBeNull();
    }
  });

  it('executor names for dense and lexical lanes normalize to the declared lane', () => {
    for (const [id, row] of Object.entries(HELPER_VOTE_MAP)) {
      for (const name of row.executorNames ?? []) expect(normalizeRetrievalLane(name), `${id}:${name}`).toBe(row.lane);
    }
  });

  it('several helpers may share a lane only as executors under ONE vote (lexical)', () => {
    const byLane = new Map<string, string[]>();
    for (const [id, row] of Object.entries(HELPER_VOTE_MAP)) {
      if (row.role === 'VOTING_EXECUTOR' && row.lane) byLane.set(row.lane, [...(byLane.get(row.lane) ?? []), id]);
    }
    expect(byLane.get('lexical')?.sort()).toEqual(['postgres-fts', 'postgres-trigram']);
    expect(byLane.get('dense')).toEqual(['semantic-768']);
  });

  it('the combiner counts qdrant + turbovec + go semantic as ONE semantic vote', () => {
    const solo = combineViaRRF([[hit('a', 'qdrant_vector')]], ['qdrant_vector']);
    const triple = combineViaRRF(
      [[hit('a', 'qdrant_vector')], [hit('a', 'turbovec_ann')], [hit('a', 'go_retrieval_semantic')]],
      ['qdrant_vector', 'turbovec_ann', 'go_retrieval_semantic']
    );
    expect(triple).toHaveLength(1);
    expect(triple[0].combinedScore).toBeCloseTo(solo[0].combinedScore, 12);
    expect(new Set(triple[0].breakdown.map((b) => b.logicalLaneName))).toEqual(new Set(['semantic']));
    expect(triple[0].sources.length).toBe(3);
  });

  it('a candidate seen by two different logical lanes does get two votes (the intended fusion)', () => {
    const solo = combineViaRRF([[hit('a', 'qdrant_vector')]], ['qdrant_vector']);
    const both = combineViaRRF([[hit('a', 'qdrant_vector')], [hit('a', 'postgres_trigram')]], ['qdrant_vector', 'postgres_trigram']);
    expect(both[0].combinedScore).toBeGreaterThan(solo[0].combinedScore);
  });

  it('KNOWN GAP (documented, not fixed): cuvs/cagra are not RetrievalLaneName members of the combiner', () => {
    // retrieval-lane-aliases.ts collapses cuvs/cagra into 'dense', but rrf-combiner.ts types and
    // switches only qdrant_vector / go_retrieval_semantic / turbovec_ann. A cuVS executor must be
    // routed through one of those names (or the combiner widened) before it feeds fusion; adding
    // it as a fourth name that does not collapse would cast a second semantic vote.
    expect(normalizeRetrievalLane('cuvs')).toBe('dense');
    const rogue = combineViaRRF([[hit('a', 'qdrant_vector')], [hit('a', 'cuvs' as never)]], ['qdrant_vector', 'cuvs' as never]);
    const logical = new Set(rogue[0].breakdown.map((b) => b.logicalLaneName));
    expect(logical.size).toBe(2); // today: two votes. When the combiner is fixed this becomes 1 and this test must be updated.
  });
});
