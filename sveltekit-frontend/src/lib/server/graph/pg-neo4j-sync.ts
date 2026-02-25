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
		const db = (await import('$lib/server/db')).default;
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			// 1. Load case from PostgreSQL
			const caseRows = await db.execute(
				sql`SELECT id, title, case_number, jurisdiction, court, status, practice_area, description
					FROM cases WHERE id = ${caseId} LIMIT 1`
			);
			const caseData = [...caseRows][0] as Record<string, unknown> | undefined;
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
					practiceArea: caseData.practice_area ?? ''
				}
			);
			result.cases++;

			// 2. Load persons linked to this case
			const personRows = await db.execute(
				sql`SELECT id, name, role, description
					FROM persons_of_interest
					WHERE ${caseId} = ANY(case_ids)
					LIMIT 50`
			);
			for (const p of [...personRows] as Record<string, unknown>[]) {
				await session.run(
					`MERGE (p:Person {id: $id})
					 SET p.name = $name, p.role = $role
					 WITH p
					 MATCH (c:Case {id: $caseId})
					 MERGE (p)-[:INVOLVED_IN {role: $role}]->(c)`,
					{
						id: p.id,
						name: p.name ?? '',
						role: p.role ?? 'unknown',
						caseId
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
			for (const e of [...evidenceRows] as Record<string, unknown>[]) {
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
						caseId
					}
				);
				result.evidence++;
				result.relationships++;
			}

			// 4. Load citations linked to this case
			const citationRows = await db.execute(
				sql`SELECT id, statute_code, statute_title
					FROM saved_citations
					WHERE case_id = ${caseId}
					LIMIT 30`
			);
			for (const cit of [...citationRows] as Record<string, unknown>[]) {
				await session.run(
					`MERGE (s:Statute {code: $code})
					 SET s.title = $title
					 WITH s
					 MATCH (c:Case {id: $caseId})
					 MERGE (c)-[:REFERENCES]->(s)`,
					{
						code: cit.statute_code ?? '',
						title: cit.statute_title ?? '',
						caseId
					}
				);
				result.relationships++;
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
 * Batch sync all cases to Neo4j.
 */
export async function syncAllCasesToGraph(): Promise<SyncResult> {
	const start = Date.now();
	const total: SyncResult = { cases: 0, persons: 0, evidence: 0, relationships: 0, errors: [], durationMs: 0 };

	try {
		const db = (await import('$lib/server/db')).default;
		const caseIds = await db.execute(sql`SELECT id FROM cases LIMIT 500`);

		for (const row of [...caseIds] as { id: string }[]) {
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
