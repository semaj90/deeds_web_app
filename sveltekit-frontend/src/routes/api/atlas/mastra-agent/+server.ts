/**
 * Request-scoped Mastra execution for an already admitted ContextManifest and
 * compiled PromptPlan. Candidate selection and packet identity stay upstream.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { executeMastraPromptPlanV1 } from '@deeds/atlas-orchestrator/prompt-plan-agent';
import { resolveLoadedLlamaModel } from '$lib/server/ai/llama-server-model-resolver.js';
import { ENV } from '$lib/server/env.server.js';
import { aceContextManifestAdmissionV1Schema } from '$lib/server/atlas/context/ace-context-manifest-admission-v1.js';
import { buildContextManifestV2 } from '$lib/server/atlas/graph/context-manifest-v2.js';
import { PromptPlanV1Schema } from '$lib/server/atlas/prefill/prompt-plan-v1.js';
import { z } from 'zod';

const SegmentContentSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  content: z.string().max(100_000),
}).strict();

const RequestSchema = z.object({
  admission: z.unknown(),
  promptPlan: z.unknown(),
  segmentContent: z.array(SegmentContentSchema).min(1).max(128),
}).strict();

function validatesManifestBoundPlan(
  admissionValue: unknown,
  planValue: unknown,
  contentValue: unknown,
): { admission: ReturnType<typeof aceContextManifestAdmissionV1Schema.parse>; promptPlan: ReturnType<typeof PromptPlanV1Schema.parse>; segmentContent: z.infer<typeof SegmentContentSchema>[] } | null {
  try {
    const admission = aceContextManifestAdmissionV1Schema.parse(admissionValue);
    const promptPlan = PromptPlanV1Schema.parse(planValue);
    const segmentContent = z.array(SegmentContentSchema).min(1).max(128).parse(contentValue);
    const manifest = admission.manifest;
    const rebuilt = buildContextManifestV2(manifest.v1, manifest.identityInput);
    if (rebuilt.identityChecksum !== manifest.identityChecksum) return null;
    if (admission.selectedOrdinalSetChecksum !== manifest.identityInput.selectedOrdinalSetChecksum) return null;
    if (promptPlan.requestId !== manifest.v1.requestId) return null;
    if (promptPlan.contextManifestChecksum !== manifest.identityChecksum) return null;

    const selectedPacketKeys = new Set(manifest.v1.selectedNodeKeys);
    const evidenceSegments = promptPlan.segments.filter((segment) => segment.kind === 'EVIDENCE');
    if (!evidenceSegments.length || evidenceSegments.some((segment) => !segment.packetKey || !selectedPacketKeys.has(segment.packetKey))) return null;
    const planEvidenceRefs = evidenceSegments.flatMap((segment) => segment.evidenceRefs);
    if (new Set(planEvidenceRefs).size !== planEvidenceRefs.length) return null;
    if (
      planEvidenceRefs.length !== manifest.v1.evidenceRefs.length
      || manifest.v1.evidenceRefs.some((ref) => !planEvidenceRefs.includes(ref))
    ) return null;
    return { admission, promptPlan, segmentContent };
  } catch {
    return null;
  }
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

  const bound = validatesManifestBoundPlan(body.admission, body.promptPlan, body.segmentContent);
  if (!bound) {
    return json({ success: false, error: 'CONTEXT_PROMPT_PLAN_BINDING_INVALID', writesPerformed: false }, { status: 422 });
  }
  if (!ENV.LLAMA_SERVER_URL) {
    return json({ success: false, error: 'LLAMA_SERVER_URL_UNCONFIGURED', writesPerformed: false }, { status: 503 });
  }

  try {
    const resolved = await resolveLoadedLlamaModel(ENV.LLAMA_SERVER_URL, ENV.LLAMA_SERVER_MODEL ?? null);
    const result = await executeMastraPromptPlanV1({
      baseUrl: ENV.LLAMA_SERVER_URL,
      resolvedModel: resolved.resolvedModel,
      promptPlan: bound.promptPlan,
      segmentContent: bound.segmentContent,
    });
    return json({
      success: true,
      error: null,
      result: {
        ...result,
        modelResolutionSource: resolved.source,
        modelArtifactRevision: null,
        canonicalAuthority: false,
        writesPerformed: false,
        durableStatePersisted: false,
      },
    });
  } catch {
    return json({ success: false, error: 'MASTRA_INFERENCE_FAILED', writesPerformed: false }, { status: 502 });
  }
};
