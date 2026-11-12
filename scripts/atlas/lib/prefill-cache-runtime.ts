import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  prefillCacheKey,
  prefillSynthesisCacheEntrySchema,
  type PrefillSynthesisCacheEntryV1,
} from './contextual-prefill-fabric.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const PREFILL_CACHE_LOOKUP_STATUSES = [
  'HIT',
  'MISS',
  'STALE',
  'CORRUPT',
  'REVOKED',
] as const;

export const PREFILL_CACHE_TIERS = [
  'ATLAS_COMPILED_PREFILL',
  'LLAMA_RUNTIME_PREFIX',
  'LLAMA_SLOT_FILE',
] as const;

export const prefillRuntimeIdentitySchema = z.object({
  schema: z.literal('atlas.prefill-runtime-identity.v1').default('atlas.prefill-runtime-identity.v1'),
  prefill_identity_checksum: checksum,
  instruction_set_checksum: checksum,
  hydration_manifest_checksum: checksum,
  feature_alignment_checksum: checksum,
  context_manifest_checksum: checksum,
  compiler_revision: revision,
  model_revision: revision,
  adapter_revision: revision.nullable().default(null),
  tokenizer_revision: revision,
  chat_template_revision: revision,
  inference_runtime_id: id,
  inference_runtime_revision: revision,
  cache_key: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const expected = prefillCacheKey({
    prefill_identity_checksum: value.prefill_identity_checksum,
    instruction_set_checksum: value.instruction_set_checksum,
    hydration_manifest_checksum: value.hydration_manifest_checksum,
    feature_alignment_checksum: value.feature_alignment_checksum,
    context_manifest_checksum: value.context_manifest_checksum,
    compiler_revision: value.compiler_revision,
  });
  if (expected !== value.cache_key) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cache_key'], message: 'cache_key must match the logical prefill dependency identity' });
  }
});
export type PrefillRuntimeIdentityV1 = z.infer<typeof prefillRuntimeIdentitySchema>;

export const valkeyPrefillCacheRecordSchema = z.object({
  schema: z.literal('atlas.valkey-prefill-cache-record.v1').default('atlas.valkey-prefill-cache-record.v1'),
  storage_key: z.string().regex(/^atlas:prefill:v1:[a-f0-9]{64}$/),
  identity: prefillRuntimeIdentitySchema,
  entry: prefillSynthesisCacheEntrySchema,
  ttl_seconds: z.number().int().positive().max(30 * 24 * 60 * 60),
  stored_value_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (!value.storage_key.endsWith(value.identity.cache_key)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['storage_key'], message: 'storage_key suffix must equal identity.cache_key' });
  }
  if (value.entry.cache_key !== value.identity.cache_key) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entry', 'cache_key'], message: 'cache entry and runtime identity must use the same cache_key' });
  }
  if (value.entry.prefill_identity_checksum !== value.identity.prefill_identity_checksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entry', 'prefill_identity_checksum'], message: 'entry prefill identity must match runtime identity' });
  }
  if (value.entry.instruction_set_checksum !== value.identity.instruction_set_checksum ||
      value.entry.hydration_manifest_checksum !== value.identity.hydration_manifest_checksum ||
      value.entry.feature_alignment_checksum !== value.identity.feature_alignment_checksum ||
      value.entry.context_manifest_checksum !== value.identity.context_manifest_checksum ||
      value.entry.compiler_revision !== value.identity.compiler_revision) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entry'], message: 'entry dependency checksums must match runtime identity' });
  }
});
export type ValkeyPrefillCacheRecordV1 = z.infer<typeof valkeyPrefillCacheRecordSchema>;

export const prefillCacheLookupReceiptSchema = z.object({
  schema: z.literal('atlas.prefill-cache-lookup-receipt.v1').default('atlas.prefill-cache-lookup-receipt.v1'),
  request_id: id,
  cache_key: checksum,
  storage_key: z.string().min(1),
  status: z.enum(PREFILL_CACHE_LOOKUP_STATUSES),
  lookup_tier: z.literal('ATLAS_COMPILED_PREFILL'),
  record_checksum: checksum.nullable().default(null),
  compiled_prefill_artifact_id: id.nullable().default(null),
  compiled_prefill_checksum: checksum.nullable().default(null),
  mismatch_fields: z.array(z.string().min(1)).default([]),
  lookup_duration_ms: z.number().finite().nonnegative().nullable().default(null),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'HIT') {
    if (!value.record_checksum || !value.compiled_prefill_artifact_id || !value.compiled_prefill_checksum || value.mismatch_fields.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'HIT requires an intact record/artifact and no mismatches' });
    }
  }
  if (['MISS', 'CORRUPT'].includes(value.status) && value.compiled_prefill_artifact_id !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['compiled_prefill_artifact_id'], message: `${value.status} cannot expose a reusable compiled artifact` });
  }
});
export type PrefillCacheLookupReceiptV1 = z.infer<typeof prefillCacheLookupReceiptSchema>;

