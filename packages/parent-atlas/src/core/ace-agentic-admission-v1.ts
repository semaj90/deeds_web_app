import { z } from 'zod';
import { sha256HexV1 } from './knowledge/stable-json-v1.js';

/**
 * Agentic admission primitives. Selection is not execution:
 *   candidate patch != selected patch != authorized edit != validated fix.
 * Pure functions only (no I/O); callers supply revisions and hashes they actually observed.
 */

// ── Patch ranking (multi-signal; cosine is one signal, never the winner) ─────────────────────────────

export const PATCH_SIGNAL_WEIGHTS_V1 = Object.freeze({
  cosine: 0.2, diagnostic: 0.2, symbol: 0.15, graph_ppr: 0.15, co_change: 0.1, test_relevance: 0.1, authority: 0.1,
} as const);
export const PATCH_PENALTY_WEIGHTS_V1 = Object.freeze({ risk: 0.3, stale_lineage: 0.5, generated_vendor: 0.4 } as const);
/** A candidate supported only by cosine similarity cannot score above this. */
export const COSINE_ONLY_CAP_V1 = 0.3;

const unit = z.number().min(0).max(1);
export const patchCandidateInputV1Schema = z.object({
  source_ref: z.string().min(1),
  source_revision: z.string().min(1).nullable(),
  signals: z.object({
    cosine: unit.nullable(), diagnostic: unit.nullable(), symbol: unit.nullable(), graph_ppr: unit.nullable(),
    co_change: unit.nullable(), test_relevance: unit.nullable(), authority: unit.nullable(),
  }).strict(),
  penalties: z.object({ risk: unit, stale_lineage: unit, generated_vendor: unit }).strict(),
  evidence_refs: z.array(z.string().min(1)),
  required_tests: z.array(z.string().min(1)),
}).strict();
export type PatchCandidateInputV1 = z.infer<typeof patchCandidateInputV1Schema>;

export interface PatchCandidateScoreV1 {
  source_ref: string;
  source_revision: string | null;
  score: number;
  contributions: Record<string, number>;
  missing_signals: string[];
  penalties_applied: Record<string, number>;
  cosine_only_capped: boolean;
  eligibility: 'ELIGIBLE' | 'BLOCKED_UNQUALIFIED_REVISION' | 'BLOCKED_STALE_LINEAGE';
  evidence_refs: string[];
  required_tests: string[];
}

export function scorePatchCandidateV1(input: unknown): PatchCandidateScoreV1 {
  const c = patchCandidateInputV1Schema.parse(input);
  const contributions: Record<string, number> = {}; const missing: string[] = [];
  let positive = 0; let observedNonCosine = 0;
  for (const [name, weight] of Object.entries(PATCH_SIGNAL_WEIGHTS_V1)) {
    const v = (c.signals as Record<string, number | null>)[name];
    if (v === null) { missing.push(name); continue; }
    contributions[name] = Number((v * weight).toFixed(6)); positive += v * weight;
    if (name !== 'cosine' && v > 0) observedNonCosine += 1;
  }
  const penalties: Record<string, number> = {}; let penalty = 0;
  for (const [name, weight] of Object.entries(PATCH_PENALTY_WEIGHTS_V1)) {
    const p = (c.penalties as Record<string, number>)[name]; penalties[name] = Number((p * weight).toFixed(6)); penalty += p * weight;
  }
  let score = Math.max(0, Math.min(1, positive - penalty));
  const capped = observedNonCosine === 0 && score > COSINE_ONLY_CAP_V1;
  if (capped) score = COSINE_ONLY_CAP_V1;
  const eligibility = c.source_revision === null ? 'BLOCKED_UNQUALIFIED_REVISION' : c.penalties.stale_lineage >= 1 ? 'BLOCKED_STALE_LINEAGE' : 'ELIGIBLE';
  return { source_ref: c.source_ref, source_revision: c.source_revision, score: Number(score.toFixed(6)), contributions, missing_signals: missing, penalties_applied: penalties, cosine_only_capped: capped, eligibility, evidence_refs: c.evidence_refs, required_tests: c.required_tests };
}

/** Deterministic: eligible first, then score desc, then source_ref. Ranking never selects; it proposes. */
export function rankPatchCandidatesV1(inputs: unknown[]): PatchCandidateScoreV1[] {
  return inputs.map(scorePatchCandidateV1).sort((a, b) =>
    Number(b.eligibility === 'ELIGIBLE') - Number(a.eligibility === 'ELIGIBLE') || b.score - a.score || (a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0));
}

// ── Tool proposal admission (registry -> schema -> policy -> revision) ──────────────────────────────

export const toolRegistryEntryV1Schema = z.object({ name: z.string().min(1), access: z.enum(['READ', 'WRITE']), schema_id: z.string().min(1) }).strict();
export type ToolRegistryEntryV1 = z.infer<typeof toolRegistryEntryV1Schema>;

export function buildToolRegistryChecksumV1(entries: ToolRegistryEntryV1[]): string {
  return `sha256:${sha256HexV1([...entries].map((e) => toolRegistryEntryV1Schema.parse(e)).sort((a, b) => (a.name < b.name ? -1 : 1)))}`;
}

