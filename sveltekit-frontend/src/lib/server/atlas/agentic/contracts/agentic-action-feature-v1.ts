import { z } from 'zod';
import type { AgenticActionV1 } from './agentic-action-v1.js';
import {
  encodeAgenticCapabilityMaskV1,
  type AgenticCapabilityV1,
} from './agentic-capability-mask-v1.js';

export const AgenticActionFeatureV1Schema = z.object({
  schema: z.literal('atlas.agentic-action-feature.v1'),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  featureRevision: z.string().min(1),
  actionIds: z.array(z.string().min(1)),
  capabilityMask: z.number().int().nonnegative().max(0xffff),
  actionCount: z.number().int().nonnegative(),
  readOnlyActionCount: z.number().int().nonnegative(),
  mutatingActionCount: z.number().int().nonnegative(),
  approvalRequiredActionCount: z.number().int().nonnegative(),
  evidenceRefs: z.array(z.string().min(1)),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type AgenticActionFeatureV1 = z.infer<typeof AgenticActionFeatureV1Schema>;

/**
 * Adds agentic action availability as a derived sidecar to the existing
 * CandidateFeatureMatrix. It joins by the caller-supplied CandidateOrdinal
 * and canonical ID; it never creates either identity or a retrieval vote.
 */
export function projectAgenticActionFeaturesV1(input: {
  candidateOrdinal: number;
  canonicalId: string;
  featureRevision: string;
  actions: readonly AgenticActionV1[];
  evidenceRefs?: readonly string[];
}): AgenticActionFeatureV1 {
  const actions = [...input.actions].sort((a, b) => a.actionId.localeCompare(b.actionId));
  const capabilities = actions.map((action) => action.kind as AgenticCapabilityV1);
  const mask = encodeAgenticCapabilityMaskV1(capabilities).mask;
  const readOnlyActionCount = actions.filter((action) => action.mutability === 'READ_ONLY').length;
  return AgenticActionFeatureV1Schema.parse({
    schema: 'atlas.agentic-action-feature.v1',
    candidateOrdinal: input.candidateOrdinal,
    canonicalId: input.canonicalId,
    featureRevision: input.featureRevision,
    actionIds: actions.map((action) => action.actionId),
    capabilityMask: mask,
    actionCount: actions.length,
    readOnlyActionCount,
    mutatingActionCount: actions.length - readOnlyActionCount,
    approvalRequiredActionCount: actions.filter((action) => action.requiresHumanApproval).length,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort(),
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
