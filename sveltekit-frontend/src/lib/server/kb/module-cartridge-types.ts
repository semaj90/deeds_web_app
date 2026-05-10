/**
 * module-cartridge-types.ts
 *
 * Shared type contracts for the module-cartridge symbolic index.
 * No external dependencies — pure TypeScript interfaces.
 */

// ── Cartridge kind ────────────────────────────────────────────────────────────

export type CartridgeKind =
  | 'component'   // src/lib/components/
  | 'server'      // src/lib/server/ (non-schema)
  | 'route'       // src/routes/(app)/ page routes
  | 'api'         // src/routes/api/ endpoints
  | 'store'       // src/lib/stores/
  | 'schema'      // src/lib/server/db/schema*
  | 'mcp'         // src/mcp/
  | 'script'      // scripts/
  | 'test'        // tests/
  | 'lib';        // src/lib/ (everything else)

// ── Import reference ──────────────────────────────────────────────────────────

export interface ImportRef {
  module: string;
  names:  string[];
  isType: boolean;
}

// ── Full cartridge ────────────────────────────────────────────────────────────

export interface ModuleCartridge {
  /** Stable identifier — relative path from sveltekit-frontend root */
  stable_key:  string;
  kind:        CartridgeKind;
  /** Same as stable_key; kept separate for future divergence */
  path:        string;
  exports:     string[];
  imports:     ImportRef[];
  /** SvelteKit route paths served by this file */
  routes:      string[];
  /** Drizzle table names imported from schema-postgres */
  tables:      string[];
  /** MCP tool names registered via server.tool() */
  mcp_tools:   string[];
  /** Semantic tags for retrieval (max 16) */
  tags:        string[];
  /** Karpathy blend score from Redis gpu:karpathy:scores (24h TTL) */
  pagerank?:   number;
  /** SOM grid position from codebase-graph.json or Qdrant payload */
  som_row?:    number;
  som_col?:    number;
  /** 4D manifold coords [som_x, som_y, semantic_z, grpo_w] */
  manifold4?:  [number, number, number, number];
  /** Short description from JSDoc or Redis wiki note */
  summary?:    string;
  /** SHA-256 prefix (16 hex chars) for change detection */
  source_hash: string;
  generated_at: string;
}

// ── Minified entry (compact representation for context packs) ─────────────────

export interface CartridgeMinEntry {
  p:    string;    // path (= stable_key)
  t:    string;    // kind
  e:    string[];  // exports (max 20)
  tg:   string[];  // tags
  pr?:  number;    // pagerank blend (3 decimal places)
  h:    string;    // source_hash prefix (12 hex chars)
}

// ── Index (fast key → metadata lookup) ───────────────────────────────────────

export interface CartridgeIndex {
  version:      string;
  generated_at: string;
  count:        number;
  /** stable_key → { kind, source_hash } */
  entries:      Record<string, { kind: CartridgeKind; source_hash: string }>;
}

// ── Rerank weights ────────────────────────────────────────────────────────────

export interface RerankWeights {
  /** Neo4j PageRank / Karpathy blend contribution */
  pagerank:        number;
  /** Semantic vector similarity (Qdrant cosine) */
  semantic:        number;
  /** Tag overlap between query and cartridge */
  tag_match:       number;
  /** Export name overlap (exact symbol lookup) */
  export_match:    number;
  /** Inverse graph hop distance from entry point */
  route_proximity: number;
  /** SOM grid distance boost (nearby = related) */
  som_boost:       number;
  /** File recency (days since last modified) */
  recency:         number;
}

// ── Candidate features (inputs to scoreCandidate) ────────────────────────────

export interface CandidateFeatures {
  /** Raw pagerank / blend score from Redis (0–10+) */
  pagerank?:           number;
  /** Cosine similarity from Qdrant (0–1) */
  semantic_score?:     number;
  /** Count of query tags matching cartridge.tags */
  tag_matches?:        number;
  /** Count of query symbols matching cartridge.exports */
  export_matches?:     number;
  /** Graph hop distance from active route (0 = same file) */
  route_proximity?:    number;
  /** Euclidean distance in SOM grid (0 = same cell) */
  som_distance?:       number;
  /** Days since file was last modified (0 = today) */
  days_since_modified?: number;
}
