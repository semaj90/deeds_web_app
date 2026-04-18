import { pgRows } from '$lib/server/db/client';
/**
 * PostgreSQL → Neo4j Sync Pipeline
 *
 * Reads cases, persons, evidence, and citations from PostgreSQL
 * and MERGEs them as nodes/relationships into Neo4j.
 */
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import { initializeNeo4jSchema } from './neo4j-schema.js';
import { sql } from 'drizzle-orm';

export interface SyncResult {
	cases: number;
	persons: number;
	evidence: number;
	relationships: number;
	errors: string[];
	durationMs: number;
}

/**
 * Sync a single case and its related entities to Neo4j.
 */
export async function syncCaseToGraph(caseId: string): Promise<SyncResult> {
	const start = Date.now();
	const result: SyncResult = { cases: 0, persons: 0, evidence: 0, relationships: 0, errors: [], durationMs: 0 };

	try {
		await initializeNeo4jSchema();
		const { db } = await import('$lib/server/db/client');
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
      // 1. Load case from PostgreSQL
      const caseRows = await db.execute(
        sql`SELECT id, title, case_number, jurisdiction, court, status, practice_area, description
					FROM cases WHERE id = ${caseId} LIMIT 1`
      );
      const caseData = pgRows(caseRows)[0] as Record<string, unknown> | undefined;
      if (!caseData) {
        result.errors.push(`Case ${caseId} not found`);
        return result;
      }

      // MERGE Case node
      await session.run(
        `MERGE (c:Case {id: $id})
				 SET c.title = $title, c.caseNumber = $caseNumber, c.jurisdiction = $jurisdiction,
					 c.court = $court, c.status = $status, c.practiceArea = $practiceArea,
					 c.updatedAt = datetime()`,
        {
          id: caseId,
          title: caseData.title ?? '',
          caseNumber: caseData.case_number ?? '',
          jurisdiction: caseData.jurisdiction ?? '',
          court: caseData.court ?? '',
          status: caseData.status ?? '',
          practiceArea: caseData.practice_area ?? '',
        }
      );
      result.cases++;

      // 2. Load persons linked to this case (check both case_id UUID and case_ids text[])
      const personRows = await db.execute(
        sql`SELECT id, name, relationship, description
					FROM persons_of_interest
					WHERE case_id = ${caseId}
					   OR ${caseId}::text = ANY(case_ids)
					LIMIT 50`
      );
      for (const p of pgRows(personRows) as Record<string, unknown>[]) {
        await session.run(
          `MERGE (p:Person {id: $id})
					 SET p.name = $name, p.role = $role
					 WITH p
					 MATCH (c:Case {id: $caseId})
					 MERGE (p)-[:INVOLVED_IN {role: $role}]->(c)`,
          {
            id: p.id,
            name: p.name ?? '',
            role: p.relationship ?? 'unknown',
            caseId,
          }
        );
        result.persons++;
        result.relationships++;
      }

      // 3. Load evidence linked to this case
      const evidenceRows = await db.execute(
        sql`SELECT id, title, file_type, description
					FROM evidence
					WHERE case_id = ${caseId}
					LIMIT 50`
      );
      for (const e of pgRows(evidenceRows) as Record<string, unknown>[]) {
        await session.run(
          `MERGE (e:Evidence {id: $id})
					 SET e.title = $title, e.fileType = $fileType
					 WITH e
					 MATCH (c:Case {id: $caseId})
					 MERGE (e)-[:BELONGS_TO]->(c)`,
          {
            id: e.id,
            title: e.title ?? '',
            fileType: e.file_type ?? '',
            caseId,
          }
        );
        result.evidence++;
        result.relationships++;
      }

      // 4. Load citations linked to this case
      const citationRows = await db.execute(
        sql`SELECT id, citation_text, title
					FROM citations
					WHERE case_id = ${caseId}
					LIMIT 30`
      );
      for (const cit of pgRows(citationRows) as Record<string, unknown>[]) {
        const code = String(cit.citation_text ?? '').trim();
        if (!code) continue;
        await session.run(
          `MERGE (s:Statute {code: $code})
					 SET s.title = $title
					 WITH s
					 MATCH (c:Case {id: $caseId})
					 MERGE (c)-[:REFERENCES]->(s)`,
          {
            code,
            title: cit.title ?? code,
            caseId,
          }
        );
        result.relationships++;
      }

      // 5. Load saved glossary concepts linked to this case
      const glossaryRows = await db.execute(
        sql`SELECT citation_text, notes, node_id
					FROM case_library_links
					WHERE case_id = ${caseId} AND category = 'glossary_concept'
					LIMIT 30`
      );
      for (const concept of pgRows(glossaryRows) as Record<string, unknown>[]) {
        const rawTerm = String(concept.citation_text ?? '').trim();
        if (!rawTerm) continue;
        const key = rawTerm.toLowerCase();
        const definition = String(concept.notes ?? '').trim();
        const nodeId = concept.node_id ? String(concept.node_id) : null;

        await session.run(
          `MERGE (g:GlossaryTerm {key: $key})
					 SET g.term = $term, g.definition = $definition, g.updatedAt = datetime()
					 WITH g
					 MATCH (c:Case {id: $caseId})
					 MERGE (c)-[:USES_CONCEPT]->(g)`,
          { key, term: rawTerm, definition, caseId }
        );
        result.relationships++;

        if (nodeId) {
          await session.run(
            `MERGE (n:LegalNode {id: $nodeId})
						 WITH n
						 MATCH (g:GlossaryTerm {key: $key})
						 MERGE (g)-[:DEFINED_IN]->(n)`,
            { nodeId, key }
          );
          result.relationships++;
        }
      }
    } finally {
			await session.close();
		}
	} catch (err) {
		result.errors.push(err instanceof Error ? err.message : String(err));
	}

	result.durationMs = Date.now() - start;
	return result;
}

