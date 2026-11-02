import { z } from 'zod';

export const acpKanbanErrorTaskInputV1Schema = z.object({
  relativePath: z.string().trim().min(1).max(1024).refine(
    (value) => !value.startsWith('/') && !value.includes('\\') && !value.includes('\0')
      && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'),
    'RELATIVE_PATH_INVALID',
  ),
  errorSignature: z.string().trim().min(1).max(4000),
  targetAgent: z.string().trim().min(1).max(128).default('a2a-error-fixer'),
}).strict();

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

export type ResearchParameterArtifactV1 = z.infer<typeof researchParameterArtifactV1Schema>;
export type DagPrefillNodeV1 = z.infer<typeof dagPrefillNodeV1Schema>;
export type AcpKanbanErrorTaskV1 = z.infer<typeof acpKanbanErrorTaskV1Schema>;
export type AcpKanbanErrorTaskInputV1 = z.infer<typeof acpKanbanErrorTaskInputV1Schema>;
