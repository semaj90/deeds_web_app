import { createHash } from 'node:crypto';
import { z } from 'zod';

export const FEATURE_VALIDATION_SCHEMA = 'atlas.feature-validation.v1' as const;
export const GEPA_SHADOW_POLICY_SCHEMA = 'atlas.gepa-shadow-policy.v1' as const;

const NonEmpty = z.string().min(1);
const Sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const ValidatorKindSchema = z.enum([
  'UNIT',
  'API',
  'PLAYWRIGHT',
  'SCREENSHOT',
  'DB_READBACK',
  'OPEN_SPEC',
]);

export type ValidatorKind = z.infer<typeof ValidatorKindSchema>;

export const FeatureValidationRequirementV1Schema = z
  .object({
    kind: ValidatorKindSchema,
    required: z.boolean(),
    command: NonEmpty.nullable().default(null),
    artifactRef: NonEmpty.nullable().default(null),
    route: NonEmpty.nullable().default(null),
    viewport: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict()
      .nullable()
      .default(null),
    readOnly: z.boolean().default(true),
  })
  .strict();

export const FeatureValidationPlanV1Schema = z
  .object({
    schema: z.literal(FEATURE_VALIDATION_SCHEMA),
    taskId: NonEmpty,
    changeId: NonEmpty,
    taskRevision: NonEmpty,
    featureId: NonEmpty,
    sourceTaskRef: NonEmpty,
    requirements: z.array(FeatureValidationRequirementV1Schema).min(1),
    canonicalWrites: z.literal(false),
    checksum: Sha256,
  })
  .strict();

export type FeatureValidationPlanV1 = z.infer<typeof FeatureValidationPlanV1Schema>;

export const FeatureValidationObservationV1Schema = z
  .object({
    kind: ValidatorKindSchema,
    status: z.enum(['PASS', 'FAIL', 'MISSING', 'NOT_REQUIRED']),
    evidenceRefs: z.array(NonEmpty).default([]),
    note: NonEmpty.nullable().default(null),
  })
  .strict();

export const FeatureValidationReceiptV1Schema = z
  .object({
    schema: z.literal(FEATURE_VALIDATION_SCHEMA),
    planChecksum: Sha256,
    taskId: NonEmpty,
    taskRevision: NonEmpty,
    observations: z.array(FeatureValidationObservationV1Schema).min(1),
    status: z.enum(['PROVEN', 'FAILED', 'INCOMPLETE']),
    missingRequiredValidators: z.array(ValidatorKindSchema),
    canonicalWrites: z.literal(false),
    mutationAuthorized: z.literal(false),
    checksum: Sha256,
  })
  .strict();

export type FeatureValidationReceiptV1 = z.infer<typeof FeatureValidationReceiptV1Schema>;

export const ValidationTodoCandidateV1Schema = z
  .object({
    schema: z.literal('atlas.validation-todo-candidate.v1'),
    taskId: NonEmpty,
    taskRevision: NonEmpty,
    featureId: NonEmpty,
    reason: z.literal('REQUIRED_VALIDATOR_MISSING'),
    validatorKind: ValidatorKindSchema,
    todoText: NonEmpty,
    canonicalAuthority: z.literal(false),
    mutationAuthorized: z.literal(false),
    checksum: Sha256,
  })
  .strict();

export type ValidationTodoCandidateV1 = z.infer<typeof ValidationTodoCandidateV1Schema>;

export const GepaShadowPolicyV1Schema = z
  .object({
    schema: z.literal(GEPA_SHADOW_POLICY_SCHEMA),
    policyId: NonEmpty,
    basePolicyRevision: NonEmpty,
    optimizer: z.literal('DSPY_GEPA'),
    optimizerApiRevision: NonEmpty,
    trainingCorpusRevision: NonEmpty,
    metricRevision: NonEmpty,
    toolRegistryRevision: NonEmpty,
    instructionDigest: Sha256,
    toolDescriptionDigest: Sha256,
    evaluationReceiptRef: NonEmpty.nullable().default(null),
    candidateSelectionStrategy: z.enum(['pareto', 'current_best']).default('pareto'),
    toolOptimizationEnabled: z.boolean().default(true),
    canonicalAuthority: z.literal(false),
    mutationAuthorized: z.literal(false),
    tournamentEligible: z.boolean().default(false),
    checksum: Sha256,
  })
  .strict();

export type GepaShadowPolicyV1 = z.infer<typeof GepaShadowPolicyV1Schema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

