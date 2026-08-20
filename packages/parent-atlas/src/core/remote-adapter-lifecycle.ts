import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const REMOTE_TRAINING_EXECUTORS = [
  'LOCAL_IPYTHON',
  'GCE_JUPYTER',
  'COLAB_ENTERPRISE',
  'COLAB_HOSTED_NOTEBOOK',
] as const;

export const remoteTrainingExecutorSchema = z.object({
  executor: z.enum(REMOTE_TRAINING_EXECUTORS),
  execution_mode: z.enum(['PERSISTENT_JUPYTER', 'ONE_SHOT_ARTIFACT_JOB']),
  host_initiated_zmq: z.boolean(),
  artifact_exchange: z.enum(['LOCAL_FS', 'CLOUD_STORAGE', 'MANUAL_NOTEBOOK_UPLOAD']),
  credential_owner: z.literal('TYPESCRIPT_HOST'),
}).strict().superRefine((value, ctx) => {
  if (value.executor === 'COLAB_HOSTED_NOTEBOOK') {
    if (value.host_initiated_zmq) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['host_initiated_zmq'], message: 'hosted Colab is not admitted as a host-initiated Atlas ZMQ runtime' });
    }
    if (value.execution_mode !== 'ONE_SHOT_ARTIFACT_JOB') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['execution_mode'], message: 'hosted Colab must consume/produce frozen artifacts as a one-shot job' });
    }
  }
  if (value.execution_mode === 'PERSISTENT_JUPYTER' && !value.host_initiated_zmq) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['host_initiated_zmq'], message: 'persistent remote Jupyter executor requires an endpoint controlled by Atlas' });
  }
});
export type RemoteTrainingExecutorV1 = z.infer<typeof remoteTrainingExecutorSchema>;

export const cdcPartitionRangeSchema = z.object({
  topic: z.string().min(1),
  partition: z.number().int().nonnegative(),
  start_offset_inclusive: z.string().regex(/^\d+$/),
  end_offset_inclusive: z.string().regex(/^\d+$/),
  event_count: z.number().int().nonnegative(),
}).strict();

export const cdcCalibrationSnapshotSchema = z.object({
  schema: z.literal('atlas.cdc-calibration-snapshot.v1').default('atlas.cdc-calibration-snapshot.v1'),
  snapshot_revision: revision,
  source: z.literal('KAFKA_DEBEZIUM_OUTBOX'),
  outbox_schema_revision: revision,
  partition_ranges: z.array(cdcPartitionRangeSchema).min(1),
  event_id_checksum: checksum,
  event_count: z.number().int().positive(),
  payload_policy: z.enum(['METRICS_ONLY', 'VERIFIED_EVIDENCE_EXAMPLES']),
  raw_prompt_payload_exported: z.literal(false).default(false),
  verified_claim_receipt_ids: z.array(id).default([]),
  source_snapshot_revision: revision,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const counted = value.partition_ranges.reduce((sum, range) => sum + range.event_count, 0);
  if (counted !== value.event_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['event_count'], message: 'event_count must equal sum(partition_ranges.event_count)' });
  }
  if (value.payload_policy === 'VERIFIED_EVIDENCE_EXAMPLES' && value.verified_claim_receipt_ids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['verified_claim_receipt_ids'], message: 'training examples derived from CDC require verified claim receipts' });
  }
});
export type CdcCalibrationSnapshotV1 = z.infer<typeof cdcCalibrationSnapshotSchema>;

export const routerWeightedSaliencySchema = z.object({
  schema: z.literal('atlas.router-weighted-saliency.v1').default('atlas.router-weighted-saliency.v1'),
  observation_id: id,
  model_revision: revision,
  calibration_snapshot_revision: revision,
  unit_id: id,
  unit_kind: z.enum(['MOE_EXPERT', 'ADAPTER_MODULE', 'ATTENTION_HEAD', 'DELTANET_PROJECTION', 'FFN_PROJECTION']),
  method: z.enum(['REAP_EXPERT_SALIENCY', 'ATLAS_ROUTER_WEIGHTED_MODULE_SALIENCY']),
  routing_source: z.enum(['MODEL_NATIVE_ROUTER', 'ATLAS_POLICY_ROUTER']),
  mean_router_weight: z.number().finite().min(0),
  mean_activation_l2: z.number().finite().nonnegative(),
  sample_count: z.number().int().positive(),
  saliency: z.number().finite().nonnegative(),
  input_checksum: checksum,
  output_checksum: checksum,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.method === 'REAP_EXPERT_SALIENCY') {
    if (value.unit_kind !== 'MOE_EXPERT' || value.routing_source !== 'MODEL_NATIVE_ROUTER') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['method'], message: 'REAP_EXPERT_SALIENCY is reserved for actual model-native MoE experts' });
    }
  } else if (value.unit_kind === 'MOE_EXPERT') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['method'], message: 'native MoE expert saliency should use the explicit REAP method when REAP semantics are intended' });
  }
});
export type RouterWeightedSaliencyV1 = z.infer<typeof routerWeightedSaliencySchema>;

