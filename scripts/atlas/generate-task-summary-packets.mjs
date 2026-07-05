/**
 * generate-task-summary-packets.mjs — Phase 102 T3 + T4
 *
 * T3: For each task_semantic_packets row where summary_llm IS NULL, calls
 *     Gemma4 (via llama-server :8090 → Ollama :11434 fallback) to produce
 *     a 2-sentence agent-facing summary, then writes it back to Postgres.
 *
 * T4: After each summary write, pushes the full packet into Redis as
 *     ace:task:{workspace_task_id}  (JSON string, TTL 24h) so ACE Stage A0
 *     can serve it in O(1) without hitting Postgres.
 *
 * Usage:
 *   node scripts/atlas/generate-task-summary-packets.mjs
 *   node scripts/atlas/generate-task-summary-packets.mjs --dry-run
 *   node scripts/atlas/generate-task-summary-packets.mjs --limit=20
 *   node scripts/atlas/generate-task-summary-packets.mjs --batch=5
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { llamaChat } from './lib/llama-inference.mjs';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const { __dirname, frontendRoot: FRONTEND_ROOT } = resolveAtlasPaths(import.meta.url);

// ── env injection ──────────────────────────────────────────────────────────────
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: resolve(FRONTEND_ROOT, '.env'), override: false });
  dotenv.config({ path: resolve(FRONTEND_ROOT, '.env.local'), override: true });
  dotenv.config({ path: resolve(__dirname, '../../.env'), override: false });
} catch { /* optional */ }

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

const DRY_RUN  = process.argv.includes('--dry-run');
const LIMIT    = (() => { const a = process.argv.find(x => x.startsWith('--limit=')); return a ? parseInt(a.split('=')[1], 10) : 50; })();
const BATCH    = (() => { const a = process.argv.find(x => x.startsWith('--batch=')); return a ? parseInt(a.split('=')[1], 10) : 5; })();

const DB_URL    = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';
const REDIS_TTL = 86400; // 24h

// ── LLM call — llama-server :8090 ────────────────────────────────────────────
async function callLlm(prompt) {
  const text = await llamaChat(prompt, { maxTokens: 1024, temperature: 0.3 });
  return { text, backend: 'llama-server' };
}

function buildPrompt(row) {
  const parts = [
    `Summarize this software task in exactly 2 sentences for an AI coding agent.`,
    `Be concrete about what code or infrastructure needs changing.`,
    ``,
    `task_id: ${row.workspace_task_id ?? row.id}`,
    `feature_id: ${row.feature_id ?? 'unknown'}`,
    `cluster_id: ${row.cluster_id ?? 'none'}`,
    `task_name: ${row.task_name ?? row.feature_id ?? '(unnamed)'}`,
    `next_action: ${row.next_action ?? '(none)'}`,
    ``,
    `Reply with only the 2-sentence summary, no preamble:`,
  ];
  return parts.join('\n');
}

// ── Redis ioredis cold-start pattern ──────────────────────────────────────────
async function connectRedis() {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    await redis.ping();
    return redis;
  } catch {
    redis.disconnect();
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[T3+T4] Task Summary Packet Generator — Phase 102`);
  console.log(`[T3+T4] DRY_RUN=${DRY_RUN}  LIMIT=${LIMIT}  BATCH=${BATCH}`);
  console.log(`[T3+T4] LLM=llama-server :8090`);

  // Postgres
  const pool = new Pool({ connectionString: DB_URL });
  await pool.query('SELECT 1');
  console.log('[T3+T4] Postgres connected');

  // Redis (T4) — non-fatal if unavailable
  const redis = await connectRedis();
  if (redis) {
    console.log('[T3+T4] Redis connected (T4 hot-context enabled)');
  } else {
    console.warn('[T3+T4] Redis not reachable — T4 hot-context skipped');
  }

  // Load workspace_tasks for title lookup
  const { rows: tasks } = await pool.query(
    'SELECT id, title, name, feature_id FROM workspace_tasks'
  );
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // Load packets needing summaries
  const { rows: packets } = await pool.query(
    `SELECT id, workspace_task_id, feature_id, cluster_id, centroid_id,
            source_ref, next_action, status
     FROM task_semantic_packets
     WHERE summary_llm IS NULL
     ORDER BY id
     LIMIT $1`,
    [LIMIT]
  );

  console.log(`[T3+T4] Found ${packets.length} packets needing summaries`);

  let done = 0, errors = 0, redisWrites = 0;

  for (let i = 0; i < packets.length; i += BATCH) {
    const batch = packets.slice(i, i + BATCH);

    await Promise.all(batch.map(async (pkt) => {
      const task = taskMap.get(pkt.workspace_task_id);
      const row = {
        ...pkt,
        task_name: task?.title ?? task?.name ?? null,
      };

      const prompt = buildPrompt(row);

      if (DRY_RUN) {
        console.log(`  [DRY] id=${pkt.id} wt=${pkt.workspace_task_id} feat=${pkt.feature_id}`);
        console.log(`        prompt[:80]: ${prompt.slice(0, 80).replace(/\n/g, ' ')}`);
        done++;
        return;
      }

      try {
        const { text, backend } = await callLlm(prompt);

        // T3 — write summary back to Postgres
        await pool.query(
          `UPDATE task_semantic_packets
           SET summary_llm = $1, summary_model = $2, updated_at = now()
           WHERE id = $3`,
          [text, `${MODEL}/${backend}`, pkt.id]
        );

        // T4 — push to Redis hot-context if task_id is present
        if (redis && pkt.workspace_task_id) {
          const redisKey = `ace:task:${pkt.workspace_task_id}`;
          const redisVal = JSON.stringify({
            workspace_task_id: pkt.workspace_task_id,
            feature_id: pkt.feature_id,
            cluster_id: pkt.cluster_id,
            centroid_id: pkt.centroid_id,
            source_ref: pkt.source_ref,
            next_action: pkt.next_action,
            summary_llm: text,
            summary_model: `${MODEL}/${backend}`,
            generated_at: new Date().toISOString(),
          });
          await redis.setEx(redisKey, REDIS_TTL, redisVal);
          redisWrites++;
        }

        done++;
        process.stdout.write(`\r[T3+T4] ${done}/${packets.length} summaries written (${backend})`);
      } catch (err) {
        errors++;
        console.error(`\n  [ERROR] id=${pkt.id}: ${err.message}`);
      }
    }));
  }

  if (!DRY_RUN) {
    process.stdout.write('\n');
    console.log(`\n[T3+T4] Done — written=${done}  redis=${redisWrites}  errors=${errors}`);

    // Gate check
    const { rows: [{ c }] } = await pool.query(
      "SELECT count(*) c FROM task_semantic_packets WHERE summary_llm IS NOT NULL"
    );
    console.log(`[T3+T4] Gate: task_semantic_packets with summary_llm = ${c}`);

    if (redis) {
      const keys = await redis.keys('ace:task:*');
      console.log(`[T3+T4] Gate: ace:task:* Redis keys = ${keys.length}`);
      await redis.quit();
    }
  } else {
    console.log(`\n[T3+T4] DRY-RUN complete — ${done} packets would be summarized`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('[T3+T4] FATAL:', err);
  process.exit(1);
});
