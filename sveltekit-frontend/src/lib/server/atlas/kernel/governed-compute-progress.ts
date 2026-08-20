import { z } from 'zod';

/**
 * Proof-weighted progress for the Parent Atlas governed compute fabric.
 *
 * A lane does not become "done" because source code exists. Each 20-point gate
 * corresponds to a stronger level of evidence:
 *
 *   0   discovered/planned only
 *   20  contract/ownership defined
 *   40  implementation present
 *   60  targeted tests proven
 *   80  live shadow/canary proven
 *   100 production hardening + rollback proven
 *
 * This keeps implementation progress separate from production readiness.
 */

export const GovernedComputeProofGateSchema = z.enum([
  'CONTRACT_DEFINED',
  'IMPLEMENTATION_PRESENT',
  'TESTS_PROVEN',
  'SHADOW_PROVEN',
  'PRODUCTION_HARDENED',
]);
export type GovernedComputeProofGate = z.infer<typeof GovernedComputeProofGateSchema>;

export const GovernedComputeLaneIdSchema = z.enum([
  'OWNERSHIP_AUTHORITY',
  'KERNEL_CONTRACTS',
  'SKILL_ADMISSION',
  'KERNEL_WORKER',
  'PYTHON_SKILLS',
  'DAG_TRANSPORTS',
  'ARTIFACT_RESIDENCY',
  'EXECUTOR_REGISTRY',
  'NATIVE_ABI_NODE_LOADER',
  'BACKEND_PARITY',
  'SECURITY_RECEIPTS',
  'PRODUCTION_ROLLOUT',
]);
export type GovernedComputeLaneId = z.infer<typeof GovernedComputeLaneIdSchema>;

export const GovernedComputeLaneWeight: Record<GovernedComputeLaneId, number> = {
  OWNERSHIP_AUTHORITY: 8,
  KERNEL_CONTRACTS: 10,
  SKILL_ADMISSION: 10,
  KERNEL_WORKER: 12,
  PYTHON_SKILLS: 8,
  DAG_TRANSPORTS: 10,
  ARTIFACT_RESIDENCY: 7,
  EXECUTOR_REGISTRY: 7,
  NATIVE_ABI_NODE_LOADER: 10,
  BACKEND_PARITY: 6,
  SECURITY_RECEIPTS: 6,
  PRODUCTION_ROLLOUT: 6,
};

const WEIGHT_SUM = Object.values(GovernedComputeLaneWeight).reduce((sum, value) => sum + value, 0);
if (WEIGHT_SUM !== 100) throw new Error(`governed compute lane weights must sum to 100, got ${WEIGHT_SUM}`);

