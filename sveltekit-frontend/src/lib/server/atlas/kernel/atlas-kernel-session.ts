import { z } from 'zod';
import { ContextToolDagV1Schema, type ContextToolDagV1 } from '../workflow/context-tool-dag-contracts.js';

/**
 * AtlasKernelSessionV1 is the model-facing Python composition boundary.
 *
 * The kernel may read revision-qualified artifacts, run bounded computation,
 * and nominate typed actions. It may NOT directly mutate canonical Atlas state.
 * Canonical mutation remains owned by the TypeScript DAG/validator/materializer.
 */

export const AtlasKernelCapabilitySchema = z.enum([
  'RETRIEVE',
  'GRAPH_EVIDENCE',
  'VERIFY_CLAIM',
  'COMPILE_PREFILL',
  'PROPOSE_PATCH',
  'SPAWN_SUBTASK',
  'READ_ARTIFACT',
  'RUN_ANALYZER',
]);
export type AtlasKernelCapability = z.infer<typeof AtlasKernelCapabilitySchema>;

export const AtlasKernelAccessPolicyV1Schema = z.object({
  repositoryRead: z.literal(true),
  artifactRead: z.literal(true),
  boundedCompute: z.literal(true),
  approvedAnalyzerExecution: z.literal(true),
  canonicalDbWrite: z.literal(false),
  directRepositoryWrite: z.literal(false),
  directMaterialization: z.literal(false),
  directMutationAuthorization: z.literal(false),
  canonicalGraphWrite: z.literal(false),
}).strict();
export type AtlasKernelAccessPolicyV1 = z.infer<typeof AtlasKernelAccessPolicyV1Schema>;

export const AtlasKernelArtifactHandleV1Schema = z.object({
  schema: z.literal('atlas.kernel-artifact-handle.v1'),
  artifactId: z.string().min(1),
  representationId: z.string().min(1),
  representationRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.enum(['ARROW_IPC', 'MMAP_F32', 'JSON', 'MSGPACK', 'PROTOBUF', 'RAW_BYTES']),
  rows: z.number().int().nonnegative().nullable(),
  cols: z.number().int().nonnegative().nullable(),
  byteLength: z.number().int().nonnegative(),
  readOnly: z.literal(true),
}).strict();
export type AtlasKernelArtifactHandleV1 = z.infer<typeof AtlasKernelArtifactHandleV1Schema>;

