import { z } from 'zod';

export const PredicateEnum = z.enum([
  'BELONGS_TO_DOMAIN',
  'IMPORTS_FROM',
  'DEPENDS_ON',
  'USES',
  'DEFINES',
  'EXTENDS',
  'IMPLEMENTS',
  'REFERENCES',
  'TESTS',
  'DOCUMENTS',
  'SIMILAR_DOMAIN',
  'PRECEDES',
  'SUPERSEDES',
  'RELATED_TO',
]);
export type Predicate = z.infer<typeof PredicateEnum>;

export const ProposalSourceEnum = z.enum([
  'domain_classifier_prediction',
  'ast_analysis',
  'langextract_relation',
  'graph_neighbor_inference',
  'documentation_analysis',
  'human_annotation',
  'other',
]);
export type ProposalSource = z.infer<typeof ProposalSourceEnum>;

export const OntologyProposalStatusEnum = z.enum([
  'PROPOSED',
  'GATED_LOW_CONFIDENCE',
  'GATED_VERSION_MISMATCH',
  'GATED_SUBJECT_UNRESOLVED',
  'GATED_OBJECT_UNRESOLVED',
  'ACCEPTED',
  'REJECTED',
  'APPROVED',
  'DEPRECATED',
]);
export type OntologyProposalStatus = z.infer<typeof OntologyProposalStatusEnum>;

export const OntologyProposalSchema = z.object({
  schemaId: z.literal('atlas:ontology:proposal'),
  schemaVersion: z.literal('1.0.0'),
  proposalId: z.string().uuid(),
  subjectPacketKey: z.string().min(8),
  predicate: PredicateEnum,
  objectPacketKey: z.string().min(8),
  confidence: z.number().min(0).max(1).optional(),
  evidenceIds: z.array(z.string()).optional(),
  proposalSource: ProposalSourceEnum.optional(),
  proposedBy: z.string().min(1),
  ontologyVersion: z.string().min(1),
  status: OntologyProposalStatusEnum,
  gateReason: z.string().optional().nullable(),
  approvedBy: z.string().optional().nullable(),
  approvedAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type OntologyProposal = z.infer<typeof OntologyProposalSchema>;

/**
 * Validate and construct ontology proposal.
 */
export function createOntologyProposal(input: unknown): OntologyProposal {
  return OntologyProposalSchema.parse(input);
}

/**
 * Authorization gate: approve ontology proposal (only authorized services).
 */
export function authorizedApproveProposal(
  proposal: OntologyProposal,
  approvedBy: string
): OntologyProposal {
  if (!['PROPOSED', 'ACCEPTED'].includes(proposal.status)) {
    throw new Error(
      `Cannot approve proposal with status ${proposal.status}. Must be PROPOSED or ACCEPTED.`
    );
  }

  return {
    ...proposal,
    status: 'APPROVED' as const,
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
}