function hash(value: unknown): `sha256:${string}` {
  const body = JSON.stringify(canonicalize(value));
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function seal<T extends Record<string, unknown>>(value: T): T & { checksum: `sha256:${string}` } {
  return { ...value, checksum: hash(value) };
}

export function buildFeatureValidationPlanV1(input: Omit<FeatureValidationPlanV1, 'schema' | 'canonicalWrites' | 'checksum'>): FeatureValidationPlanV1 {
  const value = seal({
    schema: FEATURE_VALIDATION_SCHEMA,
    ...input,
    canonicalWrites: false as const,
  });
  return FeatureValidationPlanV1Schema.parse(value);
}

export function verifyFeatureValidationPlanV1(plan: FeatureValidationPlanV1): boolean {
  const parsed = FeatureValidationPlanV1Schema.parse(plan);
  const { checksum, ...body } = parsed;
  return checksum === hash(body);
}

export function buildFeatureValidationReceiptV1(
  plan: FeatureValidationPlanV1,
  observations: z.input<typeof FeatureValidationObservationV1Schema>[]
): FeatureValidationReceiptV1 {
  if (!verifyFeatureValidationPlanV1(plan)) {
    throw new Error('FeatureValidationPlanV1 checksum mismatch');
  }

  const normalized = observations.map((observation) =>
    FeatureValidationObservationV1Schema.parse(observation)
  );

  const seenKinds = new Set<ValidatorKind>();
  for (const observation of normalized) {
    if (seenKinds.has(observation.kind)) {
      throw new Error(`Duplicate validation observation for ${observation.kind}`);
    }
    seenKinds.add(observation.kind);
  }

  const byKind = new Map(normalized.map((observation) => [observation.kind, observation]));
  const missingRequiredValidators = plan.requirements
    .filter((requirement) => requirement.required)
    .filter((requirement) => {
      const observed = byKind.get(requirement.kind);
      return !observed || observed.status === 'MISSING' || observed.status === 'NOT_REQUIRED';
    })
    .map((requirement) => requirement.kind);

  const requiredFailures = plan.requirements
    .filter((requirement) => requirement.required)
    .some((requirement) => byKind.get(requirement.kind)?.status === 'FAIL');

  const status =
    requiredFailures
      ? 'FAILED'
      : missingRequiredValidators.length > 0
        ? 'INCOMPLETE'
        : 'PROVEN';

  const value = seal({
    schema: FEATURE_VALIDATION_SCHEMA,
    planChecksum: plan.checksum,
    taskId: plan.taskId,
    taskRevision: plan.taskRevision,
    observations: normalized,
    status,
    missingRequiredValidators,
    canonicalWrites: false as const,
    mutationAuthorized: false as const,
  });

  return FeatureValidationReceiptV1Schema.parse(value);
}

export function compileMissingValidationTodosV1(
  plan: FeatureValidationPlanV1,
  receipt: FeatureValidationReceiptV1
): ValidationTodoCandidateV1[] {
  if (receipt.planChecksum !== plan.checksum) {
    throw new Error('Validation receipt does not belong to plan');
  }

  return receipt.missingRequiredValidators.map((validatorKind) =>
    ValidationTodoCandidateV1Schema.parse(
      seal({
        schema: 'atlas.validation-todo-candidate.v1' as const,
        taskId: plan.taskId,
        taskRevision: plan.taskRevision,
        featureId: plan.featureId,
        reason: 'REQUIRED_VALIDATOR_MISSING' as const,
        validatorKind,
        todoText: `TODO(TEST_MISSING): ${plan.changeId}/${plan.taskId} requires ${validatorKind} validation for ${plan.featureId}, but no matching evidence receipt exists.`,
        canonicalAuthority: false as const,
        mutationAuthorized: false as const,
      })
    )
  );
}

export function buildGepaShadowPolicyV1(input: {
  policyId: string;
  basePolicyRevision: string;
  optimizerApiRevision: string;
  trainingCorpusRevision: string;
  metricRevision: string;
  toolRegistryRevision: string;
  instructions: string;
  toolDescriptions: Record<string, string>;
  evaluationReceiptRef?: string | null;
  candidateSelectionStrategy?: 'pareto' | 'current_best';
  toolOptimizationEnabled?: boolean;
}): GepaShadowPolicyV1 {
  const value = seal({
    schema: GEPA_SHADOW_POLICY_SCHEMA,
    policyId: input.policyId,
    basePolicyRevision: input.basePolicyRevision,
    optimizer: 'DSPY_GEPA' as const,
    optimizerApiRevision: input.optimizerApiRevision,
    trainingCorpusRevision: input.trainingCorpusRevision,
    metricRevision: input.metricRevision,
    toolRegistryRevision: input.toolRegistryRevision,
    instructionDigest: hash(input.instructions),
    toolDescriptionDigest: hash(input.toolDescriptions),
    evaluationReceiptRef: input.evaluationReceiptRef ?? null,
    candidateSelectionStrategy: input.candidateSelectionStrategy ?? 'pareto',
    toolOptimizationEnabled: input.toolOptimizationEnabled ?? true,
    canonicalAuthority: false as const,
    mutationAuthorized: false as const,
    tournamentEligible: false,
  });

  return GepaShadowPolicyV1Schema.parse(value);
}

export function verifyGepaShadowPolicyV1(policy: GepaShadowPolicyV1): boolean {
  const parsed = GepaShadowPolicyV1Schema.parse(policy);
  const { checksum, ...body } = parsed;
  return checksum === hash(body);
}
