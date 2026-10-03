import { z } from 'zod';

/**
 * OAKLIB-equivalent resolution boundary contract (Phase 1 of
 * openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap).
 *
 * This is a request/response envelope only -- no I/O. The real resolver
 * (`ontology-resolution-boundary-postgres.ts`) loads concepts from
 * `atlas_domain_ontology`, delegates the actual label/alias matching to the
 * existing dormant `recognizeConceptV1()` (entity-concept-taxonomy-v1.ts,
 * reused rather than duplicated -- see this change's tasks.md 2.1), and walks
 * `parent_group_id` for ancestors.
 *
 * Hard rule (spec.md "Never mints Parent Atlas lineage identity"): this
 * boundary never produces or validates packetKey/sourceRevision/
 * workspaceRevision/canonicalChunkId/graphRevision. `callerContext` fields
 * below are passthrough-only, for caller-side correlation.
 */

export const OntologyResolutionStateV1Schema = z.enum([
  'RESOLVED',
  'UNRESOLVED',
  'AMBIGUOUS',
  'RESOLUTION_UNAVAILABLE',
]);
export type OntologyResolutionStateV1 = z.infer<typeof OntologyResolutionStateV1Schema>;

export const OntologyResolutionRequestV1Schema = z
  .object({
    schemaVersion: z.literal('atlas.ontology-resolution-request.v1'),
    label: z.string().min(1),
    /**
     * Caller-supplied identity, passthrough-only. Never validated, minted,
     * or overwritten by this boundary -- see class-level comment above.
     */
    callerContext: z
      .object({
        packetKey: z.string().min(1).optional(),
        sourceRef: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type OntologyResolutionRequestV1 = z.infer<typeof OntologyResolutionRequestV1Schema>;

export const OntologyResolutionResultV1Schema = z
  .object({
    schemaVersion: z.literal('atlas.ontology-resolution-result.v1'),
    label: z.string().min(1),
    resolutionState: OntologyResolutionStateV1Schema,
    conceptId: z.string().min(1).nullable(),
    candidateConceptIds: z.array(z.string().min(1)),
    matchMethod: z
      .enum(['concept_id', 'canonical_label', 'alias', 'none'])
      .nullable(),
    ontologyRevision: z.string().min(1).nullable(),
    /** Passthrough of the request's callerContext, unmodified. */
    callerContext: z
      .object({
        packetKey: z.string().min(1).optional(),
        sourceRef: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type OntologyResolutionResultV1 = z.infer<typeof OntologyResolutionResultV1Schema>;

export const OntologyAncestorRequestV1Schema = z
  .object({
    schemaVersion: z.literal('atlas.ontology-ancestor-request.v1'),
    conceptId: z.string().min(1),
  })
  .strict();
export type OntologyAncestorRequestV1 = z.infer<typeof OntologyAncestorRequestV1Schema>;

export const OntologyAncestorResultV1Schema = z
  .object({
    schemaVersion: z.literal('atlas.ontology-ancestor-result.v1'),
    conceptId: z.string().min(1),
    resolutionState: OntologyResolutionStateV1Schema,
    ancestorConceptIds: z.array(z.string().min(1)),
    ontologyRevision: z.string().min(1).nullable(),
  })
  .strict();
export type OntologyAncestorResultV1 = z.infer<typeof OntologyAncestorResultV1Schema>;
