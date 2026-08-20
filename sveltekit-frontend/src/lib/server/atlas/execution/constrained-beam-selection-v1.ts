import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ResourceEnvelopeV1Schema, type ResourceEnvelopeV1 } from '$lib/server/retrieval/bounded-resolution.js';

export const BEAM_CANDIDATE_FAMILIES = ['entity', 'relationship', 'evidence'] as const;
export const BEAM_EXECUTION_CLASSES = ['CPU', 'GPU', 'EITHER'] as const;

const normalized = z.number().finite().min(0).max(1);
const safeBytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const beamCandidateScoresSchema = z.object({
  exact: normalized.default(0),
  reranker: normalized.default(0),
  ppr: normalized.default(0),
  pagerank: normalized.default(0),
  semantic: normalized.default(0),
  structural: normalized.default(0),
  incidenceConfidence: normalized.default(0),
}).strict();

export const beamCandidateCostSchema = z.object({
  candidateUnits: z.number().int().positive().default(1),
  hyperedgeUnits: z.number().int().nonnegative().default(0),
  fanoutUnits: z.number().int().nonnegative().default(0),
  gpuBytes: safeBytes.default(0),
  hostBytes: safeBytes.default(0),
}).strict();

export const beamCandidateSchema = z.object({
  canonicalId: z.string().min(1),
  family: z.enum(BEAM_CANDIDATE_FAMILIES),
  entityType: z.string().min(1).optional(),
  relationshipId: z.string().min(1).optional(),
  executionClass: z.enum(BEAM_EXECUTION_CLASSES).default('EITHER'),
  scores: beamCandidateScoresSchema.default({}),
  cost: beamCandidateCostSchema.default({}),
  evidenceRefs: z.array(z.string().min(1)).default([]),
}).strict();

export const beamSelectionWeightsSchema = z.object({
  exact: z.number().finite().nonnegative().default(3),
  reranker: z.number().finite().nonnegative().default(2),
  ppr: z.number().finite().nonnegative().default(1.5),
  pagerank: z.number().finite().nonnegative().default(0.75),
  semantic: z.number().finite().nonnegative().default(1),
  structural: z.number().finite().nonnegative().default(1),
  incidenceConfidence: z.number().finite().nonnegative().default(1),
}).strict();

export const beamFamilyQuotaSchema = z.object({
  family: z.enum(BEAM_CANDIDATE_FAMILIES),
  min: z.number().int().nonnegative().default(0),
  max: z.number().int().positive().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.max !== undefined && value.min > value.max) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['min'],
      message: 'family quota min must not exceed max',
    });
  }
});

export const gpuCapacitySnapshotSchema = z.object({
  totalVramBytes: safeBytes.optional(),
  freeVramBytes: safeBytes,
  reservedHeadroomBytes: safeBytes.default(0),
  telemetryProven: z.boolean().default(false),
  deviceName: z.string().min(1).optional(),
  computeCapability: z.string().min(1).optional(),
}).strict();

export const constrainedBeamSelectionInputSchema = z.object({
  schema: z.literal('atlas.constrained-beam-selection-input.v1').default('atlas.constrained-beam-selection-input.v1'),
  requestId: z.string().min(1),
  revisionSetHash: z.string().min(16),
  seed: z.number().int().min(0).max(0xffff_ffff).default(0),
  beamWidth: z.number().int().positive().max(128).default(32),
  poolLimit: z.number().int().positive().max(4096).default(1024),
  maxSelections: z.number().int().positive().max(4096),
  explorationWeight: z.number().finite().min(0).max(0.25).default(0),
  envelope: ResourceEnvelopeV1Schema,
  gpu: gpuCapacitySnapshotSchema.optional(),
  weights: beamSelectionWeightsSchema.default({}),
  familyQuotas: z.array(beamFamilyQuotaSchema).max(BEAM_CANDIDATE_FAMILIES.length).default([]),
  candidates: z.array(beamCandidateSchema),
}).strict();

