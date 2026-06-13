#!/usr/bin/env node
/**
 * build-temporal-entity-index.mjs
 *
 * Extended temporal intelligence layer. Builds Redis keys for every major
 * entity class so OpenCode subagents, LangGraph, and Gemma4 planners can
 * start from current Atlas state instead of re-auditing 250k files cold.
 *
 * Keys written (7-day TTL):
 *   bitfrost:temporal:file:{hash}       → { source_ref, feature_id, domain_class, freshness, ts }
 *   bitfrost:temporal:feature:{id}      → { packet_count, concept_count, avg_reward, ts }
 *   bitfrost:temporal:community:{id}    → { packet_count, avg_conf, ts }
 *   bitfrost:temporal:tool:{hash}       → { tool_name, domain, transport, service, ts }   (from proto)
 *   bitfrost:temporal:task:{id}         → { title, priority, command, blocks, ts }         (from kanban)
 *   bitfrost:temporal:gate:{id}         → { label, value, pass, threshold, ts }            (from board)
 *
 * Index sets for range queries:
 *   bitfrost:temporal:index:file        → sorted set (score=freshness*1000, member=hash)
 *   bitfrost:temporal:index:feature     → sorted set (score=packet_count, member=feature_id)
 *   bitfrost:temporal:index:domain      → hash (domain_class → packet_count JSON)
 *
 * Usage:
 *   node scripts/atlas/build-temporal-entity-index.mjs
 *   node scripts/atlas/build-temporal-entity-index.mjs --apply
 *   node scripts/atlas/build-temporal-entity-index.mjs --apply --verbose
 *   node scripts/atlas/build-temporal-entity-index.mjs --apply --limit=10000
 */

import { existsSync, readFileSync } from 'fs';
import { createHash }               from 'crypto';
import { readdirSync }              from 'fs';
import path                         from 'path';
import { fileURLToPath }            from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const LIMIT   = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '20000', 10);

const TTL_SEC = 7 * 86400; // 7 days

function log(...a)  { console.log(...a); }
function vlog(...a) { if (VERBOSE) console.log(...a); }

