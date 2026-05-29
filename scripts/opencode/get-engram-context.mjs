#!/usr/bin/env node
import fs from 'fs/promises';

const REDIS_KEYS = [
  'engram:user:chat:latest',
  'ace:packet:latest',
  'atlas:context:latest',
  'opencode:context:latest'
];

async function tryRedis() {
  try {
    const mod = await import('ioredis');
    const Redis = mod.default || mod;
    const client = new Redis();
    for (const k of REDIS_KEYS) {
      try {
        const v = await client.get(k);
        if (!v) continue;
        try {
          const parsed = JSON.parse(v);
          await client.quit();
          console.log(JSON.stringify({ key: k, data: parsed }, null, 2));
          return 0;
        } catch (e) {
          // skip malformed
        }
      } catch (e) {
        // ignore per-key errors
      }
    }
    await client.quit();
    return 1;
  } catch (err) {
    return 2; // redis not available
  }
}

async function tryFallbackFiles() {
  const fallbacks = [
    '.tmp/engram-fallback.json',
    '.tmp/ace-packet.json',
    '.tmp/opencode-context.json'
  ];
  for (const p of fallbacks) {
    try {
      const s = await fs.readFile(p, 'utf8');
      const parsed = JSON.parse(s);
      console.log(JSON.stringify({ file: p, data: parsed }, null, 2));
      return 0;
    } catch (e) {
      // continue
    }
  }
  return 1;
}

async function main() {
  // Try Redis first
  const r = await tryRedis();
  if (r === 0) return process.exit(0);
  // fallback to files
  const f = await tryFallbackFiles();
  if (f === 0) return process.exit(0);
  // else emit empty
  console.log(JSON.stringify({ key: null, data: {} }, null, 2));
  return process.exit(0);
}

main();