export const GovernedComputeGateEvidenceV1Schema = z.object({
  contractDefined: z.boolean(),
  implementationPresent: z.boolean(),
  testsProven: z.boolean(),
  shadowProven: z.boolean(),
  productionHardened: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const ordered = [
    ['contractDefined', value.contractDefined],
    ['implementationPresent', value.implementationPresent],
    ['testsProven', value.testsProven],
    ['shadowProven', value.shadowProven],
    ['productionHardened', value.productionHardened],
  ] as const;

  let previous = true;
  for (const [key, complete] of ordered) {
    if (complete && !previous) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} cannot be true before the previous proof gate`,
      });
    }
    previous = complete;
  }
}).transform((value) => value);
export type GovernedComputeGateEvidenceV1 = z.infer<typeof GovernedComputeGateEvidenceV1Schema>;

export const GovernedComputeLaneProgressV1Schema = z.object({
  laneId: GovernedComputeLaneIdSchema,
  openspecSections: z.array(z.number().int().min(0).max(22)).min(1),
  gates: GovernedComputeGateEvidenceV1Schema,
  evidenceRefs: z.array(z.string().min(1)).max(128),
  blockers: z.array(z.string().min(1)).max(64),
  notes: z.array(z.string().min(1)).max(64),
}).strict();
export type GovernedComputeLaneProgressV1 = z.infer<typeof GovernedComputeLaneProgressV1Schema>;

export const GovernedComputeProgressSnapshotV1Schema = z.object({
  schema: z.literal('atlas.governed-compute-progress.v1'),
  changeId: z.literal('parent-atlas-governed-compute-fabric'),
  branch: z.string().min(1),
  observedAt: z.string().datetime(),
  sourceRevision: z.string().min(1),
  lanes: z.array(GovernedComputeLaneProgressV1Schema).length(12),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<GovernedComputeLaneId>();
  for (const lane of value.lanes) {
    if (seen.has(lane.laneId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lanes'], message: `duplicate lane ${lane.laneId}` });
    }
    seen.add(lane.laneId);
  }
  for (const laneId of GovernedComputeLaneIdSchema.options) {
    if (!seen.has(laneId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lanes'], message: `missing lane ${laneId}` });
    }
  }
});
export type GovernedComputeProgressSnapshotV1 = z.infer<typeof GovernedComputeProgressSnapshotV1Schema>;

export type GovernedComputeLaneScoreV1 = {
  laneId: GovernedComputeLaneId;
  weight: number;
  completionPercent: 0 | 20 | 40 | 60 | 80 | 100;
  currentGate: 'DISCOVERED' | GovernedComputeProofGate;
  nextGate: GovernedComputeProofGate | null;
  productionReady: boolean;
};

const GATE_ORDER: readonly GovernedComputeProofGate[] = [
  'CONTRACT_DEFINED',
  'IMPLEMENTATION_PRESENT',
  'TESTS_PROVEN',
  'SHADOW_PROVEN',
  'PRODUCTION_HARDENED',
];

export function laneCompletionPercent(gates: GovernedComputeGateEvidenceV1): 0 | 20 | 40 | 60 | 80 | 100 {
  const parsed = GovernedComputeGateEvidenceV1Schema.parse(gates);
  const completed = [
    parsed.contractDefined,
    parsed.implementationPresent,
    parsed.testsProven,
    parsed.shadowProven,
    parsed.productionHardened,
  ].filter(Boolean).length;
  return (completed * 20) as 0 | 20 | 40 | 60 | 80 | 100;
}

export function scoreGovernedComputeLane(lane: GovernedComputeLaneProgressV1): GovernedComputeLaneScoreV1 {
  const parsed = GovernedComputeLaneProgressV1Schema.parse(lane);
  const completionPercent = laneCompletionPercent(parsed.gates);
  const completedCount = completionPercent / 20;
  const currentGate = completedCount === 0 ? 'DISCOVERED' : GATE_ORDER[completedCount - 1];
  const nextGate = completedCount >= GATE_ORDER.length ? null : GATE_ORDER[completedCount];
  return {
    laneId: parsed.laneId,
    weight: GovernedComputeLaneWeight[parsed.laneId],
    completionPercent,
    currentGate,
    nextGate,
    productionReady: completionPercent === 100,
  };
}

export type GovernedComputeOverallScoreV1 = {
  weightedCompletionPercent: number;
  minimumLanePercent: number;
  testsGatePercent: number;
  shadowGatePercent: number;
  productionHardenedPercent: number;
  productionReady: boolean;
  lanes: GovernedComputeLaneScoreV1[];
};

export function scoreGovernedComputeProgress(snapshot: GovernedComputeProgressSnapshotV1): GovernedComputeOverallScoreV1 {
  const parsed = GovernedComputeProgressSnapshotV1Schema.parse(snapshot);
  const lanes = parsed.lanes.map(scoreGovernedComputeLane);
  const weightedCompletionPercent = lanes.reduce(
    (sum, lane) => sum + (lane.completionPercent * lane.weight) / 100,
    0,
  );
  const minimumLanePercent = Math.min(...lanes.map((lane) => lane.completionPercent));
  const testsGatePercent = 100 * parsed.lanes.filter((lane) => lane.gates.testsProven).length / parsed.lanes.length;
  const shadowGatePercent = 100 * parsed.lanes.filter((lane) => lane.gates.shadowProven).length / parsed.lanes.length;
  const productionHardenedPercent = 100 * parsed.lanes.filter((lane) => lane.gates.productionHardened).length / parsed.lanes.length;

  return {
    weightedCompletionPercent: Number(weightedCompletionPercent.toFixed(1)),
    minimumLanePercent,
    testsGatePercent: Number(testsGatePercent.toFixed(1)),
    shadowGatePercent: Number(shadowGatePercent.toFixed(1)),
    productionHardenedPercent: Number(productionHardenedPercent.toFixed(1)),
    productionReady: lanes.every((lane) => lane.productionReady),
    lanes,
  };
}

export function nextGovernedComputeGates(snapshot: GovernedComputeProgressSnapshotV1): Array<{
  laneId: GovernedComputeLaneId;
  nextGate: GovernedComputeProofGate;
  blockers: string[];
}> {
  const parsed = GovernedComputeProgressSnapshotV1Schema.parse(snapshot);
  return parsed.lanes.flatMap((lane) => {
    const score = scoreGovernedComputeLane(lane);
    return score.nextGate
      ? [{ laneId: lane.laneId, nextGate: score.nextGate, blockers: [...lane.blockers] }]
      : [];
  });
}
