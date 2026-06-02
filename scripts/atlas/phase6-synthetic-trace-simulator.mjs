#!/usr/bin/env node
/**
 * phase6-synthetic-trace-simulator.mjs
 *
 * Phase 6: Generate synthetic agent execution traces from the USES_DB and
 * USES_TOOL topology already indexed in Neo4j (phases 3 + 4).
 *
 * A "trace" is a realistic sequence of operations a request handler would
 * perform: it starts at a source file (e.g. an API route), follows USES_TOOL
 * edges (MCP/API calls) and USES_DB edges (Drizzle queries), and records the
 * full execution path.  These traces are used as:
 *   1. Training data for the ACE self-improvement loop (written to
 *      scripts/atlas/out/synthetic-traces.ndjson)
 *   2. Neo4j SYNTHETIC_TRACE relationships between files
 *   3. Redis hot cache for quick Atlas Phase 7 glyph-reward seeding
 *
 * Strategy:
 *   - Pull all (File)-[USES_TOOL]->(Tool) and (File)-[USES_DB]->(Table) edges
 *     from Neo4j (or fall back to the local NDJSON files if Neo4j is offline)
 *   - Group edges by source_file to build a per-file "capability map"
 *   - For each source file, simulate N trace permutations:
 *       - pick a subset of its tools/tables (weighted by operation type)
 *       - assign plausible latency buckets (db read < db write < tool call)
 *       - emit a JSON trace record
 *   - Write traces to NDJSON, optionally to Neo4j SYNTHETIC_TRACE edges,
 *     optionally to Redis
 *
 * Usage:
 *   node scripts/atlas/phase6-synthetic-trace-simulator.mjs [--dry-run] [--no-neo4j] [--no-redis] [--traces-per-file N]
 *
 * Output:
 *   scripts/atlas/out/synthetic-traces.ndjson
 *   scripts/atlas/out/synthetic-trace-summary.json
 */

import neo4j from 'neo4j-driver';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(ROOT, 'sveltekit-frontend/.env') });

// ── CLI args ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY_RUN      = argv.includes('--dry-run');
const NO_NEO4J     = argv.includes('--no-neo4j');
const NO_REDIS     = argv.includes('--no-redis');
const tracesIdx    = argv.indexOf('--traces-per-file');
const TRACES_PER_FILE = tracesIdx >= 0 ? parseInt(argv[tracesIdx + 1], 10) : 3;

const OUT_DIR   = path.join(ROOT, 'scripts/atlas/out');
const OUT_NDJSON = path.join(OUT_DIR, 'synthetic-traces.ndjson');
const OUT_SUMMARY = path.join(OUT_DIR, 'synthetic-trace-summary.json');

// Latency buckets (ms) — used to make traces feel realistic
const LATENCY = {
  db_read:    () => 2  + Math.random() * 8,    // 2–10ms
  db_write:   () => 5  + Math.random() * 20,   // 5–25ms
  tool_call:  () => 15 + Math.random() * 85,   // 15–100ms
  api_route:  () => 0,                          // entry point, no latency
};

// ── Neo4j helpers ──────────────────────────────────────────────────────────────
async function fetchEdgesFromNeo4j(session) {
  const dbEdges = [];
  const toolEdges = [];

  const dbResult = await session.run(`
    MATCH (f:File)-[r:USES_DB]->(t:Table)
    RETURN f.path AS source, t.name AS table,
           r.operation AS operation, r.line_num AS line_num, r.caller AS caller
    ORDER BY f.path
  `);
  for (const rec of dbResult.records) {
    dbEdges.push({
      source_file: rec.get('source'),
      table:       rec.get('table'),
      operation:   rec.get('operation') || 'query',
      line_num:    rec.get('line_num'),
      caller:      rec.get('caller'),
      type:        'drizzle',
    });
  }

  const toolResult = await session.run(`
    MATCH (f:File)-[r:USES_TOOL]->(t:Tool)
    RETURN f.path AS source, t.name AS tool,
           r.endpoint AS endpoint, r.line_num AS line_num, r.caller AS caller
    ORDER BY f.path
  `);
  for (const rec of toolResult.records) {
    toolEdges.push({
      source_file: rec.get('source'),
      tool:        rec.get('tool'),
      endpoint:    rec.get('endpoint'),
      line_num:    rec.get('line_num'),
      caller:      rec.get('caller'),
      type:        'api_route',
    });
  }

  return { dbEdges, toolEdges };
}

