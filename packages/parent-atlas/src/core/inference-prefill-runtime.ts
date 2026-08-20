import { z } from 'zod';
import { prefillRuntimeIdentitySchema } from './prefill-cache-runtime.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const ATLAS_INFERENCE_RUNTIMES = [
  'LLAMA_CPP',
  'TRTLLM_PYTORCH',
  'TRITON_TRTLLM',
  'TRITON_PYTHON',
  'PYTORCH_EAGER',
  'PYTORCH_COMPILE',
] as const;

export const PREFILL_RUNTIME_CACHE_MODES = [
  'NONE',
  'PREFIX_TOKEN_REUSE',
  'PAGED_KV_BLOCK_REUSE',
  'EXTERNAL_KV_CONNECTOR',
  'DISAGGREGATED_PREFILL_DECODE',
] as const;

export const runtimePrefillCapabilitiesSchema = z.object({
  schema: z.literal('atlas.runtime-prefill-capabilities.v1').default('atlas.runtime-prefill-capabilities.v1'),
  runtime_id: id,
  runtime_revision: revision,
  runtime: z.enum(ATLAS_INFERENCE_RUNTIMES),
  serving_layer: z.enum(['DIRECT', 'TRITON']),
  model_revision: revision,
  adapter_revision: revision.nullable().default(null),
  tokenizer_revision: revision,
  chat_template_revision: revision,
  cache_modes: z.array(z.enum(PREFILL_RUNTIME_CACHE_MODES)).min(1),
  paged_kv_cache: z.boolean(),
  block_reuse: z.boolean(),
  partial_block_reuse: z.boolean().default(false),
  cache_salt_supported: z.boolean().default(false),
  kv_host_offload_supported: z.boolean().default(false),
  kv_connector_supported: z.boolean().default(false),
  inflight_batching_supported: z.boolean().default(false),
  chunked_context_supported: z.boolean().default(false),
  lora_cache_supported: z.boolean().default(false),
  runtime_metrics_supported: z.boolean().default(false),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.runtime === 'TRITON_TRTLLM' && value.serving_layer !== 'TRITON') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['serving_layer'], message: 'TRITON_TRTLLM requires serving_layer=TRITON' });
  }
  if (value.runtime !== 'TRITON_TRTLLM' && value.runtime !== 'TRITON_PYTHON' && value.serving_layer === 'TRITON') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['serving_layer'], message: 'TRITON serving layer is reserved for Triton runtime bindings' });
  }
  if (value.block_reuse && !value.paged_kv_cache) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['block_reuse'], message: 'KV block reuse requires paged_kv_cache' });
  }
  if (value.partial_block_reuse && !value.block_reuse) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['partial_block_reuse'], message: 'partial block reuse requires block_reuse' });
  }
  if (value.cache_modes.includes('PAGED_KV_BLOCK_REUSE') && (!value.paged_kv_cache || !value.block_reuse)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cache_modes'], message: 'PAGED_KV_BLOCK_REUSE requires paged KV cache with block reuse' });
  }
  if (value.cache_modes.includes('EXTERNAL_KV_CONNECTOR') && !value.kv_connector_supported) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cache_modes'], message: 'EXTERNAL_KV_CONNECTOR requires kv_connector_supported' });
  }
  if (value.cache_modes.includes('DISAGGREGATED_PREFILL_DECODE') && !value.kv_connector_supported) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cache_modes'], message: 'disaggregated prefill/decode requires a KV transfer/connector capability' });
  }
});
export type RuntimePrefillCapabilitiesV1 = z.infer<typeof runtimePrefillCapabilitiesSchema>;

export const runtimePrefillBindingSchema = z.object({
  schema: z.literal('atlas.runtime-prefill-binding.v1').default('atlas.runtime-prefill-binding.v1'),
  binding_id: id,
  binding_revision: revision,
  identity: prefillRuntimeIdentitySchema,
  capabilities: runtimePrefillCapabilitiesSchema,
  cache_mode: z.enum(PREFILL_RUNTIME_CACHE_MODES),
  cache_namespace_checksum: checksum.nullable().default(null),
  request_isolation_checksum: checksum.nullable().default(null),
  external_cache_artifact_id: id.nullable().default(null),
  external_cache_artifact_checksum: checksum.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (!value.capabilities.cache_modes.includes(value.cache_mode)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cache_mode'], message: 'selected cache_mode is not supported by runtime capabilities' });
  }
  if (value.identity.inference_runtime_id !== value.capabilities.runtime_id || value.identity.inference_runtime_revision !== value.capabilities.runtime_revision) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identity'], message: 'logical prefill runtime identity must bind to the selected runtime revision' });
  }
  if (value.identity.model_revision !== value.capabilities.model_revision ||
      value.identity.adapter_revision !== value.capabilities.adapter_revision ||
      value.identity.tokenizer_revision !== value.capabilities.tokenizer_revision ||
      value.identity.chat_template_revision !== value.capabilities.chat_template_revision) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identity'], message: 'model/adapter/tokenizer/template revisions must match runtime capabilities' });
  }
  const hasExternal = value.external_cache_artifact_id !== null || value.external_cache_artifact_checksum !== null;
  if (hasExternal && (value.external_cache_artifact_id === null || value.external_cache_artifact_checksum === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['external_cache_artifact_id'], message: 'external cache artifact id/checksum must be present together' });
  }
  if (value.cache_mode !== 'EXTERNAL_KV_CONNECTOR' && hasExternal) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['external_cache_artifact_id'], message: 'external cache artifact metadata is reserved for EXTERNAL_KV_CONNECTOR' });
  }
});
export type RuntimePrefillBindingV1 = z.infer<typeof runtimePrefillBindingSchema>;

