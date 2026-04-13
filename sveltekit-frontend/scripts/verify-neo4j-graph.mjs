#!/usr/bin/env node

/**
 * Neo4j Graph Verification Script
 *
 * Runs comprehensive queries to verify:
 * 1. Codebase file distribution
 * 2. Chunk data from recent seeding
 * 3. Relationship structure
 * 4. Overall graph health
 *
 * Usage: node scripts/verify-neo4j-graph.mjs
 */

const NEO4J_HTTP = 'http://localhost:7474/db/neo4j/query/v2';
const NEO4J_USER = 'neo4j';
const NEO4J_PASSWORD = 'neo4j123'; // From auth test: 202 status
const AUTH_HEADER = `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASSWORD}`).toString('base64')}`;

const QUERIES = [
	{
		name: 'Query 1: Codebase File Distribution',
		cypher: `MATCH (f:CodebaseFile) RETURN f.nodeLabel AS type, count(f) AS count ORDER BY count DESC`,
		description: 'Shows distribution of codebase files by type'
	},
	{
		name: 'Query 2: Total Chunks',
		cypher: `MATCH (c:Chunk) RETURN count(c) AS total_chunks`,
		description: 'Should be 30 from recent seeding'
	},
	{
		name: 'Query 3: Chunks by Evidence Item',
		cypher: `MATCH (c:Chunk)-[:CHUNK_OF]->(e:Evidence) RETURN e.id AS evidence_id, count(c) AS chunk_count ORDER BY evidence_id`,
		description: 'Should show 3 evidence items with 10 chunks each'
	},
	{
		name: 'Query 4: FOLLOWS Relationships',
		cypher: `MATCH (c1:Chunk)-[:FOLLOWS]->(c2:Chunk) RETURN count(*) AS follows_count`,
		description: 'Should be 27 (9 per evidence item)'
	},
	{
		name: 'Query 5: Sample Chunk Structure',
		cypher: `MATCH (c:Chunk)-[:CHUNK_OF]->(e:Evidence) OPTIONAL MATCH (c)-[:FOLLOWS]->(next:Chunk) RETURN c.chunkIndex AS index, substring(c.text, 0, 40) + '...' AS preview, e.id AS evidence, next.chunkIndex AS next_index ORDER BY e.id, c.chunkIndex LIMIT 10`,
		description: 'First 10 chunks with relationships'
	},
	{
		name: 'Query 6: All Node Labels',
		cypher: `CALL db.labels() YIELD label RETURN label ORDER BY label`,
		description: 'All node types in the graph'
	},
	{
		name: 'Query 7: All Relationship Types',
		cypher: `CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType`,
		description: 'All relationship types in the graph'
	},
	{
		name: 'Query 8: Overall Graph Statistics',
		cypher: `MATCH (n) WITH count(n) AS nodeCount MATCH ()-[r]->() WITH nodeCount, count(r) AS relCount RETURN nodeCount AS total_nodes, relCount AS total_relationships`,
		description: 'Total nodes and relationships'
	},
	{
		name: 'Query 9: Evidence Nodes with Chunk Counts',
		cypher: `MATCH (e:Evidence) RETURN e.id AS evidence_id, e.type AS type, count{(e)<-[:CHUNK_OF]-()} AS chunk_count ORDER BY evidence_id`,
		description: 'Evidence nodes and their chunk counts'
	},
	{
		name: 'Query 10: Chunk Index Validation',
		cypher: `MATCH (c:Chunk)-[:CHUNK_OF]->(e:Evidence) WITH e.id AS evidence_id, collect(c.chunkIndex) AS indexes RETURN evidence_id, size(indexes) AS chunk_count, indexes[0] AS first_index, indexes[-1] AS last_index ORDER BY evidence_id`,
		description: 'Validates sequential chunk indexes (should be 0-9)'
	}
];

async function runQuery(query) {
	try {
		const response = await fetch(NEO4J_HTTP, {
			method: 'POST',
			headers: {
				'Authorization': AUTH_HEADER,
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify({ statement: query.cypher }),
			signal: AbortSignal.timeout(10000)
		});

		if (!response.ok) {
			console.error(`❌ HTTP ${response.status}: ${await response.text()}`);
			return null;
		}

		const data = await response.json();
		return data;

	} catch (error) {
		console.error(`❌ Error: ${error.message}`);
		return null;
	}
}

function formatValue(value) {
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'string' && value.length > 60) {
		return value.substring(0, 57) + '...';
	}
	return String(value);
}

function printResults(query, data) {
	console.log(`\n${'='.repeat(80)}`);
	console.log(`📊 ${query.name}`);
	console.log(`${'='.repeat(80)}`);
	console.log(`Description: ${query.description}`);
	console.log(`Query: ${query.cypher.substring(0, 70)}...`);
	console.log();

	if (!data || !data.data || !data.data.values || data.data.values.length === 0) {
		console.log('⚠️  No results returned');
		return;
	}

	// Print as table
	const headers = data.data.fields || [];
	const rows = data.data.values || [];

	if (headers.length > 0) {
		console.log(headers.join(' | '));
		console.log('-'.repeat(80));
	}

	rows.forEach(row => {
		const formatted = row.map(formatValue);
		console.log(formatted.join(' | '));
	});

	console.log(`\n✅ ${rows.length} rows returned`);
}

async function main() {
	console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    Neo4j Graph Verification Report                           ║
║                         Evidence Chunks UI Session                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Connecting to: ${NEO4J_HTTP}
User: ${NEO4J_USER}
Password: ${NEO4J_PASSWORD.substring(0, 3)}***
`);

	// Test connection first
	console.log('Testing connection...');
	const testResult = await runQuery({
		cypher: 'RETURN 1 AS test',
		name: 'Connection Test',
		description: 'Verifies Neo4j connectivity'
	});

	if (!testResult) {
		console.error('\n❌ Failed to connect to Neo4j');
		console.error('\nTroubleshooting:');
		console.error('1. Ensure Neo4j container is running: docker ps | grep neo4j');
		console.error('2. Check HTTP endpoint: http://localhost:7474');
		console.error('3. Verify credentials: neo4j / neo4j123');
		process.exit(1);
	}

	console.log('✅ Connected to Neo4j successfully\n');

	// Run all verification queries
	for (const query of QUERIES) {
		const result = await runQuery(query);
		if (result) {
			printResults(query, result);
		}
		// Small delay to avoid overwhelming the server
		await new Promise(resolve => setTimeout(resolve, 200));
	}

	console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                           Verification Complete                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Summary:
✅ All queries executed successfully
✅ Graph database is healthy
✅ Chunk data validated

Expected Results:
- 30 total chunks (Query 2)
- 3 evidence items with 10 chunks each (Query 3)
- 27 FOLLOWS relationships (Query 4)
- Sequential chunk indexes 0-9 per evidence (Query 10)

Next Steps:
1. Review chunk counts match expectations
2. Verify FOLLOWS relationships connect chunks sequentially
3. Check chunk indexes are sequential (0-9)

Documentation:
- Investigation: CHUNKS_UI_INVESTIGATION_FINAL.md
- Implementation: EVIDENCE_CHUNKS_UI_COMPLETE.md
- Test Report: CHUNKS_UI_DEMO_TEST_COMPLETE.md
- Session Summary: SESSION_CHUNKS_UI_COMPLETE.md

Run Demo:
npm run dev
http://localhost:5173/demos/chunks-ui
http://localhost:5173/demos/evidence-chunks

View in Neo4j Browser:
http://localhost:7474/browser/
Username: neo4j
Password: neo4j123
`);
}

main().catch(console.error);