export type BeamCandidateV1 = z.infer<typeof beamCandidateSchema>;
export type BeamCandidateCostV1 = z.infer<typeof beamCandidateCostSchema>;
export type BeamSelectionWeightsV1 = z.infer<typeof beamSelectionWeightsSchema>;
export type BeamFamilyQuotaV1 = z.infer<typeof beamFamilyQuotaSchema>;
export type GpuCapacitySnapshotV1 = z.infer<typeof gpuCapacitySnapshotSchema>;
export type ConstrainedBeamSelectionInputV1 = z.infer<typeof constrainedBeamSelectionInputSchema>;

export interface BeamBudgetUsageV1 {
  candidates: number;
  hyperedges: number;
  fanout: number;
  gpuBytes: number;
  hostBytes: number;
}

export interface BeamBudgetPressureV1 {
  candidates: number;
  hyperedges: number;
  fanout: number;
  gpu: number;
  dominant: number;
  dominantAxis: 'candidates' | 'hyperedges' | 'fanout' | 'gpu' | 'none';
}

export interface ConstrainedBeamSelectionReceiptV1 {
  schema: 'atlas.constrained-beam-selection-receipt.v1';
  requestId: string;
  revisionSetHash: string;
  seed: number;
  beamWidth: number;
  poolSize: number;
  selectedCanonicalIds: string[];
  familyCounts: Record<(typeof BEAM_CANDIDATE_FAMILIES)[number], number>;
  usage: BeamBudgetUsageV1;
  pressure: BeamBudgetPressureV1;
  effectiveGpuBudgetBytes: number | null;
  quotaSatisfied: boolean;
  status: 'SELECTED' | 'DEGRADED' | 'EMPTY';
  reasonCodes: string[];
  checksum: string;
}

export const gpuWorkingSetModelSchema = z.object({
  schema: z.literal('atlas.gpu-working-set-model.v1').default('atlas.gpu-working-set-model.v1'),
  candidateRows: z.number().int().nonnegative(),
  semanticDimensions: z.number().int().nonnegative().max(65536).default(0),
  semanticBytesPerElement: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]).default(2),
  featureColumns: z.number().int().nonnegative().max(4096).default(0),
  featureBytesPerElement: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]).default(4),
  graphVertices: z.number().int().nonnegative().default(0),
  graphEdges: z.number().int().nonnegative().default(0),
  vertexBytes: z.number().int().positive().max(64).default(8),
  edgeBytes: z.number().int().positive().max(128).default(16),
  hyperedgeIncidences: z.number().int().nonnegative().default(0),
  incidenceBytes: z.number().int().positive().max(128).default(24),
  fixedOverheadBytes: safeBytes.default(0),
  scratchMultiplier: z.number().finite().min(1).max(8).default(1.5),
}).strict();

export type GpuWorkingSetModelV1 = z.infer<typeof gpuWorkingSetModelSchema>;

export interface GpuWorkingSetEstimateV1 {
  schema: 'atlas.gpu-working-set-estimate.v1';
  semanticBytes: number;
  featureBytes: number;
  graphBytes: number;
  incidenceBytes: number;
  fixedOverheadBytes: number;
  baseBytes: number;
  scratchMultiplier: number;
  estimatedBytes: number;
}

function finiteSafeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('byte estimate must be finite and non-negative');
  if (value > Number.MAX_SAFE_INTEGER) throw new RangeError('byte estimate exceeds Number.MAX_SAFE_INTEGER');
  return Math.ceil(value);
}

/**
 * Conservative model for selecting a feasible batch before the executor asks
 * NVML-backed admission for the final proof. It is an estimate, not a CUDA
 * allocator receipt. Library workspaces must be represented by scratchMultiplier
 * or fixedOverheadBytes and calibrated on the target GPU.
 */
