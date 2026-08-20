import { z } from 'zod';

/**
 * Detect model-internal MoE topology from explicit config fields only.
 * Never infer MoE from model names, external softmax routers, or executor shape.
 */

export const ModelTopologyIdentityV1Schema = z.object({
  schema: z.literal('atlas.model-topology-identity.v1'),
  modelId: z.string().min(1),
  modelRevision: z.string().min(1),
  topology: z.enum(['DENSE', 'MOE', 'UNKNOWN']),
  expertCount: z.number().int().positive().nullable(),
  expertsPerToken: z.number().int().positive().nullable(),
  routerFieldEvidence: z.array(z.string().min(1)).max(16),
  groupedGemmEligible: z.boolean(),
  reasonCodes: z.array(z.string().min(1)).min(1).max(16),
  producerRevision: z.string().min(1),
}).strict();
export type ModelTopologyIdentityV1 = z.infer<typeof ModelTopologyIdentityV1Schema>;

const EXPERT_COUNT_FIELDS = [
  'num_local_experts',
  'num_experts',
  'n_experts',
  'moe_num_experts',
  'expert_count',
] as const;

const TOPK_FIELDS = [
  'num_experts_per_tok',
  'experts_per_token',
  'moe_top_k',
  'top_k_experts',
] as const;

function readPositiveInt(config: Record<string, unknown>, fields: readonly string[]): { value: number | null; field: string | null } {
  for (const field of fields) {
    const raw = config[field];
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return { value: raw, field };
  }
  return { value: null, field: null };
}

export function detectModelTopology(input: {
  modelId: string;
  modelRevision: string;
  config: Record<string, unknown> | null | undefined;
  producerRevision: string;
}): ModelTopologyIdentityV1 {
  const config = input.config ?? {};
  const experts = readPositiveInt(config, EXPERT_COUNT_FIELDS);
  const topK = readPositiveInt(config, TOPK_FIELDS);
  const evidence = [experts.field, topK.field].filter((value): value is string => value !== null);

  if (experts.value !== null || topK.value !== null) {
    if (experts.value === null || topK.value === null) {
      return ModelTopologyIdentityV1Schema.parse({
        schema: 'atlas.model-topology-identity.v1',
        modelId: input.modelId,
        modelRevision: input.modelRevision,
        topology: 'UNKNOWN',
        expertCount: null,
        expertsPerToken: null,
        routerFieldEvidence: evidence,
        groupedGemmEligible: false,
        reasonCodes: ['PARTIAL_MOE_FIELDS', 'GROUPED_GEMM_BLOCKED'],
        producerRevision: input.producerRevision,
      });
    }
    if (topK.value > experts.value) {
      return ModelTopologyIdentityV1Schema.parse({
        schema: 'atlas.model-topology-identity.v1',
        modelId: input.modelId,
        modelRevision: input.modelRevision,
        topology: 'UNKNOWN',
        expertCount: null,
        expertsPerToken: null,
        routerFieldEvidence: evidence,
        groupedGemmEligible: false,
        reasonCodes: ['INVALID_MOE_TOPK_GT_EXPERTS', 'GROUPED_GEMM_BLOCKED'],
        producerRevision: input.producerRevision,
      });
    }
    return ModelTopologyIdentityV1Schema.parse({
      schema: 'atlas.model-topology-identity.v1',
      modelId: input.modelId,
      modelRevision: input.modelRevision,
      topology: 'MOE',
      expertCount: experts.value,
      expertsPerToken: topK.value,
      routerFieldEvidence: evidence,
      groupedGemmEligible: true,
      reasonCodes: ['EXPLICIT_MOE_TOPOLOGY', 'GROUPED_GEMM_ELIGIBLE'],
      producerRevision: input.producerRevision,
    });
  }

  const architecture = String(config['model_type'] ?? config['architectures'] ?? '').toLowerCase();
  const denseDeclared = config['is_moe'] === false || config['moe'] === false;
  return ModelTopologyIdentityV1Schema.parse({
    schema: 'atlas.model-topology-identity.v1',
    modelId: input.modelId,
    modelRevision: input.modelRevision,
    topology: denseDeclared ? 'DENSE' : 'UNKNOWN',
    expertCount: null,
    expertsPerToken: null,
    routerFieldEvidence: architecture ? ['architecture_without_explicit_expert_topology'] : [],
    groupedGemmEligible: false,
    reasonCodes: denseDeclared
      ? ['EXPLICIT_DENSE_MODEL', 'GROUPED_GEMM_BLOCKED']
      : ['NO_EXPLICIT_EXPERT_TOPOLOGY', 'MODEL_NAME_NOT_USED_FOR_INFERENCE', 'GROUPED_GEMM_BLOCKED'],
    producerRevision: input.producerRevision,
  });
}
