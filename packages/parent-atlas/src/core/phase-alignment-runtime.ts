import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  buildValkeyPrefillCacheRecord,
  type PrefillRuntimeIdentityV1,
} from './prefill-cache-runtime.js';
import { buildPrefillCacheEntry } from './contextual-prefill-fabric.js';
import type { ValkeyAdapter } from '../adapters/valkey.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);

export const phaseAlignmentStateSchema = z.enum([
  'UNKNOWN',
  'SEARCH_CODE',
  'SEARCH_GRAPH',
  'SEARCH_SEMANTIC',
  'VALIDATE_PACKET',
  'SYNTHESIZE',
  'QUARANTINE',
]);
export type PhaseAlignmentState = z.infer<typeof phaseAlignmentStateSchema>;

export const phaseAlignmentActionSchema = z.enum([
  'BLOCK',
  'RETRIEVE',
  'EXPAND_GRAPH',
  'VALIDATE',
  'PREFILL',
  'DECODE',
]);
export type PhaseAlignmentAction = z.infer<typeof phaseAlignmentActionSchema>;

export const phaseAlignmentInputSchema = z.object({
  schema: z.literal('atlas.phase-alignment-input.v1').default('atlas.phase-alignment-input.v1'),
  request_id: z.string().min(1),
  workspace_revision: revision,
  source_revision: revision,
  graph_revision: revision,
  representation_revision: revision,
  hmm_model_revision: revision,
  hmm_observation_checksum: checksum,
  state_path: z.array(phaseAlignmentStateSchema).min(1),
  selected_tool: z.string().min(1),
  tool_schema_revision: revision,
  context_manifest_checksum: checksum,
  exact_evidence_promoted: z.boolean(),
  prefill_identity_checksum: checksum.nullable().default(null),
  prefill_cache_status: z.enum(['NONE', 'MISS', 'HIT', 'COMPILED', 'STALE', 'CORRUPT']).default('NONE'),
  decoder_runtime_revision: revision.nullable().default(null),
  encoder_model_revision: revision.nullable().default(null),
  encoder_input_checksum: checksum.nullable().default(null),
  producer_revision: revision,
}).strict();
export type PhaseAlignmentInputV1 = z.infer<typeof phaseAlignmentInputSchema>;

export const phaseAlignmentDecisionSchema = z.object({
  schema: z.literal('atlas.phase-alignment-decision.v1'),
  request_id: z.string().min(1),
  state: phaseAlignmentStateSchema,
  action: phaseAlignmentActionSchema,
  selected_tool: z.string().min(1).nullable(),
  prefill_required: z.boolean(),
  decode_admitted: z.boolean(),
  encoder_training_admitted: z.literal(false),
  block_reasons: z.array(z.string().min(1)),
  input_checksum: checksum,
  producer_revision: revision,
  canonical_authority: z.literal(false),
}).strict();
export type PhaseAlignmentDecisionV1 = z.infer<typeof phaseAlignmentDecisionSchema>;

export const phaseAlignmentReceiptSchema = z.object({
  schema: z.literal('atlas.phase-alignment-receipt.v1'),
  request_id: z.string().min(1),
  decision: phaseAlignmentDecisionSchema,
  dag_edge_id: z.string().min(1).nullable(),
  prefill_identity_checksum: checksum.nullable(),
  decoder_runtime_revision: revision.nullable(),
  encoder_model_revision: revision.nullable(),
  encoder_input_checksum: checksum.nullable(),
  training_example_admitted: z.literal(false),
  evidence_refs: z.array(z.string().min(1)),
  receipt_checksum: checksum,
  canonical_authority: z.literal(false),
}).strict();
export type PhaseAlignmentReceiptV1 = z.infer<typeof phaseAlignmentReceiptSchema>;

export type PhaseAlignmentRuntimeResultV1 = {
  receipt: PhaseAlignmentReceiptV1;
  outcome: 'BLOCKED' | 'PREFILLED' | 'DECODED' | 'TOOL_EXECUTED';
  tool_result?: unknown;
  decode_result?: unknown;
  compile_count: number;
  decode_count: number;
};

