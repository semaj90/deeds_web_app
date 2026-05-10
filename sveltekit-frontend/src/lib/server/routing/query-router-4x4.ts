/**
 * query-router-4x4.ts
 *
 * 4×4 tensor routing matrix for multi-query API dispatch.
 *
 * Concept: represent each query as a 4D signal vector, multiply by a 4×4
 * learned weight matrix to get routing weights across 4 execution backends.
 *
 * Signal vector (rows):
 *   S[0] = semantic density  (0..1, high = dense concept query)
 *   S[1] = lexical density   (0..1, high = exact term match needed)
 *   S[2] = graph density     (0..1, high = "depends on / connected to" query)
 *   S[3] = trust pressure    (0..1, high = security-sensitive, needs T1 source)
 *
 * Backend vector (cols):
 *   B[0] = Qdrant ANN (dense + sparse hybrid)
 *   B[1] = Postgres FTS (ts_rank, BM25 approx)
 *   B[2] = Neo4j GDS (PageRank + Louvain + KNN)
 *   B[3] = MCP tool call (Gemma4 agent with web_search + graph tools)
 *
 * Weight = softmax(M · S) — each backend gets a probability share.
 * Parallel dispatch to backends weighted above threshold (default 0.15).
 * Results fused via RRF (Reciprocal Rank Fusion) weighted by routing share.
 *
 * The matrix M starts as a tuned prior (below) and can be adapted via
 * gradient-free Karpathy blend: read hit rates from chunk_hit_log, update M
 * toward backends that produced high-reward chunks.
 */

import type { LaneId } from '../ace/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuerySignal {
  semantic: number;    // [0..1]
  lexical: number;     // [0..1]
  graph: number;       // [0..1]
  trustPressure: number; // [0..1]
}

export interface RoutingWeights {
  qdrant: number;      // [0..1]
  postgres: number;    // [0..1]
  neo4j: number;       // [0..1]
  mcp: number;         // [0..1]
}

export interface RouterResult {
  weights: RoutingWeights;
  dispatch: Array<'qdrant' | 'postgres' | 'neo4j' | 'mcp'>;
  signalVector: [number, number, number, number];
  rawScores: [number, number, number, number];
}

// ── Default 4×4 weight matrix M (row = backend, col = signal) ─────────────────
// Tuned prior from empirical hit rates in chunk_hit_log:
//   - Dense semantic queries → Qdrant wins  (0.8)
//   - Lexical queries → Postgres wins       (0.7)
//   - Graph traversal → Neo4j wins          (0.9)
//   - Trust-sensitive → MCP + Qdrant        (0.6 / 0.5)
//
// Format: M[backend][signal] — row-major Float32Array
const DEFAULT_MATRIX: [number, number, number, number][] = [
  // sem   lex   graph  trust
  [0.80, 0.30, 0.20, 0.50],  // Qdrant
  [0.25, 0.70, 0.10, 0.20],  // Postgres
  [0.15, 0.10, 0.90, 0.10],  // Neo4j
  [0.35, 0.20, 0.40, 0.60],  // MCP
];

// ── Math helpers ──────────────────────────────────────────────────────────────

function matVecMul(M: [number, number, number, number][], v: [number, number, number, number]): [number, number, number, number] {
  return M.map(row => row.reduce((s, w, i) => s + w * v[i], 0)) as [number, number, number, number];
}

function softmax(v: [number, number, number, number]): [number, number, number, number] {
  const max = Math.max(...v);
  const exps = v.map(x => Math.exp(x - max));
  const sum  = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum) as [number, number, number, number];
}

// ── Signal extraction from query text + context ───────────────────────────────

const GRAPH_KEYWORDS = /\b(depends|imports|exports|calls|uses|implements|extends|connected|path|between|from|to|neighbor|adjacent|cluster|related)\b/i;
const LEXICAL_KEYWORDS = /[A-Z]{2,}|\b[a-z]+[A-Z]|\b\d{4}\b|"[^"]{3,}"|'[^']{3,}'|`[^`]{3,}`|\bU\.S\.C\b|\bCFR\b|§/;
const TRUST_KEYWORDS   = /\b(auth|secret|token|key|password|credential|admin|root|privilege|inject|execute|drop|delete|rm\s+-rf)\b/i;

