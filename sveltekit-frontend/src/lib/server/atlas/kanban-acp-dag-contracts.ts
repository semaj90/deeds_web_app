import { createHash } from 'node:crypto';
import { z } from 'zod';

export const openSpecWorkboardTaskRefV1Schema = z.object({
  schema: z.literal('atlas.openspec-workboard-task-ref.v1'),
  workboardTaskId: z.string().min(1).max(512),
  stableKey: z.string().min(1).max(512),
  logicalTaskKey: z.string().min(1).max(512).nullable(),
  taskRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sourceRef: z.string().min(1).max(1024),
  sourceFileSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  workboardSnapshotSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  workboardGeneratedAt: z.string().datetime(),
  currentHead: z.string().nullable(),
  status: z.literal('CAPTURE_ASSERTED_SOURCE_CURRENT_LINK'),
  dispatchRevalidation: z.literal('REQUIRED'),
  authority: z.literal('PROPOSAL_REFERENCE_ONLY'),
  canonicalAuthority: z.literal(false),
}).strict();

export const acpKanbanErrorTaskInputV1Schema = z.object({
  relativePath: z.string().trim().min(1).max(1024).refine(
    (value) => !value.startsWith('/') && !value.includes('\\') && !value.includes('\0')
      && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'),
    'RELATIVE_PATH_INVALID',
  ),
  errorSignature: z.string().trim().min(1).max(4000),
  targetAgent: z.string().trim().min(1).max(128).default('a2a-error-fixer'),
  workboardTaskRef: openSpecWorkboardTaskRefV1Schema.optional(),
}).strict();

/**
 * One grep-friendly line for the agentic error-fixing path (tail-and-ingest -> `kag.ingest_error`,
 * and `acp.kanban_prefill_error_task`, which takes exactly `acpKanbanErrorTaskInput`). Printing it
 * writes nothing: no database, queue or Kanban write happens in the request path, and the Kanban
 * task stays a proposal until the existing tools are run on it. Never throws (it runs on error paths).
 */
export function formatAcpKanbanErrorLineV1(
  input: { relativePath: string; errorSignature: string; targetAgent?: string; workboardTaskRef?: unknown },
  context: Record<string, unknown> = {},
): string {
  const signature = String(input.errorSignature ?? '').slice(0, 4000) || 'UNKNOWN_ERROR';
  const code = signature.split(/[\s:]/)[0] || 'UNKNOWN_ERROR';
  const parsed = acpKanbanErrorTaskInputV1Schema.safeParse({ ...input, errorSignature: signature });
  const payload = parsed.success
    ? { acpKanbanErrorTaskInput: parsed.data, context }
    : { acpKanbanErrorTaskInput: null, invalid: parsed.error.issues.map((issue) => issue.message), signature, context };
  let body: string;
  try {
    body = JSON.stringify(payload);
  } catch {
    body = JSON.stringify({ signature, context: 'UNSERIALIZABLE_CONTEXT' });
  }
  return `[acp-error] ${code} ${body}`;
}

export const researchParameterArtifactV1Schema = z
  .object({
    schema: z.literal('atlas.research-parameter.v1'),
    parameterKey: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
    inputChecksum: z.string().regex(/^[a-f0-9]{64}$/),
    producerRevision: z.string().min(1),
    evidenceRefs: z.array(z.string()).default([]),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false)
  })
  .strict();

export const dagPrefillNodeV1Schema = z
  .object({
    nodeId: z.string().min(1),
    relativePath: z.string().min(1),
    topoClass: z.string().nullable(),
    graphAuthority: z.null(),
    pagerank: z.null(),
    agentsDir: z.string().nullable(),
    errorSignatures: z.array(z.string())
  })
  .strict();

