import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Replay-safe intent for publishing a task semantic packet to its rebuildable
 * vector projection. The intent references an immutable artifact; it never
 * stores the embedding itself in outbox JSONB.
 */
export const TaskSemanticProjectionIntentV1Schema = z.object({
  schema: z.literal('atlas.task-semantic-projection-intent.v1'),
  packetId: z.string().uuid(),
  qdrantPointId: z.string().uuid(),
  collection: z.string().min(1),
  vectorName: z.string().min(1),
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  modelRevision: z.string().min(1),
  inputChecksum: z.string().length(64),
  artifactRef: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1).nullable(),
  canonicalAuthority: z.literal(false),
  intentChecksum: z.string().length(64),
}).strict();

export type TaskSemanticProjectionIntentV1 = z.infer<typeof TaskSemanticProjectionIntentV1Schema>;

export type BuildTaskSemanticProjectionIntentV1Input = Omit<
  z.input<typeof TaskSemanticProjectionIntentV1Schema>,
  'schema' | 'representationId' | 'canonicalAuthority' | 'intentChecksum'
>;

export function buildTaskSemanticProjectionIntentV1(
  input: BuildTaskSemanticProjectionIntentV1Input,
): TaskSemanticProjectionIntentV1 {
  const base = {
    schema: 'atlas.task-semantic-projection-intent.v1' as const,
    ...input,
    representationId: 'semantic_768' as const,
    canonicalAuthority: false as const,
  };
  const intentChecksum = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return TaskSemanticProjectionIntentV1Schema.parse({ ...base, intentChecksum });
}
