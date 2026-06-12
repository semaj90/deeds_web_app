#!/usr/bin/env node
import { createClient } from 'redis';
import fetch from 'node-fetch';
import { setTimeout as wait } from 'timers/promises';
import { resolveRedisUrl } from '../lib/redis-url.mjs';

const REDIS_URL = resolveRedisUrl(process.env);
const BIFROST_URL = process.env.BIFROST_URL || process.env.BIFROST_ENDPOINT || 'http://localhost:3040';
const BIFROST_PATH = '/v1/chat/completions';
const BATCH_DELAY_MS = Number(process.env.WARMUP_BATCH_DELAY_MS || 150);

async function main() {
  console.log('Warmup Bifrost clusters — redis:', REDIS_URL, 'bifrost:', BIFROST_URL + BIFROST_PATH);
  const r = createClient({ url: REDIS_URL });
  r.on('error', err => console.error('Redis error', err));
  await r.connect();

  // Try meta list first
  let clusterKeys = [];
  try {
    const exists = await r.exists('ace:cluster:tags:__meta');
    if (exists) {
      try {
        clusterKeys = await r.sMembers('ace:cluster:tags:__meta');
      } catch (e) {
        // fallback to list
        clusterKeys = await r.lRange('ace:cluster:tags:__meta', 0, -1);
      }
    }
  } catch (e) {
    console.warn('Could not read ace:cluster:tags:__meta:', e.message);
  }

  // If meta not present, scan for keys
  if (!clusterKeys || clusterKeys.length === 0) {
    console.log('Meta key empty — scanning Redis for ace:cluster:tags:*');
    const it = r.scanIterator({ MATCH: 'ace:cluster:tags:*', COUNT: 1000 });
    for await (const k of it) {
      if (k === 'ace:cluster:tags:__meta') continue;
      clusterKeys.push(k);
    }
  }

  console.log('Found', clusterKeys.length, 'cluster keys');
  let warmed = 0;
  for (const key of clusterKeys) {
    try {
      const t = await r.type(key);
      let content = null;
      if (t === 'hash') {
        const obj = await r.hGetAll(key);
        content = obj.summary || JSON.stringify(obj);
      } else if (t === 'string') {
        content = await r.get(key);
      } else if (t === 'list') {
        const items = await r.lRange(key, 0, 9);
        content = items.join('\n');
      } else if (t === 'set') {
        const items = await r.sMembers(key);
        content = items.join('\n');
      } else {
        // try get
        content = await r.get(key);
      }
      if (!content) {
        console.debug('Empty content for', key); continue;
      }

      // Build a lightweight prompt to warm the cache
      const ck = key.split(':').pop();
      const messages = [
        { role: 'system', content: 'You are a lightweight cache seeder. Create a short, focused summary (1-3 sentences) useful for retrieval and reranking.' },
        { role: 'user', content: `Cluster ${ck} summary:\n${content}` }
      ];

      const url = `${BIFROST_URL.replace(/\/$/,'')}${BIFROST_PATH}`;
      const body = JSON.stringify({ model: 'bifrost-seed-1', messages, max_tokens: 64, stream: false });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) {
        console.warn('Bifrost seed failed for', key, 'status', res.status);
      } else {
        warmed++;
      }
      // small delay to be polite
      await wait(BATCH_DELAY_MS);
    } catch (e) {
      console.error('Error processing', key, e.message);
    }
  }

  await r.disconnect();
  console.log(`Warmed ${warmed}/${clusterKeys.length} clusters to Bifrost`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
