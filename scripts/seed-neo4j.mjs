/**
 * Neo4j Graph Seeder — Populate Neo4j from PostgreSQL data
 *
 * Reads cases, persons, evidence, citations, and glossary concepts from
 * PostgreSQL and MERGEs them as nodes/relationships into Neo4j.
 *
 * Usage: node scripts/seed-neo4j.mjs [--case <caseId>] [--dry-run] [--verify]
 *
 * Requires:
 *   PostgreSQL on 127.0.0.1:5434 (deeds-postgres-prod via proxy)
 *   Neo4j on bolt://localhost:7687 (docker compose --profile full up -d neo4j)
 *
 * Neo4j credentials: neo4j/neo4j123 (matches docker-compose.yml NEO4J_AUTH)
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';

const { Pool } = pg;

// ── Config ──────────────────────────────────────────────────────────────

const PG_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD || 'neo4j123';

const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify');
const SINGLE_CASE = process.argv.includes('--case')
	? process.argv[process.argv.indexOf('--case') + 1]
	: null;

const pool = new Pool({ connectionString: PG_URL });
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS), {
	disableLosslessIntegers: true,
});

const stats = { cases: 0, persons: 0, evidence: 0, citations: 0, glossary: 0, relationships: 0, errors: [] };

// ── Schema ──────────────────────────────────────────────────────────────

async function ensureSchema(session) {
	console.log('[Neo4j] Creating constraints and indexes...');
	const constraints = [
		'CREATE CONSTRAINT IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE',
		'CREATE CONSTRAINT IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE',
		'CREATE CONSTRAINT IF NOT EXISTS FOR (e:Evidence) REQUIRE e.id IS UNIQUE',
		'CREATE CONSTRAINT IF NOT EXISTS FOR (s:Statute) REQUIRE s.code IS UNIQUE',
		'CREATE CONSTRAINT IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE',
		'CREATE CONSTRAINT IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.key IS UNIQUE',
		'CREATE CONSTRAINT IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
		'CREATE CONSTRAINT IF NOT EXISTS FOR (sq:SearchQuery) REQUIRE sq.hash IS UNIQUE',
	];
	const indexes = [
		'CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.name)',
		'CREATE INDEX IF NOT EXISTS FOR (c:Case) ON (c.title)',
		'CREATE INDEX IF NOT EXISTS FOR (c:Case) ON (c.caseNumber)',
		'CREATE INDEX IF NOT EXISTS FOR (e:Evidence) ON (e.title)',
		'CREATE INDEX IF NOT EXISTS FOR (g:GlossaryTerm) ON (g.term)',
	];
	for (const q of [...constraints, ...indexes]) {
		await session.run(q);
	}
	console.log(`[Neo4j] Schema: ${constraints.length} constraints + ${indexes.length} indexes`);
}

// ── Sync Functions ──────────────────────────────────────────────────────

async function syncCase(session, caseData) {
	await session.run(
		`MERGE (c:Case {id: $id})
		 SET c.title = $title, c.caseNumber = $caseNumber, c.jurisdiction = $jurisdiction,
			 c.court = $court, c.status = $status, c.practiceArea = $practiceArea,
			 c.updatedAt = datetime()`,
		{
			id: caseData.id,
			title: caseData.title || '',
			caseNumber: caseData.case_number || '',
			jurisdiction: caseData.jurisdiction || '',
			court: caseData.court || '',
			status: caseData.status || '',
			practiceArea: caseData.practice_area || '',
		}
	);
	stats.cases++;
}

async function syncPersons(session, caseId) {
	const { rows } = await pool.query(
		`SELECT id, name, relationship, description FROM persons_of_interest WHERE $1 = ANY(case_ids) LIMIT 50`,
		[caseId]
	);
	for (const p of rows) {
		await session.run(
			`MERGE (p:Person {id: $id})
			 SET p.name = $name, p.role = $role
			 WITH p
			 MATCH (c:Case {id: $caseId})
			 MERGE (p)-[:INVOLVED_IN {role: $role}]->(c)`,
			{ id: p.id, name: p.name || '', role: p.relationship || 'unknown', caseId }
		);
		stats.persons++;
		stats.relationships++;
	}
	return rows.length;
}

async function syncEvidence(session, caseId) {
	const { rows } = await pool.query(
		`SELECT id, title, file_type, description FROM evidence WHERE case_id = $1 LIMIT 100`,
		[caseId]
	);
	for (const e of rows) {
		await session.run(
			`MERGE (e:Evidence {id: $id})
			 SET e.title = $title, e.fileType = $fileType
			 WITH e
			 MATCH (c:Case {id: $caseId})
			 MERGE (e)-[:BELONGS_TO]->(c)`,
			{ id: e.id, title: e.title || '', fileType: e.file_type || '', caseId }
		);
		stats.evidence++;
		stats.relationships++;
	}
	return rows.length;
}

async function syncCitations(session, caseId) {
	const { rows } = await pool.query(
    `SELECT id, quoted_text, title FROM citations WHERE case_id = $1 LIMIT 30`,
    [caseId]
  );
  for (const cit of rows) {
    const code = (cit.quoted_text || cit.title || '').slice(0, 120);
    if (!code) continue;
    await session.run(
      `MERGE (s:Statute {code: $code})
			 SET s.title = $title
			 WITH s
			 MATCH (c:Case {id: $caseId})
			 MERGE (c)-[:REFERENCES]->(s)`,
      { code, title: cit.title || code, caseId }
    );
    stats.citations++;
    stats.relationships++;
  }
	return rows.length;
}

async function syncGlossary(session, caseId) {
	const { rows } = await pool.query(
		`SELECT citation_text, notes, node_id FROM case_library_links WHERE case_id = $1 AND category = 'glossary_concept' LIMIT 30`,
		[caseId]
	);
	for (const concept of rows) {
		const term = (concept.citation_text || '').trim();
		if (!term) continue;
		const key = term.toLowerCase();
		const definition = (concept.notes || '').trim();
		const nodeId = concept.node_id || null;

		await session.run(
			`MERGE (g:GlossaryTerm {key: $key})
			 SET g.term = $term, g.definition = $definition, g.updatedAt = datetime()
			 WITH g
			 MATCH (c:Case {id: $caseId})
			 MERGE (c)-[:USES_CONCEPT]->(g)`,
			{ key, term, definition, caseId }
		);
		stats.glossary++;
		stats.relationships++;

		if (nodeId) {
			await session.run(
				`MERGE (n:LegalNode {id: $nodeId})
				 WITH n
				 MATCH (g:GlossaryTerm {key: $key})
				 MERGE (g)-[:DEFINED_IN]->(n)`,
				{ nodeId, key }
			);
			stats.relationships++;
		}
	}
	return rows.length;
}

// ── Evidence Connections (cross-evidence links from yorha graph) ─────

async function syncEvidenceConnections(session, caseId) {
	const { rows } = await pool.query(
		`SELECT yec.source_node_id, yec.target_node_id, yec.connection_type, yec.strength
		 FROM yorha_evidence_connections yec
		 JOIN yorha_evidence_nodes yen ON yen.id = yec.source_node_id
		 WHERE yen.case_id = $1
		 LIMIT 200`,
		[caseId]
	);
	for (const conn of rows) {
		await session.run(
			`MERGE (a:Evidence {id: $source})
			 MERGE (b:Evidence {id: $target})
			 MERGE (a)-[r:RELATED_TO]->(b)
			 SET r.type = $connType, r.strength = $strength`,
			{
				source: conn.source_node_id,
				target: conn.target_node_id,
				connType: conn.connection_type || 'RELATED_TO',
				strength: conn.strength || 50,
			}
		);
		stats.relationships++;
	}
	return rows.length;
}

// ── Verify ──────────────────────────────────────────────────────────────

async function verify(session) {
	console.log('\n── Neo4j Graph Verification ──────────────────────');

	const nodeCount = await session.run('MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC');
	console.log('\nNode counts:');
	for (const row of nodeCount.records) {
		console.log(`  ${row.get('label')}: ${row.get('cnt')}`);
	}

	const relCount = await session.run('MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt ORDER BY cnt DESC');
	console.log('\nRelationship counts:');
	for (const row of relCount.records) {
		console.log(`  ${row.get('rel')}: ${row.get('cnt')}`);
	}

	// Test a sample graph traversal (same query as graph-centrality.ts)
	const sampleCase = await session.run('MATCH (c:Case) RETURN c.id AS id, c.title AS title LIMIT 1');
	if (sampleCase.records.length > 0) {
		const caseId = sampleCase.records[0].get('id');
		const title = sampleCase.records[0].get('title');
		console.log(`\nSample 2-hop traversal from case "${title}" (${caseId}):`);
		const hops = await session.run(
			`MATCH (c:Case {id: $caseId})-[r*1..2]-(related)
			 RETURN DISTINCT labels(related)[0] AS type, related.id AS id,
				    coalesce(related.title, related.name, related.term, related.code, '') AS name
			 LIMIT 10`,
			{ caseId }
		);
		for (const row of hops.records) {
			console.log(`  [${row.get('type')}] ${row.get('name')} (${row.get('id')})`);
		}
		if (hops.records.length === 0) {
			console.log('  (no connections found — graph may be empty)');
		}
	} else {
		console.log('\nNo cases in Neo4j — seed first with: node scripts/seed-neo4j.mjs');
	}
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
	const start = Date.now();
	console.log('╔══════════════════════════════════════════╗');
	console.log('║     Neo4j Graph Seeder                   ║');
	console.log('╚══════════════════════════════════════════╝');
	console.log(`PG: ${PG_URL.replace(/:[^:@]+@/, ':***@')}`);
	console.log(`Neo4j: ${NEO4J_URI} (user: ${NEO4J_USER})`);
	if (DRY_RUN) console.log('Mode: DRY RUN (no writes)');
	if (SINGLE_CASE) console.log(`Scope: single case ${SINGLE_CASE}`);

	// Test connections
	try {
		await pool.query('SELECT 1');
		console.log('[PG] Connected');
	} catch (err) {
		console.error('[PG] Connection failed:', err.message);
		process.exit(1);
	}

	const session = driver.session({ database: 'neo4j' });
	try {
		await session.run('RETURN 1');
		console.log('[Neo4j] Connected');
	} catch (err) {
		console.error('[Neo4j] Connection failed:', err.message);
		console.error('  Start Neo4j: docker compose --profile full up -d neo4j');
		process.exit(1);
	}

	if (VERIFY_ONLY) {
		await verify(session);
		await session.close();
		await cleanup();
		return;
	}

	// Schema
	await ensureSchema(session);

	// Load cases
	let caseRows;
	if (SINGLE_CASE) {
		caseRows = (await pool.query('SELECT id, title, case_number, jurisdiction, court, status, practice_area FROM cases WHERE id = $1', [SINGLE_CASE])).rows;
	} else {
		caseRows = (await pool.query('SELECT id, title, case_number, jurisdiction, court, status, practice_area FROM cases ORDER BY created_at DESC LIMIT 500')).rows;
	}

	console.log(`\n[Sync] ${caseRows.length} cases to process...\n`);

	for (const caseData of caseRows) {
		const caseLabel = `${caseData.title || caseData.id}`;
		if (DRY_RUN) {
			console.log(`  [DRY] Would sync: ${caseLabel}`);
			stats.cases++;
			continue;
		}

		try {
			await syncCase(session, caseData);
			const persons = await syncPersons(session, caseData.id);
			const evidence = await syncEvidence(session, caseData.id);
			const citations = await syncCitations(session, caseData.id);
			const glossary = await syncGlossary(session, caseData.id);
			const connections = await syncEvidenceConnections(session, caseData.id);
			console.log(`  [OK] ${caseLabel} — ${persons}P ${evidence}E ${citations}C ${glossary}G ${connections}conn`);
		} catch (err) {
			const msg = `${caseLabel}: ${err.message}`;
			stats.errors.push(msg);
			console.error(`  [ERR] ${msg}`);
		}
	}

	// Verify
	await verify(session);

	await session.close();

	// Summary
	const elapsed = ((Date.now() - start) / 1000).toFixed(1);
	console.log('\n── Summary ──────────────────────────────────────');
	console.log(`  Cases:         ${stats.cases}`);
	console.log(`  Persons:       ${stats.persons}`);
	console.log(`  Evidence:      ${stats.evidence}`);
	console.log(`  Citations:     ${stats.citations}`);
	console.log(`  Glossary:      ${stats.glossary}`);
	console.log(`  Relationships: ${stats.relationships}`);
	console.log(`  Errors:        ${stats.errors.length}`);
	console.log(`  Duration:      ${elapsed}s`);

	if (stats.errors.length > 0) {
		console.log('\n  Errors:');
		for (const e of stats.errors) console.log(`    - ${e}`);
	}

	await cleanup();
}

async function cleanup() {
	await pool.end().catch(() => {});
	await driver.close().catch(() => {});
}

main().catch((err) => {
	console.error('Fatal:', err);
	cleanup().then(() => process.exit(1));
});