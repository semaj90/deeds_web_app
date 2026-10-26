import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { resolveTrustedWorkspaceAuthorityV1, type TrustedWorkspaceAuthorityV1 } from '$lib/server/retrieval/trusted-workspace-authority-v1.js';
import { assertCandidateOrdinalMapIntegrityV1, candidateOrdinalMapV1Schema } from '../features/canonical-candidate-v1.js';
import { currentCandidateFeatureAdmissionV1Schema, type CurrentCandidateFeatureAdmissionV1 } from '../features/candidate-feature-snapshot-v1.js';
import { executeSearchRuntimeTopKV1, type SearchRuntimeTopKCallerInputV1, type SearchRuntimeTopKExecutionResultV1 } from './search-runtime-topk-caller-v1.js';
import { renderAceProposalContextAndPlanV1 } from '../context/ace-context-proposal-renderer-v1.js';
import { buildPromptPlanV1, PromptPlanV1Schema } from '../prefill/prompt-plan-v1.js';
import type { DspyRepairOutputV1 } from '../evals/dspy-repair-output-v1.js';

export const VerifiedContextRequestV1Schema = z.object({
  requestId: z.string().trim().min(1).max(128),
  query: z.string().trim().min(1).max(16_000),
  topK: z.number().int().min(1).max(10).default(5),
}).strict();

const VerifiedContextAdmittedResponseV1Schema = z.object({
    schema: z.literal('atlas.verified-context-result.v1'),
    status: z.literal('ADMITTED'),
    requestId: z.string(),
    contextPacketRef: z.string(),
    contextPacketDigest: z.string().regex(/^[a-f0-9]{64}$/),
    contextManifestChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    promptPlanChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    promptPlan: z.unknown(),
    receipt: z.unknown(),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  }).strict();

export const VerifiedContextRefusalV1Schema = z.object({
    schema: z.literal('atlas.verified-context-result.v1'),
    status: z.literal('REFUSED'),
    requestId: z.string(),
    refusalCode: z.string(),
    firstFailingBoundary: z.string(),
    receipt: z.unknown(),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  }).strict();

export const VerifiedContextResponseV1Schema = z.discriminatedUnion('status', [
  VerifiedContextAdmittedResponseV1Schema,
  VerifiedContextRefusalV1Schema,
]);

export type VerifiedContextRequestV1 = z.infer<typeof VerifiedContextRequestV1Schema>;
export type VerifiedContextResponseV1 = z.infer<typeof VerifiedContextResponseV1Schema>;
export type VerifiedContextRefusalV1 = z.infer<typeof VerifiedContextRefusalV1Schema>;

const nonBlankUnpaddedStringV1 = z.string().min(1).refine((value) => value.trim() === value && value.length > 0);

function uniqueStringListV1(values: string[], ctx: z.RefinementCtx, path: string[]): void {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'DUPLICATE_SCOPE_VALUE' });
  }
}

export const VerifiedContextWorkspaceScopeV1Schema = z.object({
  status: z.literal('AUTHORIZED'),
  actorId: nonBlankUnpaddedStringV1,
  workspaceId: z.string().uuid(),
  workspaceRevision: nonBlankUnpaddedStringV1,
  repositoryIds: z.array(nonBlankUnpaddedStringV1).min(1),
  allowedSourceRefs: z.array(nonBlankUnpaddedStringV1).min(1),
  authorityRef: nonBlankUnpaddedStringV1,
}).strict().superRefine((scope, ctx) => {
  uniqueStringListV1(scope.repositoryIds, ctx, ['repositoryIds']);
  uniqueStringListV1(scope.allowedSourceRefs, ctx, ['allowedSourceRefs']);
});

export type VerifiedContextWorkspaceScopeV1 = z.infer<typeof VerifiedContextWorkspaceScopeV1Schema>;

export interface VerifiedContextFeatureSnapshotResultV1 {
  status: 'ADMITTED' | 'READBACK_MATCH_NOT_ADMITTED' | 'UNAVAILABLE' | 'BLOCKED';
  admission?: CurrentCandidateFeatureAdmissionV1;
  reason?: string;
}

export interface VerifiedQueryRepresentationV1 {
  representationId: 'semantic_768';
  modelRevision: string;
  recipeRevision: string;
  queryDigest: string;
  vectorDigest: string;
  dimensions: 768;
}