/**
 * Sync a web-ingested content node + its connections to Neo4j.
 * Non-fatal: if Neo4j is unavailable, PostgreSQL data is sufficient.
 */
export async function syncIngestedContent(
	nodeId: string,
	caseId: string,
	title: string,
	sourceUrl: string
): Promise<{ synced: boolean; error?: string }> {
	try {
		await initializeNeo4jSchema();
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			// Create WebContent node
			await session.run(
				`MERGE (w:WebContent {id: $id})
				 SET w.title = $title, w.url = $url, w.caseId = $caseId,
					 w.type = 'web_ingest', w.syncedAt = datetime()`,
				{ id: nodeId, title, url: sourceUrl, caseId }
			);

			// Link to Case node if exists
			await session.run(
				`MATCH (w:WebContent {id: $nodeId})
				 MATCH (c:Case {id: $caseId})
				 MERGE (w)-[:INGESTED_FOR]->(c)`,
				{ nodeId, caseId }
			);

			// Sync edges from yorha_evidence_connections
			const { db } = await import('$lib/server/db/client');
			const connections = await db.execute(
				sql`SELECT target_node_id, connection_type, strength
					FROM yorha_evidence_connections
					WHERE source_node_id = ${nodeId}
					LIMIT 20`
			);

			for (const conn of pgRows(connections) as Record<string, unknown>[]) {
				const targetId = conn.target_node_id as string;
				const connType = (conn.connection_type as string) ?? 'RELATED_TO';
				const strength = (conn.strength as number) ?? 50;

				await session.run(
					`MATCH (w:WebContent {id: $sourceId})
					 MERGE (t {id: $targetId})
					 MERGE (w)-[r:RELATED_TO]->(t)
					 SET r.type = $connType, r.strength = $strength`,
					{ sourceId: nodeId, targetId, connType, strength }
				);
			}

			return { synced: true };
		} finally {
			await session.close();
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn('[pg-neo4j-sync] syncIngestedContent failed (non-fatal):', msg);
		return { synced: false, error: msg };
	}
}

/**
 * Batch sync all cases to Neo4j.
 */
export async function syncAllCasesToGraph(): Promise<SyncResult> {
	const start = Date.now();
	const total: SyncResult = { cases: 0, persons: 0, evidence: 0, relationships: 0, errors: [], durationMs: 0 };

	try {
		const { db } = await import('$lib/server/db/client');
		const caseIds = await db.execute(sql`SELECT id FROM cases LIMIT 500`);

		for (const row of pgRows(caseIds) as { id: string }[]) {
			const r = await syncCaseToGraph(row.id);
			total.cases += r.cases;
			total.persons += r.persons;
			total.evidence += r.evidence;
			total.relationships += r.relationships;
			total.errors.push(...r.errors);
		}
	} catch (err) {
		total.errors.push(err instanceof Error ? err.message : String(err));
	}

	total.durationMs = Date.now() - start;
	return total;
}