// ── Clients ───────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function makePool() {
  const { default: pg } = await import('pg');
  return new pg.Pool({
    connectionString: DATABASE_URL,
    max: 3, connectionTimeoutMillis: 6000,
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

// ── Freshness ──────────────────────────────────────────────────────────────────

function freshness(ts) {
  if (!ts) return 0.5;
  const ageDays = (Date.now() - new Date(ts).getTime()) / 86_400_000;
  return Math.max(0.1, 1.0 - (ageDays / 365) * 0.9);
}

// ── 1. File / packet keys ──────────────────────────────────────────────────────

async function buildFileKeys(pool, redis) {
  log('  Building bitfrost:temporal:file:{hash} keys…');
  const { rows } = await pool.query(`
    SELECT packet_key, source_ref, feature_id, community_id, domain_class,
           reward_prior, created_at
    FROM atlas_packets
    ORDER BY created_at DESC
    LIMIT $1
  `, [LIMIT]);

  log(`    ${rows.length} packets`);

  const pipeline = redis.pipeline();
  const indexArgs = []; // for zadd

  for (const row of rows) {
    const hash = row.packet_key ?? createHash('sha256').update(row.source_ref ?? '').digest('hex').slice(0, 16);
    const key  = `bitfrost:temporal:file:${hash}`;
    const f    = freshness(row.created_at);
    const val  = JSON.stringify({
      source_ref:   row.source_ref,
      feature_id:   row.feature_id,
      domain_class: row.domain_class,
      community_id: row.community_id,
      reward_prior: row.reward_prior,
      freshness:    Math.round(f * 1000) / 1000,
      ts:           row.created_at?.toISOString?.() ?? null,
    });

    if (APPLY) {
      pipeline.set(key, val, 'EX', TTL_SEC);
      indexArgs.push(Math.round(f * 1000), hash); // score=freshness*1000
    }
    vlog(`    ${key}`);
  }

  if (APPLY) {
    // Batch zadd
    if (indexArgs.length > 0) {
      pipeline.del('bitfrost:temporal:index:file');
      for (let i = 0; i < indexArgs.length; i += 2) {
        pipeline.zadd('bitfrost:temporal:index:file', indexArgs[i], indexArgs[i + 1]);
      }
      pipeline.expire('bitfrost:temporal:index:file', TTL_SEC);
    }
    await pipeline.exec();
  }

  log(`    ✅ ${rows.length} file keys`);
  return rows.length;
}

// ── 2. Feature aggregate keys ──────────────────────────────────────────────────

async function buildFeatureKeys(pool, redis) {
  log('  Building bitfrost:temporal:feature:{id} keys…');
  const { rows } = await pool.query(`
    SELECT feature_id,
           COUNT(*) AS packet_count,
           AVG(reward_prior) AS avg_reward,
           COUNT(CASE WHEN concept_ids IS NOT NULL AND array_length(concept_ids,1)>0 THEN 1 END) AS with_concepts
    FROM atlas_packets
    WHERE feature_id IS NOT NULL
    GROUP BY feature_id
    ORDER BY packet_count DESC
  `);

  const pipeline = redis.pipeline();
  const indexArgs = [];

  for (const row of rows) {
    const key = `bitfrost:temporal:feature:${row.feature_id}`;
    const val = JSON.stringify({
      feature_id:    row.feature_id,
      packet_count:  Number(row.packet_count),
      avg_reward:    Math.round(Number(row.avg_reward ?? 0) * 100) / 100,
      with_concepts: Number(row.with_concepts),
      ts:            new Date().toISOString(),
    });
    if (APPLY) {
      pipeline.set(key, val, 'EX', TTL_SEC);
      indexArgs.push(Number(row.packet_count), row.feature_id);
    }
    vlog(`    ${key} count=${row.packet_count}`);
  }

  if (APPLY && indexArgs.length > 0) {
    pipeline.del('bitfrost:temporal:index:feature');
    for (let i = 0; i < indexArgs.length; i += 2) {
      pipeline.zadd('bitfrost:temporal:index:feature', indexArgs[i], String(indexArgs[i + 1]));
    }
    pipeline.expire('bitfrost:temporal:index:feature', TTL_SEC);
    await pipeline.exec();
  }

  log(`    ✅ ${rows.length} feature keys`);
  return rows.length;
}

// ── 3. Community aggregate keys ────────────────────────────────────────────────

async function buildCommunityKeys(pool, redis) {
  log('  Building bitfrost:temporal:community:{id} keys…');
  const { rows } = await pool.query(`
    SELECT community_id,
           COUNT(*) AS packet_count,
           AVG(community_confidence) AS avg_conf
    FROM atlas_packets
    WHERE community_id IS NOT NULL
    GROUP BY community_id
    ORDER BY packet_count DESC
    LIMIT 500
  `);

  const pipeline = redis.pipeline();
  for (const row of rows) {
    const key = `bitfrost:temporal:community:${row.community_id}`;
    const val = JSON.stringify({
      community_id:  row.community_id,
      packet_count:  Number(row.packet_count),
      avg_conf:      Math.round(Number(row.avg_conf ?? 0) * 1000) / 1000,
      ts:            new Date().toISOString(),
    });
    if (APPLY) pipeline.set(key, val, 'EX', TTL_SEC);
    vlog(`    ${key}`);
  }

  if (APPLY) await pipeline.exec();
  log(`    ✅ ${rows.length} community keys`);
  return rows.length;
}

// ── 4. Domain index hash ───────────────────────────────────────────────────────

async function buildDomainIndex(pool, redis) {
  log('  Building bitfrost:temporal:index:domain hash…');
  const { rows } = await pool.query(`
    SELECT domain_class, COUNT(*) AS cnt, AVG(reward_prior) AS avg_reward
    FROM atlas_packets
    WHERE domain_class IS NOT NULL
    GROUP BY domain_class
    ORDER BY cnt DESC
  `);

  if (APPLY) {
    const pipeline = redis.pipeline();
    pipeline.del('bitfrost:temporal:index:domain');
    for (const row of rows) {
      pipeline.hset('bitfrost:temporal:index:domain', row.domain_class, JSON.stringify({
        packet_count: Number(row.cnt),
        avg_reward:   Math.round(Number(row.avg_reward ?? 0) * 100) / 100,
      }));
    }
    pipeline.expire('bitfrost:temporal:index:domain', TTL_SEC);
    await pipeline.exec();
  }

  log(`    ✅ ${rows.length} domain entries`);
  return rows.length;
}

// ── 5. Proto tool keys ─────────────────────────────────────────────────────────

async function buildToolKeys(redis) {
  log('  Building bitfrost:temporal:tool:{hash} keys (from proto)…');

  const protoDirs = [
    path.join(ROOT, 'proto', 'active'),
    path.join(ROOT, 'sveltekit-frontend', 'proto', 'active'),
  ];

  const tools = [];
  for (const dir of protoDirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.proto'))) {
      const content = readFileSync(path.join(dir, file), 'utf8');
      const serviceName = content.match(/service\s+(\w+)/)?.[1] ?? file.replace('.proto', '');
      const rpcs = [...content.matchAll(/rpc\s+(\w+)\s*\(([^)]+)\)/g)];
      const transport = content.includes('stream') ? 'grpc-streaming' : 'grpc';

      for (const rpc of rpcs) {
        tools.push({
          tool_name:  `${serviceName}.${rpc[1]}`,
          service:    serviceName,
          method:     rpc[1],
          input_type: rpc[2].trim().replace(/^stream\s+/, ''),
          domain:     inferDomain(file, serviceName),
          transport,
          proto_file: file,
        });
      }
    }
  }

  const pipeline = redis.pipeline();
  for (const tool of tools) {
    const hash = createHash('sha256').update(tool.tool_name).digest('hex').slice(0, 16);
    const key  = `bitfrost:temporal:tool:${hash}`;
    const val  = JSON.stringify({ ...tool, ts: new Date().toISOString() });
    if (APPLY) pipeline.set(key, val, 'EX', TTL_SEC);
    vlog(`    ${key} → ${tool.tool_name}`);
  }

  if (APPLY) await pipeline.exec();
  log(`    ✅ ${tools.length} tool keys from ${protoDirs.length} proto dirs`);
  return tools.length;
}