export function extractSignal(query: string, context?: { hasFilePath?: boolean; laneHints?: LaneId[] }): QuerySignal {
  const lower = query.toLowerCase();
  const words = lower.split(/\s+/).length;

  // Semantic: longer, conceptual queries with few exact terms
  const semantic = Math.min(1, (words / 15) * (LEXICAL_KEYWORDS.test(query) ? 0.5 : 1.0));

  // Lexical: exact symbols, quoted phrases, legal citations
  const lexicalMatches = (query.match(LEXICAL_KEYWORDS) ?? []).length;
  const lexical = Math.min(1, lexicalMatches / 3);

  // Graph: structural relationship words
  const graphMatches = (query.match(new RegExp(GRAPH_KEYWORDS.source, 'gi')) ?? []).length;
  const graph = Math.min(1, graphMatches / 2 + (context?.hasFilePath ? 0.3 : 0));

  // Trust pressure: security-sensitive terms → prefer T1 MCP tools
  const trustMatches = (query.match(new RegExp(TRUST_KEYWORDS.source, 'gi')) ?? []).length;
  const trustPressure = Math.min(1, trustMatches / 2);

  return { semantic, lexical, graph, trustPressure };
}

// ── Main router ───────────────────────────────────────────────────────────────

export class QueryRouter4x4 {
  private matrix: [number, number, number, number][];
  private threshold: number;

  constructor(opts?: { matrix?: [number, number, number, number][]; threshold?: number }) {
    this.matrix    = opts?.matrix ?? DEFAULT_MATRIX;
    this.threshold = opts?.threshold ?? 0.15;
  }

  route(signal: QuerySignal): RouterResult {
    const v: [number, number, number, number] = [
      signal.semantic,
      signal.lexical,
      signal.graph,
      signal.trustPressure,
    ];

    const rawScores = matVecMul(this.matrix, v);
    const weights   = softmax(rawScores);
    const [q, p, n, m] = weights;

    const named: RoutingWeights = { qdrant: q, postgres: p, neo4j: n, mcp: m };

    const dispatch = (
      ['qdrant', 'postgres', 'neo4j', 'mcp'] as const
    ).filter((_, i) => weights[i] >= this.threshold);

    return { weights: named, dispatch, signalVector: v, rawScores };
  }

  /** Adapt matrix toward backends that produced high-reward chunks (gradient-free) */
  adapt(signal: QuerySignal, reward: { qdrant: number; postgres: number; neo4j: number; mcp: number }, lr = 0.01) {
    const v: [number, number, number, number] = [signal.semantic, signal.lexical, signal.graph, signal.trustPressure];
    const rewards = [reward.qdrant, reward.postgres, reward.neo4j, reward.mcp];
    // Hebbian-style: M[i][j] += lr * reward[i] * signal[j]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        this.matrix[i][j] = Math.max(0, Math.min(1,
          this.matrix[i][j] + lr * rewards[i] * v[j]
        ));
      }
    }
  }

  /** Serialize matrix for Redis storage */
  serialize(): string {
    return JSON.stringify(this.matrix);
  }

  static deserialize(json: string): QueryRouter4x4 {
    return new QueryRouter4x4({ matrix: JSON.parse(json) });
  }
}

// ── RRF fusion of multi-backend results ───────────────────────────────────────

export interface ScoredResult {
  id: string;
  score: number;
  source: 'qdrant' | 'postgres' | 'neo4j' | 'mcp';
}

/** Reciprocal Rank Fusion weighted by routing share */
export function rrfFuse(
  results: ScoredResult[],
  weights: RoutingWeights,
  k = 60,
): ScoredResult[] {
  const scores = new Map<string, number>();

  // Group by source, sort by score descending, apply RRF
  const bySource: Record<string, ScoredResult[]> = { qdrant: [], postgres: [], neo4j: [], mcp: [] };
  for (const r of results) bySource[r.source].push(r);
  for (const src of Object.keys(bySource) as Array<keyof typeof bySource>) {
    bySource[src].sort((a, b) => b.score - a.score);
    bySource[src].forEach((r, rank) => {
      const w = weights[src as keyof RoutingWeights];
      const rrf = w * (1 / (k + rank + 1));
      scores.set(r.id, (scores.get(r.id) ?? 0) + rrf);
    });
  }

  // Deduplicate and return ranked
  const seen = new Set<string>();
  return results
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .map(r => ({ ...r, score: scores.get(r.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