export const prefillCacheStoreReceiptSchema = z.object({
  schema: z.literal('atlas.prefill-cache-store-receipt.v1').default('atlas.prefill-cache-store-receipt.v1'),
  request_id: id,
  cache_key: checksum,
  storage_key: z.string().min(1),
  store_mode: z.literal('SET_NX_EX'),
  ttl_seconds: z.number().int().positive(),
  status: z.enum(['STORED', 'ALREADY_EXISTS', 'FAILED']),
  stored_value_checksum: checksum,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type PrefillCacheStoreReceiptV1 = z.infer<typeof prefillCacheStoreReceiptSchema>;

export const llamaPromptCacheBindingSchema = z.object({
  schema: z.literal('atlas.llama-prompt-cache-binding.v1').default('atlas.llama-prompt-cache-binding.v1'),
  binding_id: id,
  binding_revision: revision,
  prefill_identity_checksum: checksum,
  inference_runtime_id: id,
  inference_runtime_revision: revision,
  model_revision: revision,
  adapter_revision: revision.nullable().default(null),
  tokenizer_revision: revision,
  chat_template_revision: revision,
  cache_prompt: z.literal(true).default(true),
  reuse_mode: z.enum(['RUNTIME_PREFIX_MATCH', 'EXPLICIT_SLOT', 'EXPLICIT_SLOT_FILE']),
  slot_id: z.number().int().nonnegative().nullable().default(null),
  slot_file_artifact_id: id.nullable().default(null),
  slot_file_checksum: checksum.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.reuse_mode === 'EXPLICIT_SLOT' && value.slot_id === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slot_id'], message: 'EXPLICIT_SLOT requires slot_id' });
  }
  if (value.reuse_mode === 'EXPLICIT_SLOT_FILE') {
    if (value.slot_id === null || value.slot_file_artifact_id === null || value.slot_file_checksum === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slot_file_artifact_id'], message: 'EXPLICIT_SLOT_FILE requires slot, file artifact and checksum' });
    }
  } else if (value.slot_file_artifact_id !== null || value.slot_file_checksum !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['slot_file_artifact_id'], message: 'slot-file metadata is only valid for EXPLICIT_SLOT_FILE' });
  }
});
export type LlamaPromptCacheBindingV1 = z.infer<typeof llamaPromptCacheBindingSchema>;

export const llamaPrefillReuseReceiptSchema = z.object({
  schema: z.literal('atlas.llama-prefill-reuse-receipt.v1').default('atlas.llama-prefill-reuse-receipt.v1'),
  request_id: id,
  binding_id: id,
  prefill_identity_checksum: checksum,
  cache_prompt_enabled: z.literal(true),
  cache_n: z.number().int().nonnegative(),
  prompt_n: z.number().int().nonnegative(),
  predicted_n: z.number().int().nonnegative().default(0),
  prompt_ms: z.number().finite().nonnegative().nullable().default(null),
  tokens_cached: z.number().int().nonnegative().nullable().default(null),
  tokens_evaluated: z.number().int().nonnegative().nullable().default(null),
  prompt_reuse_ratio: z.number().finite().min(0).max(1),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const denominator = value.cache_n + value.prompt_n;
  const expected = denominator === 0 ? 0 : value.cache_n / denominator;
  if (Math.abs(expected - value.prompt_reuse_ratio) > 1e-9) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['prompt_reuse_ratio'], message: 'prompt_reuse_ratio must equal cache_n/(cache_n+prompt_n)' });
  }
});
export type LlamaPrefillReuseReceiptV1 = z.infer<typeof llamaPrefillReuseReceiptSchema>;

export const prefillReuseMetricsReceiptSchema = z.object({
  schema: z.literal('atlas.prefill-reuse-metrics-receipt.v1').default('atlas.prefill-reuse-metrics-receipt.v1'),
  request_id: id,
  logical_prefill_cache_hit: z.boolean(),
  llama_prompt_cache_reused: z.boolean(),
  source_fragments_before: z.number().int().nonnegative(),
  source_fragments_after: z.number().int().nonnegative(),
  instruction_atoms_before: z.number().int().nonnegative(),
  instruction_atoms_after: z.number().int().nonnegative(),
  estimated_tokens_before: z.number().int().nonnegative(),
  estimated_tokens_after: z.number().int().nonnegative(),
  llama_cache_n: z.number().int().nonnegative().nullable().default(null),
  llama_prompt_n: z.number().int().nonnegative().nullable().default(null),
  recomputation_avoided: z.array(z.enum([
    'RETRIEVAL',
    'HYDRATION',
    'INSTRUCTION_COMPILE',
    'PREFILL_TEXT_COMPILE',
    'LLAMA_PROMPT_EVAL',
  ])).default([]),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.source_fragments_after > value.source_fragments_before) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source_fragments_after'], message: 'dedup cannot increase source fragment count' });
  }
  if (value.instruction_atoms_after > value.instruction_atoms_before) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['instruction_atoms_after'], message: 'instruction compile cannot increase atom count in this receipt' });
  }
  if (value.estimated_tokens_after > value.estimated_tokens_before) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['estimated_tokens_after'], message: 'dedup cache metrics cannot claim negative token savings' });
  }
});
export type PrefillReuseMetricsReceiptV1 = z.infer<typeof prefillReuseMetricsReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function prefillRuntimeChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function buildPrefillRuntimeIdentity(input: Omit<z.input<typeof prefillRuntimeIdentitySchema>, 'schema' | 'cache_key' | 'canonical_authority'>): PrefillRuntimeIdentityV1 {
  const cache_key = prefillCacheKey({
    prefill_identity_checksum: input.prefill_identity_checksum,
    instruction_set_checksum: input.instruction_set_checksum,
    hydration_manifest_checksum: input.hydration_manifest_checksum,
    feature_alignment_checksum: input.feature_alignment_checksum,
    context_manifest_checksum: input.context_manifest_checksum,
    compiler_revision: input.compiler_revision,
  });
  return prefillRuntimeIdentitySchema.parse({
    schema: 'atlas.prefill-runtime-identity.v1',
    ...input,
    cache_key,
    canonical_authority: false,
  });
}