export interface VerifiedContextServicePortsV1 {
  resolveWorkspaceAuthority?: () => Promise<TrustedWorkspaceAuthorityV1>;
  authorizeWorkspaceScope: (input: { actorId: string; authority: Extract<TrustedWorkspaceAuthorityV1, { status: 'TRUSTED' }> }) => Promise<VerifiedContextWorkspaceScopeV1 | { status: 'BLOCKED'; reason: string }>;
  resolveQueryRepresentation: (input: { request: VerifiedContextRequestV1; scope: VerifiedContextWorkspaceScopeV1 }) => Promise<VerifiedQueryRepresentationV1 | null>;
  retrieveTopKInput: (input: { request: VerifiedContextRequestV1; scope: VerifiedContextWorkspaceScopeV1 }) => Promise<SearchRuntimeTopKCallerInputV1 | null>;
  resolveFeatureSnapshot: (input: { request: VerifiedContextRequestV1; scope: VerifiedContextWorkspaceScopeV1; ordinalMapChecksum: string }) => Promise<VerifiedContextFeatureSnapshotResultV1>;
  executeTopK?: (input: SearchRuntimeTopKCallerInputV1) => SearchRuntimeTopKExecutionResultV1;
  tokenizer: { revision: string; countTokens: (text: string) => number };
  promptTemplateRevision: string;
  instructionRevision: string;
}

const sha = (value: unknown) => canonicalSha256V1(value);
const blocked = (requestId: string, refusalCode: string, firstFailingBoundary: string, details: Record<string, unknown> = {}): VerifiedContextRefusalV1 => {
  const receiptBody = { schema: 'atlas.verified-context-receipt.v1', requestId, refusalCode, firstFailingBoundary, details, canonicalAuthority: false, writesPerformed: false };
  return VerifiedContextRefusalV1Schema.parse({
    schema: 'atlas.verified-context-result.v1', status: 'REFUSED', requestId, refusalCode, firstFailingBoundary,
    receipt: { ...receiptBody, receiptChecksum: sha(receiptBody) },
    canonicalAuthority: false, writesPerformed: false,
  });
};

export function refuseVerifiedContextV1(requestId: string, refusalCode: string, firstFailingBoundary = 'SERVICE_CONFIGURATION', details: Record<string, unknown> = {}): VerifiedContextRefusalV1 {
  return blocked(requestId, refusalCode, firstFailingBoundary, details);
}

function sourceRevisionSetDigest(revisions: readonly string[]): string {
  return canonicalSha256V1({ schema: 'atlas.ace-context-source-revision-set.v1', revisions: [...new Set(revisions)].sort((a, b) => a.localeCompare(b, 'en')) });
}