// ── NDJSON fallback ────────────────────────────────────────────────────────────
function loadNdjson(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

// ── Capability map builder ─────────────────────────────────────────────────────
function buildCapabilityMap(dbEdges, toolEdges) {
  // Map: source_file -> { db: [...], tools: [...] }
  const map = new Map();

  const ensure = (file) => {
    if (!map.has(file)) map.set(file, { db: [], tools: [] });
    return map.get(file);
  };

  for (const e of dbEdges) {
    ensure(e.source_file).db.push({ table: e.table, operation: e.operation, line_num: e.line_num });
  }
  for (const e of toolEdges) {
    ensure(e.source_file).tools.push({ tool: e.tool || e.endpoint, endpoint: e.endpoint, line_num: e.line_num });
  }

  return map;
}

// ── Trace generator ────────────────────────────────────────────────────────────
function shortPath(p) {
  // Normalise backslashes and strip leading repo root prefix
  return p.replace(/\\/g, '/').replace(/^.*sveltekit-frontend\//, '');
}

function pickSubset(arr, minFrac = 0.4) {
  if (arr.length === 0) return [];
  const n = Math.max(1, Math.floor(arr.length * (minFrac + Math.random() * (1 - minFrac))));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function generateTraces(capMap, tracesPerFile) {
  const traces = [];

  for (const [sourceFile, caps] of capMap.entries()) {
    const file = shortPath(sourceFile);
    const isRoute = file.includes('+server') || file.includes('api/');

    for (let t = 0; t < tracesPerFile; t++) {
      const steps = [];
      let totalMs = 0;

      // Entry point
      const entryMs = LATENCY.api_route();
      steps.push({ step: 0, type: 'entry', file, latency_ms: +entryMs.toFixed(2) });

      // Random subset of DB ops
      const dbSteps = pickSubset(caps.db);
      for (const db of dbSteps) {
        const lat = db.operation?.includes('insert') || db.operation?.includes('update')
          ? LATENCY.db_write()
          : LATENCY.db_read();
        totalMs += lat;
        steps.push({
          step:       steps.length,
          type:       'db',
          table:      db.table,
          operation:  db.operation,
          latency_ms: +lat.toFixed(2),
        });
      }

      // Random subset of tool calls
      const toolSteps = pickSubset(caps.tools);
      for (const tool of toolSteps) {
        const lat = LATENCY.tool_call();
        totalMs += lat;
        steps.push({
          step:       steps.length,
          type:       'tool',
          tool:       tool.tool,
          endpoint:   tool.endpoint,
          latency_ms: +lat.toFixed(2),
        });
      }

      if (steps.length < 2) continue; // skip entry-only

      const traceId = createHash('sha1')
        .update(`${file}:${t}:${Date.now()}:${Math.random()}`)
        .digest('hex')
        .slice(0, 16);

      traces.push({
        trace_id:    traceId,
        source_file: file,
        is_route:    isRoute,
        step_count:  steps.length,
        db_ops:      dbSteps.length,
        tool_calls:  toolSteps.length,
        total_ms:    +totalMs.toFixed(2),
        steps,
        generated_at: new Date().toISOString(),
      });
    }
  }

  return traces;
}

// ── Neo4j trace writer ─────────────────────────────────────────────────────────
async function writeTracesToNeo4j(session, traces) {
  let written = 0;
  const BATCH = 50;

  for (let i = 0; i < traces.length; i += BATCH) {
    const batch = traces.slice(i, i + BATCH);
    await session.run(`
      UNWIND $rows AS row
      MATCH (f:File {path: row.source_file})
      MERGE (tr:SyntheticTrace {trace_id: row.trace_id})
      ON CREATE SET
        tr.step_count  = row.step_count,
        tr.db_ops      = row.db_ops,
        tr.tool_calls  = row.tool_calls,
        tr.total_ms    = row.total_ms,
        tr.is_route    = row.is_route,
        tr.generated_at = row.generated_at
      MERGE (f)-[:SYNTHETIC_TRACE]->(tr)
    `, {
      rows: batch.map(tr => ({
        source_file: tr.source_file,
        trace_id:    tr.trace_id,
        step_count:  tr.step_count,
        db_ops:      tr.db_ops,
        tool_calls:  tr.tool_calls,
        total_ms:    tr.total_ms,
        is_route:    tr.is_route,
        generated_at: tr.generated_at,
      }))
    });
    written += batch.length;
    process.stdout.write(`\r  [NEO4J] Wrote ${written}/${traces.length} traces...`);
  }
  console.log();
  return written;
}

// ── Redis writer ───────────────────────────────────────────────────────────────
async function writeTracesToRedis(redis, traces) {
  // Store top-20 traces by total_ms (highest complexity) per file in a hash
  const byFile = new Map();
  for (const tr of traces) {
    if (!byFile.has(tr.source_file)) byFile.set(tr.source_file, []);
    byFile.get(tr.source_file).push(tr);
  }

  const pipeline = redis.pipeline();
  let keys = 0;
  for (const [file, fileTraces] of byFile.entries()) {
    const top = fileTraces.sort((a, b) => b.total_ms - a.total_ms).slice(0, 3);
    pipeline.hset(
      'atlas:synthetic-traces',
      file,
      JSON.stringify(top.map(t => ({
        trace_id: t.trace_id,
        step_count: t.step_count,
        db_ops: t.db_ops,
        tool_calls: t.tool_calls,
        total_ms: t.total_ms,
      })))
    );
    keys++;
  }
  pipeline.expire('atlas:synthetic-traces', 86400); // 24h TTL
  await pipeline.exec();
  return keys;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Phase 6 Atlas: Synthetic Trace Simulator');
  console.log(`   traces-per-file: ${TRACES_PER_FILE}  dry-run: ${DRY_RUN}`);
  console.log();

  mkdirSync(OUT_DIR, { recursive: true });

  // ── 1. Load edges ────────────────────────────────────────────────────────────
  let dbEdges = [];
  let toolEdges = [];
  let edgeSource = 'ndjson';

  if (!NO_NEO4J) {
    const URI      = process.env.NEO4J_URI      || 'neo4j://localhost:7687';
    const USER     = process.env.NEO4J_USER     || 'neo4j';
    const PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

    try {
      const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
      const session = driver.session();
      console.log('[NEO4J] Fetching USES_DB + USES_TOOL edges...');
      const result = await fetchEdgesFromNeo4j(session);
      dbEdges   = result.dbEdges;
      toolEdges = result.toolEdges;
      await session.close();
      await driver.close();
      edgeSource = 'neo4j';
      console.log(`  ✓ ${dbEdges.length} USES_DB, ${toolEdges.length} USES_TOOL from Neo4j`);
    } catch (err) {
      console.warn(`  ⚠ Neo4j unavailable (${err.message}) — falling back to NDJSON`);
    }
  }

  if (dbEdges.length === 0) {
    dbEdges = loadNdjson(path.join(OUT_DIR, 'db-usage-edges.ndjson'));
    console.log(`[NDJSON] Loaded ${dbEdges.length} db-usage edges`);
  }
  if (toolEdges.length === 0) {
    toolEdges = loadNdjson(path.join(OUT_DIR, 'tool-usage-edges.ndjson'));
    console.log(`[NDJSON] Loaded ${toolEdges.length} tool-usage edges`);
  }

  if (dbEdges.length === 0 && toolEdges.length === 0) {
    console.error('✗ No edges found. Run phases 3+4 first (or ensure NDJSON files exist).');
    process.exit(1);
  }

  // ── 2. Build capability map ──────────────────────────────────────────────────
  const capMap = buildCapabilityMap(dbEdges, toolEdges);
  console.log(`\n[MAP] ${capMap.size} files with capabilities`);
  console.log(`      ${dbEdges.length} USES_DB edges, ${toolEdges.length} USES_TOOL edges`);

  // ── 3. Generate traces ───────────────────────────────────────────────────────
  console.log(`\n[GEN] Generating ~${capMap.size * TRACES_PER_FILE} traces (${TRACES_PER_FILE} per file)...`);
  const traces = generateTraces(capMap, TRACES_PER_FILE);
  console.log(`  ✓ Generated ${traces.length} traces`);

  // Stats
  const totalSteps = traces.reduce((s, t) => s + t.step_count, 0);
  const avgMs      = traces.reduce((s, t) => s + t.total_ms, 0) / traces.length;
  const routeCount = traces.filter(t => t.is_route).length;
  console.log(`  Stats: ${totalSteps} total steps, avg ${avgMs.toFixed(1)}ms/trace, ${routeCount} route traces`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Sample trace:');
    console.log(JSON.stringify(traces[0], null, 2));
    console.log('\n✓ Dry-run complete. No files written.');
    return;
  }

  // ── 4. Write NDJSON ──────────────────────────────────────────────────────────
  const ndjsonContent = traces.map(t => JSON.stringify(t)).join('\n') + '\n';
  writeFileSync(OUT_NDJSON, ndjsonContent, 'utf-8');
  console.log(`\n[FILE] Wrote ${traces.length} traces → ${path.relative(ROOT, OUT_NDJSON)}`);

  // ── 5. Write summary ─────────────────────────────────────────────────────────
  const summary = {
    generated_at:    new Date().toISOString(),
    edge_source:     edgeSource,
    files_covered:   capMap.size,
    db_edges_used:   dbEdges.length,
    tool_edges_used: toolEdges.length,
    total_traces:    traces.length,
    total_steps:     totalSteps,
    avg_ms:          +avgMs.toFixed(2),
    route_traces:    routeCount,
    traces_per_file: TRACES_PER_FILE,
  };
  writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`[FILE] Summary → ${path.relative(ROOT, OUT_SUMMARY)}`);

  // ── 6. Optionally write to Neo4j ─────────────────────────────────────────────
  if (!NO_NEO4J) {
    const URI      = process.env.NEO4J_URI      || 'neo4j://localhost:7687';
    const USER     = process.env.NEO4J_USER     || 'neo4j';
    const PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

    try {
      const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
      const session = driver.session();
      console.log('\n[NEO4J] Writing SYNTHETIC_TRACE relationships...');
      const written = await writeTracesToNeo4j(session, traces);
      await session.close();
      await driver.close();
      console.log(`  ✓ ${written} SyntheticTrace nodes + SYNTHETIC_TRACE edges written`);
    } catch (err) {
      console.warn(`  ⚠ Neo4j write skipped: ${err.message}`);
    }
  }

  // ── 7. Optionally write to Redis ─────────────────────────────────────────────
  if (!NO_REDIS) {
    const REDIS_URL  = process.env.REDIS_URL  || 'redis://localhost:6379';
    const REDIS_PASS = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined;

    let redis;
    try {
      redis = new Redis(REDIS_URL, {
        password:           REDIS_PASS,
        lazyConnect:        true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy:      () => null,
      });
      redis.on('error', () => {});
      await redis.connect();
      await redis.ping();
      console.log('\n[REDIS] Writing atlas:synthetic-traces hash...');
      const keys = await writeTracesToRedis(redis, traces);
      console.log(`  ✓ ${keys} file keys in atlas:synthetic-traces (24h TTL)`);
      redis.disconnect();
    } catch (err) {
      console.warn(`  ⚠ Redis write skipped: ${err.message}`);
      try { redis?.disconnect(); } catch {}
    }
  }

  console.log('\n✅ Phase 6 complete');
  console.log(`   ${traces.length} synthetic traces written to ${path.relative(ROOT, OUT_NDJSON)}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
