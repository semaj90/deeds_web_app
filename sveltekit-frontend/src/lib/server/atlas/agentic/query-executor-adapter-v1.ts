import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { aggregateValidationBarrier, type ValidationObservationV1, type ValidationBarrierResultV1 } from '../agentic-file-compiler/validation-barrier.js';
import { z } from 'zod';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const boundedValue = z.union([z.string().max(512), z.number().finite(), z.boolean()]);
const ArtifactReferenceV1Schema = z.object({ artifactId: z.string().min(1), checksum: digest, revision: z.string().min(1) }).strict();

export const QueryExecutionNodeV1Schema = z.object({
  nodeId: z.string().min(1),
  dependencies: z.array(z.string().min(1)).max(16),
  executorClass: z.enum(['CPU', 'GPU_RTX']),
  transport: z.enum(['LOCAL', 'FASTAPI', 'GRPC']),
  parameters: z.record(z.string(), boundedValue).refine((v) => Object.keys(v).length <= 32),
  artifactRefs: z.array(ArtifactReferenceV1Schema).max(16),
  evidenceRefs: z.array(z.string().min(1)).max(32),
  expectedOutputSchema: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict().superRefine((node, ctx) => {
  if (node.executorClass === 'GPU_RTX' && node.artifactRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifactRefs'], message: 'GPU_EXECUTOR_REQUIRES_REVISIONED_ARTIFACT_REF' });
  }
  if (node.transport === 'GRPC' && node.artifactRefs.length === 0 && JSON.stringify(node.parameters).length > 4096) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters'], message: 'GRPC_INLINE_PAYLOAD_LIMIT_EXCEEDED_USE_ARTIFACT_REF' });
  }
  if (node.transport === 'GRPC' && Object.keys(node.parameters).some((key) => /tensor|matrix|embedding|vectorPayload/i.test(key))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters'], message: 'BULK_NUMERIC_DATA_MUST_USE_REVISIONED_ARTIFACT_REF' });
  }
});
export type QueryExecutionNodeV1 = z.infer<typeof QueryExecutionNodeV1Schema>;

export const QueryExecutionPlanV1Schema = z.object({
  schema: z.literal('atlas.query-execution-plan.v1'),
  planId: z.string().min(1),
  policyRevision: z.string().min(1),
  nodes: z.array(QueryExecutionNodeV1Schema).min(1).max(32),
  planChecksum: digest,
  canonicalAuthority: z.literal(false),
}).strict().superRefine((plan, ctx) => {
  const seen = new Set<string>();
  for (const [index, node] of plan.nodes.entries()) {
    if (seen.has(node.nodeId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'nodeId'], message: 'DUPLICATE_EXECUTION_NODE' });
    if (new Set(node.dependencies).size !== node.dependencies.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'dependencies'], message: 'DUPLICATE_EXECUTION_DEPENDENCY' });
    for (const dependency of node.dependencies) {
      if (!seen.has(dependency)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'dependencies'], message: 'UNKNOWN_OR_FORWARD_DEPENDENCY' });
    }
    seen.add(node.nodeId);
  }
  const { planChecksum, ...body } = plan;
  if (planChecksum !== `sha256:${canonicalSha256V1(body)}`) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['planChecksum'], message: 'PLAN_CHECKSUM_MISMATCH' });
});
export type QueryExecutionPlanV1 = z.infer<typeof QueryExecutionPlanV1Schema>;

export function buildQueryExecutionPlanV1(input: Omit<QueryExecutionPlanV1, 'planChecksum'>): QueryExecutionPlanV1 {
  const body = { ...input, canonicalAuthority: false as const };
  return QueryExecutionPlanV1Schema.parse({ ...body, planChecksum: `sha256:${canonicalSha256V1(body)}` });
}

