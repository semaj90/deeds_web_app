/**
 * Atlas types — single source of truth for the YoRHa Knowledge Atlas
 * shape consumed by the ACE skill, Gemma4 agent, and prompt engineering
 * layer.
 *
 * Built by scripts/build-atlas-index.mjs from:
 *   - codebase_chunk_index           (cluster, PR, community)
 *   - code_retrieval_chunks          (topo_class, topo_byte)
 *   - qdrant_cluster_members         (cluster_key)
 *   - chunk_hit_log                  (demand signal)
 *   - agent_context_files            (AGENTS.md envelope per dir)
 *
 * Mirrored to Redis ace:atlas:latest (24h TTL).
 *
 * Schema-first: this Zod model is the runtime validator and the source for
 *   - generated TypeScript types (AtlasIndex, AtlasFile)
 *   - the proto contract (via scripts/proto-from-zod.mjs when needed)
 *   - the column-oriented row tuple format used by the JSON output
 *
 * Per the schema-consolidation rule (CLAUDE.md): Zod first, JSONB second,
 * proto only when cross-language consumers appear, gRPC only when MCP/HTTP
 * is too slow.
 */

import { z } from 'zod';

// ── Column-oriented row tuple (matches scripts/build-atlas-index.mjs) ────────
//
// Index    Field        Meaning
//   0      f            relative file path
//   1      tc           topo_class               (api-route, ui-component, …)
//   2      tb           topo_byte                (bit-flag variant within class)
//   3      c            cluster_key              (gpu:N | dir:path | general)
//   4      pr           graphPageRank            ([0,1] normalised)
//   5      ga           graphAuthorityScore      ([0,1])
//   6      h            chunk_hit_log hits       (count over hours_window)
//   7      rs           avg rerank_score         ([0,1] from chunk_hit_log)
//   8      a            nearest AGENTS.md dir
//   9      rules        envelope.rules count
//   10     tools        envelope.tools count
//   11     tags         envelope.qdrant_tags count

export const atlasRowSchema = z.tuple([
  z.string(),                                         // f
  z.string(),                                         // tc
  z.number().int().nullable(),                        // tb
  z.string(),                                         // c
  z.number().min(0).max(1),                           // pr
  z.number().min(0).max(1),                           // ga
  z.number().int().nonnegative(),                     // h
  z.number().min(0).max(1),                           // rs
  z.string(),                                         // a
  z.number().int().nonnegative(),                     // rules
  z.number().int().nonnegative(),                     // tools
  z.number().int().nonnegative(),                     // tags
]);
export type AtlasRow = z.infer<typeof atlasRowSchema>;

// ── Object form (decoded from row tuple) ─────────────────────────────────────

export const atlasFileSchema = z.object({
  f:     z.string(),
  tc:    z.string(),
  tb:    z.number().int().nullable(),
  c:     z.string(),
  pr:    z.number().min(0).max(1),
  ga:    z.number().min(0).max(1),
  h:     z.number().int().nonnegative(),
  rs:    z.number().min(0).max(1),
  a:     z.string(),
  rules: z.number().int().nonnegative(),
  tools: z.number().int().nonnegative(),
  tags:  z.number().int().nonnegative(),
});
export type AtlasFile = z.infer<typeof atlasFileSchema>;

// ── Top-level index ──────────────────────────────────────────────────────────

export const atlasStatsSchema = z.object({
  files:          z.number().int().nonnegative(),
  clusters:       z.number().int().nonnegative(),
  topo_classes:   z.number().int().nonnegative(),
  agents_dirs:    z.number().int().nonnegative(),
  with_authority: z.number().int().nonnegative(),
  with_hits:      z.number().int().nonnegative(),
  build_ms:       z.number().int().nonnegative(),
});
export type AtlasStats = z.infer<typeof atlasStatsSchema>;

export const atlasIndexSchema = z.object({
  v:            z.literal(1),
  generated_at: z.string(),
  hours_window: z.number().int().positive(),
  schema:       z.array(z.string()),                              // ['f','tc','tb', …]
  files:        z.array(atlasRowSchema),
  indices:      z.object({
    by_cluster:    z.record(z.string(), z.array(z.number().int())),
    by_topo_class: z.record(z.string(), z.array(z.number().int())),
    by_agents_dir: z.record(z.string(), z.array(z.number().int())),
  }),
  stats:        atlasStatsSchema,
});
export type AtlasIndex = z.infer<typeof atlasIndexSchema>;

// ── Decode helpers ───────────────────────────────────────────────────────────

/** Convert a column-oriented row tuple into a named object. */
export function rowToFile(row: AtlasRow, schema: readonly string[]): AtlasFile {
  // Trust the schema order matches our type — validated by atlasIndexSchema
  // upstream. Direct positional decode is ~10× faster than Object.fromEntries.
  return {
    f:     row[0],
    tc:    row[1],
    tb:    row[2],
    c:     row[3],
    pr:    row[4],
    ga:    row[5],
    h:     row[6],
    rs:    row[7],
    a:     row[8],
    rules: row[9],
    tools: row[10],
    tags:  row[11],
  };
}

/** O(1) cluster → file rows lookup (post-decode). */
export function filesInCluster(atlas: AtlasIndex, clusterKey: string): AtlasFile[] {
  const idxs = atlas.indices.by_cluster[clusterKey] ?? [];
  return idxs.map(i => rowToFile(atlas.files[i], atlas.schema));
}

/** O(1) topo_class → file rows lookup. */
export function filesInTopoClass(atlas: AtlasIndex, topoClass: string): AtlasFile[] {
  const idxs = atlas.indices.by_topo_class[topoClass] ?? [];
  return idxs.map(i => rowToFile(atlas.files[i], atlas.schema));
}

/** O(1) AGENTS.md directory → file rows lookup. */
export function filesUnderAgents(atlas: AtlasIndex, dir: string): AtlasFile[] {
  const idxs = atlas.indices.by_agents_dir[dir] ?? [];
  return idxs.map(i => rowToFile(atlas.files[i], atlas.schema));
}

// ── Prompt-engineering scoring ───────────────────────────────────────────────
//
// rank = 0.25 × graphAuthorityScore
//      + 0.20 × retrievalHitFrequency
//      + 0.20 × recentChangeWeight
//      + 0.15 × auditRisk
//      + 0.10 × clusterRisk
//      + 0.10 × semanticRelevance
//
// (matches the formula in next_steps/active/2026-05-08_topology-notebook-glossary.md)

export interface PromptScoreInputs {
  /** External signals the atlas does not store inline. */
  recentChangeWeight?: number;  // 0..1 from `git diff`
  auditRisk?:          number;  // 0..1 from gate violations
  clusterRisk?:        number;  // 0..1 from cluster_risk_cards
  semanticRelevance?:  number;  // 0..1 from query embedding × file embedding
}

/**
 * Atlas-aware prompt rank for a single file. External weights are optional;
 * pure-atlas score uses only what's in the row.
 */
export function promptRank(file: AtlasFile, ext: PromptScoreInputs = {}): number {
  const hits1     = Math.min(1, file.h / 10);                 // normalise hits to [0,1]
  const recency   = ext.recentChangeWeight ?? 0;
  const audit     = ext.auditRisk          ?? 0;
  const cluster   = ext.clusterRisk        ?? 0;
  const semantic  = ext.semanticRelevance  ?? 0;
  return (
    0.25 * file.ga +
    0.20 * hits1 +
    0.20 * recency +
    0.15 * audit +
    0.10 * cluster +
    0.10 * semantic
  );
}
