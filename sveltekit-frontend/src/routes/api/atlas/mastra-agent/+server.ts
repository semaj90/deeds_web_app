import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { trace } from '@opentelemetry/api';
import { VerifiedContextRequestV1Schema, type VerifiedContextServiceV1 } from '$lib/server/atlas/execution/verified-context-service-v1.js';
import { hydrateVerifiedContextPacketForGemmaV1 } from '$lib/server/atlas/execution/verified-context-packet-hydrator-v1.js';
import { getGemma4Invoker } from '$lib/server/ace/gemma4-invocation.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

// This production route must never infer a workspace from actor/session identity.
// Callers select the workspace explicitly; the authorization provider then checks its grant.
const RequestSchema = VerifiedContextRequestV1Schema.omit({ requestId: true }).extend({
  workspaceId: z.string().uuid(),
});

function recordVerifiedContextOutcomeV1(input: {
  requestId: string;
  serviceHealth: 'AVAILABLE' | 'NOT_CONFIGURED' | 'ERROR';
  evidenceValidity: 'NOT_VERIFIED' | 'NOT_ADMITTED' | 'VERIFIED_NONCANONICAL';
  agentExecutionStatus?: 'NOT_STARTED' | 'STARTED' | 'COMPLETED' | 'FAILED';
  firstFailingBoundary: string | null;
  refusalCode: string | null;
}) {
  trace.getActiveSpan()?.setAttributes({
    'parent_atlas.request_id': input.requestId,
    'parent_atlas.service_health': input.serviceHealth,
    'parent_atlas.agent_execution_status': input.agentExecutionStatus ?? 'NOT_STARTED',
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

  const hydrated = hydrateVerifiedContextPacketForGemmaV1(context, body.query);
  if (hydrated.status === 'REFUSED') {
    recordVerifiedContextOutcomeV1({
      requestId: context.requestId, serviceHealth: 'AVAILABLE', evidenceValidity: 'NOT_ADMITTED',
      firstFailingBoundary: hydrated.result.firstFailingBoundary, refusalCode: hydrated.result.refusalCode,
    });
    return json({
      success: false,
      error: hydrated.result.refusalCode,
      requestId: hydrated.result.requestId,
      firstFailingBoundary: hydrated.result.firstFailingBoundary,
      receipt: hydrated.result.receipt,
      writesPerformed: false,
    }, { status: 409 });
  }

  recordVerifiedContextOutcomeV1({
    requestId: context.requestId, serviceHealth: 'AVAILABLE', evidenceValidity: 'VERIFIED_NONCANONICAL',
    agentExecutionStatus: 'STARTED', firstFailingBoundary: null, refusalCode: null,
  });
  let generated;
  try {
    generated = await getGemma4Invoker(ENV.LLAMA_SERVER_URL).invoke(hydrated.systemPrompt, hydrated.userQuery);
  } catch {
    recordVerifiedContextOutcomeV1({
      requestId: context.requestId, serviceHealth: 'ERROR', evidenceValidity: 'VERIFIED_NONCANONICAL',
      agentExecutionStatus: 'FAILED', firstFailingBoundary: 'GEMMA_INFERENCE', refusalCode: 'VERIFIED_CONTEXT_GEMMA_UNAVAILABLE',
    });
    return json({
      success: false,
      error: 'VERIFIED_CONTEXT_GEMMA_UNAVAILABLE',
      requestId: context.requestId,
      contextPacketDigest: context.contextPacketDigest,
      contextManifestChecksum: context.contextManifestChecksum,
      promptPlanChecksum: context.promptPlanChecksum,
      receipt: hydrated.readback.receipt,
      writesPerformed: false,
    }, { status: 502 });
  }
  if (generated.finish_reason === 'error' || !generated.content.trim()) {
    recordVerifiedContextOutcomeV1({
      requestId: context.requestId, serviceHealth: 'ERROR', evidenceValidity: 'VERIFIED_NONCANONICAL',
      agentExecutionStatus: 'FAILED', firstFailingBoundary: 'GEMMA_INFERENCE', refusalCode: 'VERIFIED_CONTEXT_GEMMA_INFERENCE_FAILED',
    });
    return json({
      success: false,
      error: 'VERIFIED_CONTEXT_GEMMA_INFERENCE_FAILED',
      requestId: context.requestId,
      contextPacketDigest: context.contextPacketDigest,
      contextManifestChecksum: context.contextManifestChecksum,
      promptPlanChecksum: context.promptPlanChecksum,
      receipt: hydrated.readback.receipt,
      writesPerformed: false,
    }, { status: 502 });
  }

  recordVerifiedContextOutcomeV1({
    requestId: context.requestId, serviceHealth: 'AVAILABLE', evidenceValidity: 'VERIFIED_NONCANONICAL',
    agentExecutionStatus: 'COMPLETED', firstFailingBoundary: null, refusalCode: null,
  });
  return json({
    success: true,
    requestId: context.requestId,
    answer: generated.content,
    model: generated.model,
    finishReason: generated.finish_reason,
    contextPacketRef: context.contextPacketRef,
    contextPacketDigest: hydrated.contextPacketDigest,
    contextManifestChecksum: hydrated.contextManifestChecksum,
    promptPlanChecksum: hydrated.promptPlanChecksum,
    receipt: hydrated.readback.receipt,
    canonicalAuthority: false,
    writesPerformed: false,
  });
};
