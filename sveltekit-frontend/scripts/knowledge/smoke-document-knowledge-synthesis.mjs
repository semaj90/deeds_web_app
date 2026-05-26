#!/usr/bin/env node
import fs from 'fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import Redis from 'ioredis';

function findRepoRoot(startDir) {
  const current = path.resolve(startDir);
  return path.basename(current).toLowerCase() === 'sveltekit-frontend'
    ? path.dirname(current)
    : current;
}

const cwd = findRepoRoot(process.cwd());
const knowledgeDir = path.join(cwd, 'memory', 'knowledge');
const packetsPath = path.join(knowledgeDir, 'document-knowledge-packets.jsonl');
const manifestPath = path.join(knowledgeDir, 'document-knowledge-synthesis-manifest.json');
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function main() {
  if (!existsSync(packetsPath) || !existsSync(manifestPath)) {
    throw new Error(`Missing synthesis outputs in ${knowledgeDir}`);
  }

  const packets = (await fs.readFile(packetsPath, 'utf8')).split(/\r?\n/).filter(Boolean);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
  });
  await redis.connect();
  const latest = await redis.get('knowledge:document-knowledge:latest');
  const packetLatest = await redis.get('knowledge:document-knowledge:packets:latest');
  await redis.quit();

  const out = {
    packets_count: packets.length,
    manifest,
    redis_latest: Boolean(latest),
    redis_packet_latest: Boolean(packetLatest),
    ready_for_ace: packets.length > 0 && Boolean(latest),
  };

  console.log(JSON.stringify(out, null, 2));
  if (!out.ready_for_ace) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[knowledge:documents:synthesize:smoke] Fatal:', error);
  process.exitCode = 2;
});