export const runtimePrefillReuseReceiptSchema = z.object({
  schema: z.literal('atlas.runtime-prefill-reuse-receipt.v1').default('atlas.runtime-prefill-reuse-receipt.v1'),
  request_id: id,
  binding_id: id,
  runtime: z.enum(ATLAS_INFERENCE_RUNTIMES),
  runtime_revision: revision,
  prefill_identity_checksum: checksum,
  cache_mode: z.enum(PREFILL_RUNTIME_CACHE_MODES),
  reused: z.boolean(),
  matched_prefix_tokens: z.number().int().nonnegative().nullable().default(null),
  evaluated_prompt_tokens: z.number().int().nonnegative().nullable().default(null),
  reused_kv_blocks: z.number().int().nonnegative().nullable().default(null),
  total_kv_blocks: z.number().int().nonnegative().nullable().default(null),
  host_offload_bytes: z.number().int().nonnegative().nullable().default(null),
  kv_transfer_bytes: z.number().int().nonnegative().nullable().default(null),
  kv_transfer_ms: z.number().finite().nonnegative().nullable().default(null),
  time_to_first_token_ms: z.number().finite().nonnegative().nullable().default(null),
  runtime_metrics_checksum: checksum.nullable().default(null),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.reused && value.cache_mode === 'NONE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reused'], message: 'cache_mode=NONE cannot claim runtime reuse' });
  }
  if ((value.reused_kv_blocks === null) !== (value.total_kv_blocks === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reused_kv_blocks'], message: 'reused/total KV block metrics must be present together' });
  }
  if (value.reused_kv_blocks !== null && value.total_kv_blocks !== null && value.reused_kv_blocks > value.total_kv_blocks) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reused_kv_blocks'], message: 'reused KV blocks cannot exceed total KV blocks' });
  }
  if ((value.kv_transfer_bytes === null) !== (value.kv_transfer_ms === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kv_transfer_bytes'], message: 'KV transfer bytes/time must be recorded together' });
  }
});
export type RuntimePrefillReuseReceiptV1 = z.infer<typeof runtimePrefillReuseReceiptSchema>;

export const trtllmRuntimePolicySchema = z.object({
  schema: z.literal('atlas.trtllm-runtime-policy.v1').default('atlas.trtllm-runtime-policy.v1'),
  policy_revision: revision,
  runtime: z.enum(['TRTLLM_PYTORCH', 'TRITON_TRTLLM']),
  enable_block_reuse: z.boolean().default(true),
  enable_partial_reuse: z.boolean().default(true),
  cache_salt_required: z.boolean().default(true),
  kv_cache_free_gpu_mem_fraction: z.number().finite().min(0).max(1).nullable().default(null),
  max_tokens_in_paged_kv_cache: z.number().int().positive().nullable().default(null),
  kv_cache_host_memory_bytes: z.number().int().nonnegative().default(0),
  enable_chunked_context: z.boolean().default(false),
  enable_inflight_batching: z.boolean().default(true),
  scheduler_policy: z.enum(['MAX_UTILIZATION', 'GUARANTEED_NO_EVICT']).default('GUARANTEED_NO_EVICT'),
  lora_cache_gpu_memory_fraction: z.number().finite().min(0).max(1).nullable().default(null),
  lora_cache_host_memory_bytes: z.number().int().nonnegative().nullable().default(null),
  disaggregated_prefill_decode: z.boolean().default(false),
  kv_connector_backend: z.enum(['NONE', 'UCX', 'NIXL', 'MPI', 'CUSTOM']).default('NONE'),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.disaggregated_prefill_decode && value.kv_connector_backend === 'NONE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kv_connector_backend'], message: 'disaggregated prefill/decode requires a KV connector backend' });
  }
});
export type TrtllmRuntimePolicyV1 = z.infer<typeof trtllmRuntimePolicySchema>;

export function describeInferencePrefillRuntime(): string {
  return [
    'Atlas compiled-prefill identity is backend-neutral and remains above every model runtime cache.',
    'llama.cpp prefix reuse, TensorRT-LLM paged KV block reuse, Triton in-flight scheduling, external KV connectors and future PyTorch compilation caches are runtime accelerators, never canonical evidence identities.',
    'TensorRT-LLM and Triton bindings record model, adapter, tokenizer, chat-template and runtime revisions before cache reuse is admissible.',
    'Disaggregated prefill/decode is modeled as KV transfer between runtime executors, not as a new logical prefill identity.',
  ].join(' ');
}
