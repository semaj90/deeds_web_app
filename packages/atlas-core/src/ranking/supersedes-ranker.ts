/**
 * PHASE 85 P1: SUPERSEDES RANKER
 *
 * Canonical authority for artifact ranking decisions.
 *
 * Decision logic:
 *   identity mismatch     → REVIEW (never supersede)
 *   content_hash same     → SKIP (no change)
 *   semantic sim >= 0.99  → SKIP
 *   semantic sim 0.95-99  → METADATA_ONLY
 *   semantic sim 0.80-95  → REGENERATE_SUMMARY
 *   semantic sim 0.60-80  → GAN_REVIEW
 *   semantic sim < 0.60   → FULL_REGENERATION
 *   gan_score < 0.60      → reject new
 *   reward_score > old    → new supersedes old (if GAN pass)
 *   uncertain             → REVIEW (not ACTIVE)
 */

export type ArtifactDecision = 'ACTIVE' | 'SUPERSEDED' | 'STALE' | 'REVIEW' | 'SKIP';

export interface RankerInput {
  // Artifact identity (immutable)
  old_packet_key: string;
  new_packet_key: string;
  old_source_ref: string;
  new_source_ref: string;
  old_feature_id?: string;
  new_feature_id?: string;

  // Content tracking
  old_content_hash: string | null;
  new_content_hash: string | null;
  old_generator: string;
  new_generator: string;
  old_generator_version: string;
  new_generator_version: string;

  // Git tracking
  old_git_commit?: string;
  new_git_commit?: string;

  // Semantic scoring
  semantic_diff_score?: number; // 0.0-1.0 cosine similarity

  // GAN scoring
  old_gan_score?: number; // 0.0-1.0
  new_gan_score?: number; // 0.0-1.0

  // Reward scoring
  old_reward_score?: number; // 0.0-1.0
  new_reward_score?: number; // 0.0-1.0

  // Replay results
  old_replay_success_rate?: number; // 0.0-1.0
  new_replay_success_rate?: number; // 0.0-1.0

  // Metadata
  old_created_at: Date;
  new_created_at: Date;
  trace_id?: string;
}

export interface RankerOutput {
  winner_artifact_id: string; // 'old' or 'new'
  loser_artifact_id: string;
  decision: ArtifactDecision;
  confidence: number; // 0.0-1.0
  reasons: string[];
  gates_passed: string[];
  gates_failed: string[];
  score_delta: number; // new_score - old_score
  old_score: number;
  new_score: number;
}

// ── Gate implementations ───────────────────────────────────────────────────────

function identityGate(input: RankerInput): { pass: boolean; reason: string } {
  if (input.old_packet_key !== input.new_packet_key) {
    return { pass: false, reason: 'packet_key mismatch' };
  }
  if (input.old_source_ref !== input.new_source_ref) {
    return { pass: false, reason: 'source_ref mismatch' };
  }
  if (input.old_feature_id !== input.new_feature_id) {
    return { pass: false, reason: 'feature_id mismatch' };
  }
  return { pass: true, reason: 'identity preserved' };
}

function contentGate(input: RankerInput): { pass: boolean; reason: string } {
  if (input.old_content_hash && input.new_content_hash) {
    if (input.old_content_hash === input.new_content_hash) {
      return { pass: false, reason: 'content_hash unchanged' };
    }
  }
  return { pass: true, reason: 'content changed' };
}

function semanticGate(input: RankerInput): { pass: boolean; reason: string; action: string } {
  const score = input.semantic_diff_score ?? 0;

  if (score >= 0.99) {
    return { pass: false, reason: 'similarity >= 0.99 (skip)', action: 'SKIP' };
  }
  if (score >= 0.95) {
    return { pass: false, reason: 'similarity 0.95-0.99 (metadata only)', action: 'METADATA_ONLY' };
  }
  if (score >= 0.8) {
    return { pass: true, reason: 'similarity 0.80-0.95 (regenerate)', action: 'REGENERATE_SUMMARY' };
  }
  if (score >= 0.6) {
    return { pass: true, reason: 'similarity 0.60-0.80 (GAN review)', action: 'GAN_REVIEW' };
  }

  return { pass: true, reason: 'similarity < 0.60 (full regeneration)', action: 'FULL_REGENERATION' };
}

function ganGate(input: RankerInput): { pass: boolean; reason: string } {
  const newScore = input.new_gan_score ?? 0;

  if (newScore < 0.6) {
    return { pass: false, reason: `GAN score ${(newScore * 100).toFixed(1)}% < 60% (reject)` };
  }

  return { pass: true, reason: `GAN score ${(newScore * 100).toFixed(1)}% >= 60% (pass)` };
}

function rewardGate(input: RankerInput): { pass: boolean; reason: string; delta: number } {
  const oldScore = input.old_reward_score ?? 0;
  const newScore = input.new_reward_score ?? 0;
  const delta = newScore - oldScore;

  // New reward > old reward → new wins
  if (delta > 0.05) {
    // 5% improvement threshold
    return { pass: true, reason: `reward improved by ${(delta * 100).toFixed(1)}%`, delta };
  }

  // If delta is small, neutral
  if (Math.abs(delta) <= 0.05) {
    return { pass: true, reason: `reward unchanged (${(delta * 100).toFixed(1)}%)`, delta };
  }

  // New reward < old reward → old wins
  return { pass: false, reason: `reward degraded by ${(Math.abs(delta) * 100).toFixed(1)}%`, delta };
}

