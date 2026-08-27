import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-utils.js';
import {
  listPendingTaxonomyAssignmentCandidates,
  decideTaxonomyAssignmentCandidateV1,
} from '$lib/server/atlas/kag-taxonomy-candidate-postgres.js';

const DEFAULT_LIMIT = 50;

/**
 * KAG taxonomy-assignment review surface (roadmap step 2).
 * GET  -> pending candidates ('proposed' | 'review_required'), oldest first.
 * POST -> submit a human decision (promote or reject) for one candidate.
 */

export const GET: RequestHandler = async (event) => {
  requireAdmin(event);
  try {
    const limitParam = event.url.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : DEFAULT_LIMIT;
    const candidates = await listPendingTaxonomyAssignmentCandidates(Number.isFinite(limit) ? limit : DEFAULT_LIMIT);
    return json({ ok: true, candidates });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};

interface DecisionRequestBody {
  candidateId?: string;
  decision?: 'promoted' | 'rejected';
  reviewedBy?: string;
  workspaceRevision?: string;
  sourceRevision?: string;
  graphRevision?: string;
  promotionEvidenceRefs?: string[];
  producerRevision?: string;
}

export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  try {
    const body = (await event.request.json()) as DecisionRequestBody;

    if (!body.candidateId?.trim()) return json({ ok: false, error: 'candidateId is required' }, { status: 400 });
    if (body.decision !== 'promoted' && body.decision !== 'rejected') {
      return json({ ok: false, error: "decision must be 'promoted' or 'rejected'" }, { status: 400 });
    }
    if (!body.reviewedBy?.trim()) return json({ ok: false, error: 'reviewedBy is required' }, { status: 400 });
    if (body.decision === 'promoted') {
      if (!body.workspaceRevision?.trim() || !body.sourceRevision?.trim() || !body.graphRevision?.trim() || !body.producerRevision?.trim()) {
        return json({ ok: false, error: 'workspaceRevision, sourceRevision, graphRevision, and producerRevision are required to promote' }, { status: 400 });
      }
    }

    const result = await decideTaxonomyAssignmentCandidateV1({
      candidateId: body.candidateId,
      decision: body.decision,
      reviewedBy: body.reviewedBy,
      workspaceRevision: body.workspaceRevision ?? '',
      sourceRevision: body.sourceRevision ?? '',
      graphRevision: body.graphRevision ?? '',
      promotionEvidenceRefs: body.promotionEvidenceRefs ?? [],
      producerRevision: body.producerRevision ?? '',
    });

    return json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('TAXONOMY_CANDIDATE_NOT_FOUND:')) return json({ ok: false, error: message }, { status: 404 });
    if (message.startsWith('TAXONOMY_CANDIDATE_ALREADY_DECIDED:')) return json({ ok: false, error: message }, { status: 409 });
    return json({ ok: false, error: message }, { status: 500 });
  }
};
