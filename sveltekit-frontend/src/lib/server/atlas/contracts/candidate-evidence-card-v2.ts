/**
 * CandidateEvidenceCardV2 — the code-domain successor to `CandidateEvidenceCardV1`
 * (`candidate-evidence-card-v1.ts`), per
 * `openspec/changes/parent-atlas-code-langextract-evidence-lane/design.md` section 3.3.
 *
 * ADDITIVE, not a replacement: V1 is not deleted, and no existing V1 consumer is migrated by this
 * file. V2 is the target shape for the corrected staging-plane pipeline (RRF -> parallel structural/
 * code-extraction/ontology -> CandidateEvidenceCardV2 -> cheap tabular router -> conditional
 * AtlasGemma -> conditional mxbai -> ACE), which is why it carries `structural`, `semanticGrounding`,
 * `graph`, and `ontology` sections V1 does not.
 *
 * `presenceMask` exists specifically to close the ambiguity the EVIDENCE-CARD-01 finding left open:
 * an empty `semanticGrounding` array must be distinguishable from "extraction for this section was
 * never attempted" (e.g. because the only available extractor was domain-mismatched, per that
 * finding) versus "extraction ran and genuinely found nothing." A downstream consumer (the tabular
 * router, ACE) MUST check `presenceMask` before treating an empty section as evidence of absence.
 */

import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);

export const CandidateEvidenceIdentityV2Schema = z.object({
  canonicalId: id,
  candidateOrdinal: z.number().int().nonnegative(),
  sourceRevision: revision,
  featureRevision: revision,
}).strict();

export type CandidateEvidenceIdentityV2 = z.infer<typeof CandidateEvidenceIdentityV2Schema>;

export const CandidateStructuralV2Schema = z.object({
  symbols: z.array(z.string()).default([]),
  apis: z.array(z.string()).default([]),
  calls: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  tests: z.array(z.string()).default([]),
}).strict();

export type CandidateStructuralV2 = z.infer<typeof CandidateStructuralV2Schema>;

export const CandidateSemanticGroundingV2Schema = z.object({
  constraints: z.array(z.string()).default([]),
  invariants: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  failureModes: z.array(z.string()).default([]),
  ownershipClaims: z.array(z.string()).default([]),
}).strict();

export type CandidateSemanticGroundingV2 = z.infer<typeof CandidateSemanticGroundingV2Schema>;

export const CandidateGraphSignalsV2Schema = z.object({
  pageRank: z.number().finite().optional(),
  personalizedPageRank: z.number().finite().optional(),
  graphDistance: z.number().finite().optional(),
}).strict();

export type CandidateGraphSignalsV2 = z.infer<typeof CandidateGraphSignalsV2Schema>;

export const CandidateOntologyV2Schema = z.object({
  relationTypes: z.array(z.string()).default([]),
  conceptIds: z.array(z.string()).default([]),
  supportCount: z.number().int().nonnegative().default(0),
}).strict();

export type CandidateOntologyV2 = z.infer<typeof CandidateOntologyV2Schema>;

export const CandidateRankSignalsV2Schema = z.object({
  semanticCosine: z.number().finite().optional(),
  rrf: z.number().finite().optional(),
  atlasGemma: z.number().finite().optional(),
  mxbaiRaw: z.number().finite().optional(),
  mxbaiNormalized: z.number().finite().min(0).max(1).optional(),
}).strict();

export type CandidateRankSignalsV2 = z.infer<typeof CandidateRankSignalsV2Schema>;

export const CANDIDATE_EVIDENCE_PRESENCE_SECTIONS = [
  'structural',
  'semanticGrounding',
  'graph',
  'ontology',
] as const;

export const CandidateEvidencePresenceMaskV2Schema = z.object({
  structural: z.boolean(),
  semanticGrounding: z.boolean(),
  graph: z.boolean(),
  ontology: z.boolean(),
}).strict();

export type CandidateEvidencePresenceMaskV2 = z.infer<typeof CandidateEvidencePresenceMaskV2Schema>;

export const CandidateEvidenceCardV2Schema = z.object({
  schema: z.literal('atlas.candidate-evidence-card.v2').default('atlas.candidate-evidence-card.v2'),
  identity: CandidateEvidenceIdentityV2Schema,
  structural: CandidateStructuralV2Schema,
  semanticGrounding: CandidateSemanticGroundingV2Schema,
  graph: CandidateGraphSignalsV2Schema,
  ontology: CandidateOntologyV2Schema,
  rank: CandidateRankSignalsV2Schema,
  presenceMask: CandidateEvidencePresenceMaskV2Schema,
  evidenceRefs: z.array(z.string()).default([]),
}).strict();

export type CandidateEvidenceCardV2 = z.infer<typeof CandidateEvidenceCardV2Schema>;

/**
 * Reads a card's evidence for a given section only if that section was actually attempted,
 * returning `null` otherwise — the type-safe way to enforce "check presenceMask before trusting an
 * empty array" rather than relying on every call site to remember to check it manually.
 */
export function readIfPresent<
  S extends (typeof CANDIDATE_EVIDENCE_PRESENCE_SECTIONS)[number]
>(card: CandidateEvidenceCardV2, section: S): CandidateEvidenceCardV2[S] | null {
  return card.presenceMask[section] ? card[section] : null;
}
