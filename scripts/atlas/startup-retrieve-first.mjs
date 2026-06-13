#!/usr/bin/env node
/**
 * startup-retrieve-first.mjs
 *
 * RULE: known state → retrieve → act
 * NOT:  cold boot  → scan repo → re-discover everything
 *
 * Reads the four atlas truth reports + Bitfrost temporal cache and projects
 * a compact "what was true at last successful pass" view into Redis so
 * OpenCode, Gemma4, and LangGraph can warm-boot in O(1) hash reads.
 *
 * Inputs (read-only):
 *   docs/reports/atlas/atlas-board-state.json   ← gates, postgres/qdrant/neo4j health
 *   docs/reports/atlas/atlas-kanban-tasks.json  ← outstanding P0/P1 tasks
 *   docs/reports/atlas/atlas-risk-report.json   ← blockers, xgboost_gate_pass
 *   docs/reports/atlas/atlas-next-actions.json  ← architecture lane + quick wins
 *   bitfrost:temporal:index:domain (Redis hash) ← hot domains by packet count
 *   bitfrost:temporal:tool:* (Redis keys)        ← hot MCP/RPC tools by recency
 *   agent_traces (DB)                            ← last 25 success traces
 *
 * Outputs (Redis, TTL 7 days):
 *   ace:startup:last_board    → hash: gates_pass, gates_total, gate_pct, pg/qdrant/neo4j health
 *   ace:startup:last_tasks    → JSON: top 20 outstanding kanban tasks
 *   ace:startup:last_success  → JSON: last 25 success traces (trace_id, goal, reward, outcome)
 *   ace:startup:hot_tools     → JSON: top 30 tools by recency × invocation count
 *   ace:startup:hot_domains   → JSON: top 14 domains by packet density
 *   ace:startup:architecture  → hash: active_lane, next_lane, future_lane, som_role
 *   ace:startup:meta          → hash: built_at, source_reports[], ttl_sec
 *
 * Usage:
 *   node scripts/atlas/startup-retrieve-first.mjs              # dry-run
 *   node scripts/atlas/startup-retrieve-first.mjs --apply      # write Redis
 *   node scripts/atlas/startup-retrieve-first.mjs --apply --verbose
 *
 * Verification:
 *   docker exec legal-ai-redis redis-cli HGETALL ace:startup:last_board
 *   docker exec legal-ai-redis redis-cli TTL    ace:startup:hot_domains
 */

import { existsSync, readFileSync } from 'fs';
import path                         from 'path';
import { fileURLToPath }            from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const TTL_SEC = 7 * 86400; // 7 days — matches bitfrost:temporal:*

const REPORTS = {
  board:   path.join(ROOT, 'docs/reports/atlas/atlas-board-state.json'),
  kanban:  path.join(ROOT, 'docs/reports/atlas/atlas-kanban-tasks.json'),
  risk:    path.join(ROOT, 'docs/reports/atlas/atlas-risk-report.json'),
  actions: path.join(ROOT, 'docs/reports/atlas/atlas-next-actions.json'),
};

function log(...a)  { console.log(...a); }
function vlog(...a) { if (VERBOSE) console.log(...a); }

// ── Clients ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function makePool() {
  const { default: pg } = await import('pg');
  return new pg.Pool({
    connectionString: DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 6000,
  });
}

