import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ClassificationTaskV1Schema = z.enum([
  'query_intent',
  'domain',
  'code_role',
  'error_type',
  'repair_action',
  'tool_route',
  'evidence_role',
  'risk',
  'multi_label_domain',
]);
export type ClassificationTaskV1 = z.infer<typeof ClassificationTaskV1Schema>;

export const ClassificationLabelV1Schema = z.object({
  label: z.string().min(1),
  probability: z.number().finite().min(0).max(1),
}).strict();
export type ClassificationLabelV1 = z.infer<typeof ClassificationLabelV1Schema>;

export const ClassificationObservationV1Schema = z.object({
  schema: z.literal('atlas.classification-observation.v1'),
  observationId: z.string().min(1),
  requestId: z.string().min(1),
  sourceRef: z.string().min(1).nullable(),
  sourceRevision: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  treeNodeId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
  task: ClassificationTaskV1Schema,
  labels: z.array(ClassificationLabelV1Schema).min(1),
  abstained: z.boolean(),
  confidence: z.number().finite().min(0).max(1),
  entropy: z.number().finite().min(0),
  normalizedEntropy: z.number().finite().min(0).max(1),
  representationId: z.string().min(1).nullable(),
  representationRevision: z.string().min(1).nullable(),
  outputDimension: z.number().int().positive().nullable(),
  modelId: z.string().min(1),
  modelRevision: z.string().min(1),
  promptRevision: z.string().min(1).nullable(),
  classifierHeadRevision: z.string().min(1),
  calibrationRevision: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  canonicalWritesAllowed: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  createdAt: z.string().datetime(),
}).strict();
export type ClassificationObservationV1 = z.infer<typeof ClassificationObservationV1Schema>;

function normalizedLabels(labels: readonly ClassificationLabelV1[]): ClassificationLabelV1[] {
  const byLabel = new Map<string, number>();
  for (const row of labels) {
    const label = row.label.trim();
    if (!label) continue;
    byLabel.set(label, Math.max(byLabel.get(label) ?? 0, row.probability));
  }
  const rows = [...byLabel.entries()].map(([label, probability]) => ({ label, probability }));
  const sum = rows.reduce((total, row) => total + row.probability, 0);
  if (sum <= 0) return rows.map((row) => ({ ...row, probability: 0 }));
  return rows
    .map((row) => ({ ...row, probability: row.probability / sum }))
    .sort((a, b) => b.probability - a.probability || a.label.localeCompare(b.label));
}

function entropy(labels: readonly ClassificationLabelV1[]): { entropy: number; normalized: number } {
  const positive = labels.filter((row) => row.probability > 0);
  const h = -positive.reduce((sum, row) => sum + row.probability * Math.log(row.probability), 0);
  const max = positive.length > 1 ? Math.log(positive.length) : 0;
  return { entropy: h, normalized: max > 0 ? Math.min(1, h / max) : 0 };
}

function stableId(input: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function buildClassificationObservationV1(input: {
  requestId: string;
  workspaceRevision: string;
  task: ClassificationTaskV1;
  labels: readonly ClassificationLabelV1[];
  sourceRef?: string | null;
  sourceRevision?: string | null;
  packetKey?: string | null;
  treeNodeId?: string | null;
  symbolVersionId?: string | null;
  representationId?: string | null;
  representationRevision?: string | null;
  outputDimension?: number | null;
  modelId: string;
  modelRevision: string;
  promptRevision?: string | null;
  classifierHeadRevision: string;
  calibrationRevision: string;
  evidenceRefs?: readonly string[];
  abstainThreshold?: number;
  createdAt?: string;
}): ClassificationObservationV1 {
  const labels = normalizedLabels(input.labels);
  if (labels.length === 0) throw new Error('CLASSIFICATION_LABELS_REQUIRED');
  const uncertainty = entropy(labels);
  const confidence = labels[0]?.probability ?? 0;
  const abstainThreshold = input.abstainThreshold ?? 0.5;
  const evidenceRefs = [...new Set(input.evidenceRefs ?? [])].sort();
  const identity = {
    requestId: input.requestId,
    workspaceRevision: input.workspaceRevision,
    sourceRef: input.sourceRef ?? null,
    sourceRevision: input.sourceRevision ?? null,
    packetKey: input.packetKey ?? null,
    treeNodeId: input.treeNodeId ?? null,
    symbolVersionId: input.symbolVersionId ?? null,
    task: input.task,
    labels,
    representationId: input.representationId ?? null,
    representationRevision: input.representationRevision ?? null,
    outputDimension: input.outputDimension ?? null,
    modelId: input.modelId,
    modelRevision: input.modelRevision,
    promptRevision: input.promptRevision ?? null,
    classifierHeadRevision: input.classifierHeadRevision,
    calibrationRevision: input.calibrationRevision,
    evidenceRefs,
  };

  return ClassificationObservationV1Schema.parse({
    schema: 'atlas.classification-observation.v1',
    observationId: `cls:${stableId(identity)}`,
    ...identity,
    abstained: confidence < abstainThreshold,
    confidence,
    entropy: uncertainty.entropy,
    normalizedEntropy: uncertainty.normalized,
    canonicalWritesAllowed: false,
    retrievalVoteAdded: false,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}
