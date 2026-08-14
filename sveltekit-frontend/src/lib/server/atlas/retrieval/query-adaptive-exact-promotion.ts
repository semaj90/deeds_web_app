import { z } from 'zod';
import type { QueryAdaptiveSample } from './query-adaptive-sampler.js';

export const QasExactPromotionStateSchema = z.enum([
  'EXACT_PROMOTED',
  'NOT_FOUND',
  'REVISION_MISMATCH',
  'STALE_REPRESENTATION',
]);

export const QasExactPromotionResultSchema = z.object({
  canonicalId: z.string().min(1).nullable(),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  state: QasExactPromotionStateSchema,
  evidenceRefs: z.array(z.string().min(1)).max(64),
}).strict();

export type QasExactPromotionResult = z.infer<typeof QasExactPromotionResultSchema>;

export async function promoteQasCandidatesExact(input: {
  samples: QueryAdaptiveSample[];
  resolve: (sample: QueryAdaptiveSample) => Promise<{
    canonicalId: string;
    packetKey: string;
    sourceRef: string;
    workspaceRevision: string;
    representationRevision: string;
    evidenceRefs: string[];
  } | null>;
  workspaceRevision: string;
  representationRevision: string;
}): Promise<QasExactPromotionResult[]> {
  const results: QasExactPromotionResult[] = [];
  for (const sample of input.samples) {
    const exact = await input.resolve(sample);
    const result = exact === null
      ? { canonicalId: null, packetKey: sample.packetKey, sourceRef: sample.sourceRef, state: 'NOT_FOUND' as const, evidenceRefs: [] }
      : exact.workspaceRevision !== input.workspaceRevision
        ? { canonicalId: exact.canonicalId, packetKey: exact.packetKey, sourceRef: exact.sourceRef, state: 'REVISION_MISMATCH' as const, evidenceRefs: exact.evidenceRefs }
        : exact.representationRevision !== input.representationRevision
          ? { canonicalId: exact.canonicalId, packetKey: exact.packetKey, sourceRef: exact.sourceRef, state: 'STALE_REPRESENTATION' as const, evidenceRefs: exact.evidenceRefs }
          : { canonicalId: exact.canonicalId, packetKey: exact.packetKey, sourceRef: exact.sourceRef, state: 'EXACT_PROMOTED' as const, evidenceRefs: exact.evidenceRefs };
    results.push(QasExactPromotionResultSchema.parse(result));
  }
  return results;
}
