import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';

export const OKF_EVIDENCE_FEATURE_SCHEMA_VERSION = 'atlas.okf-evidence-feature.v1' as const;
export const OKF_DERIVED_MATRIX_REVISION = 'atlas.okf-derived-feature-matrix.c25.v1' as const;

export const OkfRevisionSetV1Schema = z.object({
  schemaRevision: z.string().min(1),
  taxonomyRevision: z.string().min(1),
  classifierRevision: z.string().min(1),
  featureMappingRevision: z.string().min(1),
}).strict();
export type OkfRevisionSetV1 = z.infer<typeof OkfRevisionSetV1Schema>;

export const OkfEvidenceKindSchema = z.enum([
  'AST',
  'LANGEXTRACT',
  'CLASSIFIER',
  'EXECUTION',
  'HUMAN',
]);
export type OkfEvidenceKind = z.infer<typeof OkfEvidenceKindSchema>;

export const OkfEvidenceRefV1Schema = z.object({
  evidenceRef: z.string().min(1),
  evidenceKind: OkfEvidenceKindSchema,
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type OkfEvidenceRefV1 = z.infer<typeof OkfEvidenceRefV1Schema>;

const RevisionedClaimBaseSchema = z.object({
  canonicalId: z.string().min(1),
  subjectId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  revisions: OkfRevisionSetV1Schema,
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
  evidenceRefs: z.array(OkfEvidenceRefV1Schema).min(1),
  confidence: z.number().min(0).max(1),
  canonicalWritesAllowed: z.literal(false),
});

export const SemanticObservationV1Schema = RevisionedClaimBaseSchema.extend({
  schema: z.literal('atlas.semantic-observation.v1'),
  observationKind: z.enum(['DOMAIN', 'CONCEPT', 'RELATION', 'SUMMARY', 'EXECUTION_OUTCOME']),
  label: z.string().min(1),
  value: z.union([z.string(), z.number().finite(), z.boolean()]),
  evidenceKind: OkfEvidenceKindSchema,
}).strict();
export type SemanticObservationV1 = z.infer<typeof SemanticObservationV1Schema>;

export const OntologyLinkedTupleV1Schema = RevisionedClaimBaseSchema.extend({
  schema: z.literal('atlas.ontology-linked-tuple.v1'),
  predicate: z.string().min(1),
  objectId: z.string().min(1),
  tupleKind: z.literal('BINARY_SEMANTIC_FACT'),
}).strict();
export type OntologyLinkedTupleV1 = z.infer<typeof OntologyLinkedTupleV1Schema>;

export const OntologyHyperedgeMemberV1Schema = z.object({
  role: z.string().min(1),
  entityId: z.string().min(1),
}).strict();

export const OntologyHyperedgeV1Schema = RevisionedClaimBaseSchema.extend({
  schema: z.literal('atlas.ontology-hyperedge.v1'),
  hyperedgeKind: z.string().min(1),
  members: z.array(OntologyHyperedgeMemberV1Schema).min(3),
  eventOrProcessFact: z.literal(true),
}).strict();
export type OntologyHyperedgeV1 = z.infer<typeof OntologyHyperedgeV1Schema>;

export const FeatureDefinitionV1Schema = z.object({
  schema: z.literal('atlas.feature-definition.v1'),
  featureName: z.string().min(1),
  scope: z.enum(['CANONICAL_ENTITY', 'QUERY_CANDIDATE']),
  definition: z.string().min(1),
  compilerId: z.string().min(1),
  compilerRevision: z.string().min(1),
  featureMappingRevision: z.string().min(1),
  allowedEvidenceKinds: z.array(OkfEvidenceKindSchema).min(1),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type FeatureDefinitionV1 = z.infer<typeof FeatureDefinitionV1Schema>;

export const FeatureValueV1Schema = z.object({
  featureName: z.string().min(1),
  value: z.number().finite(),
  present: z.boolean(),
  definitionRevision: z.string().min(1),
  compilerRevision: z.string().min(1),
  evidenceRefs: z.array(OkfEvidenceRefV1Schema).min(1),
}).strict().superRefine((value, ctx) => {
  if (!value.present && value.value !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'missing feature values must be encoded as numeric zero' });
  }
});
export type FeatureValueV1 = z.infer<typeof FeatureValueV1Schema>;

const FeatureRowLineageSchema = z.object({
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  representationRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  revisions: OkfRevisionSetV1Schema,
}).strict();

export const CanonicalFeatureRowV1Schema = z.object({
  schema: z.literal('atlas.canonical-feature-row.v1'),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  lineage: FeatureRowLineageSchema,
  features: z.array(FeatureValueV1Schema).min(1),
  evidenceAuthority: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type CanonicalFeatureRowV1 = z.infer<typeof CanonicalFeatureRowV1Schema>;

export const RetrievalFeatureRowV1Schema = z.object({
  schema: z.literal('atlas.retrieval-feature-row.v1'),
  queryId: z.string().min(1),
  candidateCanonicalId: z.string().min(1),
  candidatePacketKey: z.string().min(1),
  rowOrdinal: z.number().int().nonnegative(),
  lineage: FeatureRowLineageSchema,
  features: z.array(FeatureValueV1Schema).min(1),
  evidenceAuthority: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type RetrievalFeatureRowV1 = z.infer<typeof RetrievalFeatureRowV1Schema>;

export const DerivedFeatureMatrixV1Schema = z.object({
  schema: z.literal('atlas.derived-feature-matrix.v1'),
  matrixRevision: z.literal(OKF_DERIVED_MATRIX_REVISION),
  queryId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  featureMappingRevision: z.string().min(1),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.literal(25),
  columnNames: z.array(z.enum(CANDIDATE_FEATURE_NAMES)).length(25),
  rowCanonicalIds: z.array(z.string().min(1)),
  rowPacketKeys: z.array(z.string().min(1)),
  rowOrdinals: z.array(z.number().int().nonnegative()),
  values: z.instanceof(Float32Array),
  presenceMask: z.instanceof(Uint8Array),
  cellEvidenceRefs: z.array(z.array(z.string().min(1))),
  matrixSha256: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceAuthority: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.columnNames.some((name, index) => name !== CANDIDATE_FEATURE_NAMES[index])) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'columnNames must exactly match canonical CANDIDATE_FEATURE_NAMES order' });
  }
  const cells = value.rowCount * value.columnCount;
  if (value.values.length !== cells || value.presenceMask.length !== cells || value.cellEvidenceRefs.length !== cells) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'matrix cell arrays must match rowCount * columnCount' });
  }
  if (value.rowCanonicalIds.length !== value.rowCount || value.rowPacketKeys.length !== value.rowCount || value.rowOrdinals.length !== value.rowCount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'matrix row identity arrays must match rowCount' });
  }
});
export type DerivedFeatureMatrixV1 = z.infer<typeof DerivedFeatureMatrixV1Schema>;

