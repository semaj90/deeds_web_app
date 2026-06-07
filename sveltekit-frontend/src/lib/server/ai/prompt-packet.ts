/**
 * SemanticPromptPacket — canonical shape for Valkey prompt/rule/fix/sourceRef cards.
 *
 * Key layout (all stored as Valkey HASH):
 *   prompt:exact:v1:{sha256}        exact prompt → answer
 *   prompt:sem:v1:{id}              semantic packet (embedding stored separately)
 *   prompt:vec:v1:{id}              Float32 embedding bytes (VECTOR field for FT.SEARCH)
 *   prompt:route:v1:{sha256}        cached router decision (avoid re-embedding on repeat prompts)
 *   prompt:stats:v1                 global hit/miss counters (HASH, HINCRBY)
 *
 *   opencode:rule:v1:{topic}        AGENTS.md-style rule card (no answer, just context)
 *   opencode:fix:v1:{errorHash}     known fix packet keyed by error signature
 *   opencode:file:v1:{sourceRef}    summarized file card (lod1Summary + tags)
 */

// ── Kind ──────────────────────────────────────────────────────────────────────

export type PacketKind =
  | 'prompt'       // user/OpenCode prompt with cached answer
  | 'rule'         // AGENTS.md rule card — context-only, no answer
  | 'fix'          // known fix for a recurring error pattern
  | 'source_ref'   // summarized file/sourceRef card
  | 'error';       // error signature with diagnosis

// ── Router decision ───────────────────────────────────────────────────────────

export type RouterDecision =
  | 'exact_hit'          // L0: exact SHA-256 match, return answer directly
  | 'semantic_hit'       // L1.5: cosine ≥ 0.92, reuse or patch cached answer
  | 'semantic_context'   // L1.5: 0.78–0.91, inject top-5 as context then call model
  | 'model_call';        // L2: score < 0.78, call Gemma4 with minimal context

// ── Core packet ───────────────────────────────────────────────────────────────

export interface SemanticPromptPacket {
  id: string;
  kind: PacketKind;
  inputHash: string;               // SHA-256 of normalizedPrompt
  normalizedPrompt: string;        // whitespace-collapsed, lowercased
  summary: string;                 // ≤200 chars — shown to model as context card
  tags: string[];                  // TAG field for FT.SEARCH pre-filter
  sourceRefs: string[];            // file paths or task refs that informed this packet
  model: string;                   // 'gemma4-rotorquant:latest' | 'gemma4-legal-iq4xs' | ...
  score?: number;                  // cosine similarity from last FT.SEARCH (runtime only)
  answer?: string;                 // cached model output (omitted for rule/source_ref kinds)
  createdAt: string;               // ISO timestamp
  ttlSeconds: number;              // Valkey EXPIRE value
}

// ── Flat Valkey HASH representation ───────────────────────────────────────────
// ioredis HSET requires string/number values.

export type PacketHashFields = {
  id: string;
  kind: string;
  inputHash: string;
  normalizedPrompt: string;
  summary: string;
  tags: string;           // JSON.stringify(string[])
  sourceRefs: string;     // JSON.stringify(string[])
  model: string;
  answer: string;         // '' when absent
  createdAt: string;
  ttlSeconds: string;     // string for ioredis
};

export function packetToHash(p: SemanticPromptPacket): PacketHashFields {
  return {
    id: p.id,
    kind: p.kind,
    inputHash: p.inputHash,
    normalizedPrompt: p.normalizedPrompt,
    summary: p.summary,
    tags: JSON.stringify(p.tags),
    sourceRefs: JSON.stringify(p.sourceRefs),
    model: p.model,
    answer: p.answer ?? '',
    createdAt: p.createdAt,
    ttlSeconds: String(p.ttlSeconds),
  };
}

export function hashToPacket(h: Record<string, string>): SemanticPromptPacket {
  return {
    id: h.id,
    kind: h.kind as PacketKind,
    inputHash: h.inputHash,
    normalizedPrompt: h.normalizedPrompt,
    summary: h.summary,
    tags: safeParseArray(h.tags),
    sourceRefs: safeParseArray(h.sourceRefs),
    model: h.model,
    answer: h.answer || undefined,
    createdAt: h.createdAt,
    ttlSeconds: Number(h.ttlSeconds),
  };
}

function safeParseArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

// ── Key helpers ───────────────────────────────────────────────────────────────

export const PROMPT_KEY_PREFIX   = 'prompt:sem:v1:';
export const PROMPT_VEC_PREFIX   = 'prompt:vec:v1:';
export const EXACT_KEY_PREFIX    = 'prompt:exact:v1:';
export const ROUTE_KEY_PREFIX    = 'prompt:route:v1:';
export const STATS_KEY           = 'prompt:stats:v1';

export const OPENCODE_RULE_PREFIX   = 'opencode:rule:v1:';
export const OPENCODE_FIX_PREFIX    = 'opencode:fix:v1:';
export const OPENCODE_FILE_PREFIX   = 'opencode:file:v1:';

export function promptSemKey(id: string)       { return `${PROMPT_KEY_PREFIX}${id}`; }
export function promptVecKey(id: string)       { return `${PROMPT_VEC_PREFIX}${id}`; }
export function exactKey(sha256: string)       { return `${EXACT_KEY_PREFIX}${sha256}`; }
export function routeKey(sha256: string)       { return `${ROUTE_KEY_PREFIX}${sha256}`; }
export function opencodeRuleKey(topic: string) { return `${OPENCODE_RULE_PREFIX}${topic}`; }
export function opencodeFixKey(errorHash: string) { return `${OPENCODE_FIX_PREFIX}${errorHash}`; }
export function opencodeFileKey(sourceRef: string) {
  return `${OPENCODE_FILE_PREFIX}${sourceRef.replace(/\//g, ':')}`;
}

// ── Normalisation ─────────────────────────────────────────────────────────────

export function normalizePrompt(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '') // strip Gemma4 reasoning blocks
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 2000);
}

export function hashPrompt(normalized: string): string {
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(normalized).digest('hex');
}

// ── Router decision thresholds ────────────────────────────────────────────────

export const EXACT_HIT_SCORE      = 1.0;   // exact SHA-256 match
export const SEMANTIC_HIT_SCORE   = 0.92;  // reuse answer (minimal patch allowed)
export const SEMANTIC_CTX_SCORE   = 0.78;  // inject as context, still call model
// below 0.78 → full model call with no cached context injection