export function estimateGpuWorkingSet(input: z.input<typeof gpuWorkingSetModelSchema>): GpuWorkingSetEstimateV1 {
  const model = gpuWorkingSetModelSchema.parse(input);
  const semanticBytes = finiteSafeInt(model.candidateRows * model.semanticDimensions * model.semanticBytesPerElement);
  const featureBytes = finiteSafeInt(model.candidateRows * model.featureColumns * model.featureBytesPerElement);
  const graphBytes = finiteSafeInt(model.graphVertices * model.vertexBytes + model.graphEdges * model.edgeBytes);
  const incidenceBytes = finiteSafeInt(model.hyperedgeIncidences * model.incidenceBytes);
  const baseBytes = finiteSafeInt(semanticBytes + featureBytes + graphBytes + incidenceBytes + model.fixedOverheadBytes);
  const estimatedBytes = finiteSafeInt(baseBytes * model.scratchMultiplier);
  return {
    schema: 'atlas.gpu-working-set-estimate.v1',
    semanticBytes,
    featureBytes,
    graphBytes,
    incidenceBytes,
    fixedOverheadBytes: model.fixedOverheadBytes,
    baseBytes,
    scratchMultiplier: model.scratchMultiplier,
    estimatedBytes,
  };
}

function scoreCandidate(candidate: BeamCandidateV1, weights: BeamSelectionWeightsV1): number {
  return (
    candidate.scores.exact * weights.exact +
    candidate.scores.reranker * weights.reranker +
    candidate.scores.ppr * weights.ppr +
    candidate.scores.pagerank * weights.pagerank +
    candidate.scores.semantic * weights.semantic +
    candidate.scores.structural * weights.structural +
    candidate.scores.incidenceConfidence * weights.incidenceConfidence
  );
}

function seededUnit(seed: number, id: string): number {
  const digest = createHash('sha256').update(`${seed >>> 0}\u0000${id}`).digest('hex').slice(0, 8);
  return Number.parseInt(digest, 16) / 0xffff_ffff;
}

function zeroUsage(): BeamBudgetUsageV1 {
  return { candidates: 0, hyperedges: 0, fanout: 0, gpuBytes: 0, hostBytes: 0 };
}

function addCost(usage: BeamBudgetUsageV1, cost: BeamCandidateCostV1): BeamBudgetUsageV1 {
  return {
    candidates: usage.candidates + cost.candidateUnits,
    hyperedges: usage.hyperedges + cost.hyperedgeUnits,
    fanout: usage.fanout + cost.fanoutUnits,
    gpuBytes: usage.gpuBytes + cost.gpuBytes,
    hostBytes: usage.hostBytes + cost.hostBytes,
  };
}

function effectiveGpuBudget(envelope: ResourceEnvelopeV1, gpu?: GpuCapacitySnapshotV1): number | null {
  const staticLimit = envelope.maxVramBytes > 0 ? envelope.maxVramBytes : null;
  if (!gpu) return staticLimit;
  if (!gpu.telemetryProven) return staticLimit;
  const liveLimit = Math.max(0, gpu.freeVramBytes - gpu.reservedHeadroomBytes);
  return staticLimit === null ? liveLimit : Math.min(staticLimit, liveLimit);
}

function ratio(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return used > 0 && limit === 0 ? Number.POSITIVE_INFINITY : 0;
  return used / limit;
}

function budgetPressure(
  usage: BeamBudgetUsageV1,
  envelope: ResourceEnvelopeV1,
  fanoutLimit: number,
  gpuBudget: number | null,
): BeamBudgetPressureV1 {
  const values = {
    candidates: ratio(usage.candidates, envelope.maxCandidates),
    hyperedges: envelope.maxHyperedges > 0 ? ratio(usage.hyperedges, envelope.maxHyperedges) : 0,
    fanout: fanoutLimit > 0 ? ratio(usage.fanout, fanoutLimit) : 0,
    gpu: gpuBudget === null ? 0 : ratio(usage.gpuBytes, gpuBudget),
  };
  let dominantAxis: BeamBudgetPressureV1['dominantAxis'] = 'none';
  let dominant = 0;
  for (const [axis, value] of Object.entries(values) as Array<[Exclude<BeamBudgetPressureV1['dominantAxis'], 'none'>, number]>) {
    if (value > dominant) {
      dominant = value;
      dominantAxis = axis;
    }
  }
  return { ...values, dominant, dominantAxis };
}