export const toolProposalV1Schema = z.object({
  tool_name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  reason: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  /** required for WRITE tools: the source revision the proposal was planned against */
  planned_source_revision: z.string().min(1).nullable().optional(),
}).strict();

export type ToolAdmissionStageV1 = 'REGISTRY' | 'SCHEMA' | 'POLICY' | 'REVISION' | 'ADMITTED';
export interface ToolAdmissionResultV1 {
  admitted: boolean; stage: ToolAdmissionStageV1; code: string;
  tool_name: string; access: 'READ' | 'WRITE' | null; arguments_checksum: string | null; registry_checksum: string;
}

export function admitToolProposalV1(input: {
  proposal: unknown;
  registry: { revision: string; checksum: string; entries: ToolRegistryEntryV1[] };
  argument_validators: Record<string, z.ZodTypeAny>;
  policy: { allow_write: boolean; allowed_tools?: string[] };
  /** revision observed NOW by the caller (re-read); only consulted for WRITE tools */
  current_source_revision?: string | null;
}): ToolAdmissionResultV1 {
  const proposal = toolProposalV1Schema.parse(input.proposal);
  const registryChecksum = buildToolRegistryChecksumV1(input.registry.entries);
  const base = { tool_name: proposal.tool_name, registry_checksum: registryChecksum };
  const fail = (stage: ToolAdmissionStageV1, code: string, access: 'READ' | 'WRITE' | null = null, args: string | null = null): ToolAdmissionResultV1 => ({ ...base, admitted: false, stage, code, access, arguments_checksum: args });
  if (registryChecksum !== input.registry.checksum) return fail('REGISTRY', 'REGISTRY_CHECKSUM_MISMATCH');
  const entry = input.registry.entries.find((e) => e.name === proposal.tool_name);
  if (!entry) return fail('REGISTRY', 'TOOL_NOT_IN_REGISTRY');
  const validator = input.argument_validators[entry.schema_id];
  if (!validator) return fail('SCHEMA', 'NO_VALIDATOR_FOR_SCHEMA_ID', entry.access);
  const parsed = validator.safeParse(proposal.arguments);
  if (!parsed.success) return fail('SCHEMA', 'ARGUMENTS_INVALID', entry.access);
  const argsChecksum = `sha256:${sha256HexV1(parsed.data)}`;
  if (input.policy.allowed_tools && !input.policy.allowed_tools.includes(entry.name)) return fail('POLICY', 'TOOL_NOT_ALLOWED', entry.access, argsChecksum);
  if (entry.access === 'WRITE' && !input.policy.allow_write) return fail('POLICY', 'WRITE_NOT_ALLOWED', entry.access, argsChecksum);
  if (entry.access === 'WRITE') {
    if (!proposal.planned_source_revision) return fail('REVISION', 'PLANNED_REVISION_MISSING', entry.access, argsChecksum);
    if (!input.current_source_revision) return fail('REVISION', 'CURRENT_REVISION_UNKNOWN', entry.access, argsChecksum);
    if (proposal.planned_source_revision !== input.current_source_revision) return fail('REVISION', 'PATCH_STALE', entry.access, argsChecksum);
  }
  return { ...base, admitted: true, stage: 'ADMITTED', code: 'ADMITTED', access: entry.access, arguments_checksum: argsChecksum };
}

// ── Execution receipt (no claim without tool evidence) ─────────────────────────────────────────────

export const executionReceiptV1Schema = z.object({
  schema: z.literal('atlas.execution-receipt.v1').default('atlas.execution-receipt.v1'),
  tool_name: z.string().min(1),
  access: z.enum(['READ', 'WRITE']),
  arguments_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  registry_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  outcome: z.enum(['SUCCESS', 'FAILED']),
  before_hash: z.string().min(1).nullable(),
  after_hash: z.string().min(1).nullable(),
  diff_ref: z.string().min(1).nullable(),
  validation_result_ids: z.array(z.string().min(1)),
  failure_code: z.string().min(1).nullable(),
}).strict().superRefine((v, ctx) => {
  const add = (message: string, path: string[]) => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  if (v.outcome === 'FAILED' && !v.failure_code) add('a FAILED receipt needs failure_code', ['failure_code']);
  if (v.outcome === 'SUCCESS' && v.access === 'WRITE') {
    if (!v.before_hash || !v.after_hash || v.before_hash === v.after_hash) add('a successful WRITE must show before_hash != after_hash', ['after_hash']);
    if (!v.diff_ref) add('a successful WRITE needs a diff_ref', ['diff_ref']);
    if (v.validation_result_ids.length === 0) add('a successful WRITE is not a validated fix without validation_result_ids', ['validation_result_ids']);
  }
});
export type ExecutionReceiptV1 = z.infer<typeof executionReceiptV1Schema>;
export function buildExecutionReceiptV1(input: z.input<typeof executionReceiptV1Schema>): ExecutionReceiptV1 {
  return executionReceiptV1Schema.parse({ schema: 'atlas.execution-receipt.v1', ...input });
}
