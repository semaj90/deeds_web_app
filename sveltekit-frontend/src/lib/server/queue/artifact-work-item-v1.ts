import { z } from 'zod';
import { taskTypeSchema, type TaskType } from './commands.js';

/**
 * Queue messages carry immutable artifact REFERENCES, never large tensors,
 * embeddings, graphs, or source bodies. Workers resolve these addresses at
 * execution time and verify the checksum + revision set before use.
 */
export const artifactStorageSchema = z.enum([
  'MMAP',
  'ARROW_IPC',
  'POSTGRES',
  'QDRANT',
  'VALKEY',
  'GPU_RESIDENT',
]);

export type ArtifactStorage = z.infer<typeof artifactStorageSchema>;

const dtypeSchema = z.enum([
  'u8', 'u16', 'u32', 'u64',
  'i8', 'i16', 'i32', 'i64',
  'f16', 'bf16', 'f32', 'f64',
]);

export const artifactLocatorSchema = z.discriminatedUnion('storage', [
  z.object({
    storage: z.literal('MMAP'),
    path: z.string().min(1),
    byteOffset: z.number().int().min(0).optional(),
    byteLength: z.number().int().positive().optional(),
    dtype: dtypeSchema.optional(),
    shape: z.array(z.number().int().positive()).max(8).optional(),
  }),
  z.object({
    storage: z.literal('ARROW_IPC'),
    path: z.string().min(1),
    recordBatch: z.number().int().min(0).optional(),
  }),
  z.object({
    storage: z.literal('POSTGRES'),
    table: z.string().min(1),
    primaryKey: z.string().min(1),
  }),
  z.object({
    storage: z.literal('QDRANT'),
    collection: z.string().min(1),
    pointId: z.union([z.string().min(1), z.number().int().nonnegative()]),
    vectorName: z.string().min(1).optional(),
  }),
  z.object({
    storage: z.literal('VALKEY'),
    key: z.string().min(1),
  }),
  z.object({
    storage: z.literal('GPU_RESIDENT'),
    deviceId: z.number().int().min(0),
    bufferId: z.string().min(1),
    dtype: dtypeSchema,
    shape: z.array(z.number().int().positive()).min(1).max(8),
  }),
]);

export const artifactAddressSchema = z.object({
  schema: z.literal('atlas.artifact-address.v1'),
  artifactId: z.string().min(1),
  artifactHash: z.string().min(16),
  schemaId: z.string().min(1),
  checksum: z.string().min(16),
  revisionSetHash: z.string().min(16),
  revisions: z.record(z.string(), z.string().min(1)).default({}),
  locator: artifactLocatorSchema,
});

export type ArtifactAddressV1 = z.infer<typeof artifactAddressSchema>;

export const candidateSelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ordinal-range'),
    startInclusive: z.number().int().min(0),
    endExclusive: z.number().int().positive(),
  }).refine((v) => v.endExclusive > v.startInclusive, {
    message: 'endExclusive must be greater than startInclusive',
  }),
  z.object({
    kind: z.literal('ordinal-list-artifact'),
    ordinals: artifactAddressSchema,
  }),
]);

export const workBudgetSchema = z.object({
  timeoutMs: z.number().int().positive(),
  maxCpuBytes: z.number().int().nonnegative().optional(),
  maxGpuBytes: z.number().int().nonnegative().optional(),
  maxCandidateCount: z.number().int().positive().optional(),
  maxGraphHops: z.number().int().nonnegative().optional(),
  maxHyperedgeExpansions: z.number().int().nonnegative().optional(),
  maxToolCalls: z.number().int().nonnegative().optional(),
  maxTokens: z.number().int().nonnegative().optional(),
});

export const actionWorkItemSchema = z.object({
  schema: z.literal('atlas.action-work-item.v1'),
  actionKey: z.string().min(16),
  commandType: taskTypeSchema,
  operation: z.string().min(1),
  inputArtifactRefs: z.array(artifactAddressSchema).max(64),
  requiredRevisionSetHash: z.string().min(16),
  candidateSelection: candidateSelectionSchema.optional(),
  budget: workBudgetSchema,
  executorClass: z.enum(['CPU', 'GPU', 'IO', 'LLM', 'AGENT']),
  priority: z.enum(['critical', 'high', 'normal', 'low', 'background']),
  parametersHash: z.string().min(16),
  expectedOutputSchema: z.string().min(1),
  producerRevision: z.string().min(1),
});

export type ActionWorkItemV1 = z.infer<typeof actionWorkItemSchema>;

/**
 * Durable result shape persisted in workflow_tasks.result for artifact work.
 * It references immutable output bytes; it does not become an artifact owner.
 */
export const artifactWorkResultSchema = z.object({
  schema: z.literal('atlas.action-work-result.v1'),
  actionKey: z.string().min(16),
  revisionSetHash: z.string().min(16),
  artifact: artifactAddressSchema,
  producerRevision: z.string().min(1),
  fencingToken: z.string().regex(/^\d+$/),
  receiptRef: z.string().min(1).optional(),
});

export type ArtifactWorkResultV1 = z.infer<typeof artifactWorkResultSchema>;

export function parseActionWorkItem(raw: unknown): ActionWorkItemV1 {
  return actionWorkItemSchema.parse(raw);
}

export function parseArtifactWorkResult(raw: unknown): ArtifactWorkResultV1 {
  return artifactWorkResultSchema.parse(raw);
}

export function isActionWorkItemFor(
  item: ActionWorkItemV1,
  commandType: TaskType,
): boolean {
  return item.commandType === commandType;
}