export type PhaseAlignmentRuntimeDeps = {
  compile_prefill?: (input: PhaseAlignmentInputV1) => Promise<{
    prefill_identity_checksum: string;
    decoder_runtime_revision?: string | null;
  }>;
  decode?: (input: PhaseAlignmentInputV1) => Promise<unknown>;
  execute_tool?: (tool: string, input: PhaseAlignmentInputV1) => Promise<unknown>;
};

export type ValkeyPrefillCompiler = (input: PhaseAlignmentInputV1) => Promise<{
  compiled_prefill_artifact_id: string;
  compiled_prefill_checksum: string;
}>;

/**
 * Binds the phase runner to the existing Valkey metadata owner. The adapter
 * stores only a revisioned artifact pointer/checksum, never KV tensors.
 */
export function buildValkeyPhaseDeps(input: {
  adapter: Pick<ValkeyAdapter, 'getPrefillRecord' | 'setPrefillRecordNx'>;
  identity: PrefillRuntimeIdentityV1;
  compile: ValkeyPrefillCompiler;
  decoder_runtime_revision?: string | null;
}): PhaseAlignmentRuntimeDeps {
  return {
    compile_prefill: async (phaseInput) => {
      if (phaseInput.prefill_identity_checksum !== input.identity.prefill_identity_checksum) {
        throw new Error('PREFILL_IDENTITY_MISMATCH');
      }
      const existing = await input.adapter.getPrefillRecord(input.identity);
      if (existing.status === 'HIT') {
        return {
          prefill_identity_checksum: input.identity.prefill_identity_checksum,
          decoder_runtime_revision: input.decoder_runtime_revision ?? phaseInput.decoder_runtime_revision,
        };
      }
      const artifact = await input.compile(phaseInput);
      const entry = buildPrefillCacheEntry({
        prefill_identity_checksum: input.identity.prefill_identity_checksum,
        instruction_set_checksum: input.identity.instruction_set_checksum,
        hydration_manifest_checksum: input.identity.hydration_manifest_checksum,
        feature_alignment_checksum: input.identity.feature_alignment_checksum,
        context_manifest_checksum: input.identity.context_manifest_checksum,
        compiler_revision: input.identity.compiler_revision,
        compiled_prefill_artifact_id: artifact.compiled_prefill_artifact_id,
        compiled_prefill_checksum: artifact.compiled_prefill_checksum,
        status: 'VALID',
      });
      const record = buildValkeyPrefillCacheRecord({ identity: input.identity, entry, ttl_seconds: 3600 });
      await input.adapter.setPrefillRecordNx(record);
      const readback = await input.adapter.getPrefillRecord(input.identity);
      if (readback.status !== 'HIT' || !readback.record) throw new Error(`PREFILL_READBACK_${readback.status}`);
      return {
        prefill_identity_checksum: input.identity.prefill_identity_checksum,
        decoder_runtime_revision: input.decoder_runtime_revision ?? phaseInput.decoder_runtime_revision,
      };
    },
  };
}

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

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function buildPhaseAlignmentReceipt(input: PhaseAlignmentInputV1): PhaseAlignmentReceiptV1 {
  const parsed = phaseAlignmentInputSchema.parse(input);
  const state = parsed.state_path[parsed.state_path.length - 1] ?? 'UNKNOWN';
  const block_reasons: string[] = [];
  const isQuarantined = state === 'QUARANTINE' || parsed.state_path.includes('QUARANTINE');
  const prefill_required = parsed.exact_evidence_promoted && parsed.context_manifest_checksum.length > 0;
  let action: PhaseAlignmentAction = 'RETRIEVE';
  if (isQuarantined) {
    action = 'BLOCK';
    block_reasons.push('HMM_QUARANTINE');
  } else if (!parsed.exact_evidence_promoted) {
    action = 'VALIDATE';
    block_reasons.push('EXACT_EVIDENCE_NOT_PROMOTED');
  } else if (parsed.prefill_cache_status === 'NONE' || parsed.prefill_cache_status === 'MISS' || parsed.prefill_cache_status === 'STALE' || parsed.prefill_cache_status === 'CORRUPT') {
    action = 'PREFILL';
    block_reasons.push('PREFILL_NOT_REUSABLE');
  } else if (parsed.decoder_runtime_revision) {
    action = 'DECODE';
  }
  if (prefill_required && !parsed.prefill_identity_checksum) block_reasons.push('PREFILL_IDENTITY_MISSING');
  if (action === 'DECODE' && !parsed.prefill_identity_checksum) {
    action = 'PREFILL';
    block_reasons.push('DECODE_REQUIRES_PREFILL_IDENTITY');
  }
  const decision = phaseAlignmentDecisionSchema.parse({
    schema: 'atlas.phase-alignment-decision.v1',
    request_id: parsed.request_id,
    state,
    action,
    selected_tool: action === 'BLOCK' ? null : parsed.selected_tool,
    prefill_required,
    decode_admitted: action === 'DECODE' && block_reasons.length === 0,
    encoder_training_admitted: false,
    block_reasons: [...new Set(block_reasons)],
    input_checksum: sha256(parsed),
    producer_revision: parsed.producer_revision,
    canonical_authority: false,
  });
  const body = {
    schema: 'atlas.phase-alignment-receipt.v1' as const,
    request_id: parsed.request_id,
    decision,
    dag_edge_id: action === 'BLOCK' ? null : `dag:${parsed.selected_tool}:${action.toLowerCase()}`,
    prefill_identity_checksum: parsed.prefill_identity_checksum,
    decoder_runtime_revision: parsed.decoder_runtime_revision,
    encoder_model_revision: parsed.encoder_model_revision,
    encoder_input_checksum: parsed.encoder_input_checksum,
    training_example_admitted: false as const,
    evidence_refs: [
      `workspace:${parsed.workspace_revision}`,
      `source:${parsed.source_revision}`,
      `graph:${parsed.graph_revision}`,
      `representation:${parsed.representation_revision}`,
      `hmm:${parsed.hmm_model_revision}`,
      `tool-schema:${parsed.tool_schema_revision}`,
      `context:${parsed.context_manifest_checksum}`,
    ],
    canonical_authority: false as const,
  };
  return phaseAlignmentReceiptSchema.parse({ ...body, receipt_checksum: sha256(body) });
}

