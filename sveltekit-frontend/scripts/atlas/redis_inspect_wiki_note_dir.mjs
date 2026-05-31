#!/usr/bin/env node
import Redis from 'ioredis';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const r = new Redis(REDIS_URL, { lazyConnect: true });
await r.ping();

const pattern = 'wiki:note:dir:*';
const keys = await r.keys(pattern);
console.log('Found', keys.length, 'keys for', pattern);
const take = Math.min(50, keys.length);
for (let i = 0; i < take; i++) {
  const k = keys[i];
  const t = await r.type(k);
  let info = { key: k, type: t };
  try {
    if (t === 'string') {
      const v = await r.get(k);
      info.preview = v ? v.slice(0, 200) : null;
    } else if (t === 'hash') {
      const h = await r.hgetall(k);
      info.previewKeys = Object.keys(h).slice(0,10);
    } else if (t === 'list') {
      const l = await r.lrange(k, 0, 4);
      info.len = await r.llen(k);
      info.sample = l;
    } else if (t === 'set') {
      info.count = await r.scard(k);
    } else if (t === 'zset') {
      info.count = await r.zcard(k);
    }
  } catch (e) { info.err = e.message; }
  console.log(JSON.stringify(info));
}

await r.quit();
process.exit(0);
