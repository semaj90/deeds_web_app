import { z } from 'zod';

import type { OntologyLinkedTupleV1 } from './ontology-linked-tuple-v1.js';

/**
 * Revision-qualified admission envelope for promoting a grounded
 * OntologyLinkedTupleV1 into downstream caches, taxonomy candidates, graph
 * projections, or the canonical atlas_ontology_tuples surface.
 *
 * This contract deliberately lives OUTSIDE OntologyLinkedTupleV1. The linked
 * tuple table is allowed to retain GATED/REFERENCE evidence rows; admission is
 * a separate decision that must be backed by canonical source/workspace and
 * representation lineage.
 */
export const OntologyFanoutAuthorityV1Schema = z
  .object({
    schemaVersion: z.literal('atlas.ontology-fanout-authority.v1'),
    packetKey: z.string().min(1),
    sourceRef: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    sourceRevision: z.string().min(1),
    workspaceRevision: z.string().min(1),
    representationId: z.literal('semantic_768'),
    representationRevision: z.union([z.string().min(1), z.number().int().nonnegative()]),
    featureRevision: z.string().min(1),
    ontologyRevision: z.string().min(1),
    graphRevision: z.string().min(1).nullable().optional(),
    producerRevision: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)).min(1).max(64),
    ontologyIds: z.array(z.string().min(1)).min(1).max(32),
    conceptIds: z.array(z.string().min(1)).min(1).max(32),
  })
  .strict();

export type OntologyFanoutAuthorityV1 = z.infer<typeof OntologyFanoutAuthorityV1Schema>;

export const OntologyFanoutBlockerCodeSchema = z.enum([
  'FANOUT_AUTHORITY_MISSING',
  'FANOUT_PACKET_KEY_MISMATCH',
  'FANOUT_SOURCE_REF_MISMATCH',
  'FANOUT_SOURCE_REVISION_INVALID',
  'FANOUT_WORKSPACE_REVISION_INVALID',
  'FANOUT_REPRESENTATION_NOT_SEMANTIC_768',
  'FANOUT_REPRESENTATION_REVISION_INVALID',
  'FANOUT_FEATURE_REVISION_INVALID',
  'FANOUT_ONTOLOGY_REVISION_INVALID',
  'FANOUT_PRODUCER_REVISION_INVALID',
  'FANOUT_EVIDENCE_REQUIRED',
  'FANOUT_EVIDENCE_NOT_GROUNDED_IN_TUPLE',
  'FANOUT_ONTOLOGY_IDS_REQUIRED',
  'FANOUT_CONCEPT_IDS_REQUIRED',
  'FANOUT_ONTOLOGY_ID_MISMATCH',
  'FANOUT_CONCEPT_ID_MISMATCH',
  'GRAPH_FANOUT_GRAPH_REVISION_REQUIRED',
]);

export type OntologyFanoutBlockerCode = z.infer<typeof OntologyFanoutBlockerCodeSchema>;

const FORBIDDEN_REVISION_TOKENS = new Set([
  'unknown',
  'undefined',
  'null',
  'none',
  'latest',
  'current',
  'unset',
  'n/a',
  'na',
]);

export function isAuthoritativeRevisionToken(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.length > 0 && !FORBIDDEN_REVISION_TOKENS.has(normalized);
}

function includesAll(haystack: readonly string[], needles: readonly string[]): boolean {
  const set = new Set(haystack.map((value) => value.trim()).filter(Boolean));
  return needles.every((value) => set.has(value.trim()));
}

export interface OntologyFanoutEvaluationV1 {
  cacheEligible: boolean;
  taxonomyCandidateEligible: boolean;
  canonicalTupleEligible: boolean;
  graphFanoutEligible: boolean;
  blockers: OntologyFanoutBlockerCode[];
}

/**
 * Evaluate a linked tuple against explicit authority. No ID/revision is
 * synthesized and no fallback such as sourceRevision -> graphRevision is
 * permitted.
 */