export const adapterTargetSchema = z.object({
  module_path: z.string().min(1),
  target_kind: z.enum(['LINEAR_MODULE', 'EMBEDDING_MODULE']),
  lora_rank: z.number().int().positive().max(512),
  lora_alpha: z.number().finite().positive(),
  saliency_observation_ids: z.array(id).default([]),
  head_analysis_ids: z.array(id).default([]),
}).strict();

export const remoteQloraTrainingPlanSchema = z.object({
  schema: z.literal('atlas.remote-qlora-training-plan.v1').default('atlas.remote-qlora-training-plan.v1'),
  plan_revision: revision,
  base_model_id: id,
  base_model_revision: revision,
  base_model_architecture: z.enum(['DENSE_HYBRID', 'SPARSE_MOE']),
  dataset_revision: revision,
  dataset_checksum: checksum,
  evidence_snapshot_revision: revision,
  calibration_snapshot_revision: revision,
  executor: remoteTrainingExecutorSchema,
  quantization: z.object({
    method: z.enum(['NF4', 'FP4']),
    load_in_4bit: z.literal(true),
    compute_dtype: z.enum(['BF16', 'FP16']),
    double_quantization: z.boolean(),
  }).strict(),
  gradient_checkpointing: z.boolean(),
  seed: z.number().int().nonnegative(),
  targets: z.array(adapterTargetSchema).min(1),
  maximum_train_steps: z.number().int().positive(),
  maximum_gpu_memory_bytes: z.number().int().positive().nullable().default(null),
  output_adapter_artifact_id: id,
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.base_model_architecture === 'DENSE_HYBRID') {
    const invalid = value.targets.some((target) => target.module_path.includes('.experts.'));
    if (invalid) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targets'], message: 'dense-hybrid model cannot target synthetic MoE expert paths' });
  }
});
export type RemoteQloraTrainingPlanV1 = z.infer<typeof remoteQloraTrainingPlanSchema>;

export const adapterMergePlanSchema = z.object({
  schema: z.literal('atlas.adapter-merge-plan.v1').default('atlas.adapter-merge-plan.v1'),
  merge_revision: revision,
  base_model_id: id,
  base_model_revision: revision,
  adapter_artifact_id: id,
  adapter_checksum: checksum,
  method: z.enum(['PEFT_MERGE_AND_UNLOAD', 'PEFT_MERGE_ADAPTER', 'PEFT_TIES', 'PEFT_SVD_WEIGHTED']),
  reload_unquantized_base_for_merge: z.literal(true).default(true),
  merge_dtype: z.enum(['BF16', 'FP16', 'FP32']),
  quantized_base_merge_forbidden: z.literal(true).default(true),
  validation_dataset_revision: revision,
  output_model_artifact_id: id,
  producer_revision: revision,
}).strict();
export type AdapterMergePlanV1 = z.infer<typeof adapterMergePlanSchema>;

export const adapterTrainingReceiptSchema = z.object({
  schema: z.literal('atlas.adapter-training-receipt.v1').default('atlas.adapter-training-receipt.v1'),
  plan_revision: revision,
  base_model_revision: revision,
  dataset_revision: revision,
  calibration_snapshot_revision: revision,
  executor: z.enum(REMOTE_TRAINING_EXECUTORS),
  runtime_fingerprint: z.record(z.string(), z.string()),
  adapter_artifact_id: id,
  adapter_checksum: checksum,
  trainable_parameter_count: z.number().int().nonnegative(),
  peak_gpu_memory_bytes: z.number().int().nonnegative().nullable(),
  selected_modules: z.array(z.string().min(1)),
  actual_ranks: z.record(z.string(), z.number().int().positive()),
  training_metrics: z.record(z.string(), z.number().finite()),
  validation_metrics: z.record(z.string(), z.number().finite()),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type AdapterTrainingReceiptV1 = z.infer<typeof adapterTrainingReceiptSchema>;

export const adapterMergeReceiptSchema = z.object({
  schema: z.literal('atlas.adapter-merge-receipt.v1').default('atlas.adapter-merge-receipt.v1'),
  merge_revision: revision,
  base_model_revision: revision,
  adapter_checksum: checksum,
  merged_model_artifact_id: id,
  merged_model_checksum: checksum,
  merge_dtype: z.enum(['BF16', 'FP16', 'FP32']),
  quantized_base_was_not_merge_target: z.literal(true),
  validation_metrics_before: z.record(z.string(), z.number().finite()),
  validation_metrics_after: z.record(z.string(), z.number().finite()),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type AdapterMergeReceiptV1 = z.infer<typeof adapterMergeReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function checksumRemoteAdapterPlan(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function describeRemoteAdapterLifecycle(): string {
  return [
    'Kafka/Debezium CDC contributes bounded calibration lineage and behavioral statistics; verified evidence remains the only training-label authority.',
    'Hosted Colab is treated as an artifact job, not as Atlas persistent ZMQ authority; persistent Jupyter executors must be endpoints controlled by Atlas.',
    'REAP naming is reserved for native sparse-MoE expert pruning; dense/hybrid models may use an Atlas router-weighted module saliency analogue without pretending they contain experts.',
    'QLoRA trains adapters against a four-bit base, but merge receipts reload the canonical unquantized base before PEFT merge and revalidate the result.',
  ].join(' ');
}
