import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FEATURE_PROMOTION_READINESS_SCHEMA_V2 =
  'atlas.feature-promotion-readiness.v2' as const;

export const FEATURE_PROMOTION_GATE_IDS_V2 = [
  'FEATURE_ARTIFACT_PRESENT',
  'SAME_SNAPSHOT_COORDINATES',
  'GRAIN_QUALIFICATION',
  'INPUT_PROVENANCE',
  'MISSING_VALUE_POLICY',
  'PLACEHOLDER_MASKING',
  'CONTEXT_MANIFEST_READBACK',
  'PRODUCTION_SCORER_CALLER',
  'HELD_OUT_EVALUATION',
  'PERSISTENCE_AUTHORIZATION',
] as const;

export const FEATURE_PROMOTION_GATE_STATES_V2 = [
  'PROVEN',
  'OPEN',
  'BLOCKED',
  'DEFERRED',
] as const;

export const FEATURE_PROMOTION_STAGES_V2 = [
  'NOT_READY',
  'ARTIFACT_ONLY',
  'MATRIX_ADMITTED',
  'SCORER_EXPOSED',
  'PROMOTED',
] as const;

const gateSchema = z.object({
  state: z.enum(FEATURE_PROMOTION_GATE_STATES_V2),
  evidenceRefs: z.array(z.string().trim().min(1)),
  note: z.string().trim().min(1).optional(),
}).strict().superRefine((gate, ctx) => {
  if (gate.state === 'PROVEN' && gate.evidenceRefs.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceRefs'],
      message: 'A proven promotion gate must cite at least one evidence reference.',
    });
  }
});

const gatesSchema = z.object({
  FEATURE_ARTIFACT_PRESENT: gateSchema,
  SAME_SNAPSHOT_COORDINATES: gateSchema,
  GRAIN_QUALIFICATION: gateSchema,
  INPUT_PROVENANCE: gateSchema,
  MISSING_VALUE_POLICY: gateSchema,
  PLACEHOLDER_MASKING: gateSchema,
  CONTEXT_MANIFEST_READBACK: gateSchema,
  PRODUCTION_SCORER_CALLER: gateSchema,
  HELD_OUT_EVALUATION: gateSchema,
  PERSISTENCE_AUTHORIZATION: gateSchema,
}).strict();

const stageRequirements = {
  ARTIFACT_ONLY: ['FEATURE_ARTIFACT_PRESENT'],
  MATRIX_ADMITTED: [
    'SAME_SNAPSHOT_COORDINATES',
    'GRAIN_QUALIFICATION',
    'INPUT_PROVENANCE',
    'MISSING_VALUE_POLICY',
    'PLACEHOLDER_MASKING',
  ],
  SCORER_EXPOSED: ['CONTEXT_MANIFEST_READBACK', 'PRODUCTION_SCORER_CALLER'],
  PROMOTED: ['HELD_OUT_EVALUATION', 'PERSISTENCE_AUTHORIZATION'],
} as const satisfies Record<string, readonly (typeof FEATURE_PROMOTION_GATE_IDS_V2)[number][]>;

export type FeaturePromotionReadinessStageV2 = (typeof FEATURE_PROMOTION_STAGES_V2)[number];
export type FeaturePromotionGateIdV2 = (typeof FEATURE_PROMOTION_GATE_IDS_V2)[number];
export type FeaturePromotionGateV2 = z.infer<typeof gateSchema>;
export type FeaturePromotionGatesV2 = z.infer<typeof gatesSchema>;

const readinessCoreSchema = z.object({
  schema: z.literal(FEATURE_PROMOTION_READINESS_SCHEMA_V2),
  featureId: z.string().trim().min(1),
  candidateSnapshotRevision: z.string().trim().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  representationId: z.literal('semantic_768'),
  storage: z.object({
    table: z.literal('codebase_chunk_index'),
    column: z.literal('content_embedding_768'),
    storageType: z.literal('vector(768)'),
  }).strict(),
  gates: gatesSchema,
  highestReadyStage: z.enum(FEATURE_PROMOTION_STAGES_V2),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type FeaturePromotionReadinessV2 = z.infer<typeof readinessCoreSchema> & {
  checksum: string;
};

const featurePromotionReadinessSchema = readinessCoreSchema.extend({
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
}).strict().superRefine((receipt, ctx) => {
  const expectedStage = deriveHighestReadyStageV2(receipt.gates);
  if (receipt.highestReadyStage !== expectedStage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['highestReadyStage'],
      message: `Stage does not match gate evidence; expected ${expectedStage}.`,
    });
  }

  const { checksum, ...core } = receipt;
  if (checksum !== checksumCore(core)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checksum'],
      message: 'Readiness checksum does not match the canonical serialized receipt.',
    });
  }
});

export function deriveHighestReadyStageV2(gates: FeaturePromotionGatesV2): FeaturePromotionReadinessStageV2 {
  let stage: FeaturePromotionReadinessStageV2 = 'NOT_READY';
  for (const candidate of ['ARTIFACT_ONLY', 'MATRIX_ADMITTED', 'SCORER_EXPOSED', 'PROMOTED'] as const) {
    const requirements = stageRequirements[candidate];
    if (requirements.every((gateId) => gates[gateId].state === 'PROVEN')) stage = candidate;
    else break;
  }
  return stage;
}

function checksumCore(core: z.infer<typeof readinessCoreSchema>): string {
  const serialized = JSON.stringify(core);
  return `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`;
}

export function buildFeaturePromotionReadinessV2(
  input: Omit<FeaturePromotionReadinessV2, 'schema' | 'highestReadyStage' | 'checksum'>,
): FeaturePromotionReadinessV2 {
  const core = readinessCoreSchema.parse({
    schema: FEATURE_PROMOTION_READINESS_SCHEMA_V2,
    ...input,
    highestReadyStage: deriveHighestReadyStageV2(input.gates),
  });
  return featurePromotionReadinessSchema.parse({ ...core, checksum: checksumCore(core) });
}

export function isFeaturePromotionReadinessV2(value: unknown): value is FeaturePromotionReadinessV2 {
  return featurePromotionReadinessSchema.safeParse(value).success;
}
