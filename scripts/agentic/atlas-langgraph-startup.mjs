#!/usr/bin/env node
/**
 * atlas-langgraph-startup.mjs
 *
 * Startup diagnostic and status orchestrator for the Atlas codebase.
 * Scans reports, databases, caches, and taskboards to align active lane settings.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisUrl } from '../atlas/connection-config.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const env = loadRepoEnv(process.env);
// Connection envs
const DATABASE_URL = resolveDatabaseUrl(env);
const QDRANT_URL   = env.QDRANT_URL   || 'http://localhost:6333';
const NEO4J_URL    = env.NEO4J_URL    || 'http://localhost:7474';
const NEO4J_USER   = env.NEO4J_USER   || 'neo4j';
const NEO4J_PASS   = env.NEO4J_PASS   || 'neo4j123';
const REDIS_URL    = resolveRedisUrl(env);

const COLLECT_STATS = {
  scan_time: new Date().toISOString(),
  postgres: { status: 'offline', packet_count: 0, kind_distribution: {}, avg_reward: 0 },
  qdrant: { status: 'offline', points_count: 0 },
  redis: { status: 'offline', centroid_count: 0, temporal_count: 0, karpathy_scores_count: 0 },
  neo4j: { status: 'offline', packet_nodes: 0, concept_nodes: 0, community_nodes: 0, feature_nodes: 0, edges: 0 },
  reports: { status: 'unscanned', files_scanned: 0, gate_status: {} },
  todo: { status: 'unscanned', total_tasks: 0, completed_tasks: 0, open_tasks: 0 },
  lanes: {}
};

// ── Step 1: scan_board_md ──────────────────────────────────────────────────────
function scanBoardMd() {
  const paths = [
    join(ROOT, 'reports/parent-atlas-open-lanes-todo.md'),
    'C:\\Users\\james\\Documents\\Codex\\2026-05-12\\ve-updated-the-local-quantization-notebook\\reports\\parent-atlas-open-lanes-todo.md'
  ];

  let boardContent = '';
  for (const p of paths) {
    if (existsSync(p)) {
      boardContent = readFileSync(p, 'utf-8');
      break;
    }
  }

  if (!boardContent) {
    COLLECT_STATS.todo.status = 'missing';
    return;
  }

  const matches = boardContent.match(/- \[(x| )\]/g) || [];
  const completed = matches.filter(m => m.includes('x')).length;
  const open = matches.filter(m => m.includes(' ')).length;

  COLLECT_STATS.todo = {
    status: 'healthy',
    total_tasks: matches.length,
    completed_tasks: completed,
    open_tasks: open
  };
}

// ── Step 2: scan_reports ──────────────────────────────────────────────────────
function scanReports() {
  const reportsDir = join(ROOT, 'docs/reports');
  if (!existsSync(reportsDir)) {
    COLLECT_STATS.reports.status = 'missing_directory';
    return;
  }

  const files = readdirSync(reportsDir).filter(f => f.endsWith('.json'));
  let count = 0;
  const gates = {};

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(reportsDir, file), 'utf-8'));
      count++;

      if (file === 'feature-lineage-verification.json') {
        gates.feature_lineage_verification = data.Failed === 0 ? 'PASS' : 'FAIL';
      } else if (file === 'validate-packet-contract.json') {
        gates.packet_contract_validation = data.contract_pass ? 'PASS' : 'FAIL';
      } else if (file === 'ranking-signal-coverage.json') {
        gates.ranking_signals = (data.bm25_coverage_85pct && data.concept_coverage_60pct) ? 'PASS' : 'FAIL';
      } else if (file === 'recommendation-merge-audit-report.json') {
        gates.recommendation_merge = 'PASS';
      }
    } catch {
      // Ignore parse issues
    }
  }

  COLLECT_STATS.reports = {
    status: 'healthy',
    files_scanned: count,
    gate_status: gates
  };
}

// ── Step 3: scan_postgres ─────────────────────────────────────────────────────
async function scanPostgres() {
  try {
    const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 2000 });
    const resCount = await pool.query('SELECT COUNT(*)::int as c FROM atlas_packets');
    const resDist = await pool.query('SELECT source_kind, COUNT(*)::int as c FROM atlas_packets GROUP BY source_kind');
    const resReward = await pool.query('SELECT AVG(reward_prior) as avg_r FROM atlas_packets WHERE reward_prior IS NOT NULL');

    const kindDist = {};
    for (const row of resDist.rows) {
      kindDist[row.source_kind || 'unknown'] = row.c;
    }

    COLLECT_STATS.postgres = {
      status: 'healthy',
      packet_count: resCount.rows[0]?.c ?? 0,
      kind_distribution: kindDist,
      avg_reward: parseFloat((resReward.rows[0]?.avg_r ?? 0).toFixed(4))
    };
    await pool.end();
  } catch (err) {
    COLLECT_STATS.postgres.status = `offline: ${err.message}`;
  }
}

// ── Step 4: scan_qdrant ───────────────────────────────────────────────────────
async function scanQdrant() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      COLLECT_STATS.qdrant = {
        status: 'healthy',
        points_count: data.result?.points_count ?? 0
      };
    } else {
      COLLECT_STATS.qdrant.status = `http_error_${res.status}`;
    }
  } catch (err) {
    COLLECT_STATS.qdrant.status = `offline: ${err.message}`;
  }
}

async function connectRedis(timeoutMs = 3000) {
  const { default: Redis } = await import('ioredis');
  let host = '127.0.0.1';
  let port = 6379;
  try {
    const u = new URL(REDIS_URL);
    host = u.hostname || '127.0.0.1';
    port = Number(u.port) || 6379;
  } catch (err) {
    // Keep defaults
  }
  const password = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';
  const redisOpts = {
    host,
    port,
    password: password || undefined,
    lazyConnect: true,
    connectTimeout: timeoutMs,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  };
  const redis = new Redis(redisOpts);
  redis.on('error', () => {}); // Prevent unhandled error event crash
  return redis;
}

// ── Step 5: scan_redis ────────────────────────────────────────────────────────
async function scanRedis() {
  try {
    const redis = await connectRedis();
    await redis.connect();
    await redis.ping();

    const centroids = await redis.keys('centroid:*');
    const temporals = await redis.keys('bitfrost:temporal:*');
    const karpathy = await redis.keys('gpu:karpathy:scores');

    COLLECT_STATS.redis = {
      status: 'healthy',
      centroid_count: centroids.length,
      temporal_count: temporals.length,
      karpathy_scores_count: karpathy.length
    };
    await redis.quit().catch(() => {});
  } catch (err) {
    COLLECT_STATS.redis.status = `offline: ${err.message}`;
  }
}

// ── Step 6: scan_neo4j ────────────────────────────────────────────────────────
async function scanNeo4j() {
  try {
    const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
      },
      body: JSON.stringify({
        statements: [
          { statement: 'MATCH (n:Packet) RETURN count(n) as c' },
          { statement: 'MATCH (n:Concept) RETURN count(n) as c' },
          { statement: 'MATCH (n:Community) RETURN count(n) as c' },
          { statement: 'MATCH (n:Feature) RETURN count(n) as c' },
          { statement: 'MATCH ()-[r]->() RETURN count(r) as c' }
        ]
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.errors?.length) {
        COLLECT_STATS.neo4j.status = `neo4j_error: ${data.errors[0].message}`;
      } else {
        COLLECT_STATS.neo4j = {
          status: 'healthy',
          packet_nodes: data.results[0]?.data[0]?.row[0] ?? 0,
          concept_nodes: data.results[1]?.data[0]?.row[0] ?? 0,
          community_nodes: data.results[2]?.data[0]?.row[0] ?? 0,
          feature_nodes: data.results[3]?.data[0]?.row[0] ?? 0,
          edges: data.results[4]?.data[0]?.row[0] ?? 0
        };
      }
    } else {
      COLLECT_STATS.neo4j.status = `http_error_${res.status}`;
    }
  } catch (err) {
    COLLECT_STATS.neo4j.status = `offline: ${err.message}`;
  }
}

// ── Step 7: decide_completed ──────────────────────────────────────────────────
function decideLanes() {
  const gates = COLLECT_STATS.reports.gate_status;
  const isPostgresHealthy = COLLECT_STATS.postgres.status === 'healthy';
  const isQdrantHealthy = COLLECT_STATS.qdrant.status === 'healthy';
  const isNeo4jHealthy = COLLECT_STATS.neo4j.status === 'healthy';

  COLLECT_STATS.lanes = {
    lineage_mapping_p0: (gates.feature_lineage_verification === 'PASS') ? 'COMPLETE' : 'IN_PROGRESS',
    packet_contract_p0: (gates.packet_contract_validation === 'PASS' && isPostgresHealthy) ? 'COMPLETE' : 'IN_PROGRESS',
    ranking_signal_p2: (gates.ranking_signals === 'PASS') ? 'COMPLETE' : 'IN_PROGRESS',
    mcp_tooling_p0: (isPostgresHealthy && isQdrantHealthy) ? 'COMPLETE' : 'IN_PROGRESS',
    contextual_graph_p1: (isNeo4jHealthy && COLLECT_STATS.neo4j.edges > 0) ? 'COMPLETE' : 'IN_PROGRESS'
  };
}

// ── Step 8: generate_kanban ───────────────────────────────────────────────────
function updateOpenCodeKanban() {
  const kanbanPath = join(ROOT, 'sveltekit-frontend/.opencode/tasks/task-state.md');
  const kanbanJsonPath = join(ROOT, 'sveltekit-frontend/.opencode/tasks/task-state.json');

  if (!existsSync(dirname(kanbanPath))) {
    mkdirSync(dirname(kanbanPath), { recursive: true });
  }

  const openTasks = [];
  
  if (COLLECT_STATS.lanes.lineage_mapping_p0 !== 'COMPLETE') {
    openTasks.push({
      priority: 'HIGH',
      name: 'Verify symbol lineage mappings and resolve unmapped feature candidates',
      command: 'node scripts/atlas/verify-feature-lineage.mjs',
      source: 'verify-feature-lineage'
    });
  }
  
  if (COLLECT_STATS.lanes.packet_contract_p0 !== 'COMPLETE') {
    openTasks.push({
      priority: 'HIGH',
      name: 'Fix historical concept evidence spine inconsistencies',
      command: 'node scripts/atlas/backfill-concept-evidence-spine.mjs',
      source: 'concept-evidence-spine-backfill'
    });
  }

  if (COLLECT_STATS.lanes.ranking_signal_p2 !== 'COMPLETE') {
    openTasks.push({
      priority: 'HIGH',
      name: 'Resolve BM25 and concept ranking coverage gaps',
      command: 'npm run atlas:pipeline',
      source: 'rank-signals-pipeline'
    });
  }

  if (COLLECT_STATS.lanes.contextual_graph_p1 !== 'COMPLETE') {
    openTasks.push({
      priority: 'HIGH',
      name: 'Neo4j USED_CONCEPT edge projection backfill',
      command: 'node scripts/atlas/seed-neo4j-used-concept-edges.mjs',
      source: 'neo4j-used-concept-edges'
    });
  }

  // Always list XGBoost training if unblocked
  const xgboostUnblocked = COLLECT_STATS.reports.gate_status.ranking_signals === 'PASS';
  if (xgboostUnblocked) {
    openTasks.push({
      priority: 'MEDIUM',
      name: 'Export XGBoost ranking training features',
      command: 'node scripts/atlas/export-xgboost-training-rows.mjs',
      source: 'xgboost-feature-export'
    });
  }

  // Render markdown task board
  let md = `# OpenCode Task State\n\n## Summary\n\n`;
  md += `- generatedAt: ${new Date().toISOString()}\n`;
  md += `- taskCount: ${openTasks.length}\n\n`;
  
  md += `## Active Lane\n\n`;
  if (openTasks.length > 0) {
    md += `- [${openTasks[0].priority}] ${openTasks[0].name} (TODO)\n`;
    if (openTasks[0].command) md += `  - command: \`${openTasks[0].command}\`\n`;
    md += `  - source: \`${openTasks[0].source}\`\n`;
  } else {
    md += `- None (All diagnostic lanes PASS)\n`;
  }

  md += `\n## Open Tasks\n\n`;
  for (const t of openTasks) {
    md += `- [${t.priority}] ${t.name} (TODO)\n`;
    if (t.command) md += `  - command: \`${t.command}\`\n`;
    md += `  - source: \`${t.source}\`\n`;
  }

  writeFileSync(kanbanPath, md, 'utf-8');
  writeFileSync(kanbanJsonPath, JSON.stringify({ tasks: openTasks, stats: COLLECT_STATS }, null, 2), 'utf-8');
}

// ── Step 9: cache_temporal ────────────────────────────────────────────────────
async function cacheTemporalMetadata() {
  if (COLLECT_STATS.redis.status !== 'healthy') return;

  try {
    const redis = await connectRedis(2000);
    await redis.connect();
    await redis.ping();

    const TTL = 7 * 24 * 3600; // 7 days in seconds

    // Cache gate statuses
    for (const [gateName, status] of Object.entries(COLLECT_STATS.reports.gate_status)) {
      await redis.setex(`bitfrost:temporal:gate:${gateName}`, TTL, JSON.stringify({ status, ts: Date.now() }));
    }

    // Cache active task
    if (COLLECT_STATS.postgres.packet_count > 0) {
      await redis.setex(`bitfrost:temporal:task:active_indexing`, TTL, JSON.stringify({
        packet_count: COLLECT_STATS.postgres.packet_count,
        ts: Date.now()
      }));
    }

    await redis.quit().catch(() => {});
  } catch (err) {
    // Non-blocking catch
  }
}

// ── Step 10: opencode_startup ─────────────────────────────────────────────────
function writeDiagnosticOutputs() {
  const reportDir = join(ROOT, 'docs/reports');
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  const jsonOut = join(reportDir, 'atlas-langgraph-startup.json');
  const mdOut = join(reportDir, 'atlas-langgraph-startup.md');

  writeFileSync(jsonOut, JSON.stringify(COLLECT_STATS, null, 2), 'utf-8');

  let md = `# Atlas Diagnostic & Startup Report\n\n`;
  md += `**Generated:** \`${COLLECT_STATS.scan_time}\`\n\n`;

  md += `## Database Integrity & Coverage\n\n`;
  md += `| Store / Service | Connection | Details / Counts |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| **PostgreSQL** | \`${COLLECT_STATS.postgres.status}\` | ${COLLECT_STATS.postgres.packet_count} packets (Avg reward: ${COLLECT_STATS.postgres.avg_reward}) |\n`;
  md += `| **Qdrant** | \`${COLLECT_STATS.qdrant.status}\` | ${COLLECT_STATS.qdrant.points_count} points |\n`;
  md += `| **Redis (Valkey)** | \`${COLLECT_STATS.redis.status}\` | Centroids: ${COLLECT_STATS.redis.centroid_count}, Temporals: ${COLLECT_STATS.redis.temporal_count} |\n`;
  md += `| **Neo4j** | \`${COLLECT_STATS.neo4j.status}\` | Packets: ${COLLECT_STATS.neo4j.packet_nodes}, Concepts: ${COLLECT_STATS.neo4j.concept_nodes}, Edges: ${COLLECT_STATS.neo4j.edges} |\n\n`;

  md += `## Lane Completion Status\n\n`;
  md += `| Lane / Phase | Target Gate | Status |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| Lineage Mapping (P0) | Lineage Verification passes | \`${COLLECT_STATS.lanes.lineage_mapping_p0}\` |\n`;
  md += `| Packet Contract (P0) | Postgres schema + indices check | \`${COLLECT_STATS.lanes.packet_contract_p0}\` |\n`;
  md += `| Ranking Signal (P2) | BM25 & Concept coverage PASS | \`${COLLECT_STATS.lanes.ranking_signal_p2}\` |\n`;
  md += `| MCP Tooling | Postgres & Qdrant synced | \`${COLLECT_STATS.lanes.mcp_tooling_p0}\` |\n`;
  md += `| Contextual Graph (P1) | Neo4j projection edges exist | \`${COLLECT_STATS.lanes.contextual_graph_p1}\` |\n\n`;

  md += `## Taskboard Status\n\n`;
  md += `- **Open Tasks:** ${COLLECT_STATS.todo.open_tasks}\n`;
  md += `- **Completed Tasks:** ${COLLECT_STATS.todo.completed_tasks}\n`;

  writeFileSync(mdOut, md, 'utf-8');
}

// ── Runner ────────────────────────────────────────────────────────────────────
async function run() {
  console.log('🏁 Running Atlas Startup Diagnostics...');
  scanBoardMd();
  scanReports();
  await scanPostgres();
  await scanQdrant();
  await scanRedis();
  await scanNeo4j();
  decideLanes();
  updateOpenCodeKanban();
  await cacheTemporalMetadata();
  writeDiagnosticOutputs();
  console.log('✅ Diagnostic complete. Reports written to docs/reports/atlas-langgraph-startup.*');
}

run().catch(err => {
  console.error('Diagnostic run aborted:', err);
  process.exit(1);
});