function hashMatrix(values: Float32Array, presenceMask: Uint8Array, rowPacketKeys: readonly string[]): string {
  const h = createHash('sha256');
  h.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
  h.update(Buffer.from(presenceMask.buffer, presenceMask.byteOffset, presenceMask.byteLength));
  h.update('\0');
  h.update(rowPacketKeys.join('\0'));
  return h.digest('hex');
}

export function compileDerivedFeatureMatrixV1(input: {
  queryId: string;
  rows: readonly RetrievalFeatureRowV1[];
}): DerivedFeatureMatrixV1 {
  const rows = input.rows.map((row) => RetrievalFeatureRowV1Schema.parse(row));
  const rowCount = rows.length;
  const columnCount = CANDIDATE_FEATURE_NAMES.length;
  const values = new Float32Array(rowCount * columnCount);
  const presenceMask = new Uint8Array(rowCount * columnCount);
  const cellEvidenceRefs: string[][] = Array.from({ length: rowCount * columnCount }, () => []);

  const canonicalIds = new Set<string>();
  const packetKeys = new Set<string>();
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.queryId !== input.queryId) throw new Error('OKF_MATRIX_QUERY_ID_MISMATCH');
    if (row.rowOrdinal !== r) throw new Error(`OKF_MATRIX_ROW_ORDINAL_MISMATCH:${r}:${row.rowOrdinal}`);
    if (canonicalIds.has(row.candidateCanonicalId)) throw new Error(`OKF_MATRIX_DUPLICATE_CANONICAL_ID:${row.candidateCanonicalId}`);
    if (packetKeys.has(row.candidatePacketKey)) throw new Error(`OKF_MATRIX_DUPLICATE_PACKET_KEY:${row.candidatePacketKey}`);
    canonicalIds.add(row.candidateCanonicalId);
    packetKeys.add(row.candidatePacketKey);

    const featureMap = new Map(row.features.map((feature) => [feature.featureName, feature]));
    for (let c = 0; c < columnCount; c += 1) {
      const name = CANDIDATE_FEATURE_NAMES[c];
      const feature = featureMap.get(name);
      const offset = r * columnCount + c;
      if (!feature) continue;
      if (!Number.isFinite(feature.value)) throw new Error(`OKF_MATRIX_NON_FINITE:${row.candidatePacketKey}:${name}`);
      values[offset] = Math.fround(feature.value);
      presenceMask[offset] = feature.present ? 1 : 0;
      cellEvidenceRefs[offset] = feature.evidenceRefs.map((ref) => ref.evidenceRef).sort();
    }
  }

  const workspaceRevisions = [...new Set(rows.map((row) => row.lineage.workspaceRevision))];
  const representationRevisions = [...new Set(rows.map((row) => row.lineage.representationRevision))];
  const featureRevisions = [...new Set(rows.map((row) => row.lineage.featureRevision))];
  const mappingRevisions = [...new Set(rows.map((row) => row.lineage.revisions.featureMappingRevision))];
  if (workspaceRevisions.length > 1) throw new Error('OKF_MATRIX_MIXED_WORKSPACE_REVISION');
  if (representationRevisions.length > 1) throw new Error('OKF_MATRIX_MIXED_REPRESENTATION_REVISION');
  if (featureRevisions.length > 1) throw new Error('OKF_MATRIX_MIXED_FEATURE_REVISION');
  if (mappingRevisions.length > 1) throw new Error('OKF_MATRIX_MIXED_FEATURE_MAPPING_REVISION');

  const result = {
    schema: 'atlas.derived-feature-matrix.v1' as const,
    matrixRevision: OKF_DERIVED_MATRIX_REVISION,
    queryId: input.queryId,
    workspaceRevision: workspaceRevisions[0] ?? 'empty',
    representationRevision: representationRevisions[0] ?? 'empty',
    featureRevision: featureRevisions[0] ?? 'empty',
    featureMappingRevision: mappingRevisions[0] ?? 'empty',
    rowCount,
    columnCount: 25 as const,
    columnNames: [...CANDIDATE_FEATURE_NAMES],
    rowCanonicalIds: rows.map((row) => row.candidateCanonicalId),
    rowPacketKeys: rows.map((row) => row.candidatePacketKey),
    rowOrdinals: rows.map((row) => row.rowOrdinal),
    values,
    presenceMask,
    cellEvidenceRefs,
    matrixSha256: hashMatrix(values, presenceMask, rows.map((row) => row.candidatePacketKey)),
    evidenceAuthority: false as const,
    canonicalWritesAllowed: false as const,
  };
  return DerivedFeatureMatrixV1Schema.parse(result);
}
