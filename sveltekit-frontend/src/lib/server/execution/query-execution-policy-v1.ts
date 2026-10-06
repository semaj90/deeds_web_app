import { z } from 'zod';

export const QueryExecutionModeV1Schema = z.enum(['READ_ONLY', 'OBSERVED_READ_ONLY', 'MUTATING']);
export type QueryExecutionModeV1 = z.infer<typeof QueryExecutionModeV1Schema>;

export const ReadOnlySideEffectReceiptV1Schema = z.object({
  schema: z.literal('atlas.read-only-side-effect-receipt.v1'),
  executionMode: QueryExecutionModeV1Schema,
  entries: z.array(z.object({
    subsystem: z.string().min(1), operation: z.string().min(1),
    reads: z.number().int().nonnegative(), attemptedWrites: z.number().int().nonnegative(),
    committedWrites: z.number().int().nonnegative(), suppressionReason: z.string().nullable(),
    executionMode: QueryExecutionModeV1Schema,
  })),
  attemptedWrites: z.number().int().nonnegative(), committedWrites: z.number().int().nonnegative(),
});
export type ReadOnlySideEffectReceiptV1 = z.infer<typeof ReadOnlySideEffectReceiptV1Schema>;

export interface QueryExecutionPolicyV1 {
  mode: QueryExecutionModeV1;
  cache: { read: boolean; populate: boolean };
  observations: { persistAudit: boolean; persistEngram: boolean };
  promotion: { allow: boolean };
}

export function createQueryExecutionPolicyV1(mode: QueryExecutionModeV1): QueryExecutionPolicyV1 {
  if (mode === 'READ_ONLY') return {
    mode, cache: { read: true, populate: false },
    observations: { persistAudit: false, persistEngram: false }, promotion: { allow: false },
  };
  return {
    mode, cache: { read: true, populate: true },
    observations: { persistAudit: true, persistEngram: true }, promotion: { allow: mode === 'MUTATING' },
  };
}

export function shouldPopulateEmbeddingCacheV1(input: {
  executionMode?: QueryExecutionModeV1;
  skipCacheWrite?: boolean;
}): boolean {
  return input.executionMode !== 'READ_ONLY' && input.skipCacheWrite !== true;
}

export function createReadOnlySideEffectReceiptBuilderV1(executionMode: QueryExecutionModeV1) {
  const entries: ReadOnlySideEffectReceiptV1['entries'] = [];
  return {
    record(entry: Omit<ReadOnlySideEffectReceiptV1['entries'][number], 'executionMode'>) {
      entries.push({ ...entry, executionMode });
    },
    build(): ReadOnlySideEffectReceiptV1 {
      return ReadOnlySideEffectReceiptV1Schema.parse({
        schema: 'atlas.read-only-side-effect-receipt.v1', executionMode,
        entries: entries.map((entry) => ({ ...entry })),
        attemptedWrites: entries.reduce((sum, entry) => sum + entry.attemptedWrites, 0),
        committedWrites: entries.reduce((sum, entry) => sum + entry.committedWrites, 0),
      });
    },
  };
}

export type QueryExecutionContextV1 = {
  policy: QueryExecutionPolicyV1;
  sideEffects: ReturnType<typeof createReadOnlySideEffectReceiptBuilderV1>;
};
