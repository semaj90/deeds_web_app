import { z } from 'zod';
import { classifyDomainTaxonomy, DOMAIN_TAXONOMY_VERSION } from '../../atlas/domain-taxonomy.js';
import { EvidenceClaimV1Schema } from './evidence-claim-v1.js';

const sha256RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const oaklibResponseSchema = z.object({
  schema: z.literal('atlas.oaklib-label-search-response.v1'),
  status: z.literal('PROPOSAL_ONLY'),
  ontologyRevision: sha256RevisionSchema,
  producerRevision: z.string().trim().min(1).max(512),
  matches: z.array(z.object({
    searchText: z.string().trim().min(1).max(256),
    externalIds: z.array(z.string().trim().min(1).max(512)).max(256),
  }).strict()).max(16),
  candidateBundle: z.object({
    schema: z.literal('atlas.oaklib-candidate-bundle.v1'),
    sourceSelector: z.literal('atlas-local-ontology'),
    ontologyRevision: sha256RevisionSchema,
    producerRevision: z.string().trim().min(1).max(512),
    concepts: z.array(z.object({
      externalId: z.string().trim().min(1).max(512),
      label: z.string().trim().min(1).max(512),
      namespace: z.string().trim().min(1).max(256),
      evidenceRefs: z.array(z.string().trim().min(1).max(1024)).min(1).max(64),
      canonicalAuthority: z.literal(false),
    }).passthrough()).max(1024),
    canonicalAuthority: z.literal(false),
  }).passthrough(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((value, context) => {
  if (
    value.candidateBundle.ontologyRevision !== value.ontologyRevision
    || value.candidateBundle.producerRevision !== value.producerRevision
  ) {
    context.addIssue({ code: 'custom', path: ['candidateBundle'], message: 'OAKLIB_REVISION_MISMATCH' });
  }
  const candidateIds = new Set(value.candidateBundle.concepts.map((concept) => concept.externalId));
  if (value.matches.some((match) => match.externalIds.some((externalId) => !candidateIds.has(externalId)))) {
    context.addIssue({ code: 'custom', path: ['matches'], message: 'OAKLIB_MATCH_WITHOUT_CANDIDATE' });
  }
});

const inputSchema = z.object({
  claims: z.array(EvidenceClaimV1Schema).max(16),
  registryStatus: z.enum(['PRESENT', 'ABSENT', 'UNAVAILABLE', 'NOT_CHECKED']).default('NOT_CHECKED'),
  oaklib: z.discriminatedUnion('status', [
    z.object({ status: z.literal('UNAVAILABLE') }).strict(),
    z.object({ status: z.literal('RESPONSE'), response: z.unknown() }).strict(),
  ]).optional(),
}).strict();

const oakCandidateSchema = z.object({
  externalId: z.string().min(1),
  label: z.string().min(1),
  namespace: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();

const mappingSchema = z.object({
  claimId: z.string().uuid(),
  supportingClaimIds: z.array(z.string().uuid()).min(1).max(1),
  sourceId: z.string().min(1).max(512),
  sourceRevision: z.string().min(1).max(512),
  candidateDomainId: z.string().min(1).max(512).nullable(),
  candidateDomainLabel: z.string().min(1).max(512).nullable(),
  confidence: z.number().finite().min(0).max(1),
  status: z.enum(['PROPOSED', 'UNRESOLVED']),
  evidenceKinds: z.array(z.string().min(1)),
  oakCandidates: z.array(oakCandidateSchema).max(256),
  featureIdentity: z.object({
    state: z.literal('UNRESOLVED'),
    reason: z.enum(['REGISTRY_ABSENT', 'REGISTRY_UNAVAILABLE', 'REGISTRY_NOT_CHECKED', 'NO_BINDING_RECEIPT']),
    canonicalFeatureId: z.null(),
    canonicalAuthority: z.literal(false),
  }).strict(),
}).strict();

const proposalSchema = z.object({
  schema: z.literal('atlas.evidence-taxonomy-proposal.v1'),
  taxonomyRevision: z.string().min(1).max(512),
  oaklibStatus: z.enum(['NOT_REQUESTED', 'UNAVAILABLE', 'INVALID_RESPONSE', 'AVAILABLE']),
  oaklibOntologyRevision: sha256RevisionSchema.nullable(),
  oaklibProducerRevision: z.string().min(1).max(512).nullable(),
  canonicalAuthority: z.literal(false),
  mappings: z.array(mappingSchema).max(16),
}).strict();

export type EvidenceTaxonomyProposalV1 = z.infer<typeof proposalSchema>;

export function proposeEvidenceTaxonomyV1(input: unknown): EvidenceTaxonomyProposalV1 {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return emptyProposal();

  const oaklib = parsed.data.oaklib;
  const oaklibResult = oaklib?.status === 'RESPONSE' ? oaklibResponseSchema.safeParse(oaklib.response) : null;
  const oaklibStatus = oaklib?.status === 'UNAVAILABLE'
    ? 'UNAVAILABLE' as const
    : oaklibResult === null
      ? 'NOT_REQUESTED' as const
      : oaklibResult.success ? 'AVAILABLE' as const : 'INVALID_RESPONSE' as const;
  const ontologyRevision = oaklibResult?.success ? oaklibResult.data.ontologyRevision : null;
  const producerRevision = oaklibResult?.success ? oaklibResult.data.producerRevision : null;
  const concepts = oaklibResult?.success ? oaklibResult.data.candidateBundle.concepts : [];
  const matches = oaklibResult?.success ? oaklibResult.data.matches : [];

  return proposalSchema.parse({
    schema: 'atlas.evidence-taxonomy-proposal.v1',
    taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
    oaklibStatus,
    oaklibOntologyRevision: ontologyRevision,
    oaklibProducerRevision: producerRevision,
    canonicalAuthority: false,
    mappings: parsed.data.claims.map((claim) => {
      const classification = classifyDomainTaxonomy({
        sourceRef: `evidence://${claim.sourceId}`,
        title: claim.what,
        summary: claim.assertion,
        metadata: [claim.who, claim.relationPredicate, claim.why, claim.how],
      });
      const domainLabel = classification.primary_domain;
      const matchingIds = domainLabel
        ? new Set(matches.filter((match) => match.searchText === domainLabel).flatMap((match) => match.externalIds))
        : new Set<string>();
      const oakCandidates = concepts
        .filter((candidate) => matchingIds.has(candidate.externalId))
        .map((candidate) => ({
          externalId: candidate.externalId,
          label: candidate.label,
          namespace: candidate.namespace,
          evidenceRefs: candidate.evidenceRefs,
        }));
      const featureIdentityReason = parsed.data.registryStatus === 'ABSENT'
        ? 'REGISTRY_ABSENT' as const
        : parsed.data.registryStatus === 'UNAVAILABLE'
          ? 'REGISTRY_UNAVAILABLE' as const
          : parsed.data.registryStatus === 'NOT_CHECKED'
            ? 'REGISTRY_NOT_CHECKED' as const
            : 'NO_BINDING_RECEIPT' as const;

      return {
        claimId: claim.claimId,
        supportingClaimIds: [claim.claimId],
        sourceId: claim.sourceId,
        sourceRevision: claim.sourceRevision,
        candidateDomainId: domainLabel ? `domain:${domainLabel}` : null,
        candidateDomainLabel: domainLabel,
        confidence: classification.confidence,
        status: domainLabel ? 'PROPOSED' as const : 'UNRESOLVED' as const,
        evidenceKinds: classification.evidence.map((entry) => entry.kind),
        oakCandidates,
        featureIdentity: {
          state: 'UNRESOLVED' as const,
          reason: featureIdentityReason,
          canonicalFeatureId: null,
          canonicalAuthority: false as const,
        },
      };
    }),
  });
}

function emptyProposal(): EvidenceTaxonomyProposalV1 {
  return proposalSchema.parse({
    schema: 'atlas.evidence-taxonomy-proposal.v1',
    taxonomyRevision: DOMAIN_TAXONOMY_VERSION,
    oaklibStatus: 'NOT_REQUESTED',
    oaklibOntologyRevision: null,
    oaklibProducerRevision: null,
    canonicalAuthority: false,
    mappings: [],
  });
}
