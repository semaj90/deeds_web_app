import { z } from 'zod';
import { sha256Stable } from './contracts.js';
import type { HelperRegistryV1 } from './helper-registry-v2.js';
import type { HelperCapabilitySnapshotV1 } from './helper-capability-snapshot-v2.js';
import type { KeywordRecognitionV1 } from './keyword-recognition-v2.js';

/**
 * AFC-HELPER-03 (2026-09-27) -- "v2"-named for the same reason as the
 * sibling files in this set (a concurrent write landed a different
 * implementation on the original path).
 *
 * Tri-state helper eligibility: ELIGIBLE / INELIGIBLE / BLOCKED. Combines
 * exactly three already-real inputs: HelperRegistryV1 (static),
 * KeywordRecognitionV1 (query evidence), HelperCapabilitySnapshotV1
 * (runtime availability).
 */

export const HELPER_ELIGIBILITY_SCHEMA = 'atlas.helper-eligibility.v1' as const;

export const helperEligibilityStateSchema = z.enum(['ELIGIBLE', 'INELIGIBLE', 'BLOCKED']);
export type HelperEligibilityStateV1 = z.infer<typeof helperEligibilityStateSchema>;

export const helperEligibilityReasonSchema = z.enum([
  'KEYWORD_MATCH',
  'NO_KEYWORD_MATCH',
  'CAPABILITY_UNAVAILABLE',
  'CAPABILITY_AVAILABLE',
]);
export type HelperEligibilityReasonV1 = z.infer<typeof helperEligibilityReasonSchema>;

export const helperEligibilityEntrySchema = z.object({
  helperId: z.string().min(1),
  state: helperEligibilityStateSchema,
  positiveReasons: z.array(helperEligibilityReasonSchema),
  blockingReasons: z.array(helperEligibilityReasonSchema),
  matchedEvidenceRefs: z.array(z.string().min(1)),
  estimatedCostClass: z.enum(['CHEAP', 'MEDIUM', 'EXPENSIVE']),
}).strict();
export type HelperEligibilityEntryV1 = z.infer<typeof helperEligibilityEntrySchema>;

export const helperEligibilityV1Schema = z.object({
  schema: z.literal(HELPER_ELIGIBILITY_SCHEMA),
  queryChecksum: z.string().length(64),
  helperRegistryRevision: z.string().min(1),
  vocabularyRevision: z.string().min(1),
  capabilitySnapshotChecksum: z.string().length(64),
  keywordRecognitionChecksum: z.string().length(64),
  helpers: z.array(helperEligibilityEntrySchema),
  checksum: z.string().length(64),
}).strict();
export type HelperEligibilityV1 = z.infer<typeof helperEligibilityV1Schema>;

export function computeHelperEligibilityV1(input: {
  registry: HelperRegistryV1;
  keywordRecognition: KeywordRecognitionV1;
  capabilitySnapshot: HelperCapabilitySnapshotV1;
}): HelperEligibilityV1 {
  const { registry, keywordRecognition, capabilitySnapshot } = input;

  if (registry.helperRegistryRevision !== capabilitySnapshot.helperRegistryRevision) {
    throw new Error(`HELPER_ELIGIBILITY_REGISTRY_SNAPSHOT_REVISION_MISMATCH:registry=${registry.helperRegistryRevision}:snapshot=${capabilitySnapshot.helperRegistryRevision}`);
  }

  const availabilityByHelper = new Map(capabilitySnapshot.observations.map((o) => [o.helperId, o]));

  const requestedHelperIds = new Set<string>();
  const evidenceByHelper = new Map<string, string[]>();
  for (const match of keywordRecognition.matches) {
    for (const helperId of match.helperRefs) {
      requestedHelperIds.add(helperId);
      const list = evidenceByHelper.get(helperId) ?? [];
      list.push(`keyword:${match.term}`);
      evidenceByHelper.set(helperId, list);
    }
  }

  const helpers: HelperEligibilityEntryV1[] = registry.helpers.map((helper) => {
    const requested = requestedHelperIds.has(helper.helperId);
    const observation = availabilityByHelper.get(helper.helperId);
    const available = observation?.available ?? false;

    let state: HelperEligibilityStateV1;
    const positiveReasons: HelperEligibilityReasonV1[] = [];
    const blockingReasons: HelperEligibilityReasonV1[] = [];

    if (!requested) {
      state = 'INELIGIBLE';
      blockingReasons.push('NO_KEYWORD_MATCH');
    } else if (!available) {
      state = 'BLOCKED';
      positiveReasons.push('KEYWORD_MATCH');
      blockingReasons.push('CAPABILITY_UNAVAILABLE');
    } else {
      state = 'ELIGIBLE';
      positiveReasons.push('KEYWORD_MATCH', 'CAPABILITY_AVAILABLE');
    }

    return {
      helperId: helper.helperId,
      state,
      positiveReasons,
      blockingReasons,
      matchedEvidenceRefs: evidenceByHelper.get(helper.helperId) ?? [],
      estimatedCostClass: helper.costClass,
    };
  });

  const body = {
    schema: HELPER_ELIGIBILITY_SCHEMA as typeof HELPER_ELIGIBILITY_SCHEMA,
    queryChecksum: keywordRecognition.queryChecksum,
    helperRegistryRevision: registry.helperRegistryRevision,
    vocabularyRevision: keywordRecognition.vocabularyRevision,
    capabilitySnapshotChecksum: capabilitySnapshot.checksum,
    keywordRecognitionChecksum: keywordRecognition.checksum,
    helpers: [...helpers].sort((a, b) => a.helperId.localeCompare(b.helperId)),
  };
  return helperEligibilityV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}
