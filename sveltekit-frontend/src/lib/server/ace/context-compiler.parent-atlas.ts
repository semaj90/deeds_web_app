/**
 * Parent Atlas Context Compiler
 *
 * Boundary enforced here:
 *   retrieval candidates -> optional Bitfrost/Redis warming -> context selection -> llama-server
 *
 * Bitfrost is a hot candidate cache, NOT another context window.
 * llama-server KV/prompt cache is ephemeral execution acceleration, NOT canonical memory.
 * QLoRA is an offline learning lane, NOT live memory swapping.
 */

import { createHash } from 'node:crypto';

export type ContextLane = 'exact' | 'lexical' | 'dense' | 'graph' | 'bitfrost';

export const CONTEXT_COMPILER_SPEC_REFS = [
  'openspec:parent-atlas-agentic-completion#requirement:canonical-authority',
  'openspec:parent-atlas-agentic-completion#requirement:layered-retrieval',
  'openspec:parent-atlas-agentic-completion#requirement:query-aware-warming',
  'openspec:parent-atlas-agentic-completion#requirement:context-is-compiled',
  'openspec:parent-atlas-agentic-completion#requirement:kv-cache-is-ephemeral',
  'openspec:parent-atlas-agentic-completion#requirement:offline-learning',
] as const;

export interface ContextCandidate {
  packet_key: string;
  feature_id?: string;
  process_id?: string;
  source_ref?: string;
  content: string;

  /** All discovery lanes that produced this logical packet. */
  lanes: ContextLane[];

  /** 0..1 retrieval similarity / lexical relevance. */
  relevance: number;
  /** 0..1 source / graph authority. */
  authority?: number;
  /** 0..1 freshness / revision relevance. */
  freshness?: number;
  /** Graph hops from the active source/feature. Lower is better. */
  graph_distance?: number;

  /** Candidate is present in Bitfrost/Redis hot storage. This alone MUST NOT select it. */
  warmed?: boolean;
  /** This request actually obtained it from the hot cache. */
  cache_hit?: boolean;

  /** Exact diagnostics / active symbol evidence can be made mandatory. */
  required?: boolean;

  /** Prefer producer-provided tokenizer count; otherwise estimator is used. */
  token_count?: number;
}

export interface ContextSelectionPolicy {
  version: string;
  token_budget: number;

  /** Reserve budget for instructions, tool schema, and generation overhead. */
  reserved_tokens?: number;

  min_score?: number;
  max_packets?: number;
  max_packet_tokens?: number;

  weights?: {
    relevance?: number;
    authority?: number;
    freshness?: number;
    graph_proximity?: number;
  };
}

export interface ContextManifest {
  manifest_id: string;
  request_id: string;
  feature_id?: string;
  source_refs: string[];
  selected_process_ids?: string[];

  retrieved_candidates: number;
  warmed_candidates: number;
  cache_hits: number;

  selected_packet_keys: string[];
  rejected_packet_keys: string[];

  token_budget: number;
  reserved_tokens: number;
  usable_token_budget: number;
  selected_tokens: number;
  rejected_tokens: number;

  selection_policy_version: string;
  spec_refs: string[];

  /** Candidate discovery counts; multi-lane packets may count in >1 lane. */
  lanes: Record<ContextLane, number>;
  /** Selected candidate counts by lane; also intentionally multi-lane. */
  selected_by_lane: Record<ContextLane, number>;

  /** Warming effectiveness without confusing cache residence with prompt admission. */
  warming: {
    warmed_candidates: number;
    warmed_selected: number;
    warmed_rejected: number;
    cache_hits: number;
    cache_hit_selected: number;
    selection_rate: number;
    cache_hit_selection_rate: number;
    avoided_prompt_tokens: number;
  };

  created_at: string;
}

