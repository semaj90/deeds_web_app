import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { requireAdmin } from '$lib/server/auth-utils.js';
import {
  listPendingTaxonomyAssignmentCandidates,
  decideTaxonomyAssignmentCandidateV1,
} from '$lib/server/atlas/kag-taxonomy-candidate-postgres.js';

const DEFAULT_LIMIT = 50;

const taxonomyCandidateDecisionRequestSchema = z.object({
  candidateId: z.string().trim().min(1).max(512),
  decision: z.enum(['promoted', 'rejected']),
  reviewedBy: z.string().trim().min(1).max(255).optional(),
  workspaceRevision: z.string().trim().min(1).max(512).optional(),
  sourceRevision: z.string().trim().min(1).max(512).optional(),
  graphRevision: z.string().trim().min(1).max(512).optional(),
  promotionEvidenceRefs: z.array(z.string().trim().min(1).max(512)).max(64).optional(),
  producerRevision: z.string().trim().min(1).max(512).optional(),
}).strict().superRefine((body, context) => {
  if (body.decision !== 'promoted') return;
  for (const field of ['workspaceRevision', 'sourceRevision', 'graphRevision', 'producerRevision'] as const) {
    if (!body[field]) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'required for promotion' });
  }
});

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

export const POST: RequestHandler = async (event) => {
  const admin = requireAdmin(event);
  try {
    let rawBody: unknown;
    try {
      rawBody = await event.request.json();
    } catch {
      return json({ ok: false, error: 'invalid JSON request body' }, { status: 400 });
    }
    const parsed = taxonomyCandidateDecisionRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const issueDetails = parsed.error.issues.map((i) => i.path.join('.')).filter(Boolean).join(', ');
      const errorMessage = issueDetails
        ? `invalid taxonomy candidate decision: missing or invalid ${issueDetails}`
        : 'invalid taxonomy candidate decision';
      return json({ ok: false, error: errorMessage, issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;
    if (!admin.id.trim()) return json({ ok: false, error: 'authenticated admin identity is unavailable' }, { status: 401 });

    const result = await decideTaxonomyAssignmentCandidateV1({
      candidateId: body.candidateId,
      decision: body.decision,
      reviewedBy: admin.id,
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
