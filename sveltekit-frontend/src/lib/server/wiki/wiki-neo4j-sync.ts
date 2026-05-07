import type { WikiCard, WikiGap } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// wiki-neo4j-sync.ts
//
// Writes wiki/gap relationships to Neo4j.
//
// Node types created:
//   (:WikiPage { id, title, summary, updatedAt })
//   (:Gap { id, severity, status, title })
//   (:File { path })       — merge on path, don't overwrite existing nodes
//   (:Symbol { name })     — merge on name
//
// Relationships:
//   (:WikiPage)-[:EXPLAINS]->(:File)
//   (:WikiPage)-[:EXPLAINS]->(:Symbol)
//   (:WikiPage)-[:DOCUMENTS_GAP]->(:Gap)
//   (:Gap)-[:AFFECTS]->(:File)
//   (:Gap)-[:AFFECTS]->(:Symbol)
//   (:Run)-[:DISCOVERED]->(:Gap)
// ─────────────────────────────────────────────────────────────────────────────

// Lazy import — neo4j-driver is an optional dependency in scripts context
async function getDriver() {
	const neo4j = await import('neo4j-driver');
	const url = ENV.NEO4J_URI;
	const user = process.env.NEO4J_USER ?? 'neo4j';
	const pass = process.env.NEO4J_PASSWORD ?? 'neo4j_password';
	return neo4j.default.driver(url, neo4j.default.auth.basic(user, pass));
}

export interface Neo4jSyncResult {
	wikiPagesUpserted: number;
	gapsUpserted: number;
	relationshipsCreated: number;
	errors: string[];
}

export async function syncWikiToNeo4j(
	cards: WikiCard[],
	gaps: WikiGap[],
	runId?: string
): Promise<Neo4jSyncResult> {
	const driver = await getDriver();
	const session = driver.session();
	const result: Neo4jSyncResult = {
		wikiPagesUpserted: 0,
		gapsUpserted: 0,
		relationshipsCreated: 0,
		errors: [],
	};

	try {
		// 1. Upsert WikiPage nodes
		for (const card of cards) {
			try {
				await session.run(
					`MERGE (w:WikiPage { id: $id })
					 SET w.title = $title,
					     w.summary = $summary,
					     w.updatedAt = $updatedAt`,
					{ id: card.id, title: card.title, summary: card.summary.slice(0, 500), updatedAt: card.updatedAt }
				);
				result.wikiPagesUpserted++;

				// WikiPage -[:EXPLAINS]-> File
				for (const filePath of card.files) {
					await session.run(
						`MERGE (f:File { path: $path })
						 WITH f
						 MATCH (w:WikiPage { id: $wikiId })
						 MERGE (w)-[:EXPLAINS]->(f)`,
						{ path: filePath, wikiId: card.id }
					);
					result.relationshipsCreated++;
				}

				// WikiPage -[:EXPLAINS]-> Symbol
				for (const sym of card.symbols) {
					await session.run(
						`MERGE (s:Symbol { name: $name })
						 WITH s
						 MATCH (w:WikiPage { id: $wikiId })
						 MERGE (w)-[:EXPLAINS]->(s)`,
						{ name: sym, wikiId: card.id }
					);
					result.relationshipsCreated++;
				}
			} catch (e) {
				result.errors.push(`wiki card ${card.id}: ${String(e)}`);
			}
		}

		// 2. Upsert Gap nodes and relationships
		for (const gap of gaps) {
			try {
				await session.run(
					`MERGE (g:Gap { id: $id })
					 SET g.severity = $severity,
					     g.status = $status,
					     g.title = $title,
					     g.summary = $summary,
					     g.updatedAt = $updatedAt`,
					{
						id: gap.id,
						severity: gap.severity,
						status: gap.status,
						title: gap.title,
						summary: gap.summary.slice(0, 400),
						updatedAt: gap.updatedAt,
					}
				);
				result.gapsUpserted++;

				// WikiPage -[:DOCUMENTS_GAP]-> Gap (for each card that lists this gap)
				for (const card of cards) {
					if (card.gaps.includes(gap.id)) {
						await session.run(
							`MATCH (w:WikiPage { id: $wikiId }), (g:Gap { id: $gapId })
							 MERGE (w)-[:DOCUMENTS_GAP]->(g)`,
							{ wikiId: card.id, gapId: gap.id }
						);
						result.relationshipsCreated++;
					}
				}

				// Gap -[:AFFECTS]-> File
				for (const filePath of gap.affectedFiles) {
					await session.run(
						`MERGE (f:File { path: $path })
						 WITH f
						 MATCH (g:Gap { id: $gapId })
						 MERGE (g)-[:AFFECTS]->(f)`,
						{ path: filePath, gapId: gap.id }
					);
					result.relationshipsCreated++;
				}

				// Gap -[:AFFECTS]-> Symbol
				for (const sym of gap.affectedSymbols) {
					await session.run(
						`MERGE (s:Symbol { name: $name })
						 WITH s
						 MATCH (g:Gap { id: $gapId })
						 MERGE (g)-[:AFFECTS]->(s)`,
						{ name: sym, gapId: gap.id }
					);
					result.relationshipsCreated++;
				}

				// Run -[:DISCOVERED]-> Gap
				if (runId && gap.discoveredByRun === runId) {
					await session.run(
						`MERGE (r:Run { id: $runId })
						 WITH r
						 MATCH (g:Gap { id: $gapId })
						 MERGE (r)-[:DISCOVERED]->(g)`,
						{ runId, gapId: gap.id }
					);
					result.relationshipsCreated++;
				}
			} catch (e) {
				result.errors.push(`gap ${gap.id}: ${String(e)}`);
			}
		}
	} finally {
		await session.close();
		await driver.close();
	}

	return result;
}
