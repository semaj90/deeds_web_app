// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAdmin, listPendingTaxonomyAssignmentCandidates, decideTaxonomyAssignmentCandidateV1 } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listPendingTaxonomyAssignmentCandidates: vi.fn(),
  decideTaxonomyAssignmentCandidateV1: vi.fn(),
}));

vi.mock('$lib/server/auth-utils.js', () => ({ requireAdmin }));
vi.mock('$lib/server/atlas/kag-taxonomy-candidate-postgres.js', () => ({
  listPendingTaxonomyAssignmentCandidates,
  decideTaxonomyAssignmentCandidateV1,
}));

function fakeEvent(body?: unknown, searchParams: Record<string, string> = {}) {
  return {
    locals: { user: { id: 'reviewer-1', role: 'admin' } },
    url: { searchParams: new URLSearchParams(searchParams) },
    request: { json: async () => body },
  } as never;
}

describe('/api/admin/atlas/taxonomy-candidates', () => {
  let GET: typeof import('./+server.js').GET;
  let POST: typeof import('./+server.js').POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET, POST } = await import('./+server.js'));
  });

  it('GET: rejects unauthenticated/non-admin requests (401/403 surfaced by requireAdmin)', async () => {
    requireAdmin.mockImplementation(() => {
      const err = new Error('Admin access required') as Error & { status: number };
      err.status = 403;
      throw err;
    });

    await expect(GET(fakeEvent())).rejects.toThrow('Admin access required');
    expect(listPendingTaxonomyAssignmentCandidates).not.toHaveBeenCalled();
  });

  it('POST: 400 when required fields are missing', async () => {
    requireAdmin.mockReturnValue({ id: 'reviewer-1' });

    const response = await POST(fakeEvent({ decision: 'rejected' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('candidateId');
  });

  it('GET: 200 with pending candidates on success', async () => {
    requireAdmin.mockReturnValue({ id: 'reviewer-1' });
    listPendingTaxonomyAssignmentCandidates.mockResolvedValue([
      { candidateId: 'taxonomy-candidate:1', status: 'proposed' },
    ]);

    const response = await GET(fakeEvent(undefined, { limit: '10' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.candidates).toHaveLength(1);
    expect(listPendingTaxonomyAssignmentCandidates).toHaveBeenCalledWith(10);
  });

  it('POST: surfaces a degraded (promoted but hyperedge write failed) decision without pretending full success', async () => {
    requireAdmin.mockReturnValue({ id: 'reviewer-1' });
    decideTaxonomyAssignmentCandidateV1.mockResolvedValue({
      outcome: 'promoted_degraded',
      candidateId: 'taxonomy-candidate:1',
      hyperedgeError: 'connection refused',
    });

    const response = await POST(
      fakeEvent({
        candidateId: 'taxonomy-candidate:1',
        decision: 'promoted',
        reviewedBy: 'reviewer-1',
        workspaceRevision: 'workspace:1',
        sourceRevision: 'source:1',
        graphRevision: 'graph:1',
        producerRevision: 'taxonomy-review:1',
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.outcome).toBe('promoted_degraded');
    expect(body.result.hyperedgeError).toBe('connection refused');
  });

  it('POST: 409 when the candidate was already decided', async () => {
    requireAdmin.mockReturnValue({ id: 'reviewer-1' });
    decideTaxonomyAssignmentCandidateV1.mockRejectedValue(
      new Error('TAXONOMY_CANDIDATE_ALREADY_DECIDED:taxonomy-candidate:1:promoted')
    );

    const response = await POST(
      fakeEvent({ candidateId: 'taxonomy-candidate:1', decision: 'rejected', reviewedBy: 'reviewer-1' })
    );

    expect(response.status).toBe(409);
  });
});