export function createVerifiedContextServiceV1(ports: VerifiedContextServicePortsV1) {
  return {
    async execute(actorId: string | null, requestInput: unknown): Promise<VerifiedContextResponseV1> {
      const request = VerifiedContextRequestV1Schema.parse(requestInput);
      if (!actorId?.trim()) return blocked(request.requestId, 'AUTHENTICATED_ACTOR_REQUIRED', 'WORKSPACE_AUTHORITY');
      const authority = await (ports.resolveWorkspaceAuthority ?? resolveTrustedWorkspaceAuthorityV1)();
      if (authority.status !== 'TRUSTED') return blocked(request.requestId, 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', 'WORKSPACE_AUTHORITY', { reason: authority.reason });
      let scopeResult: VerifiedContextWorkspaceScopeV1 | { status: 'BLOCKED'; reason: string };
      try { scopeResult = await ports.authorizeWorkspaceScope({ actorId, authority }); }
      catch { return blocked(request.requestId, 'WORKSPACE_MEMBERSHIP_UNAVAILABLE', 'AUTHORIZED_SOURCE_SCOPE'); }
      if (scopeResult.status === 'BLOCKED') {
        return blocked(request.requestId, scopeResult.reason, 'AUTHORIZED_SOURCE_SCOPE');
      }
      let scope: VerifiedContextWorkspaceScopeV1;
      try { scope = VerifiedContextWorkspaceScopeV1Schema.parse(scopeResult); }
      catch { return blocked(request.requestId, 'AUTHORIZED_SOURCE_SCOPE_INVALID', 'AUTHORIZED_SOURCE_SCOPE'); }
      if (scope.actorId !== actorId) return blocked(request.requestId, 'WORKSPACE_SCOPE_ACTOR_MISMATCH', 'AUTHORIZED_SOURCE_SCOPE');
      if (scope.workspaceRevision !== authority.workspaceRevision) return blocked(request.requestId, 'WORKSPACE_SCOPE_REVISION_MISMATCH', 'AUTHORIZED_SOURCE_SCOPE');

      let input: SearchRuntimeTopKCallerInputV1 | null;
      try { input = await ports.retrieveTopKInput({ request, scope }); }
      catch { return blocked(request.requestId, 'SEARCH_RUNTIME_TOPK_UNAVAILABLE', 'SEARCH_RUNTIME'); }
      if (!input) return blocked(request.requestId, 'SEARCH_RUNTIME_TOPK_UNAVAILABLE', 'SEARCH_RUNTIME');
      if (input.queryDigest !== createHash('sha256').update(request.query, 'utf8').digest('hex')) {
        return blocked(request.requestId, 'QUERY_DIGEST_MISMATCH', 'QUERY_REPRESENTATION');
      }
      let queryRepresentation: VerifiedQueryRepresentationV1 | null;
      try { queryRepresentation = await ports.resolveQueryRepresentation({ request, scope }); }
      catch { return blocked(request.requestId, 'QUERY_REPRESENTATION_UNAVAILABLE', 'QUERY_REPRESENTATION'); }
      if (!queryRepresentation || queryRepresentation.representationId !== 'semantic_768' || queryRepresentation.dimensions !== 768
        || !queryRepresentation.modelRevision.trim() || !queryRepresentation.recipeRevision.trim()
        || !/^[a-f0-9]{64}$/.test(queryRepresentation.queryDigest) || !/^[a-f0-9]{64}$/.test(queryRepresentation.vectorDigest)
        || queryRepresentation.queryDigest !== input.queryDigest) {
        return blocked(request.requestId, 'QUERY_REPRESENTATION_INVALID', 'QUERY_REPRESENTATION');
      }
      let ordinalMap;
      try {
        ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
        assertCandidateOrdinalMapIntegrityV1(ordinalMap);
      } catch { return blocked(request.requestId, 'ORDINAL_MAP_INVALID', 'ORDINAL_MAP'); }
      if (ordinalMap.workspaceRevision !== authority.workspaceRevision || ordinalMap.candidates.some((candidate) => !scope.allowedSourceRefs.includes(candidate.sourceRef))) {
        return blocked(request.requestId, 'ORDINAL_MAP_OUTSIDE_AUTHORIZED_SCOPE', 'ORDINAL_MAP');
      }
      if (!ordinalMap.candidates.every((candidate) => candidate.representationBindings?.some((binding) => binding.available && binding.representationId === queryRepresentation!.representationId && binding.dimensions === 768 && binding.family === 'EMBEDDINGGEMMA_MRL' && binding.projectionKind === 'NONE' && binding.normalized && binding.modelRevision === queryRepresentation!.modelRevision))) {
        return blocked(request.requestId, 'REPRESENTATION_LINEAGE_MISMATCH', 'QUERY_REPRESENTATION');
      }

      let featureResult: VerifiedContextFeatureSnapshotResultV1;
      try { featureResult = await ports.resolveFeatureSnapshot({ request, scope, ordinalMapChecksum: ordinalMap.ordinalMapChecksum }); }
      catch { return blocked(request.requestId, 'FEATURE_SNAPSHOT_UNAVAILABLE', 'FEATURE_SNAPSHOT'); }
      if (featureResult.status !== 'ADMITTED' || !featureResult.admission) {
        const refusalCode = featureResult.status === 'READBACK_MATCH_NOT_ADMITTED' ? 'FEATURE_SNAPSHOT_READBACK_NOT_ADMITTED' : 'FEATURE_SNAPSHOT_NOT_ADMITTED';
        return blocked(request.requestId, refusalCode, 'FEATURE_SNAPSHOT', { reason: featureResult.reason ?? featureResult.status });
      }
      let featureAdmission: CurrentCandidateFeatureAdmissionV1;
      try { featureAdmission = currentCandidateFeatureAdmissionV1Schema.parse(featureResult.admission); }
      catch { return blocked(request.requestId, 'FEATURE_SNAPSHOT_ADMISSION_INVALID', 'FEATURE_SNAPSHOT'); }
      if (featureAdmission.status !== 'ADMITTED' || !featureAdmission.snapshot
        || featureAdmission.workspaceRevision !== authority.workspaceRevision
        || featureAdmission.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum
        || featureAdmission.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
        || featureAdmission.snapshot.snapshotChecksum !== input.snapshot.snapshotChecksum) {
        return blocked(request.requestId, 'FEATURE_SNAPSHOT_LINEAGE_MISMATCH', 'FEATURE_SNAPSHOT');
      }

      let result: SearchRuntimeTopKExecutionResultV1;
      try { result = (ports.executeTopK ?? executeSearchRuntimeTopKV1)({ ...input, snapshot: featureAdmission.snapshot, k: request.topK }); }
      catch { return blocked(request.requestId, 'TOPK_EXECUTION_FAILED', 'TOPK_EXECUTION'); }
      if (result.verification.status !== 'VERIFIED_PASS' || result.execution.requestId !== request.requestId
        || result.execution.ordinalMapDigest !== ordinalMap.ordinalMapChecksum
        || result.execution.representationRevision !== featureAdmission.featureRevision
        || result.receiptRow.execution_id !== result.execution.executionId) {
        return blocked(request.requestId, 'TOPK_RECEIPT_INVALID', 'TOPK_RECEIPT', { verification: result.verification.status });
      }
      if (result.evidence.qualified.length === 0 || result.evidence.qualified.some((evidence) => !scope.allowedSourceRefs.includes(evidence.sourceRef))) {
        return blocked(request.requestId, 'SOURCE_BYTE_SPAN_NOT_VERIFIED', 'SOURCE_EVIDENCE', { rejected: result.evidence.rejected.map((item) => item.reason) });
      }
      if (result.contextManifestAdmission.status !== 'ADMITTED' || !result.contextManifestAdmission.admission) {
        return blocked(request.requestId, 'CONTEXT_MANIFEST_NOT_ADMITTED', 'CONTEXT_MANIFEST');
      }

      const manifest = result.contextManifestAdmission.admission.manifest;
      const evidenceBindings: Record<string, { sourceRef: string; packetKey: string; sourceRevision: string; content: string; contentChecksum: string }> = {};
      for (const evidence of result.evidence.qualified) {
        const candidate = ordinalMap.candidates[evidence.ordinal]!;
        if (!candidate.packetKey) return blocked(request.requestId, 'PACKET_IDENTITY_MISSING', 'SOURCE_EVIDENCE');
        for (const ref of evidence.evidenceRefs) evidenceBindings[ref] = {
          sourceRef: evidence.sourceRef, packetKey: candidate.packetKey, sourceRevision: evidence.sourceRevision,
          content: evidence.text, contentChecksum: createHash('sha256').update(evidence.text, 'utf8').digest('hex'),
        };
      }
      const evidenceRefs = Object.keys(evidenceBindings).sort();
      if (evidenceRefs.length === 0) return blocked(request.requestId, 'CONTEXT_EVIDENCE_EMPTY', 'CONTEXT_MANIFEST');
      if (sourceRevisionSetDigest(result.evidence.qualified.map((item) => item.sourceRevision)) !== manifest.identityInput.evidenceRevisions.sourceRevision) {
        return blocked(request.requestId, 'CONTEXT_SOURCE_REVISION_SET_MISMATCH', 'CONTEXT_MANIFEST');
      }
      const proposal: DspyRepairOutputV1 = {
        schema: 'atlas.dspy-repair-output.v1', contextManifestChecksum: `sha256:${manifest.identityChecksum}`,
        diagnosis: `Evidence selected for query: ${request.query}`, targetCandidates: result.evidence.qualified.map((item) => item.canonicalId),
        patchPlan: 'Use only the admitted evidence references; do not modify files or persistent state.',
        validationPlan: 'Verify each claim against the cited source spans.', evidenceRefs,
      };
      let rendered;
      try {
        rendered = renderAceProposalContextAndPlanV1({
          runId: request.requestId, manifest, proposal, evidenceBindings, tokenizer: ports.tokenizer,
          promptTemplateRevision: ports.promptTemplateRevision, instructionRevision: ports.instructionRevision,
        });
      } catch (error) {
        return blocked(request.requestId, 'PROMPT_PLAN_RENDER_FAILED', 'PROMPT_PLAN', { reason: error instanceof Error ? error.message : 'UNKNOWN' });
      }
      const packet = { requestId: request.requestId, manifestChecksum: manifest.identityChecksum, aceContextPacket: rendered.aceContextPacket, promptPlan: rendered.promptPlan };
      const contextPacketDigest = sha(packet);
      const receiptBody = {
        schema: 'atlas.verified-context-receipt.v1', requestId: request.requestId,
        workspaceRevision: authority.workspaceRevision, authorityRef: scope.authorityRef,
        repositoryIds: [...scope.repositoryIds].sort(), retrievalExecutionId: result.execution.executionId,
        topKReceiptDigest: sha(result.receiptRow), ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
        queryRepresentation: { representationId: queryRepresentation.representationId, modelRevision: queryRepresentation.modelRevision, recipeRevision: queryRepresentation.recipeRevision, queryDigest: queryRepresentation.queryDigest, vectorDigest: queryRepresentation.vectorDigest, dimensions: queryRepresentation.dimensions },
        sourceEvidence: result.evidence.qualified.map((item) => ({ canonicalId: item.canonicalId, sourceRef: item.sourceRef, sourceRevision: item.sourceRevision, byteStart: item.byteStart, byteEnd: item.byteEnd, spanChecksum: item.spanChecksum, evidenceRefs: item.evidenceRefs })),
        featureSnapshotRevision: featureAdmission.candidateSnapshotRevision, featureRevision: featureAdmission.featureRevision,
        featureSnapshotChecksum: featureAdmission.snapshot.snapshotChecksum, contextManifestChecksum: manifest.identityChecksum,
        promptPlanChecksum: rendered.promptPlan.checksumSha256, contextPacketDigest, mastraReadback: 'NOT_INVOKED',
        canonicalAuthority: false, writesPerformed: false,
      };
      const receipt = { ...receiptBody, receiptChecksum: sha(receiptBody) };
      return VerifiedContextResponseV1Schema.parse({
        schema: 'atlas.verified-context-result.v1', status: 'ADMITTED', requestId: request.requestId,
        contextPacketRef: `verified-context:sha256:${contextPacketDigest}`, contextPacketDigest,
        contextManifestChecksum: manifest.identityChecksum, promptPlanChecksum: rendered.promptPlan.checksumSha256,
        promptPlan: rendered.promptPlan, receipt, canonicalAuthority: false, writesPerformed: false,
      });
    },
  };
}

export type VerifiedContextServiceV1 = ReturnType<typeof createVerifiedContextServiceV1>;

export function verifyVerifiedContextMastraReadbackV1(result: VerifiedContextResponseV1): VerifiedContextResponseV1 {
  if (result.status !== 'ADMITTED') return result;
  if (typeof result.receipt !== 'object' || result.receipt === null || Array.isArray(result.receipt)) {
    return blocked(result.requestId, 'VERIFIED_CONTEXT_RECEIPT_INVALID', 'MASTRA_READBACK');
  }
  const { receiptChecksum, ...originalReceiptBody } = result.receipt as Record<string, unknown>;
  if (typeof receiptChecksum !== 'string' || !/^[a-f0-9]{64}$/.test(receiptChecksum)
    || sha(originalReceiptBody) !== receiptChecksum) {
    return blocked(result.requestId, 'VERIFIED_CONTEXT_RECEIPT_CHECKSUM_MISMATCH', 'MASTRA_READBACK');
  }
  if (originalReceiptBody.schema !== 'atlas.verified-context-receipt.v1'
    || originalReceiptBody.requestId !== result.requestId
    || originalReceiptBody.contextManifestChecksum !== result.contextManifestChecksum
    || originalReceiptBody.promptPlanChecksum !== result.promptPlanChecksum
    || originalReceiptBody.contextPacketDigest !== result.contextPacketDigest
    || originalReceiptBody.mastraReadback !== 'NOT_INVOKED'
    || originalReceiptBody.canonicalAuthority !== false
    || originalReceiptBody.writesPerformed !== false) {
    return blocked(result.requestId, 'VERIFIED_CONTEXT_RECEIPT_BINDING_MISMATCH', 'MASTRA_READBACK');
  }
  let plan;
  try { plan = PromptPlanV1Schema.parse(result.promptPlan); }
  catch { return blocked(result.requestId, 'MASTRA_PROMPT_PLAN_READBACK_INVALID', 'MASTRA_READBACK'); }
  const recomputed = buildPromptPlanV1({
    requestId: plan.requestId,
    contextManifestChecksum: plan.contextManifestChecksum,
    tokenizerRevision: plan.tokenizerRevision,
    promptTemplateRevision: plan.promptTemplateRevision,
    instructionRevision: plan.instructionRevision,
    segments: plan.segments,
    contextLimitTokens: plan.contextLimitTokens,
    reservedOutputTokens: plan.reservedOutputTokens,
    maxInputTokens: plan.maxInputTokens,
  });
  if (recomputed.checksumSha256 !== result.promptPlanChecksum
    || result.contextPacketRef !== `verified-context:sha256:${result.contextPacketDigest}`
    || plan.checksumSha256 !== result.promptPlanChecksum) {
    return blocked(result.requestId, 'MASTRA_PROMPT_PLAN_READBACK_MISMATCH', 'MASTRA_READBACK');
  }
  const priorReceipt = { ...(result.receipt as Record<string, unknown>) };
  delete priorReceipt.receiptChecksum;
  const receiptBody = { ...priorReceipt, mastraReadback: { status: 'PROMPT_PLAN_DIGEST_MATCH', promptPlanChecksum: result.promptPlanChecksum } };
  return VerifiedContextResponseV1Schema.parse({
    ...result,
    receipt: { ...receiptBody, receiptChecksum: sha(receiptBody) },
  });
}
