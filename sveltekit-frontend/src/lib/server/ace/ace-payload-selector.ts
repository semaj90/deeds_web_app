/**
 * ACE Payload Selector
 *
 * Controls what text from a retrieval hit is injected into the model context.
 * Priority: LLM summary > content preview > raw content (truncated).
 *
 * Rule: never inject hit.content at full length unless includeFullText=true
 * AND the remaining token budget allows it. This is the primary lever for
 * preventing Qdrant full_text payloads from overfeeding the context window.
 *
 * Also assigns HmmErrorClass labels based on hit quality signals so the
 * boosted reranker and GRPO exporter can use them as training features.
 */

import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';

// ── HMM error taxonomy ────────────────────────────────────────────────────────
// Each label represents a retrieval-quality failure mode detected heuristically.
// The reranker uses hmm_error_risk as a penalty feature; GRPO uses labels as
// negative-example tags when reward < 0.

export type HmmErrorClass =
  | 'bad_intent'           // query did not match any plausible intent category
  | 'wrong_chunk'          // cosine score too low (< 0.35) — probably off-topic
  | 'stale_context'        // recency signal is low and hit is authority-poor
  | 'missing_dependency'   // hit references a symbol not present in active files
  | 'tool_timeout'         // upstream retrieval call exceeded time budget
  | 'hallucinated_file'    // filePath does not exist in codebase_chunk_index
  | 'low_authority_source' // authorityScore < 0.10 — low PageRank/Karpathy blend
  | 'over_compacted_context'; // content is too short to be useful (< 80 chars)

// ── Compact ACE payload ───────────────────────────────────────────────────────

export interface AcePayload {
  chunk_id:    string;
  source_ref:  string;
  summary:     string;           // snippet or LLM summary, within budget
  error_labels: HmmErrorClass[];
  weights: {
    cosine:    number;
    authority: number;
    topology:  number;           // caller fills this from topoClass / topo-byte
    bm25:      number;           // caller fills this from sparse scorer
  };
  full_text?: string;            // only set when includeFullText=true
}

// ── Heuristic error labeller ──────────────────────────────────────────────────

function assignErrorLabels(hit: UnifiedRetrievalResult): HmmErrorClass[] {
  const labels: HmmErrorClass[] = [];
  if (hit.score < 0.35)                       labels.push('wrong_chunk');
  if ((hit.authorityScore ?? 1) < 0.10)       labels.push('low_authority_source');
  if (hit.content.length < 80)                labels.push('over_compacted_context');
  return labels;
}

// ── Public selectors ──────────────────────────────────────────────────────────

const DEFAULT_SNIPPET_CAP  = 400;
const DEFAULT_FULLTEXT_CAP = 2000;

/**
 * selectAcePayload — distil one retrieval hit into a budget-aware ACE payload.
 *
 * @param hit         The raw retrieval result from Qdrant / Postgres.
 * @param opts.includeFullText  Inject raw content beyond the snippet (default false).
 * @param opts.snippetCap       Max chars for the summary field (default 400).
 * @param opts.topologyScore    Caller-supplied topology signal (0–1).
 * @param opts.bm25Score        Caller-supplied BM25 lexical signal (0–1).
 */
export function selectAcePayload(
  hit: UnifiedRetrievalResult,
  opts: {
    includeFullText?: boolean;
    snippetCap?:     number;
    topologyScore?:  number;
    bm25Score?:      number;
  } = {}
): AcePayload {
  const cap = opts.snippetCap ?? DEFAULT_SNIPPET_CAP;

  // Summary priority: LLM-generated > raw content preview
  const raw = hit.summary ?? hit.content;
  const snippet = raw.replace(/\s+/g, ' ').trim();
  const summary = snippet.length > cap
    ? snippet.slice(0, cap - 1) + '…'
    : snippet;

  const payload: AcePayload = {
    chunk_id:    hit.id,
    source_ref:  hit.filePath ?? hit.sourceId ?? hit.id,
    summary,
    error_labels: assignErrorLabels(hit),
    weights: {
      cosine:    Number(hit.score?.toFixed(4) ?? 0),
      authority: Number((hit.authorityScore ?? 0).toFixed(4)),
      topology:  Number((opts.topologyScore  ?? 0).toFixed(4)),
      bm25:      Number((opts.bm25Score      ?? 0).toFixed(4)),
    },
  };

  if (opts.includeFullText) {
    payload.full_text = hit.content.slice(0, DEFAULT_FULLTEXT_CAP);
  }

  return payload;
}

/**
 * selectAcePayloads — convert a ranked hit list into budget-bound ACE payloads.
 * Stops adding hits once `totalBudget` chars have been consumed.
 */
export function selectAcePayloads(
  hits: UnifiedRetrievalResult[],
  opts: {
    includeFullText?: boolean;
    snippetCap?:      number;
    totalBudget?:     number;
    topologyScores?:  Map<string, number>; // keyed by hit.id
    bm25Scores?:      Map<string, number>;
  } = {}
): AcePayload[] {
  const budget = opts.totalBudget ?? Infinity;
  const results: AcePayload[] = [];
  let used = 0;

  for (const hit of hits) {
    const payload = selectAcePayload(hit, {
      includeFullText: opts.includeFullText,
      snippetCap:      opts.snippetCap,
      topologyScore:   opts.topologyScores?.get(hit.id),
      bm25Score:       opts.bm25Scores?.get(hit.id),
    });
    const size = payload.summary.length + (payload.full_text?.length ?? 0);
    if (used + size > budget) break;
    results.push(payload);
    used += size;
  }

  return results;
}

/**
 * hmmErrorRisk — scalar 0–1 from error labels, for use as a ranking feature.
 * Each label contributes equally; capped at 1.
 */
export function hmmErrorRisk(labels: HmmErrorClass[]): number {
  return Math.min(labels.length * 0.25, 1);
}