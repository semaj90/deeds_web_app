import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
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
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const REDIS_URL = env.REDIS_URL || 'redis://127.0.0.1:6379';

const args = process.argv.slice(2);
let fromFile = path.join(FRONTEND_ROOT, '.tmp', 'gemma-recommendations.jsonl');
const fromIdx = args.indexOf('--from');
if (fromIdx !== -1 && args[fromIdx + 1]) {
  fromFile = path.resolve(REPO_ROOT, args[fromIdx + 1]);
}

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

  if (!fs.existsSync(fromFile)) {
    console.error(`Source file not found at ${fromFile}`);
    process.exit(1);
  }

  const recs = readJsonl(fromFile);
  console.log(`Loaded ${recs.length} recommendations to enqueue.`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const redis = new Redis(REDIS_URL);

  let packetsCreated = 0;

  for (const rec of recs) {
    const title = rec.workspace_task_id;
    const featureId = rec.feature_id;
    const nextAction = rec.next_action;
    const summaryHash = crypto.createHash('sha256').update(nextAction).digest('hex');

    try {
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

      if (tspCheck.rows.length === 0) {
        // 3. Insert into task_semantic_packets
        const tspInsert = await pool.query(
          `INSERT INTO task_semantic_packets (
             workspace_task_id, feature_id, summary_model, summary_hash, confidence, status, agent_pickup_ready, deleted, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 0.95, 'idle', true, false, now(), now()) RETURNING id`,
          [taskId, featureId, 'gemma4', summaryHash]
        );
        const packetId = tspInsert.rows[0].id;

        // 4. Enqueue into agent_pickup_queue (Postgres)
        await pool.query(
          `INSERT INTO agent_pickup_queue (
             task_id, packet_id, status, created_at, updated_at, attempts, max_attempts
           ) VALUES ($1, $2, 'ready', now(), now(), 0, 3)`,
          [String(taskId), String(packetId)]
        );

        // 5. Enqueue to Redis
        await redis.rpush('agent_pickup_queue:ready', JSON.stringify({
          task_id: taskId,
          packet_id: packetId,
          feature_id: featureId,
          next_action: nextAction,
          source_ref: rec.source_ref
        }));

        packetsCreated++;
      }
    } catch (err) {
      console.warn(`  ⚠️ Failed to insert packet/queue for ${title}:`, err.message);
    }
  }

  await pool.end();
  await redis.quit();

  console.log(`\n==================================================`);
  console.log(`✓ Agent Pickup Packets Created: ${packetsCreated}`);
  console.log(`==================================================`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