export interface CompiledContext {
  manifest: ContextManifest;
  selected: ScoredContextCandidate[];
  rejected: ScoredContextCandidate[];
  /** Deterministic payload to give the model in this exact order. */
  prompt_packets: Array<{
    packet_key: string;
    feature_id?: string;
    source_ref?: string;
    content: string;
    token_count: number;
  }>;
}

export interface ScoredContextCandidate extends ContextCandidate {
  score: number;
  token_count: number;
  selection_reason?: 'required' | 'ranked';
  rejection_reason?:
    | 'duplicate'
    | 'empty'
    | 'below_min_score'
    | 'packet_too_large'
    | 'packet_limit'
    | 'token_budget';
}

export interface ContextCompileInput {
  request_id: string;
  feature_id?: string;
  source_refs?: string[];
  candidates: ContextCandidate[];
  policy: ContextSelectionPolicy;
  now?: Date;
}

export interface ContextManifestPersistence {
  persist(manifest: ContextManifest): Promise<void>;
}

export interface RepairOutcomeObservation {
  request_id: string;
  manifest_id: string;
  success: boolean;
  attempts: number;
  retrieval_latency_ms?: number;
  context_compile_latency_ms?: number;
  first_token_latency_ms?: number;
  total_runtime_ms?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  validation_passed?: boolean;
  error_fingerprint?: string;
}

export interface BitfrostEffectivenessMetrics {
  runs: number;
  successful_runs: number;
  success_rate: number;
  warmed_selection_rate: number;
  cache_hit_selection_rate: number;
  average_selected_tokens: number;
  average_avoided_prompt_tokens: number;
  average_retrieval_latency_ms: number | null;
  average_total_runtime_ms: number | null;
}

export interface BitfrostCohortComparison {
  cold: BitfrostEffectivenessMetrics;
  warm: BitfrostEffectivenessMetrics;
  delta: {
    success_rate: number;
    average_selected_tokens: number;
    average_avoided_prompt_tokens: number;
    average_retrieval_latency_ms: number | null;
    average_total_runtime_ms: number | null;
  };
}

const EMPTY_LANE_COUNTS = (): Record<ContextLane, number> => ({
  exact: 0,
  lexical: 0,
  dense: 0,
  graph: 0,
  bitfrost: 0,
});

