import { describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }));

const FIXED_UPDATED_AT = new Date('2026-06-29T00:00:00.000Z');

function seedRows() {
  return [
    {
      group_id: 'devops',
      group_label: 'DevOps & Infrastructure',
      parent_group_id: null,
      examples: ['docker-compose', 'CI/CD', 'Kubernetes'],
      updated_at: FIXED_UPDATED_AT,
    },
    {
      group_id: 'devops.env-config',
      group_label: 'Environment Configuration',
      parent_group_id: 'devops',
      examples: ['.env files', 'docker compose', 'config loading', 'secrets'],
      updated_at: FIXED_UPDATED_AT,
    },
    {
      group_id: 'retrieval',
      group_label: 'Information Retrieval',
      parent_group_id: null,
      examples: ['Qdrant', 'BM25', 'vector search'],
      updated_at: FIXED_UPDATED_AT,
    },
  ];
}

describe('OAKLIB-equivalent resolution boundary (ontology-resolution-boundary-postgres)', () => {
  it('resolves a known label via alias match (spec.md: known label resolves)', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: seedRows() });
    const { resolveOntologyLabelV1 } = await import('./ontology-resolution-boundary-postgres.js');

    const result = await resolveOntologyLabelV1({
      schemaVersion: 'atlas.ontology-resolution-request.v1',
      label: 'vector search',
    });

    expect(result.resolutionState).toBe('RESOLVED');
    expect(result.conceptId).toBe('concept:retrieval');
    expect(result.matchMethod).toBe('alias');
  });

  it('does not invent a concept for an unknown label (spec.md: unknown label does not resolve)', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: seedRows() });
    const { resolveOntologyLabelV1 } = await import('./ontology-resolution-boundary-postgres.js');

    const result = await resolveOntologyLabelV1({
      schemaVersion: 'atlas.ontology-resolution-request.v1',
      label: 'quantum blockchain nft',
    });

    expect(result.resolutionState).toBe('UNRESOLVED');
    expect(result.conceptId).toBeNull();
    expect(result.matchMethod).toBe('none');
    // no new vocabulary row was written as a side effect
    expect(queryMock).not.toHaveBeenCalledWith(expect.stringContaining('INSERT'));
  });

  it('walks the real parent_group_id ancestor chain (spec.md: ancestor walk)', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: seedRows() });
    const { resolveOntologyAncestorsV1 } = await import('./ontology-resolution-boundary-postgres.js');

    const result = await resolveOntologyAncestorsV1({
      schemaVersion: 'atlas.ontology-ancestor-request.v1',
      conceptId: 'concept:devops.env-config',
    });

    expect(result.resolutionState).toBe('RESOLVED');
    expect(result.ancestorConceptIds).toEqual(['concept:devops']);
  });

  it('treats a caller-supplied packetKey as passthrough only, never validated or minted', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({ rows: seedRows() });
    const { resolveOntologyLabelV1 } = await import('./ontology-resolution-boundary-postgres.js');

    const result = await resolveOntologyLabelV1({
      schemaVersion: 'atlas.ontology-resolution-request.v1',
      label: 'vector search',
      callerContext: { packetKey: 'packet:not-a-real-packet-key' },
    });

    expect(result.callerContext?.packetKey).toBe('packet:not-a-real-packet-key');
    // the resolver never queries anything keyed by packetKey
    for (const call of queryMock.mock.calls) {
      expect(String(call[0])).not.toContain('packet_key');
    }
  });

  it('returns RESOLUTION_UNAVAILABLE (not a fabricated match) when the boundary is unreachable', async () => {
    queryMock.mockClear();
    queryMock.mockRejectedValue(new Error('connection refused'));
    const { resolveOntologyLabelV1 } = await import('./ontology-resolution-boundary-postgres.js');

    const result = await resolveOntologyLabelV1({
      schemaVersion: 'atlas.ontology-resolution-request.v1',
      label: 'vector search',
    });

    expect(result.resolutionState).toBe('RESOLUTION_UNAVAILABLE');
    expect(result.conceptId).toBeNull();
  });

  it('returns AMBIGUOUS rather than silently picking one match', async () => {
    queryMock.mockClear();
    queryMock.mockResolvedValue({
      rows: [
        ...seedRows(),
        {
          group_id: 'retrieval.dup',
          group_label: 'Duplicate Retrieval Concept',
          parent_group_id: 'retrieval',
          examples: ['vector search'],
          updated_at: FIXED_UPDATED_AT,
        },
      ],
    });
    const { resolveOntologyLabelV1 } = await import('./ontology-resolution-boundary-postgres.js');

    const result = await resolveOntologyLabelV1({
      schemaVersion: 'atlas.ontology-resolution-request.v1',
      label: 'vector search',
    });

    expect(result.resolutionState).toBe('AMBIGUOUS');
    expect(result.conceptId).toBeNull();
    expect(result.candidateConceptIds.sort()).toEqual(['concept:retrieval', 'concept:retrieval.dup']);
  });
});