/**
 * Bounded phase runner. Side effects are supplied by adapters; this function
 * owns ordering and re-checks the immutable phase gate after prefill compile.
 * It never persists cache records, KV tensors, model outputs, or training data.
 */
export async function runPhaseAlignedExecution(
  input: PhaseAlignmentInputV1,
  deps: PhaseAlignmentRuntimeDeps,
): Promise<PhaseAlignmentRuntimeResultV1> {
  let current = phaseAlignmentInputSchema.parse(input);
  let receipt = buildPhaseAlignmentReceipt(current);
  let compile_count = 0;
  let decode_count = 0;

  if (receipt.decision.action === 'BLOCK' || receipt.decision.action === 'VALIDATE') {
    return { receipt, outcome: 'BLOCKED', compile_count, decode_count };
  }

  if (receipt.decision.action === 'PREFILL') {
    if (!deps.compile_prefill) return { receipt, outcome: 'BLOCKED', compile_count, decode_count };
    const compiled = await deps.compile_prefill(current);
    compile_count += 1;
    current = phaseAlignmentInputSchema.parse({
      ...current,
      prefill_identity_checksum: compiled.prefill_identity_checksum,
      prefill_cache_status: 'COMPILED',
      decoder_runtime_revision: compiled.decoder_runtime_revision ?? current.decoder_runtime_revision,
    });
    receipt = buildPhaseAlignmentReceipt(current);
  }

  if (receipt.decision.action === 'DECODE') {
    if (!deps.decode) return { receipt, outcome: 'BLOCKED', compile_count, decode_count };
    const decode_result = await deps.decode(current);
    decode_count += 1;
    return { receipt, outcome: 'DECODED', decode_result, compile_count, decode_count };
  }

  if (['RETRIEVE', 'EXPAND_GRAPH', 'VALIDATE'].includes(receipt.decision.action) && deps.execute_tool) {
    const tool_result = await deps.execute_tool(current.selected_tool, current);
    return { receipt, outcome: 'TOOL_EXECUTED', tool_result, compile_count, decode_count };
  }

  return { receipt, outcome: 'PREFILLED', compile_count, decode_count };
}
