/**
 * Shared KAG (Knowledge-Augmented Generation) module.
 *
 * Provides 1-hop graph traversal on yorha_evidence_connections
 * to enrich RAG results with related evidence nodes.
 * Used by both /api/sse/chat and /api/evidence/search.
 */
import { sql } from 'drizzle-orm';
import db from '$lib/server/db';

export interface GraphNeighbor {
	nodeId: string;
	title: string;
	evidenceType: string;
	connectionType: string;
	strength: number;
	confidence: number;
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

	try {
		// Find nodes matching our evidence IDs
		const idList = evidenceIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
		const caseFilter = caseId ? sql`AND n.case_id = ${caseId}` : sql``;

		const nodeResult = await db.execute(sql`
			SELECT n.id AS node_id, n.title, n.evidence_type, n.file_path
			FROM yorha_evidence_nodes n
			WHERE n.status = 'active'
			${caseFilter}
			AND (n.file_path IN ${sql.raw(`(${idList})`)} OR n.id IN ${sql.raw(`(${idList})`)})
		`);

		const nodeRows = (nodeResult as any).rows ?? nodeResult;
		if (!nodeRows || nodeRows.length === 0) return null;

		const nodeIds = nodeRows.map((r: any) => r.node_id);
		const nodeIdStr = nodeIds.map((id: string) => `'${id.replace(/'/g, "''")}'`).join(',');
		const caseConnFilter = caseId ? sql`AND c.case_id = ${caseId}` : sql``;

		// 1-hop graph traversal (bidirectional)
		const connResult = await db.execute(sql`
			(
				SELECT c.connection_type, c.strength, c.confidence_score,
					tn.id AS neighbor_id, tn.title AS neighbor_title,
					tn.evidence_type AS neighbor_type
				FROM yorha_evidence_connections c
				JOIN yorha_evidence_nodes tn ON tn.id = c.target_node_id
				WHERE c.source_node_id IN ${sql.raw(`(${nodeIdStr})`)}
				${caseConnFilter}
			)
			UNION ALL
			(
				SELECT c.connection_type, c.strength, c.confidence_score,
					tn.id AS neighbor_id, tn.title AS neighbor_title,
					tn.evidence_type AS neighbor_type
				FROM yorha_evidence_connections c
				JOIN yorha_evidence_nodes tn ON tn.id = c.source_node_id
				WHERE c.target_node_id IN ${sql.raw(`(${nodeIdStr})`)}
				${caseConnFilter}
			)
			ORDER BY strength DESC, confidence_score DESC
			LIMIT 10
		`);

		const connRows = (connResult as any).rows ?? connResult;
		if (!connRows || connRows.length === 0) return null;

		// Deduplicate neighbors
		const seen = new Set<string>();
		const neighbors: GraphNeighbor[] = [];
		for (const row of connRows) {
			if (seen.has(row.neighbor_id)) continue;
			seen.add(row.neighbor_id);
			neighbors.push({
				nodeId: row.neighbor_id,
				title: row.neighbor_title ?? '',
				evidenceType: row.neighbor_type ?? '',
				connectionType: row.connection_type ?? '',
				strength: row.strength ?? 50,
				confidence: row.confidence_score ?? 0,
			});
		}

		if (neighbors.length === 0) return null;

		// Format as context for LLM system prompt
		const lines = neighbors.map(n =>
			`- ${n.title} (${n.evidenceType}, ${n.connectionType}, strength: ${n.strength}%)`
		);
		const context = `\n## Related Evidence (Knowledge Graph)\n${lines.join('\n')}`;

		return { context, neighbors };
	} catch (err) {
		console.warn('[KAG] Graph context retrieval failed (non-fatal):', err);
		return null;
	}
}
