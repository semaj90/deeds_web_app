/**
 * User-vs-AI-generated provenance for code symbols — extends `source-kind-classifier.ts`'s
 * existing `SourceKind` taxonomy to code, which `classifySourceKind()` currently bypasses
 * entirely (`sourceRef.endsWith('.ts') ... return 'code'`, no finer classification).
 *
 * This is a pure classification function, decoupled from how commit evidence is obtained — see
 * `git-commit-provenance.ts` for the one concrete evidence adapter. Never fabricates a
 * classification: returns `unknown` (an existing `SourceKind` value) when evidence is absent or
 * ambiguous, per this repo's evidence-first discipline.
 */

import type { SourceKind } from './source-kind-classifier.js';

export interface CommitProvenanceEvidence {
  commitMessage?: string;
  authorName?: string;
  authorEmail?: string;
}

/** Trailer/marker patterns that indicate AI-assisted authorship in a commit message. */
const AI_TRAILER_PATTERNS: readonly RegExp[] = [
  /co-authored-by:\s*(claude|gpt|copilot|codex|gemini)/i,
  /generated (with|by)\s+(claude|gpt|copilot|codex|gemini|chatgpt)/i,
  /\bclaude code\b/i,
];

const AI_AUTHOR_EMAIL_PATTERNS: readonly RegExp[] = [
  /noreply@anthropic\.com/i,
  /noreply@openai\.com/i,
  /github-actions\[bot\]/i,
];

/**
 * Classify a code symbol's authorship provenance from commit evidence.
 *
 * Returns `'ai_generated'` when the commit message carries a recognized AI co-authorship
 * trailer/marker or the author email matches a known AI-tooling pattern; `'code'` (the existing
 * neutral value `source-kind-classifier.ts` already uses for source files) when a commit is
 * present but shows no AI markers — a confidently human-authored commit; `'unknown'` when no
 * evidence is available at all.
 *
 * Deliberately does NOT reuse `'user_note'` for human-authored code — that value's existing
 * meaning elsewhere in `source-kind-classifier.ts` is scratch notes/observations, not source
 * code, and overloading it would blur an existing signal. `'code'` already serves as the correct
 * neutral/default classification for source files.
 */
export function classifyCodeSymbolProvenance(
  evidence: CommitProvenanceEvidence,
): Extract<SourceKind, 'ai_generated' | 'code' | 'unknown'> {
  const { commitMessage, authorEmail } = evidence;

  if (commitMessage && AI_TRAILER_PATTERNS.some((p) => p.test(commitMessage))) {
    return 'ai_generated';
  }
  if (authorEmail && AI_AUTHOR_EMAIL_PATTERNS.some((p) => p.test(authorEmail))) {
    return 'ai_generated';
  }
  if (commitMessage || authorEmail || evidence.authorName) {
    return 'code';
  }
  return 'unknown';
}

/**
 * Convert a provenance classification into a `[0,1]` score for the rerank blend, mirroring
 * `static-dynamic-classifier.ts`'s `staticDynamicScore()` pattern. `'unknown'` (no evidence) maps
 * to `undefined`, never a fabricated neutral value — `blendScores()` already skips `undefined`
 * signals correctly.
 *
 * `favor` defaults to `'code'` (confidently human-authored) — a documented policy choice, not a
 * technical necessity: this repo has no stated preference for AI- vs human-authored code in
 * search relevance, so the default only exists to give `domainScore` a concrete direction out of
 * the box. Callers wanting the opposite bias (e.g. surfacing AI-generated code for an AI-code
 * audit view) pass `favor: 'ai_generated'`.
 */
export function provenanceScore(
  label: Extract<SourceKind, 'ai_generated' | 'code' | 'unknown'>,
  favor: Extract<SourceKind, 'ai_generated' | 'code'> = 'code',
): number | undefined {
  if (label === 'unknown') return undefined;
  return label === favor ? 1 : 0;
}