function quotaMap(quotas: readonly BeamFamilyQuotaV1[]): Map<BeamCandidateV1['family'], BeamFamilyQuotaV1> {
  const map = new Map<BeamCandidateV1['family'], BeamFamilyQuotaV1>();
  for (const quota of quotas) map.set(quota.family, quota);
  return map;
}

function countsFor(selected: readonly BeamCandidateV1[]): Record<BeamCandidateV1['family'], number> {
  const counts: Record<BeamCandidateV1['family'], number> = { entity: 0, relationship: 0, evidence: 0 };
  for (const candidate of selected) counts[candidate.family] += 1;
  return counts;
}

function quotasSatisfied(selected: readonly BeamCandidateV1[], quotas: readonly BeamFamilyQuotaV1[]): boolean {
  const counts = countsFor(selected);
  return quotas.every((quota) => counts[quota.family] >= quota.min && (quota.max === undefined || counts[quota.family] <= quota.max));
}

function fits(input: {
  candidate: BeamCandidateV1;
  selected: readonly BeamCandidateV1[];
  nextUsage: BeamBudgetUsageV1;
  maxSelections: number;
  envelope: ResourceEnvelopeV1;
  fanoutLimit: number;
  gpuBudget: number | null;
  quotas: Map<BeamCandidateV1['family'], BeamFamilyQuotaV1>;
}): boolean {
  if (input.selected.length >= input.maxSelections) return false;
  if (input.nextUsage.candidates > input.envelope.maxCandidates) return false;
  if (input.envelope.maxHyperedges > 0 && input.nextUsage.hyperedges > input.envelope.maxHyperedges) return false;
  if (input.fanoutLimit > 0 && input.nextUsage.fanout > input.fanoutLimit) return false;
  const quota = input.quotas.get(input.candidate.family);
  const existingFamilyCount = input.selected.filter((entry) => entry.family === input.candidate.family).length;
  if (quota?.max !== undefined && existingFamilyCount + 1 > quota.max) return false;
  if (input.candidate.executionClass === 'GPU') {
    if (input.gpuBudget === null) return false;
    if (input.nextUsage.gpuBytes > input.gpuBudget) return false;
  } else if (input.gpuBudget !== null && input.nextUsage.gpuBytes > input.gpuBudget) {
    return false;
  }
  return true;
}

interface BeamState {
  selected: BeamCandidateV1[];
  usage: BeamBudgetUsageV1;
  utility: number;
}

function stateObjective(
  state: BeamState,
  quotas: readonly BeamFamilyQuotaV1[],
  envelope: ResourceEnvelopeV1,
  fanoutLimit: number,
  gpuBudget: number | null,
): number {
  const counts = countsFor(state.selected);
  let quotaProgress = 0;
  for (const quota of quotas) {
    if (quota.min <= 0) continue;
    quotaProgress += Math.min(1, counts[quota.family] / quota.min);
  }
  const pressure = budgetPressure(state.usage, envelope, fanoutLimit, gpuBudget);
  return state.utility + quotaProgress * 0.2 - Math.min(1, pressure.dominant) * 0.05;
}

/**
 * Multi-budget beam selector. PageRank/PPR/semantic scores only influence
 * utility; they cannot create identity, evidence or relationships. Fanout and
 * VRAM are costs, so high-degree hubs cannot consume the whole expansion merely
 * because they rank highly.
 *
 * explorationWeight is optional seeded exploration. The seed is receipt-bound,
 * making the choice replayable. This borrows the useful part of randomized
 * layer-design experiments (explicit quotas + bounded sampling) without
 * pretending the code graph is a quantum Hilbert space.
 */
