import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATHS = [
  path.join(REPO_ROOT, '.env.local'),
  path.join(REPO_ROOT, '.env'),
  path.join(FRONTEND_ROOT, '.env.local'),
  path.join(FRONTEND_ROOT, '.env'),
];

function loadEnvFiles(filePaths) {
  const env = {};
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

function normalizeRedisUrl(rawUrl, rawHost, rawPort) {
  const host = rawHost || '127.0.0.1';
  const port = Number(rawPort || 6379);
  if (rawUrl && rawUrl.includes('://')) return rawUrl;
  if (rawUrl && /^[^:/]+:\d+$/.test(rawUrl)) return `redis://${rawUrl}`;
  return `redis://${host}:${port}`;
}

const env = loadEnvFiles(ENV_PATHS);
const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const REDIS_URL = normalizeRedisUrl(env.REDIS_URL, env.REDIS_HOST, env.REDIS_PORT);
const REDIS_PASSWORD = env.REDIS_PASSWORD || 'redis';
const REDIS_HOST = env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(env.REDIS_PORT || 6379);

const args = process.argv.slice(2);
let fromFile = path.join(FRONTEND_ROOT, '.tmp', 'gemma-recommendations.jsonl');
const fromIdx = args.indexOf('--from');
if (fromIdx !== -1 && args[fromIdx + 1]) {
  fromFile = path.resolve(REPO_ROOT, args[fromIdx + 1]);
}
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? Math.max(0, parseInt(args[limitIdx + 1] ?? '0', 10) || 0) : null;

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function main() {
  console.log(`📦 Creating agent pickup packets from ${fromFile}...`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  if (LIMIT !== null) console.log(`Limit: ${LIMIT}`);

  if (!fs.existsSync(fromFile)) {
    console.error(`Source file not found at ${fromFile}`);
    process.exit(1);
  }

  const recs = readJsonl(fromFile).slice(0, LIMIT ?? undefined);
  console.log(`Loaded ${recs.length} recommendations to enqueue.`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const redis = DRY_RUN ? null : new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });

  let packetsCreated = 0;

  for (const rec of recs) {
    const title = rec.workspace_task_id || rec.task_id || rec.recommendation_id || rec.title || 'untitled';
    const featureId = rec.feature_id || (Array.isArray(rec.featureIds) ? rec.featureIds[0] : null) || null;
    const nextAction = rec.next_action || rec.next_command || rec.action || rec.description || '';
    const summaryHash = crypto.createHash('sha256').update(nextAction).digest('hex');

    try {
      if (DRY_RUN) {
        packetsCreated++;
        console.log(`  [DRY] would enqueue title=${title} feature=${featureId || '(none)'} action=${nextAction.slice(0, 80)}`);
        continue;
      }

      if (redis && (redis.status === 'wait' || redis.status === 'connecting')) {
        await redis.connect();
      }

      // 1. Ensure workspace_tasks row exists and get integer ID
      let taskVal = await pool.query('SELECT id FROM workspace_tasks WHERE title = $1', [title]);
      let taskId;
      if (taskVal.rows.length === 0) {
        const insertTask = await pool.query(
          'INSERT INTO workspace_tasks (title, name, workspace_id, feature_id) VALUES ($1, $2, $3, $4) RETURNING id',
          [title, title, 'global', featureId]
        );
        taskId = insertTask.rows[0].id;
      } else {
        taskId = taskVal.rows[0].id;
      }

      // 2. Check if task_semantic_packets row already exists
      const tspCheck = await pool.query(
        'SELECT id FROM task_semantic_packets WHERE workspace_task_id = $1 AND summary_hash = $2',
        [taskId, summaryHash]
      );

      let packetId = null;
      if (tspCheck.rows.length === 0) {
        // 3. Insert into task_semantic_packets (include workspace_id + source_ref)
        const workspaceId = 'global';
        const sourceRef = rec.source_ref || `${workspaceId}:task:${taskId}`;
        const tspInsert = await pool.query(
          `INSERT INTO task_semantic_packets (
             workspace_task_id, workspace_id, feature_id, source_ref, summary_model, summary_hash, confidence, status, agent_pickup_ready, deleted, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, 0.95, 'idle', true, false, now(), now()) RETURNING id`,
          [taskId, workspaceId, featureId, sourceRef, 'gemma4', summaryHash]
        );
        packetId = tspInsert.rows[0].id;
      } else {
        packetId = tspCheck.rows[0].id;
      }

      const queueCheck = await pool.query(
        'SELECT id FROM agent_pickup_queue WHERE task_id = $1 AND packet_id = $2 AND status = $3',
        [String(taskId), String(packetId), 'ready']
      );

      if (queueCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO agent_pickup_queue (
             task_id, packet_id, status, created_at, updated_at, attempts, max_attempts
           ) VALUES ($1, $2, 'ready', now(), now(), 0, 3)`,
          [String(taskId), String(packetId)]
        );
      }

      if (redis) {
        await redis.rpush('agent_pickup_queue:ready', JSON.stringify({
          task_id: taskId,
          packet_id: packetId,
          feature_id: featureId,
          next_action: nextAction,
          source_ref: rec.source_ref || rec.sourceRef || ''
        }));
      }

      packetsCreated++;
    } catch (err) {
      console.warn(`  ⚠️ Failed to insert packet/queue for ${title}:`, err.message);
    }
  }

  await pool.end();
  if (redis) await redis.quit();

  console.log(`\n==================================================`);
  console.log(`✓ Agent Pickup Packets Created: ${packetsCreated}`);
  console.log(`==================================================`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
