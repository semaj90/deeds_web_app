import { z } from 'zod';

/**
 * ResearchEvidenceV1 — one proposition backed by one source, produced by a research/observation step (code read, pinned doc,
 * OpenWiki claim, web fetch). It is evidence, never identity: it carries no packet_key/CandidateOrdinal and can never claim
 * canonical authority. Zod is the runtime source of truth; python/atlas_contract_parity mirrors it in Pydantic.
 * Absent facts are explicit nulls (null is not "none required" and is never coerced).
 */
export const RESEARCH_EVIDENCE_SCHEMA_V1 = 'atlas.research-evidence.v1' as const;
export const RESEARCH_SOURCE_KINDS_V1 = ['CODE', 'PINNED_DOCUMENTATION', 'OPENWIKI_CLAIM', 'WEB'] as const;

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const HTTP_URL = /^https?:\/\/\S+$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

export const webProvenanceV1Schema = z.object({
  url: z.string().regex(HTTP_URL),
  fetchedAt: z.string().regex(UTC_TIMESTAMP),
  responseDigest: z.string().regex(SHA256),
}).strict();

export const researchEvidenceV1Schema = z.object({
  schema: z.literal(RESEARCH_EVIDENCE_SCHEMA_V1),
  evidenceId: z.string().min(1),
  sourceKind: z.enum(RESEARCH_SOURCE_KINDS_V1),
  sourceRef: z.string().min(1),
  /** Required for revision-addressable sources (CODE / PINNED_DOCUMENTATION / OPENWIKI_CLAIM); null only for WEB. */
  sourceRevision: z.string().min(1).nullable(),
  contentDigest: z.string().regex(SHA256),
  proposition: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  /** Required for WEB (URL + fetch time + response digest); must be null for every other kind. */
  webProvenance: webProvenanceV1Schema.nullable(),
  producerRevision: z.string().min(1),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((e, ctx) => {
  if (e.sourceKind !== 'WEB' && e.sourceRevision === null) {
    ctx.addIssue({ code: 'custom', path: ['sourceRevision'], message: 'SOURCE_REVISION_REQUIRED_FOR_REVISIONED_SOURCE' });
  }
  if (e.sourceKind === 'WEB' && e.webProvenance === null) {
    ctx.addIssue({ code: 'custom', path: ['webProvenance'], message: 'WEB_PROVENANCE_REQUIRED_FOR_WEB' });
  }
  if (e.sourceKind !== 'WEB' && e.webProvenance !== null) {
    ctx.addIssue({ code: 'custom', path: ['webProvenance'], message: 'WEB_PROVENANCE_FORBIDDEN_FOR_NON_WEB' });
  }
});
export type ResearchEvidenceV1 = z.infer<typeof researchEvidenceV1Schema>;

/** JSON Schema projection for Zod <-> Pydantic parity. Cross-field rules above are not representable; fixtures cover them. */
export function researchEvidenceV1JsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(researchEvidenceV1Schema) as Record<string, unknown>;
}