async function makeRedis() {
  const { default: Redis } = await import('ioredis');
  const r = new Redis({
    host:                 process.env.REDIS_HOST ?? '127.0.0.1',
    port:                 parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password:             process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis',
    lazyConnect:          true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   false,
    retryStrategy:        () => null,
  });
  r.on('error', () => {});
  await r.connect();
  await r.ping();
  return r;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

function loadJson(name) {
  const fp = REPORTS[name];
  if (!existsSync(fp)) {
    vlog(`  ⚠ ${name} report missing: ${fp}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(fp, 'utf8'));
  } catch (e) {
    vlog(`  ⚠ ${name} parse failed: ${e.message}`);
    return null;
  }
}

// ── Projections ───────────────────────────────────────────────────────────────

/**
 * Project board-state into the warm-boot summary an agent needs in one read.
 * Keep it scalar/short — agents should not need to parse nested JSON.
 */
function projectBoard(board) {
  if (!board) return null;
  const gates = board.gates ?? {};
  const gateNames = Object.keys(gates);
  const gatesPass = gateNames.filter(g => gates[g]?.pass).length;
  const gatesFail = gateNames.filter(g => !gates[g]?.pass);

  return {
    built_at:           new Date().toISOString(),
    board_generated_at: String(board.generated ?? ''),
    gates_pass:         String(board.gate_summary?.pass  ?? gatesPass),
    gates_total:        String(board.gate_summary?.total ?? gateNames.length),
    gate_pct:           String(board.gate_summary?.pct   ?? Math.round(gatesPass / Math.max(1, gateNames.length) * 100)),
    gates_failing:      JSON.stringify(gatesFail),
    pg_total_packets:   String(board.postgres?.total_packets       ?? 0),
    pg_addressable:     String(board.postgres?.addressable_packets ?? 0),
    pg_with_summary:    String(board.postgres?.with_summary        ?? 0),
    pg_with_concepts:   String(board.postgres?.with_concepts_addressable ?? 0),
    pg_with_domain:     String(board.postgres?.with_domain         ?? 0),
    qdrant_points:      String(board.qdrant?.points_count          ?? 0),
    neo4j_used_concept: String(board.neo4j?.used_concept_edges     ?? 0),
    neo4j_source:       String(board.neo4j?.source                 ?? 'none'),
    redis_karpathy:     String(board.redis?.karpathy_files         ?? 0),
  };
}

function projectKanban(kanban) {
  if (!kanban?.tasks) return [];
  const tasks = Array.isArray(kanban.tasks) ? kanban.tasks : [];
  return tasks.slice(0, 20).map(t => ({
    id:       t.id       ?? t.task_id ?? '',
    title:    t.title    ?? t.label   ?? '',
    priority: t.priority ?? 'P2',
    command:  t.command  ?? '',
    blocks:   Array.isArray(t.blocks) ? t.blocks : [],
  }));
}

function projectActions(actions) {
  const arch = actions?.architecture ?? {};
  return {
    active_lane:  String(arch.active_lane  ?? ''),
    next_lane:    String(arch.next_lane    ?? ''),
    future_lane:  String(arch.future_lane  ?? ''),
    som_role:     String(arch.som_role     ?? ''),
    xgboost_role: String(arch.xgboost_role ?? ''),
    quick_wins:   JSON.stringify((actions?.quick_wins ?? []).slice(0, 5)),
  };
}

// ── Last-success traces from Postgres ─────────────────────────────────────────

async function fetchLastSuccessTraces(pool, n = 25) {
  // agent_traces table shape varies; do a tolerant pull
  try {
    const r = await pool.query(`
      SELECT
        trace_id,
        COALESCE(goal, '')                 AS goal,
        COALESCE(retrieval_strategy, '')   AS strategy,
        COALESCE(outcome, '')              AS outcome,
        COALESCE(reward, 0)::numeric       AS reward,
        COALESCE(repair_actions, '[]'::jsonb) AS repair_actions,
        COALESCE(selected_concepts, '[]'::jsonb) AS selected_concepts,
        created_at
      FROM agent_traces
      WHERE outcome = 'success'
      ORDER BY created_at DESC
      LIMIT $1
    `, [n]);
    return r.rows.map(row => ({
      trace_id:          row.trace_id,
      goal:              String(row.goal).slice(0, 200),
      strategy:          row.strategy,
      reward:            Number(row.reward),
      outcome:           row.outcome,
      n_repair_actions:  Array.isArray(row.repair_actions)    ? row.repair_actions.length    : 0,
      n_concepts:        Array.isArray(row.selected_concepts) ? row.selected_concepts.length : 0,
      created_at:        row.created_at,
    }));
  } catch (e) {
    vlog(`  ⚠ agent_traces unavailable: ${e.message}`);
    return [];
  }
}

// ── Hot tools (from bitfrost:temporal:tool:*) ─────────────────────────────────

async function fetchHotTools(redis, max = 30) {
  try {
    const tools = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'bitfrost:temporal:tool:*', 'COUNT', 200);
      cursor = next;
      for (const key of batch) {
        const raw = await redis.get(key).catch(() => null);
        if (!raw) continue;
        try {
          const v = JSON.parse(raw);
          tools.push({
            tool_name: v.tool_name ?? key.split(':').pop(),
            domain:    v.domain    ?? 'unknown',
            transport: v.transport ?? 'unknown',
            service:   v.service   ?? '',
            ts:        v.ts        ?? 0,
          });
        } catch { /* skip malformed */ }
      }
      if (tools.length > 500) break; // bound work
    } while (cursor !== '0');

    return tools
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, max);
  } catch (e) {
    vlog(`  ⚠ hot tool scan failed: ${e.message}`);
    return [];
  }
}

// ── Hot domains (from bitfrost:temporal:index:domain) ─────────────────────────

async function fetchHotDomains(redis) {
  try {
    const h = await redis.hgetall('bitfrost:temporal:index:domain');
    if (!h || Object.keys(h).length === 0) return [];
    return Object.entries(h)
      .map(([domain, raw]) => {
        try {
          const v = JSON.parse(raw);
          return { domain, packet_count: Number(v.packet_count ?? 0), avg_freshness: Number(v.avg_freshness ?? 0) };
        } catch {
          return { domain, packet_count: 0, avg_freshness: 0 };
        }
      })
      .sort((a, b) => b.packet_count - a.packet_count)
      .slice(0, 14); // 14 domains in the taxonomy
  } catch (e) {
    vlog(`  ⚠ hot domain read failed: ${e.message}`);
    return [];
  }
}

// ── Writers ───────────────────────────────────────────────────────────────────

async function writeStartupKeys(redis, projection) {
  const ops = redis.multi();

  if (projection.board) {
    ops.del('ace:startup:last_board');
    ops.hset('ace:startup:last_board', projection.board);
    ops.expire('ace:startup:last_board', TTL_SEC);
  }

  ops.set('ace:startup:last_tasks',   JSON.stringify(projection.tasks      ?? []), 'EX', TTL_SEC);
  ops.set('ace:startup:last_success', JSON.stringify(projection.success    ?? []), 'EX', TTL_SEC);
  ops.set('ace:startup:hot_tools',    JSON.stringify(projection.hotTools   ?? []), 'EX', TTL_SEC);
  ops.set('ace:startup:hot_domains',  JSON.stringify(projection.hotDomains ?? []), 'EX', TTL_SEC);

  if (projection.architecture) {
    ops.del('ace:startup:architecture');
    ops.hset('ace:startup:architecture', projection.architecture);
    ops.expire('ace:startup:architecture', TTL_SEC);
  }

  const meta = {
    built_at:       new Date().toISOString(),
    source_reports: JSON.stringify(['board', 'kanban', 'risk', 'next_actions']),
    ttl_sec:        String(TTL_SEC),
    last_traces:    String(projection.success?.length    ?? 0),
    last_tasks:     String(projection.tasks?.length      ?? 0),
    hot_tools:      String(projection.hotTools?.length   ?? 0),
    hot_domains:    String(projection.hotDomains?.length ?? 0),
  };
  ops.del('ace:startup:meta');
  ops.hset('ace:startup:meta', meta);
  ops.expire('ace:startup:meta', TTL_SEC);

  await ops.exec();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  log('\n═══ Startup Retrieve-First Projection ═══\n');
  log(`Mode:    ${APPLY ? 'APPLY (writes Redis)' : 'DRY-RUN (no writes)'}`);
  log(`TTL:     ${TTL_SEC}s (7 days)`);
  log(`Reports: ${Object.values(REPORTS).map(p => path.relative(ROOT, p)).join(', ')}`);
  log('');

  const board   = loadJson('board');
  const kanban  = loadJson('kanban');
  const risk    = loadJson('risk');
  const actions = loadJson('actions');

  const reportsPresent = [board, kanban, risk, actions].filter(Boolean).length;
  log(`Reports loaded: ${reportsPresent}/4`);

  const projection = {
    board:        projectBoard(board),
    tasks:        projectKanban(kanban),
    architecture: projectActions(actions),
    success:      [],
    hotTools:     [],
    hotDomains:   [],
  };

  let pool = null, redis = null;
  try {
    pool  = await makePool();
    redis = await makeRedis();

    projection.success    = await fetchLastSuccessTraces(pool, 25);
    projection.hotTools   = await fetchHotTools(redis, 30);
    projection.hotDomains = await fetchHotDomains(redis);
  } catch (e) {
    log(`⚠ live data fetch failed: ${e.message}`);
  }

  log('');
  log('Projected state:');
  if (projection.board) {
    log(`  board.gates             ${projection.board.gates_pass}/${projection.board.gates_total} (${projection.board.gate_pct}%)`);
    log(`  board.qdrant_points     ${projection.board.qdrant_points}`);
    log(`  board.neo4j_used_concept ${projection.board.neo4j_used_concept} [source: ${projection.board.neo4j_source}]`);
  }
  log(`  tasks                   ${projection.tasks.length} outstanding`);
  log(`  success traces          ${projection.success.length}`);
  log(`  hot_tools               ${projection.hotTools.length}`);
  log(`  hot_domains             ${projection.hotDomains.length}`);
  if (projection.architecture?.active_lane) {
    log(`  architecture.active     ${projection.architecture.active_lane.slice(0, 70)}`);
  }
  log('');

  if (APPLY) {
    if (!redis) {
      log('❌ Redis unavailable — cannot write startup keys');
      process.exitCode = 1;
    } else {
      try {
        await writeStartupKeys(redis, projection);
        log('✅ Wrote 7 startup keys to Redis (TTL 7d):');
        log('     ace:startup:last_board    (hash)');
        log('     ace:startup:last_tasks    (json)');
        log('     ace:startup:last_success  (json)');
        log('     ace:startup:hot_tools     (json)');
        log('     ace:startup:hot_domains   (json)');
        log('     ace:startup:architecture  (hash)');
        log('     ace:startup:meta          (hash)');
      } catch (e) {
        log(`❌ Redis write failed: ${e.message}`);
        process.exitCode = 1;
      }
    }
  } else {
    log('(dry-run — no Redis writes; pass --apply to commit)');
  }

  try { await pool?.end();   } catch { /* ignore */ }
  try { await redis?.quit(); } catch { /* ignore */ }

  log(`\nDone in ${Date.now() - t0}ms\n`);
}

main().catch(e => {
  console.error('startup-retrieve-first FAILED:', e);
  process.exit(1);
});