export function evaluateOntologyFanoutAuthorityV1(
  tuple: OntologyLinkedTupleV1,
  authorityInput: OntologyFanoutAuthorityV1 | null | undefined,
): OntologyFanoutEvaluationV1 {
  const blockers: OntologyFanoutBlockerCode[] = [];
  if (!authorityInput) {
    return {
      cacheEligible: false,
      taxonomyCandidateEligible: false,
      canonicalTupleEligible: false,
      graphFanoutEligible: false,
      blockers: ['FANOUT_AUTHORITY_MISSING'],
    };
  }

  const parsed = OntologyFanoutAuthorityV1Schema.safeParse(authorityInput);
  if (!parsed.success) {
    return {
      cacheEligible: false,
      taxonomyCandidateEligible: false,
      canonicalTupleEligible: false,
      graphFanoutEligible: false,
      blockers: ['FANOUT_AUTHORITY_MISSING'],
    };
  }
  const authority = parsed.data;

  if (!tuple.packetKey || tuple.packetKey !== authority.packetKey) blockers.push('FANOUT_PACKET_KEY_MISMATCH');
  if (tuple.sourceRef !== authority.sourceRef) blockers.push('FANOUT_SOURCE_REF_MISMATCH');
  if (!isAuthoritativeRevisionToken(authority.sourceRevision)) blockers.push('FANOUT_SOURCE_REVISION_INVALID');
  if (!isAuthoritativeRevisionToken(authority.workspaceRevision)) blockers.push('FANOUT_WORKSPACE_REVISION_INVALID');
  if (authority.representationId !== 'semantic_768') blockers.push('FANOUT_REPRESENTATION_NOT_SEMANTIC_768');
  if (!isAuthoritativeRevisionToken(authority.representationRevision)) blockers.push('FANOUT_REPRESENTATION_REVISION_INVALID');
  if (!isAuthoritativeRevisionToken(authority.featureRevision)) blockers.push('FANOUT_FEATURE_REVISION_INVALID');
  if (!isAuthoritativeRevisionToken(authority.ontologyRevision)) blockers.push('FANOUT_ONTOLOGY_REVISION_INVALID');
  if (!isAuthoritativeRevisionToken(authority.producerRevision)) blockers.push('FANOUT_PRODUCER_REVISION_INVALID');

  if (tuple.evidenceRefs.length === 0 || authority.evidenceRefs.length === 0) blockers.push('FANOUT_EVIDENCE_REQUIRED');
  else if (!includesAll(tuple.evidenceRefs, authority.evidenceRefs)) blockers.push('FANOUT_EVIDENCE_NOT_GROUNDED_IN_TUPLE');

  if (tuple.labelKind === 'ontology') {
    if (authority.ontologyIds.length === 0 || tuple.ontologyIds.length === 0) blockers.push('FANOUT_ONTOLOGY_IDS_REQUIRED');
    if (authority.conceptIds.length === 0 || tuple.conceptIds.length === 0) blockers.push('FANOUT_CONCEPT_IDS_REQUIRED');
    if (!includesAll(tuple.ontologyIds, authority.ontologyIds)) blockers.push('FANOUT_ONTOLOGY_ID_MISMATCH');
    if (!includesAll(tuple.conceptIds, authority.conceptIds)) blockers.push('FANOUT_CONCEPT_ID_MISMATCH');
  }

  const canonicalBlockers = blockers.filter((code) => code !== 'GRAPH_FANOUT_GRAPH_REVISION_REQUIRED');
  const canonicalTupleEligible =
    tuple.evidenceState === 'ACTIVE_VERIFIED' &&
    canonicalBlockers.length === 0;

  const graphRevisionValid = isAuthoritativeRevisionToken(authority.graphRevision);
  if (!graphRevisionValid) blockers.push('GRAPH_FANOUT_GRAPH_REVISION_REQUIRED');

  return {
    cacheEligible: canonicalTupleEligible,
    taxonomyCandidateEligible: canonicalTupleEligible && tuple.labelKind === 'ontology',
    canonicalTupleEligible,
    graphFanoutEligible: canonicalTupleEligible && graphRevisionValid,
    blockers: Array.from(new Set(blockers)),
  };
}