function clamp01(value: number | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/** Conservative approximation when producer tokenizer counts are unavailable. */
export function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function scoreContextCandidate(
  candidate: ContextCandidate,
  policy: ContextSelectionPolicy
): number {
  const w = {
    relevance: policy.weights?.relevance ?? 0.55,
    authority: policy.weights?.authority ?? 0.2,
    freshness: policy.weights?.freshness ?? 0.1,
    graph_proximity: policy.weights?.graph_proximity ?? 0.15,
  };

  const relevance = clamp01(candidate.relevance);
  const authority = clamp01(candidate.authority, 0.5);
  const freshness = clamp01(candidate.freshness, 0.5);
  const graphProximity = candidate.lanes.includes('graph')
    ? 1 / (1 + Math.max(0, candidate.graph_distance ?? 1))
    : 0.5;

  const denominator = w.relevance + w.authority + w.freshness + w.graph_proximity || 1;
  const weighted =
    (relevance * w.relevance +
      authority * w.authority +
      freshness * w.freshness +
      graphProximity * w.graph_proximity) /
    denominator;

  // Crucial invariant: warmed/cache_hit do NOT add score.
  // Cache state affects cost/latency measurement, never semantic admission.
  return Number(weighted.toFixed(6));
}

function normalizeCandidate(
  candidate: ContextCandidate,
  policy: ContextSelectionPolicy
): ScoredContextCandidate {
  return {
    ...candidate,
    lanes: [...new Set(candidate.lanes)].sort() as ContextLane[],
    token_count: candidate.token_count ?? estimateTokens(candidate.content),
    score: scoreContextCandidate(candidate, policy),
  };
}

/**
 * Deduplicate packet identities while preserving evidence that multiple retrieval lanes found it.
 * The strongest semantic scores win; warming flags are ORed only for measurement.
 */
export function mergeDuplicateCandidates(
  candidates: ContextCandidate[],
  policy: ContextSelectionPolicy
): { unique: ScoredContextCandidate[]; duplicates: ScoredContextCandidate[] } {
  const byKey = new Map<string, ScoredContextCandidate>();
  const duplicates: ScoredContextCandidate[] = [];

  for (const raw of candidates) {
    const candidate = normalizeCandidate(raw, policy);
    const existing = byKey.get(candidate.packet_key);
    if (!existing) {
      byKey.set(candidate.packet_key, candidate);
      continue;
    }

    duplicates.push({ ...candidate, rejection_reason: 'duplicate' });

    const merged: ContextCandidate = {
      ...existing,
      content: existing.content.length >= candidate.content.length ? existing.content : candidate.content,
      feature_id: existing.feature_id ?? candidate.feature_id,
      process_id: existing.process_id ?? candidate.process_id,
      source_ref: existing.source_ref ?? candidate.source_ref,
      lanes: [...new Set([...existing.lanes, ...candidate.lanes])],
      relevance: Math.max(existing.relevance, candidate.relevance),
      authority: Math.max(existing.authority ?? 0, candidate.authority ?? 0),
      freshness: Math.max(existing.freshness ?? 0, candidate.freshness ?? 0),
      graph_distance: Math.min(
        existing.graph_distance ?? Number.POSITIVE_INFINITY,
        candidate.graph_distance ?? Number.POSITIVE_INFINITY
      ),
      warmed: Boolean(existing.warmed || candidate.warmed),
      cache_hit: Boolean(existing.cache_hit || candidate.cache_hit),
      required: Boolean(existing.required || candidate.required),
      token_count: Math.min(existing.token_count, candidate.token_count),
    };

    if (!Number.isFinite(merged.graph_distance!)) delete merged.graph_distance;
    byKey.set(candidate.packet_key, normalizeCandidate(merged, policy));
  }

  return { unique: [...byKey.values()], duplicates };
}

function countLanes(candidates: ContextCandidate[]): Record<ContextLane, number> {
  const counts = EMPTY_LANE_COUNTS();
  for (const candidate of candidates) {
    for (const lane of new Set(candidate.lanes)) counts[lane]++;
  }
  return counts;
}

function createManifestId(input: {
  request_id: string;
  feature_id?: string;
  policy_version: string;
  selected_packet_keys: string[];
  selected_process_ids: string[];
  source_refs: string[];
}): string {
  const canonical = JSON.stringify({
    request_id: input.request_id,
    feature_id: input.feature_id ?? null,
    policy_version: input.policy_version,
    selected_packet_keys: input.selected_packet_keys,
    selected_process_ids: input.selected_process_ids,
    source_refs: [...input.source_refs].sort(),
  });
  return `context:${createHash('sha256').update(canonical).digest('hex').slice(0, 24)}`;
}

/**
 * Pure deterministic selection. The same candidates + policy produce the same packet ordering.
 * `created_at` is operational metadata and is excluded from manifest identity.
 */
export function compileContext(input: ContextCompileInput): CompiledContext {
  const { policy } = input;
  if (!input.request_id) throw new Error('Context compiler requires request_id');
  if (!Number.isFinite(policy.token_budget) || policy.token_budget <= 0) {
    throw new Error('Context compiler requires token_budget > 0');
  }

  const reservedTokens = Math.max(0, policy.reserved_tokens ?? 0);
  const usableBudget = Math.max(0, policy.token_budget - reservedTokens);
  const minScore = policy.min_score ?? 0;
  const maxPackets = Math.max(1, policy.max_packets ?? Number.MAX_SAFE_INTEGER);
  const maxPacketTokens = Math.max(1, policy.max_packet_tokens ?? usableBudget);

  const { unique, duplicates } = mergeDuplicateCandidates(input.candidates, policy);
  const rejected: ScoredContextCandidate[] = [...duplicates];

  const valid: ScoredContextCandidate[] = [];
  for (const candidate of unique) {
    if (!candidate.content.trim() || candidate.token_count <= 0) {
      rejected.push({ ...candidate, rejection_reason: 'empty' });
    } else if (!candidate.required && candidate.score < minScore) {
      rejected.push({ ...candidate, rejection_reason: 'below_min_score' });
    } else if (!candidate.required && candidate.token_count > maxPacketTokens) {
      rejected.push({ ...candidate, rejection_reason: 'packet_too_large' });
    } else {
      valid.push(candidate);
    }
  }

  // Required first, then score desc, then smaller packets, then packet_key for deterministic ties.
  valid.sort((a, b) => {
    if (Boolean(a.required) !== Boolean(b.required)) return a.required ? -1 : 1;
    if (a.score !== b.score) return b.score - a.score;
    if (a.token_count !== b.token_count) return a.token_count - b.token_count;
    return a.packet_key.localeCompare(b.packet_key);
  });

  const selected: ScoredContextCandidate[] = [];
  let selectedTokens = 0;

  for (const candidate of valid) {
    if (selected.length >= maxPackets) {
      rejected.push({ ...candidate, rejection_reason: 'packet_limit' });
      continue;
    }

    // Required evidence still obeys the hard total context budget.
    if (selectedTokens + candidate.token_count > usableBudget) {
      rejected.push({ ...candidate, rejection_reason: 'token_budget' });
      continue;
    }

    selected.push({
      ...candidate,
      selection_reason: candidate.required ? 'required' : 'ranked',
    });
    selectedTokens += candidate.token_count;
  }

  const selectedSet = new Set(selected.map((c) => c.packet_key));
  const warmedUnique = unique.filter((c) => c.warmed);
  const cacheHits = unique.filter((c) => c.cache_hit);
  const warmedSelected = warmedUnique.filter((c) => selectedSet.has(c.packet_key));
  const cacheHitSelected = cacheHits.filter((c) => selectedSet.has(c.packet_key));
  const warmedRejected = warmedUnique.filter((c) => !selectedSet.has(c.packet_key));

  // Counts the tokens kept out of the prompt specifically because warm candidates failed admission.
  // This is direct evidence that warming != prompt expansion.
  const avoidedPromptTokens = warmedRejected.reduce((sum, c) => sum + c.token_count, 0);
  const rejectedTokens = rejected.reduce((sum, c) => sum + c.token_count, 0);

  const sourceRefs = [...new Set([
    ...(input.source_refs ?? []),
    ...selected.map((c) => c.source_ref).filter((v): v is string => Boolean(v)),
  ])].sort();
  const selectedPacketKeys = selected.map((c) => c.packet_key);
  const selectedProcessIds = [...new Set(
    selected
      .map((c) => c.process_id)
      .filter((v): v is string => Boolean(v))
  )].sort();

  const manifest: ContextManifest = {
    manifest_id: createManifestId({
      request_id: input.request_id,
      feature_id: input.feature_id,
      policy_version: policy.version,
      selected_packet_keys: selectedPacketKeys,
      selected_process_ids: selectedProcessIds,
      source_refs: sourceRefs,
    }),
    request_id: input.request_id,
    feature_id: input.feature_id,
    source_refs: sourceRefs,
    selected_process_ids: selectedProcessIds,
    retrieved_candidates: unique.length,
    warmed_candidates: warmedUnique.length,
    cache_hits: cacheHits.length,
    selected_packet_keys: selectedPacketKeys,
    rejected_packet_keys: [...new Set(rejected.map((c) => c.packet_key))],
    token_budget: policy.token_budget,
    reserved_tokens: reservedTokens,
    usable_token_budget: usableBudget,
    selected_tokens: selectedTokens,
    rejected_tokens: rejectedTokens,
    selection_policy_version: policy.version,
    spec_refs: [...CONTEXT_COMPILER_SPEC_REFS],
    lanes: countLanes(unique),
    selected_by_lane: countLanes(selected),
    warming: {
      warmed_candidates: warmedUnique.length,
      warmed_selected: warmedSelected.length,
      warmed_rejected: warmedRejected.length,
      cache_hits: cacheHits.length,
      cache_hit_selected: cacheHitSelected.length,
      selection_rate: warmedUnique.length ? warmedSelected.length / warmedUnique.length : 0,
      cache_hit_selection_rate: cacheHits.length ? cacheHitSelected.length / cacheHits.length : 0,
      avoided_prompt_tokens: avoidedPromptTokens,
    },
    created_at: (input.now ?? new Date()).toISOString(),
  };

  return {
    manifest,
    selected,
    rejected,
    prompt_packets: selected.map((candidate) => ({
      packet_key: candidate.packet_key,
      feature_id: candidate.feature_id,
      source_ref: candidate.source_ref,
      content: candidate.content,
      token_count: candidate.token_count,
    })),
  };
}

export async function compileAndPersistContext(
  input: ContextCompileInput,
  persistence: ContextManifestPersistence
): Promise<CompiledContext> {
  const compiled = compileContext(input);
  await persistence.persist(compiled.manifest);
  return compiled;
}

/**
 * Minimal Drizzle-compatible persistence adapter.
 * Use after applying the companion `0153_atlas_context_manifests.sql` migration.
 */
export function createDrizzleContextManifestPersistence(db: {
  execute(query: unknown): Promise<unknown>;
}): ContextManifestPersistence {
  return {
    async persist(manifest: ContextManifest): Promise<void> {
      const { sql } = await import('drizzle-orm');
      await db.execute(sql`
        INSERT INTO atlas_context_manifests (
          manifest_id,
          request_id,
          feature_id,
          source_refs,
          retrieved_candidates,
          warmed_candidates,
          cache_hits,
          selected_packet_keys,
          rejected_packet_keys,
          token_budget,
          reserved_tokens,
          usable_token_budget,
          selected_tokens,
          rejected_tokens,
          selection_policy_version,
          spec_refs,
          lane_counts,
          selected_lane_counts,
          warming_metrics,
          created_at
        ) VALUES (
          ${manifest.manifest_id},
          ${manifest.request_id},
          ${manifest.feature_id ?? null},
          ${JSON.stringify(manifest.source_refs)}::jsonb,
          ${manifest.retrieved_candidates},
          ${manifest.warmed_candidates},
          ${manifest.cache_hits},
          ${JSON.stringify(manifest.selected_packet_keys)}::jsonb,
          ${JSON.stringify(manifest.rejected_packet_keys)}::jsonb,
          ${manifest.token_budget},
          ${manifest.reserved_tokens},
          ${manifest.usable_token_budget},
          ${manifest.selected_tokens},
          ${manifest.rejected_tokens},
          ${manifest.selection_policy_version},
          ${JSON.stringify(manifest.spec_refs)}::jsonb,
          ${JSON.stringify(manifest.lanes)}::jsonb,
          ${JSON.stringify(manifest.selected_by_lane)}::jsonb,
          ${JSON.stringify(manifest.warming)}::jsonb,
          ${manifest.created_at}::timestamptz
        )
        ON CONFLICT (manifest_id) DO UPDATE SET
          warmed_candidates = EXCLUDED.warmed_candidates,
          cache_hits = EXCLUDED.cache_hits,
          selected_packet_keys = EXCLUDED.selected_packet_keys,
          rejected_packet_keys = EXCLUDED.rejected_packet_keys,
          selected_tokens = EXCLUDED.selected_tokens,
          rejected_tokens = EXCLUDED.rejected_tokens,
          lane_counts = EXCLUDED.lane_counts,
          selected_lane_counts = EXCLUDED.selected_lane_counts,
          warming_metrics = EXCLUDED.warming_metrics;
      `);
    },
  };
}

/**
 * Join compile manifests with downstream repair outcomes to answer:
 * "Did Bitfrost warming improve repairs without blindly expanding the prompt?"
 */
export function summarizeBitfrostEffectiveness(
  rows: Array<{ manifest: ContextManifest; outcome: RepairOutcomeObservation }>
): BitfrostEffectivenessMetrics {
  const runs = rows.length;
  const successfulRuns = rows.filter(
    ({ outcome }) => outcome.success && outcome.validation_passed !== false
  ).length;

  const avg = (values: number[]): number | null =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  const selectedTokens = rows.map(({ manifest }) => manifest.selected_tokens);
  const avoidedTokens = rows.map(({ manifest }) => manifest.warming.avoided_prompt_tokens);
  const retrievalLatencies = rows
    .map(({ outcome }) => outcome.retrieval_latency_ms)
    .filter((v): v is number => typeof v === 'number');
  const runtimes = rows
    .map(({ outcome }) => outcome.total_runtime_ms)
    .filter((v): v is number => typeof v === 'number');

  const warmedCandidates = rows.reduce((sum, r) => sum + r.manifest.warming.warmed_candidates, 0);
  const warmedSelected = rows.reduce((sum, r) => sum + r.manifest.warming.warmed_selected, 0);
  const cacheHits = rows.reduce((sum, r) => sum + r.manifest.warming.cache_hits, 0);
  const cacheHitSelected = rows.reduce(
    (sum, r) => sum + r.manifest.warming.cache_hit_selected,
    0
  );

  return {
    runs,
    successful_runs: successfulRuns,
    success_rate: runs ? successfulRuns / runs : 0,
    warmed_selection_rate: warmedCandidates ? warmedSelected / warmedCandidates : 0,
    cache_hit_selection_rate: cacheHits ? cacheHitSelected / cacheHits : 0,
    average_selected_tokens: avg(selectedTokens) ?? 0,
    average_avoided_prompt_tokens: avg(avoidedTokens) ?? 0,
    average_retrieval_latency_ms: avg(retrievalLatencies),
    average_total_runtime_ms: avg(runtimes),
  };
}


/**
 * Automatic warm-vs-cold cohort comparison.
 * A run is "warm" only when at least one candidate was actually served as a cache hit;
 * merely having warmed candidates resident is not enough to claim cache treatment.
 */
export function compareBitfrostCohorts(
  rows: Array<{ manifest: ContextManifest; outcome: RepairOutcomeObservation }>
): BitfrostCohortComparison {
  const coldRows = rows.filter(({ manifest }) => manifest.cache_hits === 0);
  const warmRows = rows.filter(({ manifest }) => manifest.cache_hits > 0);

  const cold = summarizeBitfrostEffectiveness(coldRows);
  const warm = summarizeBitfrostEffectiveness(warmRows);
  const nullableDelta = (warmValue: number | null, coldValue: number | null): number | null =>
    warmValue == null || coldValue == null ? null : warmValue - coldValue;

  return {
    cold,
    warm,
    delta: {
      success_rate: warm.success_rate - cold.success_rate,
      average_selected_tokens: warm.average_selected_tokens - cold.average_selected_tokens,
      average_avoided_prompt_tokens:
        warm.average_avoided_prompt_tokens - cold.average_avoided_prompt_tokens,
      average_retrieval_latency_ms: nullableDelta(
        warm.average_retrieval_latency_ms,
        cold.average_retrieval_latency_ms
      ),
      average_total_runtime_ms: nullableDelta(
        warm.average_total_runtime_ms,
        cold.average_total_runtime_ms
      ),
    },
  };
}
