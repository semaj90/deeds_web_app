/**
 * Prompt-injection sanitizer for T4 (external) and T5 (user) chunks.
 *
 * Runs before any T4/T5 chunk enters the ACE context pack. Strips or
 * brackets known injection patterns and populates TrustMeta.injectionSignals
 * so the audit trail knows a chunk was modified.
 *
 * The sanitizer is intentionally lenient — it redacts patterns, it does NOT
 * block the chunk. Blocking is the caller's responsibility when `safe=false`.
 *
 * Patterns are kept minimal and regex-only to avoid LLM calls in the hot path.
 * False positives on legal text (e.g. "ignore previous precedent") are
 * acceptable — the fence around T4/T5 already limits their authority.
 */

import { createHash } from 'node:crypto';
import type { TrustMeta, TrustTier } from './types.js';

// ── Injection pattern registry ────────────────────────────────────────────────

interface InjectionPattern {
  label: string;
  re:    RegExp;
}

const PATTERNS: InjectionPattern[] = [
  { label: 'ignore_previous_instructions', re: /ignore\s+(previous|prior|all)\s+instructions?/gi },
  { label: 'system_override',              re: /system\s+prompt|<\/?system>/gi },
  { label: 'tool_call_injection',          re: /tool_calls?\s*[:=\[{]/gi },
  { label: 'ops_execute',                  re: /\bops\.(execute|run|call|invoke)\b/gi },
  { label: 'role_switch',                  re: /<\/?(?:assistant|function|user|human|ai)\b[^>]*>/gi },
  { label: 'jailbreak_prefix',             re: /\b(DAN|STAN|AIM|DUDE|KEVIN|ANTI-DAN)\b/g },
  { label: 'prompt_leak',                  re: /repeat\s+(back|above|everything)\s+(above|before|prior)/gi },
  { label: 'delimiter_injection',          re: /\[\s*INST\s*\]|\[\/\s*INST\s*\]|<\|im_start\|>|<\|im_end\|>/gi },
];

const REDACTION = '[REDACTED]';

// ── Core sanitizer ────────────────────────────────────────────────────────────

export interface SanitizeResult {
  /** Sanitized text (patterns replaced with [REDACTED]) */
  sanitized: string;
  /** True if NO patterns were detected (original text is clean) */
  safe: boolean;
  /** Labels of detected patterns */
  signals: string[];
}

export function sanitizeChunk(text: string): SanitizeResult {
  const signals: string[] = [];
  let out = text;

  for (const { label, re } of PATTERNS) {
    const before = out;
    out = out.replace(re, REDACTION);
    if (out !== before) signals.push(label);
  }

  return { sanitized: out, safe: signals.length === 0, signals };
}

// ── TrustMeta factory ─────────────────────────────────────────────────────────

/**
 * Build a TrustMeta for a T4/T5 chunk after running the sanitizer.
 * The `sanitized` field reflects whether the text was modified.
 * Callers should replace the chunk's text with `result.sanitized`.
 */
export function buildExternalTrustMeta(
  tier:      Extract<TrustTier, 'T4' | 'T5'>,
  sourceUri: string,
  rawText:   string,
): { trustMeta: TrustMeta; sanitizeResult: SanitizeResult } {
  const sanitizeResult = sanitizeChunk(rawText);
  const textForHash    = sanitizeResult.sanitized;
  const contentHash    = createHash('sha256').update(textForHash).digest('hex').slice(0, 32);

  const trustMeta: TrustMeta = {
    tier,
    instructionAuthority: false,
    sourceUri,
    contentHash,
    sanitized:        !sanitizeResult.safe,
    injectionSignals: sanitizeResult.signals.length > 0 ? sanitizeResult.signals : undefined,
  };

  return { trustMeta, sanitizeResult };
}

/**
 * Shorthand for T3 (verified code) chunks — no sanitization needed,
 * just produces the TrustMeta with correct hash.
 */
export function buildCodeChunkTrustMeta(sourceUri: string, text: string): TrustMeta {
  const contentHash = createHash('sha256').update(text).digest('hex').slice(0, 32);
  return { tier: 'T3', instructionAuthority: false, sourceUri, contentHash, sanitized: false };
}

/**
 * Shorthand for T1 (AGENTS.md / system) chunks.
 */
export function buildSystemTrustMeta(sourceUri: string, text: string): TrustMeta {
  const contentHash = createHash('sha256').update(text).digest('hex').slice(0, 32);
  return { tier: 'T1', instructionAuthority: true, sourceUri, contentHash, sanitized: false };
}
