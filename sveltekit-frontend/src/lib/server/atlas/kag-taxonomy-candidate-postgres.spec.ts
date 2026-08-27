import { describe, expect, it, vi } from 'vitest';
import { createTaxonomyAssignmentCandidateV1 } from './taxonomy/entity-concept-taxonomy-v1.js';

const queryMock = vi.fn();
const persistHyperedgesMock = vi.fn();
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));
vi.mock('./kag-hyperedge-postgres.js', () => ({ persistHyperedges: (...args: unknown[]) => persistHyperedgesMock(...args) }));

function candidate(overrides: Partial<Parameters<typeof createTaxonomyAssignmentCandidateV1>[0]> = {}) {
  return createTaxonomyAssignmentCandidateV1({
    entityId: 'symbol:searchCandidates',
    conceptId: 'concept:semantic-retrieval',
    taxonomyRevision: 'taxonomy:1',
    semanticRevision: 'semantic_768:7',
    graphRevision: 'graph:9',
    evidenceRefs: ['source:span:1'],
    producerRevision: 'taxonomy-candidate:1',
    ...overrides,
  });
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  const c = candidate();
  return {
    candidate_id: c.candidateId,
    entity_id: c.entityId,
    concept_id: c.conceptId,
    taxonomy_revision: c.taxonomyRevision,
    semantic_revision: c.semanticRevision,
    graph_revision: c.graphRevision,
    semantic_neighbor_refs: [],
    community_refs: [],
    graph_evidence_refs: [],
    lexical_evidence_refs: [],
    nlp_evidence_refs: [],
    evidence_refs: c.evidenceRefs,
    semantic_score: null,
    community_affinity: null,
    graph_support: null,
    lexical_support: null,
    nlp_support: null,
    status: 'proposed',
    producer_revision: c.producerRevision,
    ...overrides,
  };
}

describe('persistTaxonomyAssignmentCandidates', () => {
  it('is a no-op for an empty array (never queries)', async () => {
    queryMock.mockClear();
    const { persistTaxonomyAssignmentCandidates } = await import('./kag-taxonomy-candidate-postgres.js');
    const result = await persistTaxonomyAssignmentCandidates([]);
    expect(result).toEqual({ attempted: 0, written: 0, errors: [] });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('upserts without touching status/review columns', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });
    const { persistTaxonomyAssignmentCandidates } = await import('./kag-taxonomy-candidate-postgres.js');
    const result = await persistTaxonomyAssignmentCandidates([candidate()]);

    expect(result).toEqual({ attempted: 1, written: 1, errors: [] });
    const sql = queryMock.mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT (candidate_id) DO UPDATE');
    expect(sql).not.toContain('status = EXCLUDED.status');
    expect(sql).not.toContain('promoted_hyperedge_id = EXCLUDED');
  });
});

