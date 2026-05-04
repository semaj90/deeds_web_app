#!/usr/bin/env node
/**
 * nes-arch · inspect-kag-notes.mjs
 *
 * Read-only inspector for the NES-architecture codebase index Redis cache.
 *
 * "NES architecture" naming convention used in this project:
 *   - tiny RAM (Redis fast cache, ~MB)  — 24h TTL, hot path
 *   - bank-switched ROM (Qdrant)         — semantic vectors, 768-dim
 *   - cartridge ROM (CouchDB)            — long-term wiki notes
 *   - PPU (LibTorch GPU N-API addon)     — fast cosine batches
 *
 * This script peeks into the "tiny RAM" Redis bank for the per-directory
 * KAG (Knowledge-Augmented Generation) wiki notes the codebase indexer
 * writes via `npm run index:codebase:fast`. Useful when an AGENTS.md
 * comes out empty — you can confirm whether the underlying KAG note has
 * the data the renderer expects, or whether the indexer hasn't run yet.
 *
 * Usage:
 *   node scripts/tests/nes-arch/inspect-kag-notes.mjs                    # 5 random notes
 *   node scripts/tests/nes-arch/inspect-kag-notes.mjs --filter server    # only server-* keys
 *   node scripts/tests/nes-arch/inspect-kag-notes.mjs --key <full-key>   # one specific note
 *   node scripts/tests/nes-arch/inspect-kag-notes.mjs --count            # just count, no contents
 *
 * Reads:
 *   wiki:note:dir:*    JSON ClusterNote shape: purpose / summary / auditScore /
 *                      auditMetrics / dominantTags / topologicalNeighbors /
 *                      patterns / warnings / pageRankTop5
 *
 * NEVER writes to Redis. Safe to run anytime.
 */

import Redis from 'ioredis';

const argv = process.argv.slice(2);
const FILTER = argv.find((a, i) => argv[i - 1] === '--filter') ?? null;
const ONE_KEY = argv.find((a, i) => argv[i - 1] === '--key') ?? null;
const COUNT_ONLY = argv.includes('--count');

const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

const allKeys = ONE_KEY ? [ONE_KEY] : await r.keys('wiki:note:dir:*');
const keys = FILTER ? allKeys.filter(k => k.includes(FILTER)) : allKeys;

console.log(`📦 wiki:note:dir:* keys: ${allKeys.length}${FILTER ? ` (${keys.length} matching "${FILTER}")` : ''}`);

if (COUNT_ONLY) {
  await r.quit();
  process.exit(0);
}

const sample = ONE_KEY ? keys : keys.slice(0, 5);
console.log(`\nShowing ${sample.length}/${keys.length} note(s):\n`);

for (const k of sample) {
  console.log(`━━━ ${k} ━━━`);
  const raw = await r.get(k);
  try {
    const doc = JSON.parse(raw);
    console.log(`  purpose:      ${doc.purpose ?? '(none)'}`);
    console.log(`  summary:      ${(doc.summary ?? '').slice(0, 120)}`);
    console.log(`  auditScore:   ${doc.auditScore ?? '—'}`);
    console.log(`  tags:         ${(doc.dominantTags ?? []).slice(0, 6).join(', ') || '(none)'}`);
    console.log(`  warnings:     ${(doc.warnings ?? []).length}  patterns: ${(doc.patterns ?? []).length}`);
    console.log(`  topo neighbors: ${(doc.topologicalNeighbors ?? []).length}`);
    console.log(`  pageRank top5:  ${(doc.pageRankTop5 ?? []).length}`);
    console.log(`  generatedAt:  ${doc.generatedAt ?? '—'}`);
    console.log();
  } catch {
    console.log(`  (not valid JSON — raw, first 200): ${raw?.slice(0, 200)}`);
    console.log();
  }
}

await r.quit();