export function prefillValkeyStorageKey(cacheKey: string): string {
  if (!/^[a-f0-9]{64}$/.test(cacheKey)) throw new Error('PREFILL_CACHE_KEY_INVALID');
  return `atlas:prefill:v1:${cacheKey}`;
}

export function buildValkeyPrefillCacheRecord(input: {
  identity: PrefillRuntimeIdentityV1;
  entry: PrefillSynthesisCacheEntryV1;
  ttl_seconds: number;
}): ValkeyPrefillCacheRecordV1 {
  const storage_key = prefillValkeyStorageKey(input.identity.cache_key);
  const logical = {
    schema: 'atlas.valkey-prefill-cache-record.v1' as const,
    storage_key,
    identity: input.identity,
    entry: input.entry,
    ttl_seconds: input.ttl_seconds,
    canonical_authority: false as const,
  };
  return valkeyPrefillCacheRecordSchema.parse({
    ...logical,
    stored_value_checksum: prefillRuntimeChecksum(logical),
  });
}

export function verifyPrefillRecord(record: ValkeyPrefillCacheRecordV1, expected: PrefillRuntimeIdentityV1): { reusable: boolean; status: z.infer<typeof prefillCacheLookupReceiptSchema>['status']; mismatches: string[] } {
  const mismatches: string[] = [];
  const fields: Array<keyof PrefillRuntimeIdentityV1> = [
    'prefill_identity_checksum',
    'instruction_set_checksum',
    'hydration_manifest_checksum',
    'feature_alignment_checksum',
    'context_manifest_checksum',
    'compiler_revision',
    'model_revision',
    'adapter_revision',
    'tokenizer_revision',
    'chat_template_revision',
    'inference_runtime_id',
    'inference_runtime_revision',
    'cache_key',
  ];
  for (const field of fields) if (record.identity[field] !== expected[field]) mismatches.push(String(field));
  if (record.entry.status === 'REVOKED') return { reusable: false, status: 'REVOKED', mismatches };
  if (record.entry.status === 'STALE' || mismatches.length > 0) return { reusable: false, status: 'STALE', mismatches };
  const logical = {
    schema: record.schema,
    storage_key: record.storage_key,
    identity: record.identity,
    entry: record.entry,
    ttl_seconds: record.ttl_seconds,
    canonical_authority: record.canonical_authority,
  };
  if (prefillRuntimeChecksum(logical) !== record.stored_value_checksum) {
    return { reusable: false, status: 'CORRUPT', mismatches: [...mismatches, 'stored_value_checksum'] };
  }
  return { reusable: true, status: 'HIT', mismatches: [] };
}

export function buildLlamaPrefillReuseReceipt(input: Omit<z.input<typeof llamaPrefillReuseReceiptSchema>, 'schema' | 'prompt_reuse_ratio' | 'canonical_authority'>): LlamaPrefillReuseReceiptV1 {
  const denominator = input.cache_n + input.prompt_n;
  return llamaPrefillReuseReceiptSchema.parse({
    schema: 'atlas.llama-prefill-reuse-receipt.v1',
    ...input,
    prompt_reuse_ratio: denominator === 0 ? 0 : input.cache_n / denominator,
    canonical_authority: false,
  });
}

export function describePrefillCacheRuntime(): string {
  return [
    'Valkey stores Atlas logical compiled-prefill metadata and artifact pointers keyed by immutable dependency identity; it does not store or own model KV state.',
    'llama-server prompt/KV reuse is a separate runtime optimization bound to model, adapter, tokenizer, chat-template and runtime revisions.',
    'A logical cache hit is reusable only after record checksum and every dependency identity match; source hydration or feature changes therefore fail closed into a cache miss/stale path.',
    'SET NX + TTL prevents concurrent writers from repeatedly replacing an identical immutable cache record while allowing bounded eviction.',
    'Runtime receipts record prompt tokens reused/evaluated so do-not-repeat-yourself is measured as actual avoided compilation/evaluation, not merely shorter prose.',
  ].join(' ');
}
