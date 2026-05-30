#!/usr/bin/env node
/**
 * scripts/atlas/record-fix-outcome.mjs
 *
 * Record a fix outcome and its reward score to the outcome ledger in PostgreSQL.
 *
 * Usage:
 *   node scripts/atlas/record-fix-outcome.mjs --task-id task-123 --reward-score 0.85 --reward-reason "Successfully resolved compiler drift" --tools search.dev_context,context.build_kv_packet
 *   node scripts/atlas/record-fix-outcome.mjs --dry-run ...
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: 'sveltekit-frontend/.env' });

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');

function flagVal(name, fallback = '') {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

const TASK_ID = flagVal('--task-id');
const REWARD_SCORE = parseFloat(flagVal('--reward-score', '0.0'));
const REWARD_REASON = flagVal('--reward-reason', 'No reason provided');
const TOOLS_USED = flagVal('--tools', '').split(',').filter(Boolean);

if (!TASK_ID && !DRY_RUN) {
  console.error('❌ --task-id is required');
  process.exit(1);
}

const DB_URL = process.env.DATABASE_URL;

async function record() {
  console.log('══ Record Fix Outcome ══════════════════════════════════');
  console.log(`  Task ID:       ${TASK_ID}`);
  console.log(`  Reward Score:  ${REWARD_SCORE}`);
  console.log(`  Reason:        ${REWARD_REASON}`);
  console.log(`  Tools Used:    ${TOOLS_USED.join(', ')}`);
  console.log(`  Dry Run:       ${DRY_RUN ? 'YES' : 'NO'}`);
  console.log('');

  // 1. Load the task from ndjson if available to get extra metadata (sourceRefs, queryHash)
  let queryHash = 'unknown';
  let sourceRefs = [];
  try {
    const tasksPath = path.join(ROOT, '.tmp', 'ingest', 'gemma4-tasks.ndjson');
    if (fs.existsSync(tasksPath)) {
      const tasks = fs.readFileSync(tasksPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
      const matched = tasks.find(t => t.id === TASK_ID);
      if (matched) {
        queryHash = matched.queryHash || matched.node_id || 'unknown';
        if (matched.sourceRef) sourceRefs = [matched.sourceRef];
      }
    }
  } catch (err) {
    console.warn(`  ⚠️ Could not read tasks metadata: ${err.message}`);
  }

  // 2. Fetch Graph Version from Redis if available
  let graphVersion = 'unknown';
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    graphVersion = (await redis.get('graph:refresh:version')) || 'unknown';
    await redis.quit();
  } catch {
    // Redis down, default to unknown
  }

  if (DRY_RUN) {
    console.log('  [DRY-RUN] Would insert into intent_synthesis_rewards:');
    console.log(JSON.stringify({
      query_hash: queryHash,
      context_pack_key: `task:${TASK_ID}`,
      selected_lane: 'phase20:agentic-fix',
      source_refs: sourceRefs,
      feedback: { tools: TOOLS_USED, graphVersion },
      reward_score: REWARD_SCORE,
      reward_reason: REWARD_REASON,
      created_at: new Date().toISOString()
    }, null, 2));
    console.log('\n  ✅ Dry-run complete. No database changes made.');
    return;
  }

  if (!DB_URL) {
    console.error('❌ DATABASE_URL env var not set.');
    process.exit(1);
  }

  const sql = postgres(DB_URL);
  try {
    const result = await sql`
      INSERT INTO intent_synthesis_rewards (
        query_hash,
        context_pack_key,
        selected_lane,
        source_refs,
        feedback,
        reward_score,
        reward_reason,
        created_at
      ) VALUES (
        ${queryHash},
        ${`task:${TASK_ID}`},
        'phase20:agentic-fix',
        ${sql.json(sourceRefs)},
        ${sql.json({ tools: TOOLS_USED, graphVersion })},
        ${REWARD_SCORE},
        ${REWARD_REASON},
        NOW()
      )
      RETURNING id
    `;
    console.log(`  ✅ Successfully recorded outcome! Row ID: ${result[0].id}`);
  } catch (err) {
    console.error(`  ❌ Database insertion failed: ${err.message}`);
  } finally {
    await sql.end();
  }
}

record().catch(console.error);
