#!/usr/bin/env node
/**
 * seed-ontology-d27.mjs
 * 
 * Directly seeds CLASSIFIED_AS edges in Neo4j to fix D27 gate.
 * Mirrors the logic in seedAndClassifyOntology() from neo4j-gds.ts.
 * No dev server needed — connects directly to Neo4j via HTTP API.
 */
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const NEO4J_URL = (process.env.NEO4J_HTTP_URL ?? process.env.NEO4J_URL ?? process.env.NEO4J_URI ?? 'http://localhost:7474')
  .replace(/^bolt:\/\/|^neo4j:\/\//, 'http://')
  .replace(':7687', ':7474');
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const AUTH = 'Basic ' + Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64');

async function neo4jQuery(cypher, params = {}) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}: ${await res.text()}`);
  const d = await res.json();
  if (d.errors?.length) throw new Error(d.errors[0].message);
  return d.results?.[0]?.data ?? [];
}

const CONCEPTS = ['LegalEvidence', 'DevCode', 'WikiNote', 'ResearchNote'];

console.log(`[d27-seed] Connecting to Neo4j at ${NEO4J_URL}`);
const t0 = Date.now();

// 1. Seed OntologyConcept nodes
console.log('[d27-seed] Step 1: Seeding OntologyConcept nodes...');
await neo4jQuery(
  `UNWIND $concepts AS name MERGE (:OntologyConcept {id: name, label: name})`,
  { concepts: CONCEPTS }
);
console.log(`[d27-seed] ✓ Concepts seeded: ${CONCEPTS.join(', ')}`);

// 2. Classify WikiNote stableKeys
console.log('[d27-seed] Step 2: Classifying WikiNote files...');
const wikiRes = await neo4jQuery(`
  MATCH (f:File) WHERE f.stableKey STARTS WITH 'wiki:note:'
  MATCH (c:OntologyConcept {id: 'WikiNote'})
  MERGE (f)-[:CLASSIFIED_AS]->(c)
  RETURN count(f) AS n
`);
console.log(`[d27-seed] ✓ WikiNote: ${wikiRes[0]?.row?.[0] ?? 0} classified`);

// 3. Classify ResearchNote stableKeys
console.log('[d27-seed] Step 3: Classifying ResearchNote files...');
const researchRes = await neo4jQuery(`
  MATCH (f:File) 
  WHERE f.stableKey STARTS WITH 'research:'
    OR (f.path IS NOT NULL AND toLower(f.path) CONTAINS 'research')
  MATCH (c:OntologyConcept {id: 'ResearchNote'})
  MERGE (f)-[:CLASSIFIED_AS]->(c)
  RETURN count(f) AS n
`);
console.log(`[d27-seed] ✓ ResearchNote: ${researchRes[0]?.row?.[0] ?? 0} classified`);

// 4. Classify LegalEvidence
console.log('[d27-seed] Step 4: Classifying LegalEvidence files...');
const legalRes = await neo4jQuery(`
  MATCH (f:File)
  WHERE f.path IS NOT NULL
    AND (toLower(f.path) CONTAINS 'evidence/' OR toLower(f.path) CONTAINS '/legal/')
    AND NOT (f)-[:CLASSIFIED_AS]->()
  MATCH (c:OntologyConcept {id: 'LegalEvidence'})
  MERGE (f)-[:CLASSIFIED_AS]->(c)
  RETURN count(f) AS n
`);
console.log(`[d27-seed] ✓ LegalEvidence: ${legalRes[0]?.row?.[0] ?? 0} classified`);

// 5. Everything else → DevCode
console.log('[d27-seed] Step 5: Classifying remaining files as DevCode...');
const devRes = await neo4jQuery(`
  MATCH (f:File) WHERE NOT (f)-[:CLASSIFIED_AS]->()
  MATCH (c:OntologyConcept {id: 'DevCode'})
  MERGE (f)-[:CLASSIFIED_AS]->(c)
  RETURN count(f) AS n
`);
const devCount = devRes[0]?.row?.[0] ?? 0;
console.log(`[d27-seed] ✓ DevCode: ${devCount} classified`);

// 6. Verify D27 gate
console.log('[d27-seed] Step 6: Verifying D27 gate...');
const verifyRes = await neo4jQuery(`
  MATCH (f:File) WHERE NOT (f)-[:CLASSIFIED_AS]->()
  RETURN count(f) AS unclassified
`);
const unclassified = verifyRes[0]?.row?.[0] ?? -1;

if (unclassified === 0) {
  console.log(`[d27-seed] ✅ D27 PASSED — all File nodes now have CLASSIFIED_AS edges (${Date.now()-t0}ms)`);
} else {
  console.warn(`[d27-seed] ⚠️  D27 still has ${unclassified} unclassified File nodes after seeding`);
}