function replayGate(input: RankerInput): { pass: boolean; reason: string } {
  const oldRate = input.old_replay_success_rate ?? 0;
  const newRate = input.new_replay_success_rate ?? 0;

  if (newRate >= oldRate + 0.1) {
    return { pass: true, reason: `replay success improved ${(oldRate * 100).toFixed(0)}% → ${(newRate * 100).toFixed(0)}%` };
  }

  if (newRate < oldRate - 0.1) {
    return { pass: false, reason: `replay success degraded ${(oldRate * 100).toFixed(0)}% → ${(newRate * 100).toFixed(0)}%` };
  }

  return { pass: true, reason: `replay success similar (${(newRate * 100).toFixed(0)}%)` };
}

// ── Composite scoring ──────────────────────────────────────────────────────────

function computeArtifactScore(input: RankerInput, isNew: boolean): number {
  let score = 0;

  const ganScore = isNew ? input.new_gan_score ?? 0 : input.old_gan_score ?? 0;
  const rewardScore = isNew ? input.new_reward_score ?? 0 : input.old_reward_score ?? 0;
  const replayScore = isNew ? input.new_replay_success_rate ?? 0 : input.old_replay_success_rate ?? 0;

  // Weighted average: GAN (50%) + Reward (30%) + Replay (20%)
  score = ganScore * 0.5 + rewardScore * 0.3 + replayScore * 0.2;

  return Math.max(0, Math.min(1, score));
}

// ── Main ranker ────────────────────────────────────────────────────────────────

export function rankSupersedes(input: RankerInput): RankerOutput {
  const output: RankerOutput = {
    winner_artifact_id: 'new',
    loser_artifact_id: 'old',
    decision: 'ACTIVE',
    confidence: 1.0,
    reasons: [],
    gates_passed: [],
    gates_failed: [],
    score_delta: 0,
    old_score: 0,
    new_score: 0,
  };

  // Gate 1: Identity check (hard fail)
  const identity = identityGate(input);
  if (!identity.pass) {
    output.decision = 'REVIEW';
    output.gates_failed.push(identity.reason);
    output.confidence = 0.0;
    output.reasons.push(`REVIEW: ${identity.reason} (never supersede on identity mismatch)`);
    return output;
  }
  output.gates_passed.push(identity.reason);

  // Gate 2: Content check
  const content = contentGate(input);
  if (!content.pass) {
    output.decision = 'SKIP';
    output.gates_passed.push(content.reason);
    output.reasons.push(`SKIP: ${content.reason}`);
    return output;
  }
  output.gates_passed.push(content.reason);

  // Gate 3: Semantic similarity
  const semantic = semanticGate(input);
  if (!semantic.pass) {
    output.decision = 'SKIP';
    output.gates_passed.push(semantic.reason);
    output.reasons.push(`SKIP: ${semantic.reason}`);
    return output;
  }
  output.gates_passed.push(semantic.reason);
  output.reasons.push(`Semantic check: ${semantic.reason}`);

  // Gate 4: GAN score
  const gan = ganGate(input);
  if (!gan.pass) {
    output.decision = 'REVIEW';
    output.gates_failed.push(gan.reason);
    output.confidence = 0.2;
    output.reasons.push(`⚠️  ${gan.reason}`);
  } else {
    output.gates_passed.push(gan.reason);
    output.reasons.push(`✅ ${gan.reason}`);
  }

  // Gate 5: Reward score
  const reward = rewardGate(input);
  if (!reward.pass) {
    output.winner_artifact_id = 'old';
    output.loser_artifact_id = 'new';
    output.decision = 'SUPERSEDED';
    output.gates_failed.push(reward.reason);
    output.confidence = 0.8;
    output.reasons.push(`⚠️  ${reward.reason}`);
  } else {
    output.gates_passed.push(reward.reason);
    output.reasons.push(`✅ ${reward.reason}`);
  }

  // Gate 6: Replay success
  const replay = replayGate(input);
  if (!replay.pass) {
    output.winner_artifact_id = 'old';
    output.loser_artifact_id = 'new';
    output.decision = 'SUPERSEDED';
    output.gates_failed.push(replay.reason);
    output.confidence = 0.75;
    output.reasons.push(`⚠️  ${replay.reason}`);
  } else {
    output.gates_passed.push(replay.reason);
    output.reasons.push(`✅ ${replay.reason}`);
  }

  // Compute final scores
  output.old_score = computeArtifactScore(input, false);
  output.new_score = computeArtifactScore(input, true);
  output.score_delta = output.new_score - output.old_score;

  // If gates passed and new score is better → ACTIVE
  if (output.gates_failed.length === 0 && output.score_delta >= 0) {
    output.decision = 'ACTIVE';
    output.confidence = Math.min(1.0, 0.8 + Math.abs(output.score_delta) * 0.2);
    output.reasons.push(`✅ New artifact ACTIVE: score ${output.new_score.toFixed(3)} (Δ ${output.score_delta > 0 ? '+' : ''}${output.score_delta.toFixed(3)})`);
  } else if (output.gates_failed.length > 0) {
    output.decision = 'REVIEW';
    output.confidence = 0.5;
    output.reasons.push(`⚠️  REVIEW required: ${output.gates_failed.length} gates failed`);
  } else if (output.score_delta < -0.1) {
    output.winner_artifact_id = 'old';
    output.loser_artifact_id = 'new';
    output.decision = 'SUPERSEDED';
    output.confidence = 0.7;
    output.reasons.push(`⚠️  Old artifact wins: score ${output.old_score.toFixed(3)} > ${output.new_score.toFixed(3)} (Δ ${output.score_delta.toFixed(3)})`);
  } else {
    output.decision = 'REVIEW';
    output.confidence = 0.5;
    output.reasons.push(`Uncertain: manual review recommended`);
  }

  return output;
}