function inferDomain(filename, service) {
  if (/embed/.test(filename + service)) return 'embed';
  if (/retriev/.test(filename + service)) return 'search';
  if (/turbovec|vector/.test(filename + service)) return 'search';
  if (/graph|topology|som/.test(filename + service)) return 'graph';
  if (/tool|mcp|agent/.test(filename + service)) return 'mcp';
  if (/cache|bifrost|redis/.test(filename + service)) return 'cache';
  if (/evidence|legal|case/.test(filename + service)) return 'legal';
  if (/code|ast|codebase/.test(filename + service)) return 'code';
  return 'atlas';
}

// ── 6. Kanban task keys ────────────────────────────────────────────────────────

async function buildTaskKeys(redis) {
  log('  Building bitfrost:temporal:task:{id} keys (from kanban)…');

  const kanbanPath = path.join(ROOT, 'docs', 'reports', 'atlas', 'atlas-kanban-tasks.json');
  if (!existsSync(kanbanPath)) {
    log('    (atlas-kanban-tasks.json not found — run atlas:startup:apply first)');
    return 0;
  }

  const kanban = JSON.parse(readFileSync(kanbanPath, 'utf8'));
  const tasks  = kanban.tasks ?? [];

  const pipeline = redis.pipeline();
  for (const task of tasks) {
    const key = `bitfrost:temporal:task:${task.id}`;
    const val = JSON.stringify({
      id:       task.id,
      title:    task.title,
      priority: task.priority,
      command:  task.command,
      blocks:   task.blocks ?? [],
      ts:       new Date().toISOString(),
    });
    if (APPLY) pipeline.set(key, val, 'EX', TTL_SEC);
    vlog(`    ${key} [${task.priority}]`);
  }

  if (APPLY) await pipeline.exec();
  log(`    ✅ ${tasks.length} task keys`);
  return tasks.length;
}

// ── 7. Gate state keys ─────────────────────────────────────────────────────────

async function buildGateKeys(redis) {
  log('  Building bitfrost:temporal:gate:{id} keys (from board-state)…');

  const boardPath = path.join(ROOT, 'docs', 'reports', 'atlas', 'atlas-board-state.json');
  if (!existsSync(boardPath)) {
    log('    (atlas-board-state.json not found — run atlas:startup:apply first)');
    return 0;
  }

  const board = JSON.parse(readFileSync(boardPath, 'utf8'));
  const gates = board.gates ?? {};

  const pipeline = redis.pipeline();
  for (const [id, gate] of Object.entries(gates)) {
    const key = `bitfrost:temporal:gate:${id}`;
    const val = JSON.stringify({
      id,
      label:     gate.label,
      value:     gate.value,
      threshold: gate.threshold,
      pass:      gate.pass,
      unit:      gate.unit,
      ts:        new Date().toISOString(),
    });
    if (APPLY) pipeline.set(key, val, 'EX', TTL_SEC);
    vlog(`    ${key} ${gate.pass ? '✅' : '❌'}`);
  }

  if (APPLY) await pipeline.exec();
  log(`    ✅ ${Object.keys(gates).length} gate keys`);
  return Object.keys(gates).length;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  log('\n═══ Atlas Temporal Entity Index ═══\n');
  log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  if (!APPLY) log('(pass --apply to write Redis keys)\n');

  let pool, redis;
  try {
    pool  = await makePool();
    redis = await makeRedis();
  } catch (e) {
    console.error('Connection failed:', e.message);
    process.exit(1);
  }

  const t0 = Date.now();

  try {
    const fileCnt  = await buildFileKeys(pool, redis);
    const featCnt  = await buildFeatureKeys(pool, redis);
    const commCnt  = await buildCommunityKeys(pool, redis);
    const domCnt   = await buildDomainIndex(pool, redis);
    const toolCnt  = await buildToolKeys(redis);
    const taskCnt  = await buildTaskKeys(redis);
    const gateCnt  = await buildGateKeys(redis);

    const totalMs = Date.now() - t0;

    log('\n══ Summary ═════════════════════════════════════');
    log(`  file keys:       ${fileCnt}`);
    log(`  feature keys:    ${featCnt}`);
    log(`  community keys:  ${commCnt}`);
    log(`  domain entries:  ${domCnt}`);
    log(`  tool keys:       ${toolCnt}`);
    log(`  task keys:       ${taskCnt}`);
    log(`  gate keys:       ${gateCnt}`);
    log(`  TTL:             7 days`);
    log(`  Time:            ${totalMs}ms`);

    if (!APPLY) {
      log('\n  Run with --apply to write keys to Redis.');
    } else {
      log(`\n  ✅ All keys written (TTL=7d)`);
    }
  } finally {
    await pool.end().catch(() => {});
    await redis.quit().catch(() => {});
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