export function constrainedBeamSelect(raw: z.input<typeof constrainedBeamSelectionInputSchema>): ConstrainedBeamSelectionReceiptV1 {
  const input = constrainedBeamSelectionInputSchema.parse(raw);
  const maxSelections = Math.min(input.maxSelections, input.envelope.maxCandidates);
  const gpuBudget = effectiveGpuBudget(input.envelope, input.gpu);
  const fanoutLimit = Math.max(0, input.envelope.maxHyperedges > 0 ? input.envelope.maxHyperedges * 8 : input.envelope.maxCandidates * 8);
  const quotas = quotaMap(input.familyQuotas);

  const deduped = new Map<string, BeamCandidateV1>();
  for (const candidate of input.candidates) {
    const previous = deduped.get(candidate.canonicalId);
    if (!previous || scoreCandidate(candidate, input.weights) > scoreCandidate(previous, input.weights)) {
      deduped.set(candidate.canonicalId, candidate);
    }
  }

  const pool = [...deduped.values()]
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, input.weights) + input.explorationWeight * seededUnit(input.seed, candidate.canonicalId),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.canonicalId.localeCompare(b.candidate.canonicalId))
    .slice(0, input.poolLimit);

  let beam: BeamState[] = [{ selected: [], usage: zeroUsage(), utility: 0 }];

  for (const entry of pool) {
    const expanded: BeamState[] = [];
    for (const state of beam) {
      expanded.push(state);
      const nextUsage = addCost(state.usage, entry.candidate.cost);
      if (fits({
        candidate: entry.candidate,
        selected: state.selected,
        nextUsage,
        maxSelections,
        envelope: input.envelope,
        fanoutLimit,
        gpuBudget,
        quotas,
      })) {
        expanded.push({
          selected: [...state.selected, entry.candidate],
          usage: nextUsage,
          utility: state.utility + entry.score,
        });
      }
    }
    expanded.sort((a, b) =>
      stateObjective(b, input.familyQuotas, input.envelope, fanoutLimit, gpuBudget) -
      stateObjective(a, input.familyQuotas, input.envelope, fanoutLimit, gpuBudget)
    );
    beam = expanded.slice(0, input.beamWidth);
  }

  const quotaEligible = beam.filter((state) => quotasSatisfied(state.selected, input.familyQuotas));
  const winner = (quotaEligible.length > 0 ? quotaEligible : beam)[0] ?? { selected: [], usage: zeroUsage(), utility: 0 };
  const quotaSatisfied = quotasSatisfied(winner.selected, input.familyQuotas);
  const pressure = budgetPressure(winner.usage, input.envelope, fanoutLimit, gpuBudget);
  const selectedCanonicalIds = winner.selected.map((candidate) => candidate.canonicalId);
  const reasonCodes: string[] = [];

  if (!quotaSatisfied) reasonCodes.push('FAMILY_QUOTA_MINIMUM_UNMET');
  if (input.gpu && !input.gpu.telemetryProven) reasonCodes.push('GPU_TELEMETRY_UNPROVEN');
  if (pool.length < deduped.size) reasonCodes.push('POOL_LIMIT_APPLIED');
  if (winner.selected.length >= maxSelections) reasonCodes.push('CANDIDATE_LIMIT_REACHED');
  if (pressure.dominant >= 0.95 && pressure.dominantAxis !== 'none') {
    reasonCodes.push(`BUDGET_PRESSURE_${pressure.dominantAxis.toUpperCase()}`);
  }
  if (input.explorationWeight > 0) reasonCodes.push('SEEDED_EXPLORATION_ENABLED');
  if (selectedCanonicalIds.length === 0) reasonCodes.push('NO_FEASIBLE_CANDIDATE');
  if (reasonCodes.length === 0) reasonCodes.push('CONSTRAINED_BEAM_SELECTED');

  const status: ConstrainedBeamSelectionReceiptV1['status'] =
    selectedCanonicalIds.length === 0 ? 'EMPTY' : quotaSatisfied ? 'SELECTED' : 'DEGRADED';

  const payload = {
    schema: 'atlas.constrained-beam-selection-receipt.v1' as const,
    requestId: input.requestId,
    revisionSetHash: input.revisionSetHash,
    seed: input.seed,
    beamWidth: input.beamWidth,
    poolSize: pool.length,
    selectedCanonicalIds,
    familyCounts: countsFor(winner.selected),
    usage: winner.usage,
    pressure,
    effectiveGpuBudgetBytes: gpuBudget,
    quotaSatisfied,
    status,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
  const checksum = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { ...payload, checksum };
}
