import { z } from 'zod';

/**
 * AR-01 (openspec/changes/parent-atlas-agentic-repair-fabric).
 *
 * Evidence envelope for the Tier-2 (deep) concept resolver -- the live
 * real-oaklib FastAPI kernel at :8095 (python/atlas_oak_kernel.py, owned by
 * parent-atlas-ontology-kernel). Distinct from, and never overriding, Tier-1
 * evidence from the TypeScript domain resolver
 * (parent-atlas-ontology-oaklib-fanout-bitmap's OntologyResolutionResultV1).
 *
 * Hard rule (matches OntologyResolutionRequestV1's own "never mints lineage
 * identity" rule): `canonicalAuthority` is always `false`. A `resolvedCurie`
 * is evidence/context only -- it is never a packetKey, sourceRevision,
 * workspaceRevision, or any other canonical identity value.
 */

export const OakResolutionStateV1Schema = z.enum([
  'RESOLVED',
  'AMBIGUOUS',
  'UNRESOLVED',
  'RESOLUTION_UNAVAILABLE',
]);
export type OakResolutionStateV1 = z.infer<typeof OakResolutionStateV1Schema>;

export const OakResolutionEvidenceV1Schema = z
  .object({
    schema: z.literal('atlas.oak-resolution-evidence.v1'),
    requestId: z.string().min(1),
    rawLabel: z.string().min(1),
    normalizedLabel: z.string().min(1),
    resolvedCurie: z.string().min(1).nullable(),
    preferredLabel: z.string().min(1).nullable(),
    synonyms: z.array(z.string().min(1)),
    ancestors: z.array(z.string().min(1)),
    ontologyRevision: z.string().min(1).nullable(),
    resolverRevision: z.string().min(1),
    state: OakResolutionStateV1Schema,
    evidenceRefs: z.array(z.string().min(1)),
    canonicalAuthority: z.literal(false),
  })
  .strict();
export type OakResolutionEvidenceV1 = z.infer<typeof OakResolutionEvidenceV1Schema>;
