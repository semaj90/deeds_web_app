import { z } from 'zod';

export type ResidencyTier = 'COLD' | 'WARM' | 'HOT' | 'VERY_HOT';
export type Fidelity =
  | 'METADATA'
  | 'LATENT_128'
  | 'SEMANTIC_COMPRESSED'
  | 'SEMANTIC_768'
  | 'FEATURE_ROW'
  | 'SOURCE_CARD'
  | 'TOKEN_TENSORS';

export const ACE_RESIDENCY_MANIFEST_REVISION = 'parent-atlas.ace-residency.v1' as const;

export interface GpuResidencyManifest {
  revision: typeof ACE_RESIDENCY_MANIFEST_REVISION;
  objectId: string;
  representationId: string;
  representationRevision: string;
  fidelity: Fidelity;
  residency: ResidencyTier;
  bytes: number;
  utility: number;
  transferCostMs: number;
  recomputeCostMs: number;
  preemptible: boolean;
}

export interface ResidencyBudget {
  maxBytes: number;
  promoteAbovePressure?: number;
  demoteAbovePressure?: number;
}

export const GpuResidencyManifestSchema = z
  .object({
    revision: z.literal(ACE_RESIDENCY_MANIFEST_REVISION),
    objectId: z.string().min(1),
    representationId: z.string().min(1),
    representationRevision: z.string().min(1),
    fidelity: z.enum(['METADATA', 'LATENT_128', 'SEMANTIC_COMPRESSED', 'SEMANTIC_768', 'FEATURE_ROW', 'SOURCE_CARD', 'TOKEN_TENSORS']),
    residency: z.enum(['COLD', 'WARM', 'HOT', 'VERY_HOT']),
    bytes: z.number().int().positive(),
    utility: z.number().finite(),
    transferCostMs: z.number().finite().nonnegative(),
    recomputeCostMs: z.number().finite().nonnegative(),
    preemptible: z.boolean(),
  })
  .strict();

export type GpuResidencyManifestInput = Omit<GpuResidencyManifest, 'revision'> & { revision?: typeof ACE_RESIDENCY_MANIFEST_REVISION };

export const ResidencyBudgetSchema = z
  .object({
    maxBytes: z.number().int().positive(),
    promoteAbovePressure: z.number().finite().min(0).max(1).optional(),
    demoteAbovePressure: z.number().finite().min(0).max(1).optional(),
  })
  .strict();

export interface ResidencyPlan {
  revision: typeof ACE_RESIDENCY_MANIFEST_REVISION;
  budget: ResidencyBudget;
  selected: GpuResidencyManifest[];
  deferred: GpuResidencyManifest[];
  usedBytes: number;
}

export function utilityPerByte(item: GpuResidencyManifest): number {
  const costPenalty = 1 + item.transferCostMs + item.recomputeCostMs * 0.25;
  return item.utility / Math.max(1, item.bytes * costPenalty);
}

export function validateResidencyManifest(manifest: GpuResidencyManifestInput): GpuResidencyManifest {
  return GpuResidencyManifestSchema.parse({
    ...manifest,
    revision: manifest.revision ?? ACE_RESIDENCY_MANIFEST_REVISION,
  });
}

export function buildResidencyPlan(
  candidates: GpuResidencyManifestInput[],
  budget: ResidencyBudget,
): ResidencyPlan {
  const validatedBudget = ResidencyBudgetSchema.parse(budget);
  const validatedCandidates = candidates.map((candidate) => validateResidencyManifest(candidate));
  const selected = chooseResidency(validatedCandidates, validatedBudget);
  const selectedIds = new Set(selected.map((item) => item.objectId));
  return {
    revision: ACE_RESIDENCY_MANIFEST_REVISION,
    budget: validatedBudget,
    selected,
    deferred: validatedCandidates.filter((item) => !selectedIds.has(item.objectId)),
    usedBytes: selected.reduce((sum, item) => sum + item.bytes, 0),
  };
}

export function chooseResidency(
  candidates: GpuResidencyManifest[],
  budget: ResidencyBudget,
): GpuResidencyManifest[] {
  let used = 0;
  const selected: GpuResidencyManifest[] = [];
  for (const item of [...candidates].sort((a, b) => utilityPerByte(b) - utilityPerByte(a) || a.objectId.localeCompare(b.objectId))) {
    if (used + item.bytes > budget.maxBytes) continue;
    selected.push(item);
    used += item.bytes;
  }
  return selected;
}
