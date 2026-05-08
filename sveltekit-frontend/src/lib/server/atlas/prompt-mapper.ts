/**
 * prompt-mapper — turns atlas signals + KAG cache hits into a compact
 * "context packet" the prompt-engineering layer hands to Gemma4 / Claude.
 *
 * Composition order (cheapest → most expensive):
 *   1. Atlas O(1) lookups (by_cluster / by_topo_class / by_agents_dir)
 *   2. Redis Karpathy GPU blend (already-computed authority + attn)
 *   3. Redis ace:authority:top (graph-only authority)
 *   4. Per-file rerank via promptRank() with optional external signals
 *
 * NEVER calls Qdrant / embedding here — that's the upstream retrieval
 * layer's job. This module assumes the candidate file list is already
 * narrowed and just needs scoring + ordering for the prompt.
 */

import { type AtlasFile, rowToFile, promptRank, type PromptScoreInputs } from './types.js';
import { loadAtlas } from './atlas-loader.js';

// ── Helpers: path aliasing + Karpathy blend normalization ────────────────────
//
// Path aliases — Karpathy / authority writers use different prefix conventions:
//   karpathy:gpu       → 'src/lib/server/db/client.ts' (Neo4j CodebaseFile.filePath)
//   ace:authority:top  → 'lib/server/db/client.ts'      (code_relations.source_file)
// Try every plausible form so one writer's keys still match the other writer's
// keys. Without this, Karpathy scores miss for any file whose atlas form is
// the non-src/-prefixed shape.
function pathAliases(path: string): string[] {
  const p       = path.replace(/\\/g, '/').replace(/^\.?\//, '');
  const noSrc   = p.replace(/^src\//, '');
  const withSrc = p.startsWith('src/') ? p : `src/${p}`;
  return Array.from(new Set([p, noSrc, withSrc]));
}

function lookupByPath<T>(map: Record<string, T> | undefined, path: string): T | undefined {
  if (!map) return undefined;
  for (const key of pathAliases(path)) {
    const value = map[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

// Karpathy `blend` field is the fused (PR + attention + authority) score from
// karpathy:gpu — observed range ~0..3.5 (e.g. db/client.ts = 3.29). Without
// normalization, anything ≥ 2.5 saturates Math.min(1, baseRank*0.6 + blend*0.4)
// at 1.0, collapsing the top of the ranking. Clamp to [0,1] preserving order.
const KARPATHY_BLEND_RANGE = 3.5;
function normalizeKarpathyBlend(value: number): number {
  return Math.max(0, Math.min(1, value / KARPATHY_BLEND_RANGE));
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface PromptCard {
  /** Stable file path. */
  filePath:    string;
  /** Topo class label — drives section-aware tiling. */
  topoClass:   string;
  /** GPU/dir cluster key — drives community grouping. */
  clusterKey:  string;
  /** Nearest AGENTS.md directory — for walk-up rule resolution. */
  agentsDir:   string;
  /** Composed rank score (0..1). */
  rank:        number;
  /** Reason strings for prompt provenance. */
  reasons:     string[];
}

export interface ContextPacketOptions {
  /** Cap on returned cards. Default 12 (matches default LLM context budget of ~12k tokens). */
  topN?: number;
  /** Optional per-file score overlays (recency, audit risk, etc.). */
  ext?: Record<string, PromptScoreInputs>;
  /** Restrict candidates to a specific axis. */
  filter?: {
    cluster?:    string;
    topoClass?:  string;
    agentsDir?:  string;
  };
}

// ── Builders ─────────────────────────────────────────────────────────────────

/**
 * Rank every atlas file (or the filtered subset) and return the top-N
 * as PromptCards. This is the single function the prompt layer calls.
 */
export async function buildPromptCards(opts: ContextPacketOptions = {}): Promise<PromptCard[]> {
  const { atlas, neighbours } = await loadAtlas();
  const { topN = 12, ext = {}, filter = {} } = opts;

  // ── Pick candidate row indices (axis-filtered or all) ─────────────────────
  let candidateIdx: number[];
  if (filter.cluster) {
    candidateIdx = atlas.indices.by_cluster[filter.cluster] ?? [];
  } else if (filter.topoClass) {
    candidateIdx = atlas.indices.by_topo_class[filter.topoClass] ?? [];
  } else if (filter.agentsDir) {
    candidateIdx = atlas.indices.by_agents_dir[filter.agentsDir] ?? [];
  } else {
    candidateIdx = atlas.files.map((_, i) => i);
  }

  // ── Decode + score ────────────────────────────────────────────────────────
  const scored: { card: PromptCard; raw: AtlasFile }[] = [];
  for (const idx of candidateIdx) {
    const row  = atlas.files[idx];
    if (!row) continue;
    const file = rowToFile(row, atlas.schema);

    // Karpathy GPU blend overrides graph authority when present (it already
    // bakes in PR + attention + authority). Look up via path aliases so
    // src/-prefixed and non-src/-prefixed atlas forms both find the score.
    const karpathyRaw = lookupByPath(neighbours.karpathy, file.f);
    let karpathyBlend: number | null = null;
    if (karpathyRaw) {
      try {
        const k = typeof karpathyRaw === 'string' ? JSON.parse(karpathyRaw) : karpathyRaw;
        karpathyBlend = typeof k.blend === 'number' ? k.blend : null;
      } catch { /* leave null */ }
    }

    // External overlays (recency, audit risk) — same path-alias lookup so
    // the atlas's canonical path matches whatever shape the caller passes.
    const extSignals = lookupByPath(ext, file.f);

    const baseRank = promptRank(file, extSignals);
    const kNorm = karpathyBlend != null ? normalizeKarpathyBlend(karpathyBlend) : null;
    const finalRank = kNorm != null
      ? Math.min(1, baseRank * 0.6 + kNorm * 0.4)
      : baseRank;

    const reasons: string[] = [];
    if (file.ga > 0)                     reasons.push(`authority=${file.ga.toFixed(2)}`);
    if (file.h > 0)                      reasons.push(`hits=${file.h}`);
    if (karpathyBlend != null)           reasons.push(`gpu_blend=${karpathyBlend.toFixed(2)}`);
    if (file.rules + file.tools > 0)     reasons.push(`agents=${file.rules}r/${file.tools}t`);
    if (extSignals?.recentChangeWeight)  reasons.push(`recent`);
    if (extSignals?.auditRisk)           reasons.push(`audit-risk`);

    scored.push({
      card: {
        filePath:    file.f,
        topoClass:   file.tc,
        clusterKey:  file.c,
        agentsDir:   file.a,
        rank:        finalRank,
        reasons,
      },
      raw: file,
    });
  }

  // Deterministic tie-breakers — without these the prompt re-orders between
  // runs whenever two cards score identically, which breaks cache reuse and
  // makes prompt diffs noisy. Order: rank desc → graph authority desc →
  // hits desc → file path asc.
  scored.sort((a, b) =>
    b.card.rank - a.card.rank ||
    b.raw.ga    - a.raw.ga    ||
    b.raw.h     - a.raw.h     ||
    a.card.filePath.localeCompare(b.card.filePath)
  );
  return scored.slice(0, topN).map(s => s.card);
}

// ── Markdown formatter for the actual LLM prompt ─────────────────────────────

/**
 * Render PromptCards as a compact Markdown block ready to splice into a
 * Gemma4 / Claude system prompt. ≤ ~80 tokens per card; 12 cards ≈ 1k tokens.
 */
export function cardsToPromptBlock(cards: PromptCard[], heading = 'Context cards'): string {
  if (!cards.length) return '';
  const lines = [`## ${heading}`, ''];
  for (const c of cards) {
    const ranked = c.rank.toFixed(3);
    const reason = c.reasons.length ? ` _(${c.reasons.join(', ')})_` : '';
    lines.push(`- \`${c.filePath}\` · rank=${ranked} · topo=\`${c.topoClass}\` · cluster=\`${c.clusterKey}\`${reason}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * One-shot helper: load atlas → build cards → render block.
 * Drop the result into a system prompt verbatim.
 */
export async function buildPromptBlock(opts: ContextPacketOptions = {}, heading?: string): Promise<string> {
  const cards = await buildPromptCards(opts);
  return cardsToPromptBlock(cards, heading);
}