export const AtlasKernelSessionV1Schema = z.object({
  schema: z.literal('atlas.kernel-session.v1'),
  sessionId: z.string().min(1),
  kernelRevision: z.string().min(1),
  pythonVersion: z.string().min(1),
  environmentRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),
  persistent: z.literal(true),
  modelFacingLanguage: z.literal('PYTHON'),
  authoritativeHostLanguage: z.literal('TYPESCRIPT'),
  securitySandbox: z.literal(false),
  capabilities: z.array(AtlasKernelCapabilitySchema).min(1),
  accessPolicy: AtlasKernelAccessPolicyV1Schema,
  loadedSkills: z.array(z.string().min(1)).max(256),
  artifactHandles: z.array(AtlasKernelArtifactHandleV1Schema).max(4096),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AtlasKernelSessionV1 = z.infer<typeof AtlasKernelSessionV1Schema>;

export const AtlasKernelHostRequestKindSchema = z.enum([
  'RETRIEVE',
  'GRAPH_EVIDENCE',
  'VERIFY_CLAIM',
  'COMPILE_PREFILL',
  'PROPOSE_PATCH',
  'SPAWN_SUBTASK',
]);
export type AtlasKernelHostRequestKind = z.infer<typeof AtlasKernelHostRequestKindSchema>;

export const AtlasKernelHostRequestV1Schema = z.object({
  schema: z.literal('atlas.kernel-host-request.v1'),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  dagNodeId: z.string().min(1),
  kind: AtlasKernelHostRequestKindSchema,
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),
  canonicalIds: z.array(z.string().min(1)).max(4096),
  evidenceRefs: z.array(z.string().min(1)).max(4096),
  payload: z.record(z.string(), z.unknown()),
  resourceBudget: z.object({
    maxCandidates: z.number().int().positive().max(1_000_000),
    maxGraphHops: z.number().int().nonnegative().max(64),
    maxToolCalls: z.number().int().nonnegative().max(256),
    maxOutputBytes: z.number().int().positive(),
    deadlineMs: z.number().int().positive(),
  }).strict(),
  canonicalWritesRequested: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AtlasKernelHostRequestV1 = z.infer<typeof AtlasKernelHostRequestV1Schema>;

export const CandidateSetV1Schema = z.object({
  schema: z.literal('atlas.candidate-set.v1'),
  requestId: z.string().min(1),
  candidates: z.array(z.object({
    canonicalId: z.string().min(1),
    score: z.number().finite(),
    logicalLane: z.enum(['lexical', 'semantic', 'ast', 'graph']),
    evidenceRefs: z.array(z.string().min(1)),
  }).strict()).max(1_000_000),
  approximate: z.boolean(),
  exactPromotionRequired: z.literal(true),
  canonicalWrites: z.literal(false),
}).strict();
export type CandidateSetV1 = z.infer<typeof CandidateSetV1Schema>;

export const ClaimNominationV1Schema = z.object({
  schema: z.literal('atlas.claim-nomination.v1'),
  requestId: z.string().min(1),
  claim: z.string().min(1),
  status: z.enum(['SUPPORTED', 'CONTRADICTED', 'INSUFFICIENT_EVIDENCE']),
  confidence: z.number().finite().min(0).max(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  canonicalWrites: z.literal(false),
}).strict();
export type ClaimNominationV1 = z.infer<typeof ClaimNominationV1Schema>;

export const AgenticFileMutationPlanV1Schema = z.object({
  schema: z.literal('atlas.agentic-file-mutation-plan.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  targetPath: z.string().min(1),
  baseChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(z.object({
    kind: z.enum(['REPLACE_RANGE', 'INSERT', 'DELETE_RANGE']),
    startLine: z.number().int().positive().nullable(),
    endLine: z.number().int().positive().nullable(),
    content: z.string(),
  }).strict()).min(1).max(128),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  requiresRevisionCas: z.literal(true),
  requiresExactSourceEvidence: z.literal(true),
  requiresValidation: z.literal(true),
  directWritePerformed: z.literal(false),
}).strict();
export type AgenticFileMutationPlanV1 = z.infer<typeof AgenticFileMutationPlanV1Schema>;

export const PrefillCompilationNominationV1Schema = z.object({
  schema: z.literal('atlas.prefill-compilation-nomination.v1'),
  requestId: z.string().min(1),
  contextManifestChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  modelRevision: z.string().min(1),
  adapterRevision: z.string().min(1).nullable(),
  promptTemplateRevision: z.string().min(1),
  evidenceRevisions: z.array(z.string().min(1)),
  cacheIdentity: z.string().min(1),
  canonicalWrites: z.literal(false),
}).strict();

export const SubtaskNominationV1Schema = z.object({
  schema: z.literal('atlas.subtask-nomination.v1'),
  requestId: z.string().min(1),
  objective: z.string().min(1),
  parentDagNodeId: z.string().min(1),
  proposedLane: z.enum(['lexical', 'semantic', 'ast', 'graph', 'tool', 'validator']),
  evidenceRefs: z.array(z.string().min(1)),
  requiresHostAdmission: z.literal(true),
  canonicalWrites: z.literal(false),
}).strict();

export const AtlasKernelHostResponseV1Schema = z.discriminatedUnion('schema', [
  CandidateSetV1Schema,
  ClaimNominationV1Schema,
  AgenticFileMutationPlanV1Schema,
  PrefillCompilationNominationV1Schema,
  SubtaskNominationV1Schema,
]);
export type AtlasKernelHostResponseV1 = z.infer<typeof AtlasKernelHostResponseV1Schema>;

export const AtlasPythonSkillManifestV1Schema = z.object({
  schema: z.literal('atlas.python-skill-manifest.v1'),
  skillName: z.string().regex(/^[a-z][a-z0-9-]*$/),
  importName: z.string().regex(/^[a-z][a-z0-9_]*$/),
  skillRevision: z.string().min(1),
  packageRevision: z.string().min(1),
  pythonBacked: z.literal(true),
  callable: z.string().min(1),
  allowedHostRequests: z.array(AtlasKernelHostRequestKindSchema).min(1),
  directCanonicalWrites: z.literal(false),
  directRepositoryWrites: z.literal(false),
  directMaterialization: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AtlasPythonSkillManifestV1 = z.infer<typeof AtlasPythonSkillManifestV1Schema>;

export function defaultAtlasKernelAccessPolicy(): AtlasKernelAccessPolicyV1 {
  return AtlasKernelAccessPolicyV1Schema.parse({
    repositoryRead: true,
    artifactRead: true,
    boundedCompute: true,
    approvedAnalyzerExecution: true,
    canonicalDbWrite: false,
    directRepositoryWrite: false,
    directMaterialization: false,
    directMutationAuthorization: false,
    canonicalGraphWrite: false,
  });
}

export function validateKernelRequestAgainstDag(input: {
  session: AtlasKernelSessionV1;
  dag: ContextToolDagV1;
  request: AtlasKernelHostRequestV1;
}): AtlasKernelHostRequestV1 {
  const session = AtlasKernelSessionV1Schema.parse(input.session);
  const dag = ContextToolDagV1Schema.parse(input.dag);
  const request = AtlasKernelHostRequestV1Schema.parse(input.request);

  if (request.sessionId !== session.sessionId) throw new Error('kernel request/session mismatch');
  if (request.workspaceRevision !== session.workspaceRevision || request.workspaceRevision !== dag.workspaceRevision) {
    throw new Error('kernel request workspace revision mismatch');
  }
  if (request.workflowId !== dag.workflowId || request.workflowRevision !== dag.workflowRevision) {
    throw new Error('kernel request workflow identity mismatch');
  }
  if (!dag.nodes.some((node) => node.nodeId === request.dagNodeId)) {
    throw new Error(`kernel request references unknown DAG node ${request.dagNodeId}`);
  }
  if (!session.capabilities.includes(request.kind as AtlasKernelCapability)) {
    throw new Error(`kernel session lacks capability ${request.kind}`);
  }
  if (request.kind === 'PROPOSE_PATCH' && !dag.canonicalWritesAllowed) {
    // Proposal generation is still safe: no write occurs. Keep this explicit so
    // downstream code does not confuse proposal permission with write authority.
    return request;
  }
  return request;
}

export function assertKernelResponseIsNomination(response: AtlasKernelHostResponseV1): AtlasKernelHostResponseV1 {
  const parsed = AtlasKernelHostResponseV1Schema.parse(response);
  if ('canonicalWrites' in parsed && parsed.canonicalWrites !== false) {
    throw new Error('kernel host response attempted canonical write authority');
  }
  if (parsed.schema === 'atlas.agentic-file-mutation-plan.v1' && parsed.directWritePerformed) {
    throw new Error('kernel mutation plan performed a direct write');
  }
  return parsed;
}
