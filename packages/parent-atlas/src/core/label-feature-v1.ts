import { createHash } from 'node:crypto';
import { z } from 'zod';

const identitySchema = z.object({
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
}).strict();

export const labelEvidenceV1Schema = z.object({
  kind: z.enum(['AST_KEYWORDS', 'DOMAIN_CLASSIFIER', 'NLP_CLASSIFIER', 'LANGEXTRACT', 'RULE']),
  label: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  taxonomyRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

export const labelFeatureV1Schema = z.object({
  schema: z.literal('atlas.label-feature.v1'),
  identity: identitySchema,
  sourceRole: z.string().min(1),
  language: z.string().min(1).nullable(),
  ast: z.object({
    keywordCounts: z.record(z.string(), z.number().int().nonnegative()),
    symbolCount: z.number().int().nonnegative(),
    importCount: z.number().int().nonnegative(),
    exportCount: z.number().int().nonnegative(),
    predictedDomain: z.string().min(1).nullable(),
    domainConfidence: z.number().finite().min(0).max(1).nullable(),
  }).strict(),
  evidence: z.array(labelEvidenceV1Schema).min(1),
  taxonomyRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
}).strict();

export type LabelFeatureV1 = z.infer<typeof labelFeatureV1Schema>;
export type LabelEvidenceV1 = z.infer<typeof labelEvidenceV1Schema>;

export const labelProposalV1Schema = z.object({
  schema: z.literal('atlas.label-proposal.v1'),
  proposalId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  label: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  kind: labelEvidenceV1Schema.shape.kind,
  taxonomyRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  featureChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  status: z.literal('REVIEW_REQUIRED'),
  canonicalAuthority: z.literal(false),
}).strict();

export type LabelProposalV1 = z.infer<typeof labelProposalV1Schema>;

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

/** Build a revision-bound feature row; caller supplies the existing canonical taxonomy. */
export function buildLabelFeatureV1(input: {
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  sourceRole: string;
  language?: string | null;
  keywordCounts: Readonly<Record<string, number>>;
  symbolCount: number;
  importCount: number;
  exportCount: number;
  predictedDomain?: string | null;
  domainConfidence?: number | null;
  evidence: readonly LabelEvidenceV1[];
  allowedDomains: readonly string[];
  taxonomyRevision: string;
  producerRevision: string;
}): LabelFeatureV1 {
  const allowed = new Set(input.allowedDomains);
  if (allowed.size === 0 || allowed.size !== input.allowedDomains.length) {
    throw new Error('LABEL_FEATURE_INVALID_TAXONOMY_DOMAIN_SET');
  }
  if (input.predictedDomain && !allowed.has(input.predictedDomain)) {
    throw new Error(`LABEL_FEATURE_NONCANONICAL_DOMAIN:${input.predictedDomain}`);
  }
  const identity = identitySchema.parse({
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
  });
  const evidence = input.evidence.map((item) => labelEvidenceV1Schema.parse({
    ...item,
    evidenceRefs: [...new Set(item.evidenceRefs)].sort(),
  }));
  if (evidence.some((item) =>
    item.sourceRevision !== identity.sourceRevision
    || item.workspaceRevision !== identity.workspaceRevision
    || item.taxonomyRevision !== input.taxonomyRevision
    || !allowed.has(item.label))) {
    throw new Error('LABEL_FEATURE_EVIDENCE_LINEAGE_OR_TAXONOMY_MISMATCH');
  }
  if (input.predictedDomain && !evidence.some((item) =>
    item.kind === 'AST_KEYWORDS' && item.label === input.predictedDomain)) {
    throw new Error('LABEL_FEATURE_AST_PREDICTION_WITHOUT_MATCHING_EVIDENCE');
  }
  const orderedEvidence = [...evidence].sort((a, b) =>
    a.kind.localeCompare(b.kind)
    || a.label.localeCompare(b.label)
    || a.producerRevision.localeCompare(b.producerRevision)
    || a.evidenceRefs.join('\0').localeCompare(b.evidenceRefs.join('\0')));
  const payload = {
    schema: 'atlas.label-feature.v1' as const,
    identity,
    sourceRole: input.sourceRole,
    language: input.language ?? null,
    ast: {
      keywordCounts: Object.fromEntries(Object.entries(input.keywordCounts).sort(([a], [b]) => a.localeCompare(b))),
      symbolCount: input.symbolCount,
      importCount: input.importCount,
      exportCount: input.exportCount,
      predictedDomain: input.predictedDomain ?? null,
      domainConfidence: input.domainConfidence ?? null,
    },
    evidence: orderedEvidence,
    taxonomyRevision: input.taxonomyRevision,
    producerRevision: input.producerRevision,
    canonicalAuthority: false as const,
  };
  return labelFeatureV1Schema.parse({ ...payload, checksum: checksum(payload) });
}

/** Convert matched feature evidence into deterministic review proposals only. */
export function buildLabelProposalsV1(input: {
  feature: LabelFeatureV1;
  allowedDomains: readonly string[];
}): LabelProposalV1[] {
  const feature = labelFeatureV1Schema.parse(input.feature);
  const { checksum: featureChecksum, ...featurePayload } = feature;
  if (checksum(featurePayload) !== featureChecksum) throw new Error('LABEL_FEATURE_CHECKSUM_MISMATCH');
  const allowed = new Set(input.allowedDomains);
  const unique = new Map<string, LabelProposalV1>();
  for (const item of feature.evidence) {
    if (!allowed.has(item.label)) throw new Error(`LABEL_PROPOSAL_NONCANONICAL_DOMAIN:${item.label}`);
    const proposalId = checksum([
      feature.identity.sourceRef,
      feature.identity.sourceRevision,
      feature.identity.workspaceRevision,
      item.kind,
      item.label,
      item.producerRevision,
      [...item.evidenceRefs].sort(),
    ]);
    const proposal = labelProposalV1Schema.parse({
      schema: 'atlas.label-proposal.v1',
      proposalId: `label-proposal:${proposalId}`,
      sourceRef: feature.identity.sourceRef,
      sourceRevision: feature.identity.sourceRevision,
      workspaceRevision: feature.identity.workspaceRevision,
      label: item.label,
      confidence: item.confidence,
      kind: item.kind,
      taxonomyRevision: feature.taxonomyRevision,
      producerRevision: item.producerRevision,
      featureChecksum: feature.checksum,
      evidenceRefs: [...new Set(item.evidenceRefs)].sort(),
      status: 'REVIEW_REQUIRED',
      canonicalAuthority: false,
    });
    unique.set(proposal.proposalId, proposal);
  }
  return [...unique.values()].sort((a, b) =>
    b.confidence - a.confidence || a.label.localeCompare(b.label) || a.proposalId.localeCompare(b.proposalId));
}
