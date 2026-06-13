#!/usr/bin/env node
/**
 * seed-neo4j-used-concept-edges.mjs
 *
 * Projects agent_traces.selected_concepts from Postgres into Neo4j as
 * USED_CONCEPT edges:
 *
 *   (:Trace {trace_id}) -[:USED_CONCEPT]-> (:Concept {concept_id})
 *
 * Each Trace node also carries task_id, outcome, score, updated_at.
 * Does NOT delete existing edges. Safe to re-run (MERGE is idempotent).
 *
 * Usage:
 *   node scripts/atlas/seed-neo4j-used-concept-edges.mjs
 *   node scripts/atlas/seed-neo4j-used-concept-edges.mjs --dry-run --limit=25
 *   node scripts/atlas/seed-neo4j-used-concept-edges.mjs --apply
 *   node scripts/atlas/seed-neo4j-used-concept-edges.mjs --apply --limit=100
 *   node scripts/atlas/seed-neo4j-used-concept-edges.mjs --safe-only --dry-run
 *   node scripts/atlas/seed-neo4j-used-concept-edges.mjs --safe-only --apply
 *
 * Gate (USED_CONCEPT coverage):
 *   traces_with_edges / total_traces >= 0.95
 *
 * Lane 1B Extension:
 *   --safe-only: Only seed concepts classified as "safe" by classify-supernode-pressure.mjs
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const NEO4J_URI      = process.env.NEO4J_URI      || 'bolt://127.0.0.1:7687';
const NEO4J_USER     = process.env.NEO4J_USER     || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const APPLY      = process.argv.includes('--apply');
const DRY_RUN    = !APPLY;
const SAFE_ONLY  = process.argv.includes('--safe-only');
const LIMIT_ARG  = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS   = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const VERBOSE    = process.argv.includes('--verbose');
const BATCH_SIZE = 50;

// ── Load safe concepts list (Lane 1B) ──────────────────────────────────────

function loadSafeConceptsList() {
  if (!SAFE_ONLY) return null;

  const classificationPath = join(ROOT, 'docs', 'reports', 'higher-hop-enrichment-classified.json');

  if (!existsSync(classificationPath)) {
    console.error(`\n❌ --safe-only requested but classification not found: ${classificationPath}`);
    console.error(`   Run 'npm run atlas:classify-supernode-pressure --save' first.`);
    process.exit(1);
  }

  try {
    const content = readFileSync(classificationPath, 'utf-8');
    const classification = JSON.parse(content);
    const safeIds = new Set(
      classification.classification.safe.concepts.map(c => c.concept_id)
    );
    return safeIds;
  } catch (err) {
    console.error(`\n❌ Cannot load classification: ${err.message}`);
    process.exit(1);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const safeConceptsSet = loadSafeConceptsList();

  // ── 1. Load traces from Postgres ─────────────────────────────────────────
  const { rows: traces } = await pool.query(`
    SELECT trace_id::text,
           task_id,
           outcome,
           score,
           selected_concepts
    FROM agent_traces
    WHERE selected_concepts IS NOT NULL
      AND jsonb_array_length(selected_concepts) > 0
    ORDER BY created_at DESC
  `);
  await pool.end();

  const total = Math.min(traces.length, MAX_ROWS);
  const modeLabel = SAFE_ONLY ? '(safe-only)' : '';
  console.log(`\n═══ Seed Neo4j USED_CONCEPT Edges ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ${modeLabel} ═══`);
  console.log(`Traces with selected_concepts: ${traces.length}`);
  console.log(`Processing: ${total}`);

  // Compute edge inventory for report (apply safe-only filter if needed)
  let totalEdges = 0;
  const conceptSet = new Set();
  let traceRows = traces.slice(0, total);

  // Lane 1B: Filter to safe concepts only if requested
  if (SAFE_ONLY && safeConceptsSet) {
    console.log(`\nFiltering to safe concepts only: ${safeConceptsSet.size} concepts`);
    for (const t of traceRows) {
      const concepts = Array.isArray(t.selected_concepts) ? t.selected_concepts : [];
      // Filter to only safe concepts
      t.selected_concepts = concepts.filter(c => safeConceptsSet.has(c));
    }
    // Filter out traces with no remaining concepts after safe-only filter
    traceRows = traceRows.filter(t => Array.isArray(t.selected_concepts) && t.selected_concepts.length > 0);
  }

  for (const t of traceRows) {
    const concepts = t.selected_concepts;
    const arr = Array.isArray(concepts) ? concepts : [];
    totalEdges += arr.length;
    for (const c of arr) conceptSet.add(c);
  }

  console.log(`\nEdges to create:  ${totalEdges}`);
  console.log(`Unique concepts:  ${conceptSet.size}`);
  console.log(`Concepts:         ${[...conceptSet].sort().join(', ')}`);

  // ── 2. Build report ───────────────────────────────────────────────────────
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    safe_only: SAFE_ONLY,
    total_traces_in_db: traces.length,
    traces_processed: total,
    traces_after_safe_filter: traceRows.length,
    edges_planned: totalEdges,
    unique_concepts: [...conceptSet].sort(),
  };

  const reportDir = join(ROOT, 'docs', 'reports');
  try { mkdirSync(reportDir, { recursive: true }); } catch {}
  const reportPath = join(reportDir, 'seed-neo4j-used-concept-edges.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: docs/reports/seed-neo4j-used-concept-edges.json`);

  if (DRY_RUN) {
    console.log('\n(dry-run — no Neo4j writes; run with --apply to commit)');
    return;
  }

  // ── 3. Connect to Neo4j ───────────────────────────────────────────────────
  let driver;
  try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      maxConnectionPoolSize: 5,
      connectionAcquisitionTimeout: 10000,
    });
    await driver.verifyConnectivity();
    console.log(`\nNeo4j connected: ${NEO4J_URI}`);
  } catch (err) {
    console.error(`\n⚠️  Neo4j unavailable (${err.message}) — aborting apply`);
    process.exitCode = 1;
    return;
  }

  // ── 4. Apply in batches ───────────────────────────────────────────────────
  const cypher = `
    MERGE (t:Trace {trace_id: $trace_id})
    SET t.task_id    = $task_id,
        t.outcome    = $outcome,
        t.score      = $score,
        t.updated_at = datetime()
    WITH t
    UNWIND $concepts AS concept_id
    WITH t, concept_id WHERE concept_id IS NOT NULL AND concept_id <> ''
    MERGE (c:Concept {concept_id: concept_id})
    MERGE (t)-[:USED_CONCEPT]->(c)
  `;

  const session = driver.session({ database: 'neo4j' });
  let applied = 0;
  let errors  = 0;

  try {
    for (let i = 0; i < traceRows.length; i += BATCH_SIZE) {
      const batch = traceRows.slice(i, i + BATCH_SIZE);

      const tx = session.beginTransaction();
      try {
        for (const t of batch) {
          const concepts = (Array.isArray(t.selected_concepts) ? t.selected_concepts : [])
            .filter(c => c != null && c !== '');
          await tx.run(cypher, {
            trace_id: t.trace_id,
            task_id:  t.task_id  ?? null,
            outcome:  t.outcome  ?? null,
            score:    t.score    != null ? parseFloat(t.score) : null,
            concepts,
          });
          applied++;
        }
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        errors += batch.length;
        console.error(`Batch ${i}–${i + batch.length} failed: ${err.message}`);
      }

      if (VERBOSE || (i + BATCH_SIZE) % 200 === 0) {
        console.log(`  ${Math.min(i + BATCH_SIZE, traceRows.length)}/${traceRows.length} traces written`);
      }
    }
  } finally {
    await session.close();
  }

  // ── 5. Gate evaluation ────────────────────────────────────────────────────
  let edgeCount = 0;
  let traceCount = 0;
  let tracesWithEdges = 0;

  const verifySession = driver.session({ database: 'neo4j' });
  try {
    const result = await verifySession.run(`
      MATCH (t:Trace)-[:USED_CONCEPT]->(:Concept)
      RETURN count(DISTINCT t) AS traces_with_edges,
             count(*) AS total_edges
    `);
    const rec = result.records[0];
    tracesWithEdges = rec.get('traces_with_edges').toNumber();
    edgeCount = rec.get('total_edges').toNumber();

    const totalResult = await verifySession.run('MATCH (t:Trace) RETURN count(t) AS n');
    traceCount = totalResult.records[0].get('n').toNumber();
  } finally {
    await verifySession.close();
  }
  await driver.close();

  // Gate: fraction of Postgres traces that now have USED_CONCEPT edges in Neo4j
  const pgTotal = traces.length;
  const coveragePct = pgTotal > 0 ? tracesWithEdges / pgTotal : 0;
  const coverageGate = coveragePct >= 0.95;

  console.log('\n══ Gate Evaluation ══════════════════════════════');
  console.log(`  Trace nodes in Neo4j:     ${traceCount} (includes pre-existing)`);
  console.log(`  Traces from Postgres:     ${pgTotal}`);
  console.log(`  Traces with USED_CONCEPT: ${tracesWithEdges}`);
  console.log(`  Total USED_CONCEPT edges: ${edgeCount}`);
  console.log(`  Coverage ≥ 95%:           ${coverageGate ? '✅' : '❌'} (${tracesWithEdges}/${pgTotal} = ${(coveragePct*100).toFixed(1)}%)`);
  console.log(`\n  ${coverageGate ? '✅ GATE PASS' : '⚠️  GATE FAIL'}`);

  report.gate_result = { neo4j_trace_total: traceCount, pg_trace_total: pgTotal, tracesWithEdges, edgeCount, coveragePct, coverageGate };
  report.applied = applied;
  report.errors  = errors;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  Applied: ${applied} trace rows`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Report:  docs/reports/seed-neo4j-used-concept-edges.json`);
}

main().catch(err => { console.error(err); process.exit(1); });
