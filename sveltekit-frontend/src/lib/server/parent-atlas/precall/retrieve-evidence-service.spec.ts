import { beforeEach, describe, expect, it, vi } from 'vitest';

const { parallelRetrieve } = vi.hoisted(() => ({ parallelRetrieve: vi.fn() }));

vi.mock('$lib/server/retrieval/parallel-orchestrator.js', () => ({
  parallelRetrieve: (...args: unknown[]) => parallelRetrieve(...args),
}));

vi.mock('$lib/server/embedding/canonical-embed.js', () => ({
  tryEmbedCanonical: vi.fn(async () => null),
}));

describe('retrieveEvidence lineage boundary', () => {
  beforeEach(() => {
    parallelRetrieve.mockReset();
  });

  it('keeps executor IDs distinct and returns only lineage present in result metadata', async () => {
    parallelRetrieve.mockResolvedValue({
      results: [{
        id: 'qdrant-point-77',
        source: 'qdrant',
        score: 0.82,
        relativeScore: 0.82,
        metadata: {
          packet_key: 'packet:canonical-77',
          source_ref: 'src/example.ts',
          source_revision: 'sha256:source',
          workspace_revision: 'sha256:result-workspace',
        },
      }],
      lanes: [],
    });

    const { retrieveEvidence } = await import('./retrieve-evidence-service.js');
    const result = await retrieveEvidence({
      query: 'example',
      workspaceRevision: 'sha256:requested-workspace',
      lanes: ['lexical'],
    });

    expect(result.workspaceRevision).toBe('sha256:requested-workspace');
    expect(result.evidence[0]).toEqual({
      candidateId: 'qdrant-point-77',
      packetKey: 'packet:canonical-77',
      sourceRef: 'src/example.ts',
      sourceRevision: 'sha256:source',
      workspaceRevision: 'sha256:result-workspace',
      score: 0.82,
    });
  });

  it('does not manufacture packet or source identity or copy the requested revision onto a hit', async () => {
    parallelRetrieve.mockResolvedValue({
      results: [{ id: 'legacy-id-1', source: 'postgres', score: 0.4, relativeScore: 0.4 }],
      lanes: [],
    });

    const { retrieveEvidence } = await import('./retrieve-evidence-service.js');
    const result = await retrieveEvidence({
      query: 'legacy',
      workspaceRevision: 'sha256:requested-workspace',
      lanes: ['lexical'],
    });

    expect(result.evidence[0]).toEqual({
      candidateId: 'legacy-id-1',
      packetKey: null,
      sourceRef: null,
      sourceRevision: null,
      workspaceRevision: null,
      score: 0.4,
    });
  });
});
