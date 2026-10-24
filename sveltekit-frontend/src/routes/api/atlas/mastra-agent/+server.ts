import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { trace } from '@opentelemetry/api';
import { VerifiedContextRequestV1Schema, type VerifiedContextServiceV1 } from '$lib/server/atlas/execution/verified-context-service-v1.js';
import { z } from 'zod';

const RequestSchema = VerifiedContextRequestV1Schema.omit({ requestId: true });

function recordVerifiedContextOutcomeV1(input: {
  requestId: string;
  serviceHealth: 'AVAILABLE' | 'NOT_CONFIGURED' | 'ERROR';
  evidenceValidity: 'NOT_VERIFIED' | 'NOT_ADMITTED' | 'VERIFIED_NONCANONICAL';
  firstFailingBoundary: string | null;
  refusalCode: string | null;
}) {
  trace.getActiveSpan()?.setAttributes({
    'parent_atlas.request_id': input.requestId,
    'parent_atlas.service_health': input.serviceHealth,
    'parent_atlas.agent_execution_status': 'NOT_STARTED',
    'parent_atlas.evidence_validity': input.evidenceValidity,
    'parent_atlas.canonical_admission': 'NOT_ADMITTED',
    'parent_atlas.first_failing_boundary': input.firstFailingBoundary ?? 'NONE',
    'parent_atlas.refusal_code': input.refusalCode ?? 'NONE',
    'parent_atlas.writes_performed': false,
  });
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ success: false, error: 'Unauthorized', writesPerformed: false }, { status: 401 });
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await request.json());
  } catch {
    return json({ success: false, error: 'INVALID_REQUEST', writesPerformed: false }, { status: 400 });
  }

  const requestId = locals.requestId ?? crypto.randomUUID();
  const verifiedContextService = (locals as typeof locals & { verifiedContextService?: VerifiedContextServiceV1 }).verifiedContextService;
  if (!verifiedContextService) {
    recordVerifiedContextOutcomeV1({
      requestId, serviceHealth: 'NOT_CONFIGURED', evidenceValidity: 'NOT_VERIFIED',
      firstFailingBoundary: 'SERVICE_CONFIGURATION', refusalCode: 'VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED',
    });
    return json({ success: false, error: 'VERIFIED_CONTEXT_SERVICE_NOT_CONFIGURED', requestId, writesPerformed: false }, { status: 503 });
  }

  let context;
  try {
    context = await verifiedContextService.execute(locals.user.id, { ...body, requestId });
  } catch {
    recordVerifiedContextOutcomeV1({
      requestId, serviceHealth: 'ERROR', evidenceValidity: 'NOT_VERIFIED',
      firstFailingBoundary: 'VERIFIED_CONTEXT_SERVICE', refusalCode: 'VERIFIED_CONTEXT_SERVICE_FAILED',
    });
    return json({ success: false, error: 'VERIFIED_CONTEXT_SERVICE_FAILED', requestId, writesPerformed: false }, { status: 503 });
  }

  if (context.status !== 'ADMITTED') {
    recordVerifiedContextOutcomeV1({
      requestId: context.requestId, serviceHealth: 'AVAILABLE', evidenceValidity: 'NOT_ADMITTED',
      firstFailingBoundary: context.firstFailingBoundary, refusalCode: context.refusalCode,
    });
    return json({
      success: false,
      error: context.refusalCode,
      requestId: context.requestId,
      firstFailingBoundary: context.firstFailingBoundary,
      receipt: context.receipt,
      writesPerformed: false,
    }, { status: 409 });
  }

  recordVerifiedContextOutcomeV1({
    requestId: context.requestId, serviceHealth: 'AVAILABLE', evidenceValidity: 'VERIFIED_NONCANONICAL',
    firstFailingBoundary: 'IMMUTABLE_PACKET_HYDRATOR', refusalCode: 'VERIFIED_CONTEXT_PACKET_HYDRATOR_NOT_CONFIGURED',
  });
  return json({
    success: false,
    error: 'VERIFIED_CONTEXT_PACKET_HYDRATOR_NOT_CONFIGURED',
    requestId: context.requestId,
    contextPacketRef: context.contextPacketRef,
    contextPacketDigest: context.contextPacketDigest,
    promptPlanChecksum: context.promptPlanChecksum,
    receipt: context.receipt,
    writesPerformed: false,
  }, { status: 503 });
};
