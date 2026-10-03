import { z } from 'zod';

/**
 * AR-03 (openspec/changes/parent-atlas-agentic-repair-fabric).
 *
 * Typed vocabulary of legal "moves" an agentic repair/recommendation loop
 * may select from. An LLM proposes among these; it never invents tool/
 * action semantics outside this registry (matches this repo's existing
 * "classifier proposes, never decides" principle).
 */

export const AgenticActionKindV1Schema = z.enum([
  'READ',
  'SEARCH',
  'EXPAND',
  'CLASSIFY',
  'VALIDATE',
  'REPAIR',
  'MUTATE',
  'AWAIT',
  'RETRY',
  'STOP',
]);
export type AgenticActionKindV1 = z.infer<typeof AgenticActionKindV1Schema>;

export const AgenticActionMutabilityV1Schema = z.enum([
  'READ_ONLY',
  'SOURCE_WRITE',
  'DATABASE_WRITE',
  'CACHE_WRITE',
  'GRAPH_WRITE',
]);
export type AgenticActionMutabilityV1 = z.infer<typeof AgenticActionMutabilityV1Schema>;

export const AgenticActionV1Schema = z
  .object({
    schema: z.literal('atlas.agentic-action.v1'),
    actionId: z.string().min(1),
    actionRevision: z.string().min(1),
    kind: AgenticActionKindV1Schema,
    tool: z.string().min(1).nullable(),
    inputSchema: z.string().min(1),
    outputSchema: z.string().min(1),
    prerequisites: z.array(z.string().min(1)),
    effects: z.array(z.string().min(1)),
    mutability: AgenticActionMutabilityV1Schema,
    requiresHumanApproval: z.boolean(),
    validator: z.string().min(1).nullable(),
  })
  .strict();
export type AgenticActionV1 = z.infer<typeof AgenticActionV1Schema>;
