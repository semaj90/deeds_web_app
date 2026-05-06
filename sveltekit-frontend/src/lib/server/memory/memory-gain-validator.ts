/**
 * memory-gain-validator.ts — Step 5B memory quality gate.
 *
 * Scores incoming HCA cards / KAG notes / prior-answer summaries against
 * what is already stored. Only high-gain candidates are queued for Qdrant
 * embedding; low-gain ones are logged and skipped.
 *
 * Deterministic heuristics only — no LLM calls. Fast enough to call inline.
 *
 * Scoring criteria (each 0–1, equal weight):
 *   accuracy  — candidate covers at least 1 verifiable claim (file path / symbol)
 *   density   — information per character (unique tokens / length)
 *   clarity   — readable prose, not raw JSON/stack-trace
 *   novelty   — low string overlap with existing memory
 *
 * Threshold defaults: accept when gainScore ≥ 0.45
 */

import { createHash } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryGainReport {
  candidateHash:  string;
  gainScore:      number;     // 0–1, weighted average of all criteria
  accepted:       boolean;
  reasons:        string[];   // human-readable explanation of each score
  scores: {
    accuracy: number;
    density:  number;
    clarity:  number;
    novelty:  number;
  };
}

export interface MemoryCandidate {
  text:        string;
  memoryType:  'hca_card' | 'kag_note' | 'prior_answer' | 'wiki_note' | 'research_card';
  stableKey?:  string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

export const DEFAULT_ACCEPT_THRESHOLD = 0.45;

// Patterns that indicate a file/symbol reference (positive for accuracy)
const ACCURACY_SIGNALS = /(?:src\/|lib\/|\.ts|\.svelte|export\s+(?:function|class|const|type|interface)|import\s+\{)/;

// Patterns that suggest raw noise (negative for clarity)
const NOISE_SIGNALS = /^\s*\{|\[\d+\]|Error:.*at\s+\w|stacktrace|undefined\s+is\s+not/im;

// Minimum token density threshold (unique words / total chars)
const MIN_DENSITY = 0.04;

// ── Scoring functions ─────────────────────────────────────────────────────────

function scoreAccuracy(text: string): number {
  // Presence of file paths, symbols, or typed exports = verifiable claim
  const matches = (text.match(ACCURACY_SIGNALS) ?? []).length;
  return Math.min(matches / 3, 1.0);
}

function scoreDensity(text: string): number {
  const tokens    = text.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const unique    = new Set(tokens).size;
  const density   = text.length > 0 ? unique / text.length : 0;
  // Normalise so density ≥ MIN_DENSITY → score 1.0
  return Math.min(density / MIN_DENSITY, 1.0);
}

function scoreClarity(text: string): number {
  if (NOISE_SIGNALS.test(text)) return 0.1;
  // Prose heuristic: sentence-like (has spaces, ends with punctuation or word)
  const hasSentenceShape = /[A-Z][^.!?]*[.!?]/.test(text) || text.split(' ').length > 5;
  const isNotRawJson     = !/^\s*[{["]/.test(text.trimStart());
  return (hasSentenceShape ? 0.5 : 0.2) + (isNotRawJson ? 0.5 : 0);
}

function scoreNovelty(candidate: string, existing: string | null | undefined): number {
  if (!existing) return 1.0; // no prior memory → fully novel
  const candTokens = new Set(candidate.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  const existTokens = new Set(existing.toLowerCase().split(/\W+/).filter(t => t.length > 2));
  if (candTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of candTokens) {
    if (existTokens.has(t)) overlap++;
  }
  const similarity = overlap / candTokens.size;
  return Math.max(0, 1 - similarity);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score the information gain of a candidate memory against optional existing content.
 * All criteria are equally weighted (0.25 each).
 */
export function scoreMemoryGain(
  candidate: MemoryCandidate,
  existingText?: string | null,
): MemoryGainReport {
  const { text } = candidate;

  const accuracy = scoreAccuracy(text);
  const density  = scoreDensity(text);
  const clarity  = scoreClarity(text);
  const novelty  = scoreNovelty(text, existingText);

  const gainScore = (accuracy + density + clarity + novelty) / 4;

  const reasons: string[] = [
    `accuracy=${accuracy.toFixed(2)} (file/symbol references present)`,
    `density=${density.toFixed(2)} (unique-token/char ratio)`,
    `clarity=${clarity.toFixed(2)} (prose quality)`,
    `novelty=${novelty.toFixed(2)} (token overlap with existing)`,
  ];

  return {
    candidateHash: createHash('sha1').update(text).digest('hex').slice(0, 12),
    gainScore,
    accepted:      gainScore >= DEFAULT_ACCEPT_THRESHOLD,
    reasons,
    scores:        { accuracy, density, clarity, novelty },
  };
}

/**
 * Returns true if the candidate should be accepted (stored in Qdrant / Redis).
 * Pass `threshold` to override the default 0.45.
 */
export function shouldAcceptMemory(
  candidate:    MemoryCandidate,
  existingText: string | null | undefined,
  threshold    = DEFAULT_ACCEPT_THRESHOLD,
): boolean {
  return scoreMemoryGain(candidate, existingText).gainScore >= threshold;
}

/**
 * Human-readable gain report for logging / API responses.
 */
export function explainMemoryGain(
  candidate:    MemoryCandidate,
  existingText: string | null | undefined,
): string {
  const report = scoreMemoryGain(candidate, existingText);
  return [
    `[memory-gain] type=${candidate.memoryType} key=${candidate.stableKey ?? '?'}`,
    `  hash=${report.candidateHash}  gain=${report.gainScore.toFixed(3)}  accepted=${report.accepted}`,
    ...report.reasons.map(r => `  · ${r}`),
  ].join('\n');
}
