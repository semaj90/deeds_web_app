import pg from 'pg';
import { ENV } from '$lib/server/env.server.js';
import type {
  Hyperedge,
  HyperedgeMember,
  HyperedgeTopology,
  HyperedgeSearchParams,
  HyperedgeSearchResponse,
  HyperedgeSearchResult,
  HyperedgeScoreBreakdown,
  HyperedgeCard,
  HyperedgeActivation,
  HyperedgeExpansion,
} from './hypergraph-types.js';

const DB_URL = ENV.DATABASE_URL;

let _pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!_pool) _pool = new pg.Pool({ connectionString: DB_URL, max: 3 });
  return _pool;
}

// ── member hydration ──────────────────────────────────────────────────────────

async function fetchMembers(edgeIds: string[]): Promise<Map<string, HyperedgeMember[]>> {
  if (!edgeIds.length) return new Map();
  const { rows } = await getPool().query<{
    edge_id: string; id: number; member_kind: string;
    member_key: string; role: string | null; score: number | null;
    payload: Record<string, unknown> | null;
  }>(
    `SELECT edge_id, id, member_kind, member_key, role, score, payload
     FROM hypergraph_edge_members
     WHERE edge_id = ANY($1::uuid[])`,
    [edgeIds]
  ).catch(() => ({ rows: [] as typeof rows }));

  const map = new Map<string, HyperedgeMember[]>();
  for (const r of rows) {
    const list = map.get(r.edge_id) ?? [];
    list.push({
      id: r.id, edge_id: r.edge_id,
      member_kind: r.member_kind as HyperedgeMember['member_kind'],
      member_key: r.member_key,
      role: (r.role ?? undefined) as HyperedgeMember['role'],
      score: r.score ?? undefined,
      payload: r.payload ?? undefined,
    });
    map.set(r.edge_id, list);
  }
  return map;
}

function rowToEdge(r: Record<string, unknown>, members: HyperedgeMember[]): Hyperedge {
  return {
    id:         String(r.id ?? ''),
    edge_type:  (r.edge_type as Hyperedge['edge_type']) ?? 'retrieval',
    label:      r.label != null ? String(r.label) : null,
    query_hash: r.query_hash != null ? String(r.query_hash) : null,
    run_id:     r.run_id != null ? String(r.run_id) : null,
    weight:     Number(r.weight ?? 1.0),
    topology:   (r.topology as HyperedgeTopology | null) ?? null,
    metadata:   (r.metadata as Record<string, unknown>) ?? null,
    created_at: String(r.created_at ?? ''),
    members,
  };
}

// ── GraphSearch-inspired hybrid scoring ───────────────────────────────────────
//
// Base formula (no embedding vectors available):
//   final = memberCoverage×0.50 + weight×0.20 + roleWeight + topology + lexical + graphAuthority
//
// When anchor_similarity / query_similarity are populated (R/F traversal with embeddings):
//   final = memberCoverage×0.40 + query_sim×0.25 + anchor_sim×0.20 + roleWeight×0.10 + rest×0.05
//
// Empty members: final = weight × 0.20 (no coverage possible)

export function computeScoreBreakdown(
  edge: Hyperedge,
  matchedKeys: Set<string>,
  params: HyperedgeSearchParams,
  anchorSimilarity?: number,
  querySimilarity?: number,
): HyperedgeScoreBreakdown {
  const memberCount    = edge.members.length;
  const memberCoverage = memberCount ? matchedKeys.size / memberCount : 0;

  const roleWeight = edge.members.reduce((acc, m) => {
    if (!matchedKeys.has(m.member_key)) return acc;
    return acc + (m.role === 'source' || m.role === 'result' ? 0.08 : 0.02);
  }, 0);

  const graphAuthority = (edge.topology?.graphAuthorityScore ?? 0) * 0.05;
  const topologyBonus  = edge.topology?.glyph_cluster ? 0.03 : 0;
  const lexical        = params.member_key ? 0.04 : 0;

  let final: number;
  if (anchorSimilarity !== undefined || querySimilarity !== undefined) {
    // GraphSearch hybrid mode
    final = Math.min(1.0,
      memberCoverage    * 0.40 +
      (querySimilarity  ?? 0)  * 0.25 +
      (anchorSimilarity ?? 0)  * 0.20 +
      roleWeight        * 0.10 +
      (graphAuthority + topologyBonus + lexical) * 0.05
    );
  } else {
    final = Math.min(1.0,
      memberCoverage * 0.50 +
      edge.weight    * 0.20 +
      roleWeight              +
      graphAuthority          +
      topologyBonus           +
      lexical
    );
  }

  return {
    memberCoverage,
    query_similarity:  querySimilarity,
    anchor_similarity: anchorSimilarity,
    roleWeight,
    graphAuthority,
    topology: topologyBonus,
    lexical,
    final,
  };
}

