import { z } from 'zod';

// Despite its historical name, this schema is currently max-only; the
// boundary proof reports empty evidence arrays as a contract defect.
const NonEmptyStringArraySchema = z.array(z.string().min(1)).min(1).max(64);

export const OkfDomainSubjectKindSchema = z.enum([
  'document',
  'file',
  'feature',
  'symbol',
  'task',
]);

export const OkfEvidenceLifecycleSchema = z.enum([
  'OBSERVED',
  'DERIVED',
  'SUPERSEDED',
]);

/**
 * Domain labels are navigation evidence. They never become Atlas identity.
 */
export const DomainClassificationV1Schema = z.object({
  schemaVersion: z.literal('atlas.okf.domain-classification.v1'),
  classificationId: z.string().min(1),
  subjectRef: z.string().min(1),
  subjectKind: OkfDomainSubjectKindSchema,
  domainId: z.string().min(1),
  taxonomyRevision: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  evidenceRefs: NonEmptyStringArraySchema,
  sourceRevision: z.string().min(1),
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
  lifecycle: OkfEvidenceLifecycleSchema,
}).strict();

export type DomainClassificationV1 = z.infer<typeof DomainClassificationV1Schema>;

export const OkfFeatureValueV1Schema = z.object({
  featureId: z.string().min(1),
  featureRevision: z.string().min(1),
  subjectRef: z.string().min(1),
  ontologyRefs: NonEmptyStringArraySchema,
  value: z.number().finite(),
  coverage: z.number().finite().min(0).max(1),
  provenanceRefs: NonEmptyStringArraySchema,
}).strict();

export const OkfFeatureFamilySchema = z.enum([
  'semantic',
  'structural',
  'domain',
  'operational',
]);

/**
 * Derived planning envelope only. The existing FeatureMatrix5 and
 * FeatureMatrixRowV1 remain the production feature owners.
 */
export const OkfFeatureMatrix4x6V1Schema = z.object({
  schemaVersion: z.literal('atlas.okf.feature-matrix-4x6.v1'),
  matrixId: z.string().min(1),
  subjectRef: z.string().min(1),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  families: z.array(z.object({
    family: OkfFeatureFamilySchema,
    values: z.array(OkfFeatureValueV1Schema).length(6),
  }).strict()).length(4),
  lifecycle: OkfEvidenceLifecycleSchema,
}).strict().superRefine((matrix, ctx) => {
  const families = matrix.families.map((entry) => entry.family);
  if (new Set(families).size !== 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['families'],
      message: '4x6 matrix must contain four distinct feature families',
    });
  }

  for (const [familyIndex, family] of matrix.families.entries()) {
    for (const [valueIndex, value] of family.values.entries()) {
      if (value.subjectRef !== matrix.subjectRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['families', familyIndex, 'values', valueIndex, 'subjectRef'],
          message: 'feature value subjectRef must match matrix subjectRef',
        });
      }
    }
  }
});

export type OkfFeatureMatrix4x6V1 = z.infer<typeof OkfFeatureMatrix4x6V1Schema>;

export const OkfDerivationNodeKindSchema = z.enum([
  'document',
  'packet',
  'source_file',
  'symbol',
  'related_file',
  'feature_row',
  'ontology_tuple',
]);

export const OkfDerivationRelationSchema = z.enum([
  'DOCUMENT_MATERIALIZES_PACKET',
  'PACKET_BINDS_SOURCE_FILE',
  'SOURCE_FILE_DEFINES_SYMBOL',
  'SOURCE_FILE_RELATES_TO_FILE',
  'SYMBOL_SUPPORTS_FEATURE',
  'FEATURE_GROUNDS_ONTOLOGY_TUPLE',
]);

const OkfDerivationNodeV1Schema = z.object({
  nodeId: z.string().min(1),
  kind: OkfDerivationNodeKindSchema,
  subjectRef: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  packetKey: z.string().min(1).optional(),
  treeNodeId: z.string().min(1).optional(),
  evidenceRefs: NonEmptyStringArraySchema,
  lifecycle: OkfEvidenceLifecycleSchema,
}).strict();

const OkfDerivationEdgeV1Schema = z.object({
  edgeId: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  relation: OkfDerivationRelationSchema,
  relationRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  evidenceRefs: NonEmptyStringArraySchema,
  lifecycle: OkfEvidenceLifecycleSchema,
}).strict();

/**
 * Replayable derived links between document/source/packet evidence and
 * enrichment rows. This is a graph envelope, not a packet or symbol owner.
 */
export const OkfDocumentFileDerivationGraphV1Schema = z.object({
  schemaVersion: z.literal('atlas.okf.document-file-derivation-graph.v1'),
  graphId: z.string().min(1),
  graphRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
  replayEvidenceRefs: NonEmptyStringArraySchema,
  nodes: z.array(OkfDerivationNodeV1Schema).min(1).max(4096),
  edges: z.array(OkfDerivationEdgeV1Schema).max(8192),
  canonicalAuthority: z.literal(false),
  promotionAuthorized: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((graph, ctx) => {
  const nodeIds = new Set(graph.nodes.map((node) => node.nodeId));
  if (nodeIds.size !== graph.nodes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: 'derivation graph node IDs must be unique' });
  }
  for (const [index, node] of graph.nodes.entries()) {
    if (node.sourceRevision !== graph.sourceRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'sourceRevision'], message: 'node sourceRevision must match graph sourceRevision' });
    }
  }
  for (const [index, edge] of graph.edges.entries()) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index], message: 'edge endpoints must reference graph nodes' });
    }
    if (edge.sourceRevision !== graph.sourceRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edges', index, 'sourceRevision'], message: 'edge sourceRevision must match graph sourceRevision' });
    }
  }
});

export type OkfDocumentFileDerivationGraphV1 = z.infer<typeof OkfDocumentFileDerivationGraphV1Schema>;

export const OkfRecommendationStatusSchema = z.enum([
  'RECOMMENDED',
  'APPROVED',
  'IN_PROGRESS',
  'VALIDATING',
  'PROVEN',
  'REJECTED',
]);

export const OkfRecommendationV1Schema = z.object({
  schemaVersion: z.literal('atlas.okf.recommendation.v1'),
  recommendationId: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW']),
  subjectRefs: NonEmptyStringArraySchema,
  evidenceRefs: NonEmptyStringArraySchema,
  graphifyReceiptRefs: z.array(z.string().min(1)).max(32).default([]),
  featureRowRefs: z.array(z.string().min(1)).max(32).default([]),
  acceptanceGates: NonEmptyStringArraySchema,
  prohibitedMutations: z.array(z.string().min(1)).max(32).default([]),
  status: OkfRecommendationStatusSchema,
  sourceRevision: z.string().min(1),
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();

export type OkfRecommendationV1 = z.infer<typeof OkfRecommendationV1Schema>;