export const acpKanbanErrorTaskV1Schema = z
  .object({
    schema: z.literal('atlas.acp-kanban-error-task.v1'),
    taskId: z.string().min(1),
    boardColumn: z.enum(['backlog', 'prefilled', 'in_progress', 'verify', 'blocked']),
    sourceAgent: z.string().min(1),
    targetAgent: z.string().min(1),
    relativePath: z.string().min(1),
    errorSignature: z.string().min(1).max(4000),
    workboardTaskRef: openSpecWorkboardTaskRefV1Schema.optional(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    sourceRevision: z.string().min(1).nullable(),
    status: z.literal('BLOCKED_SOURCE_BYTES_UNAVAILABLE'),
    admission: z.literal('PROPOSAL_ONLY'),
    extractionStatus: z.literal('NOT_RUN'),
    extractedSpans: z.array(z.string()),
    dagPrefillNodes: z.array(dagPrefillNodeV1Schema),
    promptCards: z.array(z.string()),
    recommendedFixActions: z.array(z.string()),
    dbSchemaStatus: z.literal('NOT_CHECKED'),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false)
  })
  .strict();

/**
 * Shared ACP/A2A proposal builder. Its deterministic ID is only a dedupe key for an
 * unqualified diagnostic proposal; it is not a canonical task identity or admission.
 */
export function buildAcpKanbanErrorTaskV1(
  input: AcpKanbanErrorTaskInputV1,
  options: { sourceAgent: string; targetAgent?: string },
): AcpKanbanErrorTaskV1 {
  const parsedInput = acpKanbanErrorTaskInputV1Schema.parse(input);
  const normalized = {
    relativePath: parsedInput.relativePath,
    errorSignature: parsedInput.errorSignature,
    workboardTaskRef: parsedInput.workboardTaskRef ?? null,
  };
  const proposalKey = createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
  return acpKanbanErrorTaskV1Schema.parse({
    schema: 'atlas.acp-kanban-error-task.v1',
    taskId: `proposal-${proposalKey}`,
    boardColumn: 'blocked',
    sourceAgent: options.sourceAgent,
    targetAgent: options.targetAgent ?? parsedInput.targetAgent,
    relativePath: parsedInput.relativePath,
    errorSignature: parsedInput.errorSignature,
    ...(parsedInput.workboardTaskRef ? { workboardTaskRef: parsedInput.workboardTaskRef } : {}),
    sourceSha256: null,
    sourceRevision: null,
    status: 'BLOCKED_SOURCE_BYTES_UNAVAILABLE',
    admission: 'PROPOSAL_ONLY',
    extractionStatus: 'NOT_RUN',
    extractedSpans: [],
    dagPrefillNodes: [],
    promptCards: [],
    recommendedFixActions: [],
    dbSchemaStatus: 'NOT_CHECKED',
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

export const a2aErrorFixProposalRequestV1Schema = z.object({
  relativePath: acpKanbanErrorTaskInputV1Schema.shape.relativePath,
  errorSignature: acpKanbanErrorTaskInputV1Schema.shape.errorSignature,
  targetAgent: acpKanbanErrorTaskInputV1Schema.shape.targetAgent,
  workboardTaskRef: openSpecWorkboardTaskRefV1Schema.optional(),
}).strict();

/** A2A envelope wrapping the exact same proposal returned by the ACP prefill tool. */
export function buildA2AErrorFixProposalResultV1(input: {
  requestId: string;
  errorFix: z.input<typeof a2aErrorFixProposalRequestV1Schema>;
  sourceAgent?: string;
}) {
  const requestId = z.string().trim().min(1).max(256).parse(input.requestId);
  const errorFix = a2aErrorFixProposalRequestV1Schema.parse(input.errorFix);
  const proposal = buildAcpKanbanErrorTaskV1(errorFix, {
    sourceAgent: input.sourceAgent ?? 'a2a-agent-endpoint',
  });
  return {
    id: requestId,
    status: { state: 'completed' as const },
    artifacts: [{ name: 'error-fix-proposal', parts: [{ data: proposal }] }],
    metadata: {
      skill: 'agentic-error-fix-proposal',
      proposalOnly: true,
      canonicalAuthority: false,
      writesPerformed: false,
    },
  };
}

export type ResearchParameterArtifactV1 = z.infer<typeof researchParameterArtifactV1Schema>;
export type DagPrefillNodeV1 = z.infer<typeof dagPrefillNodeV1Schema>;
export type AcpKanbanErrorTaskV1 = z.infer<typeof acpKanbanErrorTaskV1Schema>;
export type AcpKanbanErrorTaskInputV1 = z.infer<typeof acpKanbanErrorTaskInputV1Schema>;