function buildWhySelected(
  edge: Hyperedge,
  matchedKeys: Set<string>,
  params: HyperedgeSearchParams,
  breakdown: HyperedgeScoreBreakdown,
): string[] {
  const reasons: string[] = [];
  const mode = params.search_mode ?? 'global';
  if (mode !== 'global') reasons.push(`search_mode: ${mode}`);
  if (params.anchor_key)  reasons.push(`anchor: ${params.anchor_key}`);
  if (params.member_key)  reasons.push(`member_key matched: ${params.member_key}`);
  if (params.member_kind) reasons.push(`member_kind: ${params.member_kind}`);
  if (params.query_hash)  reasons.push(`query_hash matched`);
  if (matchedKeys.size)   reasons.push(`${matchedKeys.size}/${edge.members.length} members matched`);
  if (breakdown.anchor_similarity !== undefined) reasons.push(`anchor_sim: ${breakdown.anchor_similarity.toFixed(3)}`);
  if (breakdown.query_similarity !== undefined)  reasons.push(`query_sim: ${breakdown.query_similarity.toFixed(3)}`);
  if (edge.topology?.glyph_cluster) reasons.push(`glyph_cluster: ${edge.topology.glyph_cluster}`);
  return reasons;
}

function buildCard(edge: Hyperedge): HyperedgeCard {
  return {
    edge_id:    edge.id,
    summary128: (edge.label ?? edge.edge_type).slice(0, 128),
    memberKeys: edge.members.slice(0, 8).map(m => m.member_key),
    tags: [
      edge.edge_type,
      ...(edge.topology?.topo_class    ? [edge.topology.topo_class]    : []),
      ...(edge.topology?.glyph_cluster ? [edge.topology.glyph_cluster] : []),
    ],
    topology: edge.topology ?? undefined,
  };
}

// ── public API ────────────────────────────────────────────────────────────────

