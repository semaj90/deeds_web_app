#!/usr/bin/env node
/**
 * MapReduce pipeline — feeds wiki_cards, code_relations_runs, synthesis_runs, mapreduce_jobs
 *
 * Phases:
 *   MAP    — scan code_relations (Postgres) + relationship_map artifacts
 *   SHUFFLE — group edges by relationType, cluster_key, file
 *   REDUCE  — write to CouchDB (wiki_cards, code_relations_runs) + Redis summary key
 *
 * Usage:
 *   node scripts/wiki/run-mapreduce-pipeline.mjs
 *   node scripts/wiki/run-mapreduce-pipeline.mjs --dry-run
 *   node scripts/wiki/run-mapreduce-pipeline.mjs --phase map
 *   node scripts/wiki/run-mapreduce-pipeline.mjs --phase reduce
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import pg from 'pg';
import dotenv from 'dotenv';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PHASE_FILTER = (() => { const i = args.indexOf('--phase'); return i !== -1 ? args[i+1] : null; })();

const DATABASE_URL = process.env.DATABASE_URL;
const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://admin:deeds123@localhost:5984';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

// Parse CouchDB auth
const couchMatch = COUCHDB_URL.match(/^https?:\/\/([^:]+):([^@]+)@(.+)$/);
const [, COUCH_USER, COUCH_PASS, COUCH_HOST] = couchMatch ?? ['', 'admin', 'deeds123', 'localhost:5984'];
const COUCH_BASE = `http://${COUCH_HOST}`;
const COUCH_AUTH = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');

async function couch(method, path, body) {
  const opts = { method, headers: { Authorization: COUCH_AUTH, 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${COUCH_BASE}${path}`, opts);
  return { status: r.status, ok: r.ok, json: await r.json() };
}

const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const t0 = Date.now();

console.log(`\n╔══════════════════════════════════════════╗`);
console.log(`║  MapReduce Pipeline — ${runId}  ║`);
console.log(`╚══════════════════════════════════════════╝`);
console.log(`  dry-run : ${DRY_RUN}`);
console.log(`  phase   : ${PHASE_FILTER ?? 'all'}\n`);

// ── Phase 1: MAP ──────────────────────────────────────────────────────────────
if (!PHASE_FILTER || PHASE_FILTER === 'map') {
  console.log('[MAP] Loading code_relations from Postgres...');

  if (!DATABASE_URL) { console.error('[error] DATABASE_URL not set'); process.exit(1); }
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  const relRes = await pool.query(
    `SELECT source_file, target_key, relation_type, confidence, evidence
     FROM code_relations
     WHERE relation_type != 'EXPORTS_SYMBOL'
     ORDER BY relation_type, source_file`
  );
  await pool.end();

  const edges = relRes.rows;
  console.log(`[MAP] ${edges.length} edges loaded`);

  // Emit intermediate records keyed by relationType
  const intermediate = new Map();
  for (const row of edges) {
    const key = row.relation_type;
    const bucket = intermediate.get(key) ?? [];
    bucket.push({
      sourceFile: row.source_file,
      targetKey: row.target_key,
      confidence: row.confidence,
      evidence: row.evidence,
    });
    intermediate.set(key, bucket);
  }

  // Also load latest relationship_map artifact
  const runsDir = resolve(ROOT, 'memory/runs');
  let latestRunArtifact = null;
  if (existsSync(runsDir)) {
    const runs = readdirSync(runsDir).sort().reverse();
    for (const run of runs) {
      const mapPath = resolve(runsDir, run, 'relationship_map.json');
      if (existsSync(mapPath)) {
        try { latestRunArtifact = JSON.parse(readFileSync(mapPath, 'utf8')); break; }
        catch { /* skip */ }
      }
    }
  }

  console.log(`[MAP] Edge buckets: ${[...intermediate.keys()].join(', ')}`);
  if (latestRunArtifact) console.log(`[MAP] Latest run artifact: ${latestRunArtifact.runId ?? 'unknown'}`);

  // ── Phase 2: SHUFFLE ────────────────────────────────────────────────────────
  if (!PHASE_FILTER || PHASE_FILTER === 'shuffle') {
    console.log('\n[SHUFFLE] Grouping by relationType + cluster...');

    const byType = {};
    for (const [type, rows] of intermediate.entries()) {
      // Count unique sources and targets
      const sources = new Set(rows.map(r => r.sourceFile));
      const targets = new Set(rows.map(r => r.targetKey));
      byType[type] = {
        count: rows.length,
        uniqueSources: sources.size,
        uniqueTargets: targets.size,
        topTargets: [...targets].slice(0, 10),
        topSources: [...sources].slice(0, 10),
        sample: rows.slice(0, 3).map(r => ({ src: r.sourceFile, tgt: r.targetKey, conf: r.confidence })),
      };
    }

    // Group by source file for per-file relation_types
    const byFile = new Map();
    for (const [type, rows] of intermediate.entries()) {
      if (type === 'HAS_AGENTS_SCOPE') continue;
      for (const row of rows) {
        const entry = byFile.get(row.sourceFile) ?? { file: row.sourceFile, relations: [] };
        entry.relations.push({ type, target: row.targetKey, confidence: row.confidence });
        byFile.set(row.sourceFile, entry);
      }
    }

    console.log(`[SHUFFLE] ${Object.keys(byType).length} relation types, ${byFile.size} files with relations`);

    // ── Phase 3: REDUCE → CouchDB ─────────────────────────────────────────────
    if (!PHASE_FILTER || PHASE_FILTER === 'reduce') {
      console.log('\n[REDUCE] Writing to CouchDB...');

      // Write relation_run summary doc
      const relRunDoc = {
        _id: `relation_run:${runId}`,
        type: 'relation_run',
        runId,
        createdAt: new Date().toISOString(),
        totalEdges: edges.length,
        totalFiles: byFile.size,
        edgeCounts: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.count])),
        byType,
        durationMs: Date.now() - t0,
        sourceDb: 'code_relations',
        latestArtifactRunId: latestRunArtifact?.runId ?? null,
      };

      if (!DRY_RUN) {
        const r = await couch('PUT', `/code_relations_runs/${relRunDoc._id}`, relRunDoc);
        console.log(`[REDUCE] code_relations_runs/${relRunDoc._id} — ${r.ok ? 'WRITTEN' : 'WARN: ' + JSON.stringify(r.json).slice(0,100)}`);
      } else {
        console.log(`[REDUCE] [DRY] Would write code_relations_runs/${relRunDoc._id}`);
      }

      // Write wiki_card docs from current gap analysis
      const gapAnalyzerPath = resolve(ROOT, 'src/lib/server/analytics/wiki-card-writer.ts');
      const nesPath = resolve(ROOT, 'docs/graph/nes-glyph-architecture.json');

      // Build a summary wiki_card from the relation data
      const wikiCardDoc = {
        _id: `wiki_card:code_relations:${runId}`,
        type: 'wiki_card',
        title: 'Code Relations Extraction Run',
        createdAt: new Date().toISOString(),
        runId,
        tags: Object.keys(byType),
        files: [...byFile.keys()].slice(0, 20),
        clusterKey: 'codebase-intelligence',
        summary: `Extracted ${edges.length} semantic edges from ${byFile.size} source files. ` +
          `Top relation types: ${Object.entries(byType).sort((a,b) => b[1].count - a[1].count).slice(0,3).map(([t,v]) => `${t}(${v.count})`).join(', ')}.`,
        edgeCounts: Object.fromEntries(Object.entries(byType).map(([k,v]) => [k, v.count])),
        topFiles: [...byFile.entries()]
          .sort((a,b) => b[1].relations.length - a[1].relations.length)
          .slice(0, 10)
          .map(([f, v]) => ({ file: f, relationCount: v.relations.length })),
        gaps: [],
      };

      if (!DRY_RUN) {
        const r = await couch('PUT', `/wiki_cards/${wikiCardDoc._id}`, wikiCardDoc);
        console.log(`[REDUCE] wiki_cards/${wikiCardDoc._id} — ${r.ok ? 'WRITTEN' : 'WARN: ' + JSON.stringify(r.json).slice(0,100)}`);
      } else {
        console.log(`[REDUCE] [DRY] Would write wiki_cards/${wikiCardDoc._id}`);
      }

      // Write mapreduce_job tracking doc
      const jobDoc = {
        _id: `mapreduce_job:${runId}`,
        type: 'mapreduce_job',
        jobId: runId,
        phase: 'complete',
        status: 'ok',
        createdAt: new Date().toISOString(),
        fileCount: byFile.size,
        edgeCount: edges.length,
        durationMs: Date.now() - t0,
        dryRun: DRY_RUN,
        phases: {
          map: { edges: edges.length, buckets: Object.keys(byType).length },
          shuffle: { files: byFile.size, types: Object.keys(byType).length },
          reduce: { couchDbs: ['code_relations_runs', 'wiki_cards', 'mapreduce_jobs'] },
        },
      };

      if (!DRY_RUN) {
        const r = await couch('PUT', `/mapreduce_jobs/${jobDoc._id}`, jobDoc);
        console.log(`[REDUCE] mapreduce_jobs/${jobDoc._id} — ${r.ok ? 'WRITTEN' : 'WARN: ' + JSON.stringify(r.json).slice(0,100)}`);
      } else {
        console.log(`[REDUCE] [DRY] Would write mapreduce_jobs/${jobDoc._id}`);
      }

      // Write Redis summary key for quick ACE reads
      let redisOk = false;
      try {
        const redis = new Redis(REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
        await redis.connect();
        const summary = {
          runId,
          totalEdges: edges.length,
          totalFiles: byFile.size,
          edgeCounts: Object.fromEntries(Object.entries(byType).map(([k,v]) => [k, v.count])),
          updatedAt: new Date().toISOString(),
        };
        if (!DRY_RUN) {
          await redis.setex('mapreduce:latest_run', 3600, JSON.stringify(summary));
          console.log(`[REDUCE] Redis mapreduce:latest_run — WRITTEN (1h TTL)`);
        } else {
          console.log(`[REDUCE] [DRY] Would write Redis mapreduce:latest_run`);
        }
        await redis.quit();
        redisOk = true;
      } catch (e) {
        console.log(`[REDUCE] Redis — SKIPPED (${e.message?.slice(0,60)})`);
      }

      // Query CouchDB views to verify
      console.log('\n[VERIFY] Querying CouchDB views...');
      const viewChecks = [
        ['/code_relations_runs/_design/by_run/_view/by_run?limit=3&descending=true', 'code_relations_runs by_run'],
        ['/wiki_cards/_design/by_tag/_view/by_tag?limit=5', 'wiki_cards by_tag'],
        ['/mapreduce_jobs/_design/by_status/_view/by_status?limit=3', 'mapreduce_jobs by_status'],
      ];
      for (const [path, label] of viewChecks) {
        const r = await couch('GET', path);
        console.log(`  ${label}: ${r.ok ? r.json.rows?.length + ' rows' : JSON.stringify(r.json).slice(0,80)}`);
      }
    }
  }
}

const durationMs = Date.now() - t0;
console.log(`\n✅ MapReduce pipeline complete in ${durationMs}ms${DRY_RUN ? ' (dry-run)' : ''}.`);