export const ExecutorRequestV1Schema = z.object({
  schema: z.literal('atlas.executor-request.v1'),
  planId: z.string().min(1),
  planChecksum: digest,
  nodeId: z.string().min(1),
  executorClass: z.enum(['CPU', 'GPU_RTX']),
  transport: z.enum(['LOCAL', 'FASTAPI', 'GRPC']),
  parameters: z.record(z.string(), boundedValue),
  artifactRefs: z.array(ArtifactReferenceV1Schema).max(16),
  evidenceRefs: z.array(z.string().min(1)).max(32),
  expectedOutputSchema: z.string().min(1),
  expectedProducerRevision: z.string().min(1),
  policyRevision: z.string().min(1),
  writesAllowed: z.literal(false),
}).strict();
export type ExecutorRequestV1 = z.infer<typeof ExecutorRequestV1Schema>;

export const ExecutorResponseV1Schema = z.object({
  schema: z.literal('atlas.executor-response.v1'),
  nodeId: z.string().min(1),
  status: z.enum(['PASS', 'FAIL', 'WARN']),
  exitCode: z.number().int(),
  stdoutDigest: digest,
  stderrDigest: digest,
  outputChecksum: digest,
  outputArtifactRefs: z.array(ArtifactReferenceV1Schema).max(16),
  evidenceRefs: z.array(z.string().min(1)).max(32),
  producerRevision: z.string().min(1),
  durationMs: z.number().finite().nonnegative(),
  writesPerformed: z.literal(false),
}).strict();
export type ExecutorResponseV1 = z.infer<typeof ExecutorResponseV1Schema>;

export function compileExecutorRequestV1(input: { plan: QueryExecutionPlanV1; nodeId: string }): ExecutorRequestV1 {
  const plan = QueryExecutionPlanV1Schema.parse(input.plan);
  const node = plan.nodes.find((item) => item.nodeId === input.nodeId);
  if (!node) throw new Error('EXECUTION_NODE_NOT_IN_VALIDATED_PLAN');
  return ExecutorRequestV1Schema.parse({
    schema: 'atlas.executor-request.v1', planId: plan.planId, planChecksum: plan.planChecksum,
    nodeId: node.nodeId, executorClass: node.executorClass, transport: node.transport,
    parameters: node.parameters, artifactRefs: node.artifactRefs, evidenceRefs: node.evidenceRefs,
    expectedOutputSchema: node.expectedOutputSchema, expectedProducerRevision: node.producerRevision,
    policyRevision: plan.policyRevision, writesAllowed: false,
  });
}

export async function dispatchQueryExecutionNodeV1(input: {
  plan: QueryExecutionPlanV1;
  nodeId: string;
  transports: { local: (request: ExecutorRequestV1) => Promise<unknown>; fastapi: (request: ExecutorRequestV1) => Promise<unknown>; grpc: (request: ExecutorRequestV1) => Promise<unknown> };
}): Promise<{ request: ExecutorRequestV1; response: ExecutorResponseV1; validation: ValidationBarrierResultV1; writesPerformed: false }> {
  const request = compileExecutorRequestV1(input);
  const dispatch = request.transport === 'GRPC' ? input.transports.grpc
    : request.transport === 'FASTAPI' ? input.transports.fastapi : input.transports.local;
  const response = ExecutorResponseV1Schema.parse(await dispatch(request));
  if (response.nodeId !== request.nodeId) throw new Error('EXECUTOR_RESPONSE_NODE_MISMATCH');
  if (response.producerRevision !== request.expectedProducerRevision) throw new Error('EXECUTOR_PRODUCER_REVISION_MISMATCH');
  const observation: ValidationObservationV1 = {
    schema: 'atlas.validation-observation.v1', validator: request.expectedOutputSchema,
    status: response.status, command: `${request.transport}:${request.executorClass}:${request.nodeId}`,
    exitCode: response.exitCode, stdoutDigest: response.stdoutDigest, stderrDigest: response.stderrDigest,
    evidenceRefs: [...new Set([
      ...request.evidenceRefs,
      ...response.evidenceRefs,
      ...response.outputArtifactRefs.map((ref) => `artifact:${ref.artifactId}@${ref.revision}#${ref.checksum}`),
    ])].sort(),
    durationMs: response.durationMs, producerRevision: response.producerRevision,
  };
  const validation = aggregateValidationBarrier({ mutationId: `${request.planId}:${request.nodeId}`, requiredValidators: [request.expectedOutputSchema], observations: [observation] });
  return { request, response, validation, writesPerformed: false };
}