export async function searchHyperedges(params: HyperedgeSearchParams): Promise<HyperedgeSearchResponse> {
  const t0     = Date.now();
  const limit  = Math.min(params.limit ?? 10, 50);
  const offset = params.offset ?? 0;
  const pool   = getPool();

  const conditions: string[] = [];
  const bindings: unknown[]  = [];

  if (params.edge_type) {
    bindings.push(params.edge_type);
    conditions.push(`he.edge_type = $${bindings.length}`);
  }
  if (params.run_id) {
    bindings.push(params.run_id);
    conditions.push(`he.run_id = $${bindings.length}::uuid`);
  }
  if (params.query_hash) {
    bindings.push(params.query_hash);
    conditions.push(`he.query_hash = $${bindings.length}`);
  }

  let memberJoin = '';
  if (params.member_key || params.member_kind || params.anchor_key) {
    memberJoin = 'JOIN hypergraph_edge_members hem ON hem.edge_id = he.id';
    // anchor_key treated as a member_key to find edges containing the anchor
    const keyFilter = params.anchor_key ?? params.member_key;
    if (keyFilter) {
      // Path-shaped values (containing '/' or '.') get an exact match — used
      // by code that already knows the full member_key (e.g. file path).
      // Free-text tokens (no path separator) get ILIKE '%token%' so the API's
      // documented "Free-text search maps to member_key ILIKE" contract holds
      // — without this fork, `?query=redis` would never match
      // `src/lib/server/redis.ts` because exact equality fails.
      const isPath = /[/.]/.test(keyFilter);
      bindings.push(isPath ? keyFilter : `%${keyFilter}%`);
      conditions.push(`hem.member_key ${isPath ? '=' : 'ILIKE'} $${bindings.length}`);
    }
    if (params.member_kind) {
      bindings.push(params.member_kind);
      conditions.push(`hem.member_kind = $${bindings.length}`);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  bindings.push(limit, offset);

  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT DISTINCT he.id, he.edge_type, he.label, he.query_hash, he.run_id,
            he.weight, he.topology, he.metadata, he.created_at
     FROM hypergraph_edges he
     ${memberJoin}
     ${where}
     ORDER BY he.created_at DESC
     LIMIT $${bindings.length - 1} OFFSET $${bindings.length}`,
    bindings
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  const memberMap = await fetchMembers(rows.map(r => String(r.id)));

  const results: HyperedgeSearchResult[] = rows.map((r, i) => {
    const members = memberMap.get(String(r.id)) ?? [];
    const edge    = rowToEdge(r, members);
    const matchedKeys = new Set(
      members.filter(m =>
        ((params.anchor_key ?? params.member_key) && m.member_key === (params.anchor_key ?? params.member_key)) ||
        (params.member_kind && m.member_kind === params.member_kind)
      ).map(m => m.member_key)
    );
    const scoreBreakdown = computeScoreBreakdown(edge, matchedKeys, params);
    return {
      edge,
      activationScore: scoreBreakdown.final,
      scoreBreakdown,
      matchedMembers:  [...matchedKeys],
      rankPosition:    offset + i + 1,
      whySelected:     buildWhySelected(edge, matchedKeys, params, scoreBreakdown),
      card:            buildCard(edge),
    };
  });

  return { results, totalMatched: results.length, durationMs: Date.now() - t0 };
}

export async function getHyperedgeById(edgeId: string): Promise<Hyperedge | null> {
  const { rows } = await getPool().query<Record<string, unknown>>(
    `SELECT id, edge_type, label, query_hash, run_id, weight, topology, metadata, created_at
     FROM hypergraph_edges WHERE id = $1 LIMIT 1`,
    [edgeId]
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  if (!rows[0]) return null;
  const memberMap = await fetchMembers([edgeId]);
  return rowToEdge(rows[0], memberMap.get(edgeId) ?? []);
}

export async function explainEdgeActivation(
  edgeId: string,
  queryTerms: string[],
): Promise<HyperedgeActivation> {
  const edge = await getHyperedgeById(edgeId);
  if (!edge) return { edge: null, activatedByTerms: [], membersCovered: 0, coverageRatio: 0 };

  const terms = queryTerms.map(t => t.toLowerCase());
  const activatedByTerms = terms.filter(t =>
    edge.members.some(m => m.member_key.toLowerCase().includes(t)) ||
    (edge.label ?? '').toLowerCase().includes(t) ||
    JSON.stringify(edge.metadata ?? {}).toLowerCase().includes(t)
  );
  const membersCovered = edge.members.filter(m =>
    terms.some(t => m.member_key.toLowerCase().includes(t))
  ).length;

  return {
    edge,
    activatedByTerms,
    membersCovered,
    coverageRatio: edge.members.length ? membersCovered / edge.members.length : 0,
  };
}

export async function expandEdgeMembers(edgeId: string): Promise<HyperedgeExpansion> {
  const edge = await getHyperedgeById(edgeId);
  if (!edge) return { edge: null, relatedEdges: [] };
  if (!edge.members.length) return { edge, relatedEdges: [] };

  const memberKeys = edge.members.map(m => m.member_key);
  const { rows } = await getPool().query<Record<string, unknown>>(
    `SELECT DISTINCT he.id, he.edge_type, he.label, he.query_hash, he.run_id,
            he.weight, he.topology, he.metadata, he.created_at
     FROM hypergraph_edges he
     JOIN hypergraph_edge_members hem ON hem.edge_id = he.id
     WHERE hem.member_key = ANY($1::text[])
       AND he.id != $2::uuid
     ORDER BY he.created_at DESC
     LIMIT 10`,
    [memberKeys, edgeId]
  ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

  return { edge, relatedEdges: rows.map(r => rowToEdge(r, [])) };
}