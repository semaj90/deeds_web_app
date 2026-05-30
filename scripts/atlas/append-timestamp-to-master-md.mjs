#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// Optional Redis dedupe: will attempt to use ioredis if installed.
let RedisClient = null;
async function getRedis(url) {
  if (RedisClient) return RedisClient;
  try {
    const IORedis = await import('ioredis');
    const client = new IORedis.default(url);
    // quick ping
    await client.ping();
    RedisClient = client;
    return client;
  } catch (e) {
    return null;
  }
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const message = argv.filter(a=>!a.startsWith('--')).join(' ') || 'Automated timestamp note';
const USE_REDIS = argv.includes('--use-redis');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const timestamp = new Date().toISOString();

const targets = [
  path.join(ROOT, 'AGENTS.md'),
  path.join(ROOT, 'llms.md'),
  path.join(ROOT, 'sveltekit-frontend', 'AGENTS.md'),
  path.join(ROOT, 'sveltekit-frontend', 'llms.md'),
];

const INDEX_PATH = path.join(ROOT, 'memory', 'exports', 'agents-notes-index.json');

function fileIndexContains(hash) {
  try {
    if (!fs.existsSync(INDEX_PATH)) return false;
    const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) || {};
    return !!idx[hash];
  } catch (e) { return false; }
}

function fileIndexAdd(hash, note) {
  let idx = {};
  try { idx = fs.existsSync(INDEX_PATH) ? JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) || {} : {}; } catch (e) { idx = {}; }
  idx[hash] = { note, ts: new Date().toISOString() };
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2), 'utf8');
}

async function run() {
  const hash = crypto.createHash('sha256').update(message).digest('hex');

  // Try Redis dedupe first if requested
  if (USE_REDIS) {
    const client = await getRedis(REDIS_URL);
    if (client) {
      try {
        const key = `atlas:agents_notes:${hash}`;
        const exists = await client.get(key);
        if (exists) {
          console.log('Note already present in Redis; skipping append.');
          await client.quit();
          return;
        }
        // set with 30d TTL
        await client.set(key, JSON.stringify({ message, ts: timestamp }), 'EX', 60 * 60 * 24 * 30);
        await client.quit();
      } catch (e) {
        console.warn('Redis dedupe failed, falling back to file index:', e.message);
      }
    } else {
      console.log('ioredis not available or Redis not reachable; falling back to file index.');
    }
  }

  // File-based dedupe fallback
  if (fileIndexContains(hash)) {
    console.log('Note already present in local index; skipping append.');
    return;
  }

  for (const t of targets) {
    try {
      if (!fs.existsSync(t)) continue;
      const note = `\n\n[${timestamp}] ${message}`;
      fs.appendFileSync(t, note, 'utf8');
      console.log(`Appended note to ${t}`);
    } catch (e) {
      console.error(`Failed to append to ${t}: ${e.message}`);
    }
  }

  fileIndexAdd(hash, message);
  console.log('Done.');
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
