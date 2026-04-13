import { pgRows } from '$lib/server/db/client';
/**
 * Shared KAG (Knowledge-Augmented Generation) module.
 *
 * Provides 1-hop graph traversal on yorha_evidence_connections
 * to enrich RAG results with related evidence nodes.
 * Used by both /api/sse/chat and /api/evidence/search.
 */
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { traceGraph } from '$lib/server/observability/langfuse.js';
import { setCache, getFromMemoryCache } from '$lib/server/cache.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Extract UUID-shaped evidence IDs from a node's file_path (e.g. "evidence/cb4b0a08-2b34-...") */
function extractEvidenceIdsFromPath(filePath: string | null | undefined): string[] {
  if (!filePath) return [];
  const matches = filePath.match(UUID_IN_PATH);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Graph neighbor metadata from yorha_evidence_connections.
 *
 * CRITICAL: `nodeId` is the graph node UUID (yorha_evidence_nodes.id) —
 * this is a DIFFERENT ID space from evidence document UUIDs (evidence.id).
 * When filtering Qdrant, use `buildGraphShouldFilter()` which combines
 * both `nodeId` and `evidenceIds` for correct multi-field matching.
 * NEVER use `nodeId` alone in evidence-scoped Qdrant filters.
 */
export interface GraphNeighbor {
  /** Graph node UUID (yorha_evidence_nodes.id) — NOT an evidence document ID */
  nodeId: string;
  title: string;
  evidenceType: string;
  connectionType: string;
  strength: number;
  confidence: number;
  /** Evidence document IDs resolved from node file_path (for Qdrant filter matching) */
  evidenceIds: string[];
}

/**
 * Pre-retrieval KAG: fetch graph neighbor IDs for a case BEFORE vector search.
 * Returns neighbor node IDs + strengths so the retrieval layer can build
 * Qdrant `should` filters that boost graph-connected documents.
 *
 * Unlike getGraphContext() which needs evidence IDs (post-retrieval),
 * this works with just a caseId, making it usable BEFORE the initial search.
 */
export async function getCaseGraphNeighborIds(caseId: string): Promise<GraphNeighbor[]> {
  if (!caseId || !UUID_PATTERN.test(caseId)) return [];

  return traceGraph('case-graph-neighbors', { caseId }, async () => {
    try {
      const nodeResult = await db.execute(sql`
				SELECT n.id AS node_id, n.title, n.evidence_type
				FROM yorha_evidence_nodes n
				WHERE n.status = 'active' AND n.case_id = ${caseId}
				LIMIT 50
			`);
      const nodeRows = pgRows(nodeResult);
      if (!nodeRows?.length) return [];

      const nodeIds = nodeRows.map((r: any) => r.node_id as string);
      const nodeIdStr = nodeIds.map((id: string) => `'${id.replace(/'/g, "''")}'`).join(',');

      const connResult = await db.execute(sql`
				SELECT DISTINCT ON (neighbor_id)
					neighbor_id, neighbor_title, neighbor_type,
					neighbor_file_path, connection_type, strength, confidence_score
				FROM (
					SELECT tn.id AS neighbor_id, tn.title AS neighbor_title,
						tn.evidence_type AS neighbor_type, tn.file_path AS neighbor_file_path,
						c.connection_type, c.strength, c.confidence_score
					FROM yorha_evidence_connections c
					JOIN yorha_evidence_nodes tn ON tn.id = c.target_node_id
					WHERE c.source_node_id IN (${sql.join(
            nodeIds.map((id: string) => sql`${id}`),
            sql`, `
          )})
					AND c.case_id = ${caseId}
					UNION ALL
					SELECT tn.id AS neighbor_id, tn.title AS neighbor_title,
						tn.evidence_type AS neighbor_type, tn.file_path AS neighbor_file_path,
						c.connection_type, c.strength, c.confidence_score
					FROM yorha_evidence_connections c
					JOIN yorha_evidence_nodes tn ON tn.id = c.source_node_id
					WHERE c.target_node_id IN (${sql.join(
            nodeIds.map((id: string) => sql`${id}`),
            sql`, `
          )})
					AND c.case_id = ${caseId}
				) sub
				ORDER BY neighbor_id, strength DESC, confidence_score DESC
				LIMIT 15
			`);

      const connRows = pgRows(connResult);
      if (!connRows?.length) return [];

      return connRows.map((r: any) => ({
        nodeId: r.neighbor_id,
        title: r.neighbor_title ?? '',
        evidenceType: r.neighbor_type ?? '',
        connectionType: r.connection_type ?? '',
        strength: r.strength ?? 50,
        confidence: r.confidence_score ?? 0,
        evidenceIds: extractEvidenceIdsFromPath(r.neighbor_file_path),
      }));
    } catch (err) {
      console.warn('[KAG Pre-Retrieval] Case graph neighbor fetch failed (non-fatal):', err);
      return [];
    }
  });
}

/**
 * Build a Qdrant `should` filter from graph neighbors.
 * Matches both graph node IDs and resolved evidence document IDs
 * against multiple payload field names so that graph-connected
 * documents get a relevance boost from Qdrant's scoring.
 */
export function buildGraphShouldFilter(
  neighbors: GraphNeighbor[],
  minStrength = 30
): Record<string, unknown> | null {
  const strong = neighbors.filter((n) => n.strength >= minStrength);
  if (!strong.length) return null;

  // Collect both node IDs and evidence IDs for matching
  const allIds = new Set<string>();
  for (const n of strong) {
    allIds.add(n.nodeId);
    for (const eid of n.evidenceIds ?? []) allIds.add(eid);
  }
  const matchIds = [...allIds];

  const idFieldNames = ['document_id', 'evidence_id', 'source_id', 'node_id'];
  return {
    should: idFieldNames.map((key) => ({
      key,
      match: { any: matchIds },
    })),
  };
}

/**
 * Enhanced graph boost reranking that uses both strength AND confidence.
 * Replaces the flat +0.15 boost with authority-weighted scoring:
 *   score = cosine * (1 + authorityWeight * normalizedStrength + confidenceWeight * normalizedConfidence)
 */
export function applyGraphAuthorityScoring(
  docs: Array<{ content: string; similarity: number; documentId: string; sourceId?: string }>,
  neighbors: GraphNeighbor[],
  authorityWeight = 0.2,
  confidenceWeight = 0.1
): Array<{ content: string; similarity: number; documentId: string; sourceId?: string }> {
  if (!neighbors.length || !docs.length) return docs;

  // Map both node IDs and evidence IDs to strength/confidence for matching
  const neighborMap = new Map<string, { strength: number; confidence: number }>();
  for (const n of neighbors) {
    const entry = { strength: n.strength, confidence: n.confidence };
    neighborMap.set(n.nodeId, entry);
    for (const eid of n.evidenceIds ?? []) neighborMap.set(eid, entry);
  }

  const scored = docs.map((d) => {
    const docId = d.sourceId ?? d.documentId;
    const suffix = docId.split(':').pop() ?? '';
    const match = neighborMap.get(suffix) ?? neighborMap.get(docId);
    if (!match) return d;

    const boost =
      1 + authorityWeight * (match.strength / 100) + confidenceWeight * (match.confidence / 100);
    return { ...d, similarity: Math.min(d.similarity * boost, 1.0) };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored;
}

/**
 * Given a set of evidence document IDs (from Qdrant/pgvector hits),
 * traverse the yorha_evidence_connections graph 1 hop to find
 * related evidence. Returns a formatted context string for LLM injection.
 *
 * @param evidenceIds - Array of evidence IDs from search results
 * @param caseId - Optional case ID to scope the graph traversal
 * @returns Formatted context string with related evidence, or null if none found
 */
export async function getGraphContext(
  evidenceIds: string[],
  caseId?: string
): Promise<{ context: string; neighbors: GraphNeighbor[] } | null> {
  if (evidenceIds.length === 0) return null;

  return traceGraph('graph-context', { evidenceCount: evidenceIds.length, caseId }, async () => {
    try {
      // Evidence hits can be a mix of file_path values and UUID node ids.
      // Only compare UUID-shaped values against the uuid column to avoid 22P02 errors.
      const filePathParams = evidenceIds.map((id) => sql`${id}`);
      const uuidIds = evidenceIds.filter((id) => UUID_PATTERN.test(id));
      // Match file_path exactly, node id, OR file_path containing the evidence UUID
      const lookupClauses = [sql`n.file_path IN (${sql.join(filePathParams, sql`, `)})`];
      if (uuidIds.length > 0) {
        const uuidParams = uuidIds.map((id) => sql`${id}`);
        lookupClauses.push(sql`n.id IN (${sql.join(uuidParams, sql`, `)})`);
        // Also match evidence UUIDs embedded within file_path (e.g. "evidence/<uuid>/section")
        const likePatterns = uuidIds.map((id) => sql`n.file_path LIKE ${'%' + id + '%'}`);
        lookupClauses.push(sql`(${sql.join(likePatterns, sql` OR `)})`);
      }
      const evidenceLookupClause =
        lookupClauses.length === 1
          ? lookupClauses[0]
          : sql`(${sql.join(lookupClauses, sql` OR `)})`;
      const caseFilter = caseId ? sql`AND n.case_id = ${caseId}` : sql``;

      const nodeResult = await db.execute(sql`
			SELECT n.id AS node_id, n.title, n.evidence_type, n.file_path
			FROM yorha_evidence_nodes n
			WHERE n.status = 'active'
			${caseFilter}
			AND ${evidenceLookupClause}
		`);

      const nodeRows = pgRows(nodeResult);
      if (!nodeRows || nodeRows.length === 0) return null;

      const nodeIds = nodeRows.map((r: any) => r.node_id as string);
      const nodeIdTuple = sql`(${sql.join(
        nodeIds.map((id: string) => sql`${id}`),
        sql`, `
      )})`;
      const caseConnFilter = caseId ? sql`AND c.case_id = ${caseId}` : sql``;

      // 1-hop graph traversal (bidirectional) — includes file_path for evidence ID resolution
      const connResult = await db.execute(sql`
			(
				SELECT c.connection_type, c.strength, c.confidence_score,
					tn.id AS neighbor_id, tn.title AS neighbor_title,
					tn.evidence_type AS neighbor_type, tn.file_path AS neighbor_file_path
				FROM yorha_evidence_connections c
				JOIN yorha_evidence_nodes tn ON tn.id = c.target_node_id
				WHERE c.source_node_id IN ${nodeIdTuple}
				${caseConnFilter}
			)
			UNION ALL
			(
				SELECT c.connection_type, c.strength, c.confidence_score,
					tn.id AS neighbor_id, tn.title AS neighbor_title,
					tn.evidence_type AS neighbor_type, tn.file_path AS neighbor_file_path
				FROM yorha_evidence_connections c
				JOIN yorha_evidence_nodes tn ON tn.id = c.source_node_id
				WHERE c.target_node_id IN ${nodeIdTuple}
			)
			ORDER BY strength DESC, confidence_score DESC
			LIMIT 10
		`);

      const connRows = pgRows(connResult);
      if (!connRows || connRows.length === 0) return null;

      // Deduplicate neighbors
      const seen = new Set<string>();
      const neighbors: GraphNeighbor[] = [];
      for (const row of connRows) {
        if (seen.has(row.neighbor_id as string)) continue;
        seen.add(row.neighbor_id as string);
        neighbors.push({
          nodeId: row.neighbor_id as string,
          title: (row.neighbor_title as string) ?? '',
          evidenceType: (row.neighbor_type as string) ?? '',
          connectionType: (row.connection_type as string) ?? '',
          strength: (row.strength as number) ?? 50,
          confidence: (row.confidence_score as number) ?? 0,
          evidenceIds: extractEvidenceIdsFromPath(row.neighbor_file_path as string | null),
        });
      }

      if (neighbors.length === 0) return null;

      // Format as context for LLM system prompt
      const lines = neighbors.map(
        (n) => `- ${n.title} (${n.evidenceType}, ${n.connectionType}, strength: ${n.strength}%)`
      );
      const context = `\n## Related Evidence (Knowledge Graph)\n${lines.join('\n')}`;

      return { context, neighbors };
    } catch (err) {
      console.warn('[KAG] Graph context retrieval failed (non-fatal):', err);
      return null;
    }
  }); // end traceGraph
}

// ── Neo4j Cypher Multi-Hop Traversal ─────────────────────────────────────────

const NEO4J_CACHE_TTL_MS = 10 * 60_000; // 10 min
const HOP_STRENGTH: Record<number, number> = { 1: 80, 2: 50, 3: 30 };

/**
 * Neo4j Cypher 2-3 hop traversal for multi-hop graph context.
 * Complements PG-only KAG (1-hop yorha_evidence_connections) with:
 *   - Cross-case entity traversal (Case→Person→Case→Evidence)
 *   - Typed relationship following (INVOLVED_IN, REFERENCES, etc.)
 *   - Multi-hop statute/citation chains
 *
 * Returns GraphNeighbor[] compatible with existing pipeline.
 * Non-fatal: returns [] on Neo4j unavailability.
 */
export async function getNeo4jMultiHopNeighbors(caseId: string): Promise<GraphNeighbor[]> {
  if (!caseId || !UUID_PATTERN.test(caseId)) return [];

  return traceGraph('neo4j-multihop', { caseId }, async () => {
    // Check memory cache first
    const cacheKey = `neo4j:multihop:${caseId}`;
    try {
      const cached = getFromMemoryCache(cacheKey);
      if (cached.found) return cached.value as GraphNeighbor[];
    } catch {}

    try {
      const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
      const driver = getNeo4jDriver();
      const session = driver.session({ database: 'neo4j' });

      try {
        const result = await session.run(
          `MATCH path = (c:Case {id: $caseId})-[*1..3]-(related)
					 WHERE related <> c
					 WITH DISTINCT related, min(length(path)) AS hops, labels(related) AS lbls
					 RETURN
					   COALESCE(related.id, related.code, related.key) AS nodeId,
					   COALESCE(related.title, related.name, related.term, related.code, '') AS title,
					   COALESCE(related.fileType, related.role, '') AS subType,
					   lbls[0] AS nodeType,
					   hops
					 ORDER BY hops ASC
					 LIMIT 25`,
          { caseId }
        );

        const neighbors: GraphNeighbor[] = result.records.map((rec) => {
          const hops = (rec.get('hops') as number) ?? 1;
          const nodeType = (rec.get('nodeType') as string) ?? 'Unknown';
          const nodeId = (rec.get('nodeId') as string) ?? '';

          return {
            nodeId,
            title: (rec.get('title') as string) ?? '',
            evidenceType: nodeType,
            connectionType: `neo4j-${hops}hop`,
            strength: HOP_STRENGTH[hops] ?? 20,
            confidence: 0,
            evidenceIds: nodeType === 'Evidence' ? [nodeId] : [],
          };
        });

        // Cache result in memory + Redis
        setCache(cacheKey, neighbors, NEO4J_CACHE_TTL_MS).catch(() => {});

        return neighbors;
      } finally {
        await session.close();
      }
    } catch (err) {
      console.warn(
        '[KAG Neo4j] Multi-hop traversal failed (non-fatal):',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  });
}

/**
 * Format Neo4j multi-hop neighbors as LLM context string.
 * Groups by hop distance for readability.
 */
export function formatNeo4jContext(neighbors: GraphNeighbor[]): string | null {
  if (!neighbors.length) return null;

  const lines = neighbors.map((n) => {
    const hop = n.connectionType.match(/(\d)hop/)?.[1] ?? '?';
    return `- [${n.evidenceType}] ${n.title} (${hop}-hop, strength: ${n.strength}%)`;
  });

  return `\n## Cross-Case Graph Context (Neo4j Multi-Hop)\n${lines.join('\n')}`;
}
