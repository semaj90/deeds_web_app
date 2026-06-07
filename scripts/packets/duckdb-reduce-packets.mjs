#!/usr/bin/env node
/**
 * packets:duckdb:reduce
 *
 * Reads memory/packets/nes-chrom-packets.jsonl (and side-car files) with DuckDB,
 * runs MapReduce aggregations, and writes:
 *   memory/packets/atlas-packet-summary.parquet
 *   memory/packets/atlas-packet-summary.json    (human-readable)
 *
 * Requires: DuckDB CLI on PATH or DUCKDB_BIN env var.
 *
 * Usage:
 *   node scripts/packets/duckdb-reduce-packets.mjs [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has('--dry-run');

const DUCKDB_BIN = process.env.DUCKDB_BIN ||
  'C:\\Users\\james\\AppData\\Local\\Programs\\DuckDB\\duckdb.exe';

const PACKETS_FILE  = path.join(ROOT, 'memory', 'packets', 'nes-chrom-packets.jsonl');
const FACTS_FILE    = path.join(ROOT, 'memory', 'packets', 'atlas-packet-facts.jsonl');
const EDGES_FILE    = path.join(ROOT, 'memory', 'packets', 'atlas-graph-edges.jsonl');
const PARQUET_OUT   = path.join(ROOT, 'memory', 'packets', 'atlas-packet-summary.parquet');
const JSON_OUT      = path.join(ROOT, 'memory', 'packets', 'atlas-packet-summary.json');
const DB_PATH       = path.join(ROOT, 'memory', 'packets', 'packets.duckdb');

function duckdb(sql, opts = {}) {
  const flags = opts.json ? [DB_PATH, '-json', '-c', sql] : [DB_PATH, '-c', sql];
  const res = spawnSync(DUCKDB_BIN, flags, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error((res.stderr || res.stdout || '').trim());
  return opts.json ? JSON.parse(res.stdout || '[]') : (res.stdout || '').trim();
}

function mustExist(f) {
  if (!fs.existsSync(f)) throw new Error(`Missing: ${f} — run packets:export first`);
}

function windowsPath(p) {
  // DuckDB on Windows needs forward slashes or escaped backslashes
  return p.replace(/\\/g, '/');
}

async function run() {
  console.log(`\n=== packets:duckdb:reduce${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);

  mustExist(PACKETS_FILE);

  if (DRY_RUN) {
    console.log('Files found, skipping DuckDB execution (dry-run).');
    return;
  }

  const pf  = windowsPath(PACKETS_FILE);
  const ff  = windowsPath(FACTS_FILE);
  const ef  = windowsPath(EDGES_FILE);
  const par = windowsPath(PARQUET_OUT);
  const jsn = windowsPath(JSON_OUT);

  console.log('Loading packets into DuckDB...');
  duckdb(`INSTALL json; LOAD json;`);
  duckdb(`
    CREATE OR REPLACE TABLE packets AS
    SELECT * FROM read_ndjson('${pf}', ignore_errors=true);
  `);

  const packetCount = duckdb(`SELECT count(*) AS n FROM packets;`, { json: true })[0]?.n ?? 0;
  console.log(`  packets loaded: ${packetCount}`);

  if (fs.existsSync(FACTS_FILE)) {
    duckdb(`CREATE OR REPLACE TABLE facts AS
    SELECT * FROM read_ndjson('${ff}', ignore_errors=true);`);
    const fc = duckdb(`SELECT count(*) AS n FROM facts;`, { json: true })[0]?.n ?? 0;
    console.log(`  facts loaded: ${fc}`);
  }
  if (fs.existsSync(EDGES_FILE)) {
    duckdb(`CREATE OR REPLACE TABLE edges AS
    SELECT * FROM read_ndjson('${ef}', ignore_errors=true);`);
    const ec = duckdb(`SELECT count(*) AS n FROM edges;`, { json: true })[0]?.n ?? 0;
    console.log(`  edges loaded: ${ec}`);
  }

  // ── MapReduce aggregations ────────────────────────────────────────────────
  console.log('Running MapReduce aggregations...');

  // 1. Feature × SOM cluster summary (main output)
  duckdb(`
    COPY (
      SELECT
        coalesce(TRY_CAST(feature_id AS VARCHAR), 'none')  AS feat,
        coalesce(TRY_CAST(som_cluster AS VARCHAR), 'none') AS som,
        count(*)                                           AS packet_count,
        avg(TRY_CAST(reward AS DOUBLE))                    AS avg_reward,
        min(captured_at)                                   AS first_seen,
        max(captured_at)                                   AS last_seen
      FROM packets
      GROUP BY feature_id, som_cluster
      ORDER BY packet_count DESC
    ) TO '${par}' (FORMAT PARQUET);
  `);

  // 2. Route state distribution
  const stateDistrib = duckdb(`
    SELECT TRY_CAST(route_state AS VARCHAR) AS route_state, count(*) AS n, avg(TRY_CAST(reward AS DOUBLE)) AS avg_reward
    FROM packets WHERE route_state IS NOT NULL
    GROUP BY 1 ORDER BY n DESC LIMIT 20;
  `, { json: true });

  // 3. Top source_refs across packets (unpack array — json typed column)
  const topRefs = duckdb(`
    SELECT TRY_CAST(sr AS VARCHAR) AS source_ref, count(*) AS hits
    FROM (SELECT unnest(TRY_CAST(source_refs AS VARCHAR[])) AS sr FROM packets WHERE source_refs IS NOT NULL)
    GROUP BY sr
    ORDER BY hits DESC LIMIT 30;
  `, { json: true });

  // 4. Top edge types
  const edgeSummary = fs.existsSync(EDGES_FILE)
    ? duckdb(`SELECT TRY_CAST(edge_type AS VARCHAR) AS etype, count(*) AS n, avg(TRY_CAST(weight AS DOUBLE)) AS avg_weight FROM edges GROUP BY 1 ORDER BY n DESC LIMIT 20;`, { json: true })
    : [];

  // 5. Fact type distribution
  const factSummary = fs.existsSync(FACTS_FILE)
    ? duckdb(`SELECT TRY_CAST(fact_type AS VARCHAR) AS ftype, count(*) AS n, avg(TRY_CAST(score AS DOUBLE)) AS avg_score FROM facts GROUP BY 1 ORDER BY n DESC LIMIT 20;`, { json: true })
    : [];

  // 6. Feature × avg_reward leaderboard
  const featureLeaderboard = duckdb(`
    SELECT TRY_CAST(feature_id AS VARCHAR) AS feature_id, count(*) AS packets, avg(TRY_CAST(reward AS DOUBLE)) AS avg_reward
    FROM packets WHERE feature_id IS NOT NULL
    GROUP BY 1 ORDER BY avg_reward DESC NULLS LAST LIMIT 30;
  `, { json: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    packetCount,
    stateDistrib,
    topRefs,
    edgeSummary,
    factSummary,
    featureLeaderboard,
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\nWrote: ${PARQUET_OUT.split('/').pop()} + ${JSON_OUT.split('/').pop()}`);

  // Print top-5 features
  console.log('\nTop features by avg reward:');
  for (const row of featureLeaderboard.slice(0, 5)) {
    console.log(`  ${row.feature_id}: ${row.packets} packets, avg_reward=${Number(row.avg_reward ?? 0).toFixed(3)}`);
  }
  console.log('Done.\n');
}

run().catch(e => { console.error(e.message); process.exit(1); });
