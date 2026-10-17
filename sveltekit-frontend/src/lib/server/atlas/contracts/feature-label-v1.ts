import { z } from 'zod';

export const FEATURE_LABEL_SCHEMA = 'atlas.feature-label.v1' as const;

/**
 * Standard canonical feature labels for symbols, functions, and source artifacts.
 * These map directly to typed, evidence-backed statements about code artifacts.
 */
export const StandardFeatureLabelEnum = z.enum([
  'AST_FUNCTION_DEFINED',     // Source contains a parsed function declaration (Tree-sitter)
  'TYPECHECK_PASS',           // Function belongs to a source snapshot that passed type checking
  'UNIT_TEST_COVERED',        // At least one test maps to this function
  'UNIT_TEST_PASS',           // Associated test passed in a specific run (test receipt)
  'SOURCE_LINEAGE_PROVEN',    // Symbol has exact byte/source evidence in canonical registry
  'GRAPH_DEPENDENCY_VALID',   // Relationship resolves to actual symbols (LSP/AST edge verification)
  'DOMAIN_PACKET_VALIDATION', // Function is relevant to packet validation (reviewed classifier label)
  'CALLABLE_VERIFIED',        // Registered invocation contract was validated (tool registry receipt)
]);
export type StandardFeatureLabel = z.infer<typeof StandardFeatureLabelEnum>;

/**
 * Static registry mapping canonical label names to unique integer feature IDs and bitset shifts.
 * Note: Feature IDs are numeric indices for feature matrices and bitsets; they are NOT LLM tokenizer IDs.
 */
export const FEATURE_LABEL_REGISTRY: Record<StandardFeatureLabel, { featureId: number; bitShift: number; description: string }> = {
  AST_FUNCTION_DEFINED: {
    featureId: 1,
    bitShift: 0,
    description: 'Source contains a parsed function declaration established by Tree-sitter',
  },
  TYPECHECK_PASS: {
    featureId: 2,
    bitShift: 1,
    description: 'Function belongs to a source snapshot that passed compiler/LSP type checking',
  },
  UNIT_TEST_COVERED: {
    featureId: 3,
    bitShift: 2,
    description: 'At least one unit test maps to this function symbol',
  },
  UNIT_TEST_PASS: {
    featureId: 4,
    bitShift: 3,
    description: 'Associated unit test passed in a specific test execution run receipt',
  },
  SOURCE_LINEAGE_PROVEN: {
    featureId: 5,
    bitShift: 4,
    description: 'Symbol has exact byte span and source revision lineage in PostgreSQL registry',
  },
  GRAPH_DEPENDENCY_VALID: {
    featureId: 6,
    bitShift: 5,
    description: 'Call or reference relationship resolves to actual valid symbols in CST/AST',
  },
  DOMAIN_PACKET_VALIDATION: {
    featureId: 7,
    bitShift: 6,
    description: 'Function is verified relevant to domain packet validation by reviewed classifier',
  },
  CALLABLE_VERIFIED: {
    featureId: 8,
    bitShift: 7,
    description: 'Registered invocation contract was validated by tool harness test receipt',
  },
};

export const FeatureLabelEvidenceTypeEnum = z.enum([
  'ast_observation',
  'test_receipt',
  'typecheck_receipt',
  'lineage_join',
  'graph_edge',
  'classifier_label',
  'tool_contract',
  'custom',
]);
export type FeatureLabelEvidenceType = z.infer<typeof FeatureLabelEvidenceTypeEnum>;

export const FeatureLabelEvidenceSchema = z
  .object({
    type: FeatureLabelEvidenceTypeEnum,
    ref: z.string().min(1),
    sourceContentSha256: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type FeatureLabelEvidence = z.infer<typeof FeatureLabelEvidenceSchema>;

export const FeatureLabelStatusEnum = z.enum([
  'PROVEN',
  'REVIEWED',
  'FIXTURE_ONLY',
  'REJECTED',
]);
export type FeatureLabelStatus = z.infer<typeof FeatureLabelStatusEnum>;

export const FeatureLabelV1Schema = z
  .object({
    schema: z.literal(FEATURE_LABEL_SCHEMA),
    canonicalId: z.string().min(1),
    featureId: z.number().int().positive(),
    featureName: z.string().min(1),
    value: z.union([z.boolean(), z.number(), z.string()]),
    evidence: FeatureLabelEvidenceSchema,
    status: FeatureLabelStatusEnum,
  })
  .strict();
export type FeatureLabelV1 = z.infer<typeof FeatureLabelV1Schema>;

/**
 * Builds a validated feature label record with evidence attachment.
 */
export function createFeatureLabelV1(input: {
  canonicalId: string;
  featureName: StandardFeatureLabel | string;
  value: boolean | number | string;
  evidence: FeatureLabelEvidence;
  status?: FeatureLabelStatus;
  customFeatureId?: number;
}): FeatureLabelV1 {
  let featureId: number;
  if (input.featureName in FEATURE_LABEL_REGISTRY) {
    featureId = FEATURE_LABEL_REGISTRY[input.featureName as StandardFeatureLabel].featureId;
  } else if (input.customFeatureId) {
    featureId = input.customFeatureId;
  } else {
    throw new Error(`FEATURE_ID_REQUIRED_FOR_CUSTOM_LABEL: ${input.featureName}`);
  }

  return FeatureLabelV1Schema.parse({
    schema: FEATURE_LABEL_SCHEMA,
    canonicalId: input.canonicalId,
    featureId,
    featureName: input.featureName,
    value: input.value,
    evidence: input.evidence,
    status: input.status ?? 'PROVEN',
  });
}

/**
 * Compiles a set of boolean feature labels into a compact 64-bit integer bitmask.
 * Only boolean-valued labels with value === true and status !== 'REJECTED' set bits.
 */
export function encodeFeatureLabelBitmask(labels: readonly FeatureLabelV1[]): bigint {
  let mask = 0n;
  for (const label of labels) {
    if (label.status === 'REJECTED' || label.value !== true) continue;
    const shift = label.featureId - 1;
    if (shift >= 0 && shift < 64) {
      mask |= (1n << BigInt(shift));
    }
  }
  return mask;
}

/**
 * Checks whether an encoded bitmask satisfies a required bitmask.
 */
export function satisfiesFeatureBitmask(candidateMask: bigint, requiredMask: bigint): boolean {
  return (candidateMask & requiredMask) === requiredMask;
}

/**
 * Decodes standard feature labels from a bitmask.
 */
export function decodeStandardFeatureLabels(mask: bigint): StandardFeatureLabel[] {
  const active: StandardFeatureLabel[] = [];
  for (const [name, meta] of Object.entries(FEATURE_LABEL_REGISTRY)) {
    const bit = 1n << BigInt(meta.bitShift);
    if ((mask & bit) === bit) {
      active.push(name as StandardFeatureLabel);
    }
  }
  return active;
}