describe('decideTaxonomyAssignmentCandidateV1', () => {
  it('throws a coded error when the candidate does not exist', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValueOnce({ rows: [] });
    const { decideTaxonomyAssignmentCandidateV1 } = await import('./kag-taxonomy-candidate-postgres.js');

    await expect(
      decideTaxonomyAssignmentCandidateV1({
        candidateId: 'missing',
        decision: 'rejected',
        reviewedBy: 'reviewer-1',
        workspaceRevision: 'workspace:1',
        sourceRevision: 'source:1',
        graphRevision: 'graph:1',
        promotionEvidenceRefs: [],
        producerRevision: 'review:1',
      })
    ).rejects.toThrow('TAXONOMY_CANDIDATE_NOT_FOUND:missing');
  });

  it('throws a coded error when the candidate was already decided', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValueOnce({ rows: [candidateRow({ status: 'promoted' })] });
    const { decideTaxonomyAssignmentCandidateV1 } = await import('./kag-taxonomy-candidate-postgres.js');

    await expect(
      decideTaxonomyAssignmentCandidateV1({
        candidateId: candidateRow().candidate_id as string,
        decision: 'rejected',
        reviewedBy: 'reviewer-1',
        workspaceRevision: 'workspace:1',
        sourceRevision: 'source:1',
        graphRevision: 'graph:1',
        promotionEvidenceRefs: [],
        producerRevision: 'review:1',
      })
    ).rejects.toThrow(/TAXONOMY_CANDIDATE_ALREADY_DECIDED:.*:promoted/);
  });

  it('rejection updates status only, never calls persistHyperedges', async () => {
    queryMock.mockClear();
    persistHyperedgesMock.mockClear();
    const row = candidateRow();
    queryMock.mockResolvedValueOnce({ rows: [row] }); // SELECT
    queryMock.mockResolvedValueOnce({ rows: [] }); // UPDATE status='rejected'
    const { decideTaxonomyAssignmentCandidateV1 } = await import('./kag-taxonomy-candidate-postgres.js');

    const result = await decideTaxonomyAssignmentCandidateV1({
      candidateId: row.candidate_id as string,
      decision: 'rejected',
      reviewedBy: 'reviewer-1',
      workspaceRevision: 'workspace:1',
      sourceRevision: 'source:1',
      graphRevision: 'graph:1',
      promotionEvidenceRefs: [],
      producerRevision: 'review:1',
    });

    expect(result).toEqual({ outcome: 'rejected', candidateId: row.candidate_id });
    expect(persistHyperedgesMock).not.toHaveBeenCalled();
    expect((queryMock.mock.calls[1][0] as string)).toContain("status = 'rejected'");
  });

  it('promotion commits candidate status first, then persists the hyperedge and links it back', async () => {
    queryMock.mockClear();
    persistHyperedgesMock.mockClear();
    const row = candidateRow();
    queryMock.mockResolvedValueOnce({ rows: [row] }); // SELECT
    queryMock.mockResolvedValueOnce({ rows: [] }); // UPDATE status='promoted'
    queryMock.mockResolvedValueOnce({ rows: [] }); // UPDATE promoted_hyperedge_id
    persistHyperedgesMock.mockResolvedValue({ attempted: 1, written: 1, errors: [] });
    const { decideTaxonomyAssignmentCandidateV1 } = await import('./kag-taxonomy-candidate-postgres.js');

    const result = await decideTaxonomyAssignmentCandidateV1({
      candidateId: row.candidate_id as string,
      decision: 'promoted',
      reviewedBy: 'reviewer-1',
      workspaceRevision: 'workspace:1',
      sourceRevision: 'source:1',
      graphRevision: 'graph:1',
      promotionEvidenceRefs: ['review:approved:1'],
      producerRevision: 'review:1',
    });

    expect(result.outcome).toBe('promoted');
    expect((queryMock.mock.calls[1][0] as string)).toContain("status = 'promoted'");
    expect(persistHyperedgesMock).toHaveBeenCalledTimes(1);
    expect((queryMock.mock.calls[2][0] as string)).toContain('promoted_hyperedge_id');
  });

  it('reports promoted_degraded (not a false success) when the hyperedge write fails after status commits', async () => {
    queryMock.mockClear();
    persistHyperedgesMock.mockClear();
    const row = candidateRow();
    queryMock.mockResolvedValueOnce({ rows: [row] }); // SELECT
    queryMock.mockResolvedValueOnce({ rows: [] }); // UPDATE status='promoted' (still succeeds)
    persistHyperedgesMock.mockResolvedValue({ attempted: 1, written: 0, errors: [{ hyperedgeId: 'x', message: 'db down' }] });
    const { decideTaxonomyAssignmentCandidateV1 } = await import('./kag-taxonomy-candidate-postgres.js');

    const result = await decideTaxonomyAssignmentCandidateV1({
      candidateId: row.candidate_id as string,
      decision: 'promoted',
      reviewedBy: 'reviewer-1',
      workspaceRevision: 'workspace:1',
      sourceRevision: 'source:1',
      graphRevision: 'graph:1',
      promotionEvidenceRefs: ['review:approved:1'],
      producerRevision: 'review:1',
    });

    expect(result).toEqual({ outcome: 'promoted_degraded', candidateId: row.candidate_id, hyperedgeError: 'db down' });
    // Only 2 queries: SELECT + status UPDATE. No promoted_hyperedge_id UPDATE
    // was attempted since there's no hyperedge id to link.
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
